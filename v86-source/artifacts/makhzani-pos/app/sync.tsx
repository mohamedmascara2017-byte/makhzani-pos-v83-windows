import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AppPage, Card, PageHeader } from '@/components/common';
import { useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';
import { currentCloudEmail, fetchCloudSnapshot, getLinkedStore, saveCloudSnapshot, signIn, signOut } from '@/lib/supabaseSync';
import { saveSyncBaseline, SYNC_CONFLICT_PREFIX } from '@/lib/autoSync';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRE_RESTORE_BACKUP_KEY = 'makhzani-pos:pre-cloud-restore-backup:v1';

function hasBusinessData(payload: Record<string, unknown>): boolean {
  return ['products', 'sales', 'purchases', 'returns', 'counts', 'expenses'].some((key) =>
    Array.isArray(payload[key]) && (payload[key] as unknown[]).length > 0,
  );
}

function isCompleteBackup(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Record<string, unknown>;
  return backup.format === 'makhzani-pos-backup-v1' &&
    ['products', 'employees', 'sales', 'purchases', 'returns', 'counts', 'audit', 'expenses'].every((key) => Array.isArray(backup[key]));
}

function tell(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function SyncScreen() {
  const colors = useColors();
  const store = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState('');
  const [revision, setRevision] = useState(0);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshLink = async () => {
    const accountEmail = await currentCloudEmail();
    setConnectedEmail(accountEmail);
    if (!accountEmail) { setStoreId(''); setRole(''); return; }
    const linked = await getLinkedStore();
    setStoreId(linked.storeId);
    setRole(linked.role);
    const snapshot = await fetchCloudSnapshot(linked.storeId);
    setRevision(snapshot.revision);
    setCloudUpdatedAt(snapshot.updated_at);
  };

  useEffect(() => { refreshLink().catch(() => undefined); }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) return tell('بيانات ناقصة', 'أدخل البريد الإلكتروني وكلمة مرور حساب Supabase.');
    setBusy(true);
    try {
      await signIn(email, password);
      await refreshLink();
      setPassword('');
      tell('تم الاتصال', 'تم تسجيل الدخول والعثور على المتجر المرتبط بحسابك.');
    } catch (error) {
      tell('تعذر الاتصال', error instanceof Error ? error.message : 'تحقق من البريد وكلمة المرور وإعدادات Supabase.');
    } finally { setBusy(false); }
  };

  const localPayload = () => ({
    format: 'makhzani-pos-backup-v1',
    app: 'Makhzani POS',
    exportedAt: new Date().toISOString(),
    products: store.products,
    // Employee PINs are device-local and are deliberately never uploaded to the cloud.
    employees: store.employees.map(({ pin: _pin, ...employee }) => employee),
    sales: store.sales,
    purchases: store.purchases,
    returns: store.returns,
    counts: store.counts,
    audit: store.audit,
    expenses: store.expenses,
    quickShortcutIds: store.quickShortcutIds,
    quickShortcutKeys: store.quickShortcutKeys,
  });

  const uploadLocal = async () => {
    if (!storeId) return;
    const confirmMessage = `سيتم رفع بيانات هذا الجهاز إلى المتجر السحابي واستبدال النسخة السحابية الحالية.\n\nالمنتجات: ${store.products.length}\nالمبيعات: ${store.sales.length}\nالمشتريات: ${store.purchases.length}\nالمرتجعات: ${store.returns.length}\n\nلن تُرفع أرقام PIN للموظفين. هل تريد المتابعة؟`;
    const proceed = Platform.OS === 'web' ? window.confirm(confirmMessage) : await new Promise<boolean>((resolve) => Alert.alert('رفع بيانات هذا الجهاز', confirmMessage, [{ text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) }, { text: 'رفع البيانات', onPress: () => resolve(true) }]));
    if (!proceed) return;
    setBusy(true);
    try {
      const latest = await fetchCloudSnapshot(storeId);
      const local = localPayload();
      const cloudPayload = latest.payload && typeof latest.payload === 'object' ? latest.payload as Record<string, unknown> : {};
      if (!hasBusinessData(local) && hasBusinessData(cloudPayload)) {
        throw new Error('توقّف الرفع لحماية بيانات المتجر: هذا الجهاز لا يحتوي على بيانات، بينما السحابة تحتوي على بيانات. لن نستبدل النسخة السحابية الفعلية بنسخة فارغة.');
      }
      const nextRevision = await saveCloudSnapshot(storeId, local, latest.revision);
      await saveSyncBaseline(storeId, nextRevision, local);
      await AsyncStorage.removeItem(SYNC_CONFLICT_PREFIX + storeId);
      setRevision(nextRevision);
      const latestAfter = await fetchCloudSnapshot(storeId);
      setCloudUpdatedAt(latestAfter.updated_at);
      tell('تم الرفع', `تم حفظ بيانات هذا الجهاز في السحابة. رقم المراجعة: ${nextRevision}`);
    } catch (error) {
      tell('تعذر رفع البيانات', error instanceof Error ? error.message : 'حدث خطأ أثناء المزامنة.');
    } finally { setBusy(false); }
  };

  const downloadCloud = async () => {
    if (!storeId) return;
    const proceed = Platform.OS === 'web'
      ? window.confirm('سيتم استبدال بيانات هذا الجهاز بالنسخة السحابية. أنشئ نسخة احتياطية محلية أولاً. هل تريد المتابعة؟')
      : await new Promise<boolean>((resolve) => Alert.alert('تنزيل بيانات السحابة', 'سيتم استبدال بيانات هذا الجهاز بالنسخة السحابية. أنشئ نسخة احتياطية محلية أولاً.', [{ text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) }, { text: 'استبدال البيانات', style: 'destructive', onPress: () => resolve(true) }]));
    if (!proceed) return;
    setBusy(true);
    try {
      const snapshot = await fetchCloudSnapshot(storeId);
      const cloud = snapshot.payload as Record<string, unknown>;
      if (!isCompleteBackup(cloud)) {
        throw new Error('لا توجد نسخة بيانات كاملة وصالحة في السحابة. لم يتم تغيير بيانات هذا الجهاز.');
      }
      if (!hasBusinessData(cloud) && hasBusinessData(localPayload())) {
        throw new Error('توقّف التنزيل لحماية بيانات هذا الجهاز: النسخة السحابية فارغة بينما هذا الجهاز يحتوي على بيانات. لم يتم استبدال أي شيء.');
      }
      const localSafetyBackup = {
        format: 'makhzani-pos-backup-v1',
        app: 'Makhzani POS local safety copy before cloud restore',
        exportedAt: new Date().toISOString(),
        ...store,
      };
      const serializedSafetyBackup = JSON.stringify(localSafetyBackup);
      await AsyncStorage.setItem(PRE_RESTORE_BACKUP_KEY, serializedSafetyBackup);
      const verifiedSafetyBackup = await AsyncStorage.getItem(PRE_RESTORE_BACKUP_KEY);
      if (!verifiedSafetyBackup || verifiedSafetyBackup !== serializedSafetyBackup) {
        throw new Error('تعذر التحقق من حفظ نسخة الأمان المحلية؛ أُلغي التنزيل ولم تتغير بيانات الجهاز.');
      }
      const localPins = new Map(store.employees.map((employee) => [employee.id, employee.pin]));
      const employees = (cloud.employees as Array<Record<string, unknown>>).map((employee) => ({
        ...employee,
        pin: localPins.get(String(employee.id)) ?? '',
      }));
      await store.restoreBackup({ ...cloud, employees });
      await saveSyncBaseline(storeId, snapshot.revision, cloud);
      await AsyncStorage.removeItem(SYNC_CONFLICT_PREFIX + storeId);
      setRevision(snapshot.revision);
      setCloudUpdatedAt(snapshot.updated_at);
      tell('تم التنزيل', 'تم استيراد بيانات المتجر بعد حفظ نسخة أمان محلية تلقائياً. أرقام PIN الموجودة على هذا الجهاز حُفظت محلياً، ولا تُنقل بين الأجهزة.');
    } catch (error) {
      tell('تعذر تنزيل البيانات', error instanceof Error ? error.message : 'حدث خطأ أثناء التنزيل.');
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await signOut(); setConnectedEmail(null); setStoreId(''); setRole(''); setRevision(0); }
    finally { setBusy(false); }
  };

  return (
    <AppPage>
      <PageHeader title="المزامنة السحابية" subtitle="ربط هذا الجهاز بمتجر Makhzani POS عبر Supabase" />
      <Card style={styles.card}>
        <View style={styles.heading}><Feather name="cloud" size={21} color={colors.primary} /><Text style={[styles.cardTitle, { color: colors.foreground }]}>حساب Supabase</Text></View>
        {connectedEmail ? (
          <>
            <Text style={[styles.info, { color: colors.foreground }]}>متصل بالحساب: {connectedEmail}</Text>
            <Text style={[styles.info, { color: colors.mutedForeground }]}>المتجر: Makhzani POS</Text>
            <Text style={[styles.info, { color: colors.mutedForeground }]}>الصلاحية: {role === 'owner' ? 'مالك' : role || 'عضو'}</Text>
            <Text style={[styles.info, { color: colors.mutedForeground }]}>رقم مراجعة السحابة: {revision}</Text>
            {cloudUpdatedAt ? <Text style={[styles.small, { color: colors.mutedForeground }]}>آخر تحديث: {new Date(cloudUpdatedAt).toLocaleString()}</Text> : null}
            <Pressable disabled={busy} onPress={disconnect} style={[styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.secondaryText, { color: colors.foreground }]}>تسجيل الخروج من Supabase</Text></Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.info, { color: colors.mutedForeground }]}>سجّل الدخول بنفس البريد وكلمة المرور اللذين أنشأت بهما مستخدم Supabase.</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" keyboardType="email-address" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
            <TextInput value={password} onChangeText={setPassword} placeholder="كلمة المرور" placeholderTextColor={colors.mutedForeground} secureTextEntry style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
            <Pressable disabled={busy} onPress={handleLogin} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryText}>تسجيل الدخول وربط المتجر</Text></Pressable>
          </>
        )}
      </Card>

      {connectedEmail ? <Card style={styles.card}>
        <View style={styles.heading}><Feather name="refresh-cw" size={20} color={colors.primary} /><Text style={[styles.cardTitle, { color: colors.foreground }]}>نقل البيانات يدوياً</Text></View>
        <Text style={[styles.info, { color: colors.mutedForeground }]}>اختر اتجاه النقل بوضوح. الرفع يستبدل النسخة السحابية، والتنزيل يستبدل بيانات هذا الجهاز. لا توجد مزامنة تلقائية أو دمج فوري بين الأجهزة في هذه المرحلة.</Text>
        <Pressable disabled={busy || role !== 'owner'} onPress={uploadLocal} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: role !== 'owner' ? 0.5 : 1 }]}><Feather name="upload-cloud" size={18} color="#fff" /><Text style={styles.primaryText}>رفع بيانات هذا الجهاز إلى السحابة</Text></Pressable>
        <Pressable disabled={busy} onPress={downloadCloud} style={[styles.secondaryButton, { borderColor: colors.border }]}><Feather name="download-cloud" size={18} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.foreground }]}>تنزيل بيانات السحابة إلى هذا الجهاز</Text></Pressable>
        {role !== 'owner' ? <Text style={[styles.small, { color: colors.mutedForeground }]}>رفع البيانات متاح لحساب المالك فقط.</Text> : null}
      </Card> : null}

      <Card style={styles.note}>
        <Text style={[styles.noteTitle, { color: colors.foreground }]}>حماية البيانات</Text>
        <Text style={[styles.info, { color: colors.mutedForeground }]}>• قبل تنزيل السحابة، يحفظ التطبيق نسخة أمان محلية ويتحقق من حفظها.</Text>
        <Text style={[styles.info, { color: colors.mutedForeground }]}>• يمنع التطبيق رفع جهاز فارغ فوق نسخة سحابية تحتوي على بيانات، أو تنزيل سحابة فارغة فوق بيانات الجهاز.</Text>
      </Card>
      <Card style={styles.note}>
        <Text style={[styles.noteTitle, { color: colors.foreground }]}>ملاحظات مهمة قبل التفعيل الكامل</Text>
        <Text style={[styles.info, { color: colors.mutedForeground }]}>• بيانات التطبيق المحلية لا تُحذف عند تسجيل الدخول.</Text>
        <Text style={[styles.info, { color: colors.mutedForeground }]}>• أرقام PIN للموظفين تبقى على كل جهاز ولا تُرفع للسحابة.</Text>
        <Text style={[styles.info, { color: colors.mutedForeground }]}>• هذه مرحلة نقل نسخة يدوية محمية برقم مراجعة لمنع الكتابة فوق تحديث أحدث دون تنبيه.</Text>
        <Text style={[styles.info, { color: colors.mutedForeground }]}>• المزامنة التلقائية، قائمة انتظار العمل دون إنترنت، وWi‑Fi المحلي تحتاج مراحل تطوير واختبار إضافية.</Text>
      </Card>
      {busy ? <View style={styles.busy}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>جارٍ الاتصال…</Text></View> : null}
      <Pressable onPress={() => router.back()} style={styles.back}><Text style={{ color: colors.primary }}>العودة</Text></Pressable>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  card: { padding: 15, gap: 10, marginBottom: 13 },
  note: { padding: 15, gap: 8, marginBottom: 13 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  info: { fontSize: 13, lineHeight: 21 },
  small: { fontSize: 11, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, textAlign: 'right' },
  primaryButton: { minHeight: 46, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { fontSize: 13, fontWeight: '600' },
  noteTitle: { fontSize: 15, fontWeight: '700' },
  busy: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 10 },
  back: { alignSelf: 'center', padding: 12 },
});
