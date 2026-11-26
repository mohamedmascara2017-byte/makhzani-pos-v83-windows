import React, { useState } from 'react';
import { Alert, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppButton, TextField } from '@/components/common';
import { useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ready, login } = useStore();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!/^\d{4,8}$/.test(pin)) {
      Alert.alert('رمز PIN غير مكتمل', 'أدخل رمزًا من 4 إلى 8 أرقام.');
      return;
    }
    setBusy(true);
    const success = login(pin);
    setBusy(false);
    if (!success) {
      setPin('');
      Alert.alert('تعذر تسجيل الدخول', 'تأكد من الرمز أو اطلب مساعدة المالك.');
      return;
    }
    router.replace('/(tabs)' as never);
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, {
        paddingTop: Platform.OS === 'web' ? 67 : Math.max(insets.top, 24) + 22,
        paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 24) + 20,
      }]}
      bottomOffset={60}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.brandCard, { backgroundColor: colors.primary }]}>
        <Image source={require('@/assets/images/icon.png')} style={styles.logo} />
        <Text style={styles.brandTitle}>مخزني</Text>
        <Text style={styles.brandSubtitle}>نقطة بيع وإدارة مخزون لمتجرك</Text>
      </View>
      <View style={styles.form}>
        <Text style={[styles.welcome, { color: colors.foreground }]}>مرحبًا بعودتك</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>أدخل رمز الدخول للمتابعة إلى متجرك.</Text>
        <TextField
          label="رمز PIN"
          value={pin}
          onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 8))}
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          autoFocus={false}
          testID="pin-input"
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <AppButton title="دخول إلى المتجر" icon="arrow-left" onPress={submit} loading={busy} disabled={!ready} testID="login-button" />
        <Text style={[styles.defaultPin, { color: colors.mutedForeground }]}>رمز المالك الأولي: 1234 · غيّره بعد تسجيل الدخول</Text>
      </View>
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>يعمل التطبيق دون اتصال بالإنترنت، وتُحفظ بياناتك على هذا الجهاز.</Text>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 25 },
  brandCard: { minHeight: 215, borderRadius: 30, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  logo: { width: 66, height: 66, borderRadius: 20, marginBottom: 5 },
  brandTitle: { color: '#FFFFFF', fontSize: 29, fontWeight: '700', writingDirection: 'rtl' },
  brandSubtitle: { color: '#D8EEE0', fontSize: 13, writingDirection: 'rtl' },
  form: { gap: 13 },
  welcome: { fontSize: 22, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  hint: { marginTop: -6, marginBottom: 3, fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
  defaultPin: { fontSize: 11, textAlign: 'center', lineHeight: 18, writingDirection: 'rtl' },
  footer: { fontSize: 11, lineHeight: 18, textAlign: 'center', writingDirection: 'rtl' },
});
