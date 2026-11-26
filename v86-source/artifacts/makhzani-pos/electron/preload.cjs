const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('makhzaniDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  getBackupFolder: () => ipcRenderer.invoke('makhzani:backup:get-folder'),
  selectBackupFolder: () => ipcRenderer.invoke('makhzani:backup:select-folder'),
  writeBackup: (backup) => ipcRenderer.invoke('makhzani:backup:write', backup),
}));
