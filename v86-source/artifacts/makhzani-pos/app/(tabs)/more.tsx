import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppPage, Card, PageHeader } from '@/components/common';
import { useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const options = [
  { title: 'التقارير اليومية', description: 'المبيعات والأرباح والمصاريف حسب اليوم', icon: 'bar-chart-2', route: '/reports' },
  { title: 'المشتريات', description: 'إدخال فواتير الموردين', icon: 'truck', route: '/purchases' },
  { title: 'المرتجعات', description: 'إرجاع المنتجات المباعة إلى المخزون', icon: 'corner-up-left', route: '/returns' },
  { title: 'جرد المخزون', description: 'مقارنة الكمية الفعلية بالمسجلة', icon: 'check-square', route: '/inventory-count' },
  { title: 'الفواتير المصورة', description: 'إرفاق صورة الفاتورة ومراجعة بنودها', icon: 'camera', route: '/invoice' },
  { title: 'Excel', description: 'استيراد وتصدير قائمة المنتجات', icon: 'file-text', route: '/excel' },
  { title: 'سجل العمليات', description: 'مراجعة تغييرات البيع والمخزون', icon: 'activity', route: '/audit' },
  { title: 'المزامنة السحابية', description: 'ربط المتجر بحساب Supabase ونقل البيانات بين الأجهزة', icon: 'cloud', route: '/sync' },
] as const;

export default function MoreScreen() {
  const colors = useColors();
  const { currentUser, logout, products, employees, sales, purchases, returns, counts, audit, expenses, restoreBackup, quickShortcutIds, quickShortcutKeys } = useStore();
  const [backupFolder, setBackupFolder] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const isWindowsDesktop = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.makhzaniDesktop?.isDesktop;

  useEffect(() => {
    if (isWindowsDesktop && window.makhzaniDesktop?.getBackupFolder) {
      window.makhzaniDesktop.getBackupFolder().then(setBackupFolder).catch(() => setBackupFolder(''));
    }
  }, [isWindowsDesktop]);

  const chooseBackupFolder = async () => {
    const bridge = typeof window !== 'undefined' ? window.makhzaniDesktop : undefined;
    if (!bridge?.selectBackupFolder) return;
    try {
      const selected = await bridge.selectBackupFolder();
      if (selected) {
        setBackupFolder(selected);
        const initialBackup = {
          format: 'makhzani-pos-backup-v1',
          app: 'Makhzani POS',
          exportedAt: new Date().toISOString(),
          products, employees, sales, purchases, returns, counts, audit, expenses, quickShortcutIds, quickShortcutKeys,
        };
        await bridge.writeBackup(initialBackup);
        if (Platform.OS === 'web') window.alert('تم ربط مجلد النسخ الاحتياطي وحفظ أول نسخة. سيحفظ مخزني نسخة محدثة تلقائياً بعد كل تغيير في البيانات.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر اختيار المجلد.';
      if (Platform.OS === 'web') window.alert(message); else Alert.alert('تعذر اختيار المجلد', message);
    }
  };
  const createBackup = async () => {
    setBackupBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const backup = {
        format: 'makhzani-pos-backup-v1',
        app: 'Makhzani POS',
        exportedAt: new Date().toISOString(),
        products, employees, sales, purchases, returns, counts, audit, expenses, quickShortcutIds, quickShortcutKeys,
      };
      const json = JSON.stringify(backup, null, 2);

      if (isWindowsDesktop) {
        const bridge = window.makhzaniDesktop;
        if (backupFolder && bridge?.writeBackup) {
          const result = await bridge.writeBackup(backup);
          if (result.saved) window.alert(`تم حفظ النسخة الآن في:\n${result.folderPath || backupFolder}`);
          else window.alert('لم يتم حفظ النسخة. اختر مجلد النسخ الاحتياطي أولاً.');
        } else {
          const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `makhzani-backup-${stamp}.json`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
          window.alert('تم تنزيل ملف النسخة الاحتياطية. اربط مجلد Google Drive لتفعيل الحفظ التلقائي.');
        }
      } else {
        const file = new File(Paths.cache, `makhzani-backup-${stamp}.json`);
        file.create({ overwrite: true, intermediates: true });
        file.write(json);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'حفظ نسخة احتياطية لمخزني في Google Drive أو الملفات' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'حاول مرة أخرى.';
      if (Platform.OS === 'web') window.alert(`تعذر إنشاء النسخة الاحتياطية: ${message}`);
      else Alert.alert('تعذر إنشاء النسخة الاحتياطية', message);
    } finally {
      setBackupBusy(false);
    }
  };
  const restoreFromFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0] as typeof result.assets[number] & { file?: Blob };
      let rawText = '';
      // On Windows/Electron the browser file picker supplies a real File object.
      // Reading that object is more reliable than passing its file:// URI to Expo FS.
      if (Platform.OS === 'web' && asset.file && typeof asset.file.text === 'function') {
        rawText = await asset.file.text();
      } else {
        const file = new File(asset.uri);
        rawText = new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
      }

      const backup = JSON.parse(rawText);
      if (!backup || typeof backup !== 'object' || backup.format !== 'makhzani-pos-backup-v1') {
        throw new Error('صيغة الملف غير صحيحة. اختر نسخة احتياطية أصلية من تطبيق مخزني.');
      }
      if (!Array.isArray(backup.products) || !Array.isArray(backup.employees) ||
          !Array.isArray(backup.sales) || !Array.isArray(backup.purchases) ||
          !Array.isArray(backup.returns) || !Array.isArray(backup.counts) ||
          !Array.isArray(backup.audit) || !Array.isArray(backup.expenses)) {
        throw new Error('النسخة ناقصة أو تالفة. يجب أن تحتوي على المنتجات والمبيعات والمشتريات والمرتجعات والمصاريف والجرد؛ لم يتم تغيير بيانات الحاسوب.');
      }

      const message = `سيتم استبدال بيانات الحاسوب الحالية ببيانات النسخة المختارة.\n\nالمنتجات: ${backup.products.length}\nالمبيعات: ${backup.sales.length}\nالمشتريات: ${backup.purchases.length}\nالمرتجعات: ${backup.returns.length}\nالمصاريف: ${backup.expenses.length}\n\nأنشئ نسخة من بيانات الحاسوب أولاً إذا كنت تحتاجها.`;
      const performRestore = async () => {
        try {
          await restoreBackup(backup);
          if (Platform.OS === 'web') {
            window.alert(`تمت الاستعادة بنجاح.\nتم استيراد ${backup.products.length} منتج.`);
          } else {
            Alert.alert('تمت الاستعادة', `تم استيراد ${backup.products.length} منتج وإعادة تحميل بيانات المتجر.`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'تعذرت استعادة النسخة.';
          if (Platform.OS === 'web') window.alert(message);
          else Alert.alert('تعذرت الاستعادة', message);
        }
      };

      if (Platform.OS === 'web') {
        if (window.confirm(message)) await performRestore();
      } else {
        Alert.alert('تأكيد استعادة النسخة', message, [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'استعادة', style: 'destructive', onPress: () => { void performRestore(); } },
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'اختر ملف JSON صالحًا.';
      if (Platform.OS === 'web') window.alert(`تعذر فتح النسخة: ${message}`);
      else Alert.alert('تعذر فتح النسخة', message);
    }
  };
  const signOut = () => Alert.alert('تسجيل الخروج', 'هل تريد إنهاء الجلسة الحالية؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'خروج', style: 'destructive', onPress: () => { logout(); router.replace('/login' as never); } },
  ]);
  return (
    <AppPage>
      <PageHeader title="المزيد" subtitle="إدارة المتجر والأدوات" />
      <Card style={styles.profile}>
        <View style={[styles.profileIcon, { backgroundColor: colors.secondary }]}><Feather name="user" size={21} color={colors.primary} /></View>
        <View style={styles.profileText}>
          <Text style={[styles.profileName, { color: colors.foreground }]}>{currentUser?.name}</Text>
          <Text style={[styles.profileRole, { color: colors.mutedForeground }]}>{currentUser?.role === 'owner' ? 'مالك المتجر' : 'موظف'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="تغيير رمز PIN" onPress={() => router.push('/change-pin' as never)} style={styles.pinButton}>
          <Feather name="key" size={17} color={colors.primary} />
        </Pressable>
      </Card>
      <View style={styles.options}>
        {options.filter((option) => option.route !== '/sync' || currentUser?.role === 'owner').map((option) => (
          <Pressable key={option.route} accessibilityRole="button" onPress={() => router.push(option.route as never)} style={({ pressed }) => [styles.option, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}><Feather name={option.icon} size={19} color={colors.primary} /></View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>{option.title}</Text>
              <Text style={[styles.optionDescription, { color: colors.mutedForeground }]}>{option.description}</Text>
            </View>
            <Feather name="chevron-left" size={19} color={colors.mutedForeground} />
          </Pressable>
        ))}
        {currentUser?.role === 'owner' ? (
          <Pressable accessibilityRole="button" onPress={createBackup} disabled={backupBusy} style={({ pressed }) => [styles.option, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}><Feather name="cloud" size={19} color={colors.primary} /></View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>نسخة احتياطية</Text>
              <Text style={[styles.optionDescription, { color: colors.mutedForeground }]}>{isWindowsDesktop ? (backupFolder ? `حفظ يدوي الآن؛ والنسخ التلقائي مفعّل في: ${backupFolder}` : 'أنشئ نسخة JSON أو اربط مجلد Google Drive للحفظ التلقائي') : 'إنشاء ملف JSON ثم مشاركته مع Google Drive أو حفظه في الملفات'}</Text>
            </View>
            <Feather name="chevron-left" size={19} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        {currentUser?.role === 'owner' && isWindowsDesktop ? (
          <Pressable accessibilityRole="button" onPress={chooseBackupFolder} style={({ pressed }) => [styles.option, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}><Feather name="folder" size={19} color={colors.primary} /></View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>{backupFolder ? 'تغيير مجلد Google Drive' : 'ربط مجلد Google Drive'}</Text>
              <Text style={[styles.optionDescription, { color: colors.mutedForeground }]}>اختر مجلد My Drive من تطبيق Google Drive for desktop ليحفظ التطبيق النسخ تلقائياً</Text>
            </View>
            <Feather name="chevron-left" size={19} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        {currentUser?.role === 'owner' ? (
          <Pressable accessibilityRole="button" onPress={restoreFromFile} style={({ pressed }) => [styles.option, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}><Feather name="upload-cloud" size={19} color={colors.primary} /></View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>استعادة نسخة احتياطية</Text>
              <Text style={[styles.optionDescription, { color: colors.mutedForeground }]}>استعادة المنتجات والمبيعات والمشتريات والجرد والمصاريف من نسخة محفوظة</Text>
            </View>
            <Feather name="chevron-left" size={19} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        {currentUser?.role === 'owner' ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/employees' as never)} style={({ pressed }) => [styles.option, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
            <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}><Feather name="users" size={19} color={colors.primary} /></View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>الموظفون والصلاحيات</Text>
              <Text style={[styles.optionDescription, { color: colors.mutedForeground }]}>إضافة المستخدمين وإيقافهم</Text>
            </View>
            <Feather name="chevron-left" size={19} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={signOut} style={[styles.logout, { borderColor: colors.border }]}>
        <Feather name="log-out" size={18} color={colors.destructive} />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>تسجيل الخروج</Text>
      </Pressable>
      <Text style={[styles.version, { color: colors.mutedForeground }]}>مخزني POS V8.6 · المزامنة السحابية التجريبية</Text>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
  profileIcon: { width: 43, height: 43, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  profileText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  profileName: { fontSize: 15, fontWeight: '700', writingDirection: 'rtl' },
  profileRole: { fontSize: 11, writingDirection: 'rtl' },
  pinButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  options: { gap: 9 },
  option: { minHeight: 70, borderWidth: 1, borderRadius: 19, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  optionIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, gap: 4, alignItems: 'flex-start' },
  optionTitle: { fontSize: 14, fontWeight: '700', writingDirection: 'rtl' },
  optionDescription: { fontSize: 10, writingDirection: 'rtl' },
  logout: { minHeight: 49, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 2 },
  logoutText: { fontSize: 13, fontWeight: '700', writingDirection: 'rtl' },
  version: { textAlign: 'center', fontSize: 10, writingDirection: 'rtl' },
});
