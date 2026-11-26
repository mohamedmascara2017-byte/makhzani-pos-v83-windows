const { app, BrowserWindow, session, shell, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

function startStaticServer(port = DESKTOP_PORT) {
  const distDir = path.resolve(__dirname, '..', 'dist');
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`The exported app was not found: ${indexFile}`);
  }

  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }

    const relativePath = pathname.replace(/^\/+/, '');
    let filePath = path.resolve(distDir, relativePath || 'index.html');
    if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = indexFile;
      }
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('Static file server error:', error);
      if (!res.headersSent) res.writeHead(500);
      res.end('Unable to load the application file.');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

function createWindow(appUrl) {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('Makhzani page failed to load:', code, description, validatedURL);
  });
  win.webContents.on('console-message', (_event, details) => {
    if (details.level >= 2) console.error('Makhzani renderer:', details.message);
  });
  win.loadURL(appUrl);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  return win;
}


function backupSettingsFile() {
  return path.join(app.getPath('userData'), 'backup-settings.json');
}

function getSavedBackupFolder() {
  try {
    const settings = JSON.parse(fs.readFileSync(backupSettingsFile(), 'utf8'));
    return typeof settings.folderPath === 'string' ? settings.folderPath : '';
  } catch {
    return '';
  }
}

function saveBackupFolder(folderPath) {
  fs.mkdirSync(path.dirname(backupSettingsFile()), { recursive: true });
  fs.writeFileSync(backupSettingsFile(), JSON.stringify({ folderPath }, null, 2), 'utf8');
}

function atomicWriteBackup(targetPath, contents) {
  const temporaryPath = `${targetPath}.tmp`;
  fs.writeFileSync(temporaryPath, contents, 'utf8');
  if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
  fs.renameSync(temporaryPath, targetPath);
}

ipcMain.handle('makhzani:backup:get-folder', () => getSavedBackupFolder());

ipcMain.handle('makhzani:backup:select-folder', async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: 'اختر مجلد النسخ الاحتياطي في Google Drive',
    buttonLabel: 'اختيار هذا المجلد',
    properties: ['openDirectory', 'createDirectory'],
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const folderPath = result.filePaths[0];
  saveBackupFolder(folderPath);
  return folderPath;
});

ipcMain.handle('makhzani:backup:write', async (_event, backup) => {
  if (!backup || typeof backup !== 'object' || backup.format !== 'makhzani-pos-backup-v1' ||
      !Array.isArray(backup.products) || !Array.isArray(backup.employees) || !Array.isArray(backup.sales) || !Array.isArray(backup.purchases) ||
      !Array.isArray(backup.returns) || !Array.isArray(backup.counts) || !Array.isArray(backup.audit) || !Array.isArray(backup.expenses)) {
    throw new Error('بيانات النسخة الاحتياطية غير صالحة.');
  }
  const folderPath = getSavedBackupFolder();
  if (!folderPath) return { saved: false, reason: 'folder-not-selected' };
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error('مجلد النسخ الاحتياطي غير موجود. أعد اختياره من الإعدادات.');
  }

  const exportedAt = typeof backup.exportedAt === 'string' ? new Date(backup.exportedAt) : new Date();
  const safeDate = Number.isFinite(exportedAt.getTime())
    ? new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(exportedAt)
    : new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const contents = JSON.stringify(backup, null, 2);
  atomicWriteBackup(path.join(folderPath, 'makhzani-backup-latest.json'), contents);
  atomicWriteBackup(path.join(folderPath, `makhzani-backup-${safeDate}.json`), contents);
  return { saved: true, folderPath };
});

let staticServer;
const DESKTOP_PORT = 32145;
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  // Allow Chromium's camera permission flow for Expo Camera / barcode scanning.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'camera' || permission === 'videoCapture');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'camera' || permission === 'videoCapture';
  });
  if (typeof session.defaultSession.setDevicePermissionHandler === 'function') {
    session.defaultSession.setDevicePermissionHandler((details) => {
      return details.deviceType === 'videoinput';
    });
  }

  try {
    const hostedApp = await startStaticServer(DESKTOP_PORT);
    staticServer = hostedApp.server;
    createWindow(hostedApp.url);
  } catch (error) {
    console.error('Unable to start Makhzani POS:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && staticServer) {
      const address = staticServer.address();
      createWindow(`http://127.0.0.1:${address.port}`);
    }
  });
});

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('before-quit', () => {
  if (staticServer) staticServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
