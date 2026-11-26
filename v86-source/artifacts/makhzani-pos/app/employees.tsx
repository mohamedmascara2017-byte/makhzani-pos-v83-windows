import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AppButton, AppPage, Badge, Card, PageHeader, TextField } from '@/components/common';
import { Role, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

export default function EmployeesScreen() {
  const colors = useColors();
  const { currentUser, employees, saveEmployee, setEmployeeActive } = useStore();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [saving, setSaving] = useState(false);

  if (currentUser?.role !== 'owner') {
    router.replace('/(tabs)/more' as never);
    return null;
  }

  const submit = () => {
    setSaving(true);
    try {
      saveEmployee({ name, username, pin, role });
      setName('');
      setUsername('');
      setPin('');
      setRole('employee');
      Alert.alert('تمت الإضافة', 'يمكن للموظف تسجيل الدخول برمز PIN الذي اخترته.');
    } catch (error) {
      Alert.alert('تعذرت إضافة المستخدم', error instanceof Error ? error.message : 'راجع البيانات.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string, active: boolean, displayName: string) => Alert.alert(
    active ? 'إيقاف المستخدم' : 'تفعيل المستخدم',
    `${active ? 'إيقاف' : 'تفعيل'} حساب ${displayName}؟`,
    [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'متابعة', onPress: () => {
        try { setEmployeeActive(id, !active); }
        catch (error) { Alert.alert('تعذر تغيير الحالة', error instanceof Error ? error.message : 'حاول مرة أخرى.'); }
      } },
    ],
  );

  return (
    <AppPage>
      <PageHeader title="الموظفون والصلاحيات" subtitle="إضافة مستخدمين وتحديد دورهم" onBack={() => router.back()} />
      <Text style={[styles.section, { color: colors.foreground }]}>المستخدمون الحاليون</Text>
      <View style={styles.list}>
        {employees.map((employee) => (
          <Card key={employee.id} style={styles.employee}>
            <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Feather name={employee.role === 'owner' ? 'shield' : 'user'} size={18} color={colors.primary} /></View>
            <View style={styles.employeeInfo}>
              <Text style={[styles.name, { color: colors.foreground }]}>{employee.name}</Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>{employee.username} · {employee.role === 'owner' ? 'مالك' : 'موظف'}</Text>
            </View>
            <Badge label={employee.active ? 'نشط' : 'موقوف'} tone={employee.active ? 'success' : 'danger'} />
            {employee.id !== currentUser.id ? (
              <Pressable accessibilityRole="button" accessibilityLabel={employee.active ? 'إيقاف الحساب' : 'تفعيل الحساب'} onPress={() => toggle(employee.id, employee.active, employee.name)} style={styles.toggle}>
                <Feather name={employee.active ? 'user-x' : 'user-check'} size={17} color={employee.active ? colors.destructive : colors.primary} />
              </Pressable>
            ) : null}
          </Card>
        ))}
      </View>
      <Text style={[styles.section, { color: colors.foreground }]}>إضافة مستخدم</Text>
      <Card style={styles.form}>
        <TextField label="اسم الموظف" value={name} onChangeText={setName} placeholder="الاسم الظاهر في سجل العمليات" />
        <TextField label="اسم المستخدم" value={username} onChangeText={setUsername} placeholder="مثل: cashier1" autoCapitalize="none" />
        <TextField label="رمز PIN (4 إلى 8 أرقام)" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 8))} placeholder="••••" keyboardType="number-pad" secureTextEntry maxLength={8} />
        <Text style={[styles.label, { color: colors.foreground }]}>الدور</Text>
        <View style={styles.roles}>
          {([{ value: 'employee', label: 'موظف' }, { value: 'owner', label: 'مالك' }] as const).map((item) => (
            <Pressable key={item.value} onPress={() => setRole(item.value)} style={[styles.roleOption, { backgroundColor: role === item.value ? colors.primary : colors.secondary }]}>
              <Text style={{ color: role === item.value ? colors.primaryForeground : colors.secondaryForeground, fontWeight: '700', fontSize: 13 }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <AppButton title="إضافة المستخدم" icon="user-plus" onPress={submit} loading={saving} disabled={!name.trim() || !username.trim() || pin.length < 4} />
      </Card>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  list: { gap: 8 },
  employee: { paddingHorizontal: 11, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  employeeInfo: { flex: 1, alignItems: 'flex-start', gap: 4 },
  name: { fontSize: 13, fontWeight: '700', writingDirection: 'rtl' },
  meta: { fontSize: 10, writingDirection: 'rtl' },
  toggle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 13 },
  label: { fontSize: 13, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  roles: { flexDirection: 'row', gap: 8 },
  roleOption: { minWidth: 82, paddingVertical: 9, paddingHorizontal: 15, borderRadius: 12, alignItems: 'center' },
});
