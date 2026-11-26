import React, { useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppButton, PageHeader, TextField } from '@/components/common';
import { useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

export default function ChangePinScreen() {
  const colors = useColors();
  const { changePin } = useStore();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const save = () => {
    if (newPin !== confirmPin) {
      Alert.alert('رمز PIN غير متطابق', 'أعد كتابة الرمز الجديد في حقل التأكيد.');
      return;
    }
    try {
      changePin(oldPin, newPin);
      Alert.alert('تم تغيير الرمز', 'استخدم رمز PIN الجديد في تسجيل الدخول القادم.');
      router.back();
    } catch (error) {
      Alert.alert('تعذر تغيير الرمز', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  };
  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : 0, paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={60}>
        <PageHeader title="تغيير رمز PIN" subtitle="تحديث رمز دخول حسابك الحالي" onBack={() => router.back()} />
        <TextField label="رمز PIN الحالي" value={oldPin} onChangeText={(value) => setOldPin(value.replace(/\D/g, '').slice(0, 8))} secureTextEntry keyboardType="number-pad" maxLength={8} />
        <TextField label="رمز PIN الجديد (4–8 أرقام)" value={newPin} onChangeText={(value) => setNewPin(value.replace(/\D/g, '').slice(0, 8))} secureTextEntry keyboardType="number-pad" maxLength={8} />
        <TextField label="تأكيد الرمز الجديد" value={confirmPin} onChangeText={(value) => setConfirmPin(value.replace(/\D/g, '').slice(0, 8))} secureTextEntry keyboardType="number-pad" maxLength={8} />
        <AppButton title="حفظ رمز PIN" icon="check" onPress={save} testID="change-pin-save" />
      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 35, gap: 15 },
});
