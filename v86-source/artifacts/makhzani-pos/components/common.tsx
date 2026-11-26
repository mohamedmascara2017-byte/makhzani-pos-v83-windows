import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';

export const formatMoney = (amount: number) =>
  `${new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0)} دج`;
export const formatDate = (value: string) => new Date(value).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function AppPage({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const insets = Platform.OS === 'web' ? { paddingTop: 67, paddingBottom: 34 } : undefined;
  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.page, { backgroundColor: colors.background }, insets]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {children}
        </ScrollView>
      ) : children}
    </SafeAreaView>
  );
}


export function AppBottomNav() {
  const colors = useColors();
  const items = [
    { label: 'الرئيسية', icon: 'home' as const, route: '/(tabs)' },
    { label: 'البيع', icon: 'shopping-cart' as const, route: '/(tabs)/pos' },
    { label: 'التقارير', icon: 'bar-chart-2' as const, route: '/reports' },
    { label: 'المرتجعات', icon: 'corner-up-left' as const, route: '/returns' },
  ];
  return (
    <View style={[styles.utilityBottomNav, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      {items.map((item) => (
        <Pressable key={item.route} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.replace(item.route as any)} style={styles.utilityBottomNavItem}>
          <Feather name={item.icon} size={19} color={colors.primary} />
          <Text style={[styles.utilityBottomNavLabel, { color: colors.foreground }]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={onBack} style={styles.back}>
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionTitleText, { color: colors.foreground }]}>{children}</Text>
      {right}
    </View>
  );
}

export function AppButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: object;
  testID?: string;
}) {
  const colors = useColors();
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
    secondary: { bg: colors.secondary, fg: colors.secondaryForeground, border: colors.secondary },
    outline: { bg: 'transparent', fg: colors.foreground, border: colors.border },
    danger: { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled || loading ? 0.5 : pressed ? 0.82 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : null}
      {!loading && icon ? <Feather name={icon} size={18} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Feather name={icon} size={20} color={colors.foreground} />
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        textAlign="right"
        {...props}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.input },
          props.style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'warning' | 'success' | 'danger' }) {
  const colors = useColors();
  const palette = {
    default: { bg: colors.secondary, fg: colors.secondaryForeground },
    warning: { bg: '#F2F2F2', fg: '#000000' },
    success: { bg: '#F2F2F2', fg: '#000000' },
    danger: { bg: '#F2F2F2', fg: '#000000' },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, description, icon = 'inbox' }: { title: string; description: string; icon?: keyof typeof Feather.glyphMap }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={24} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{description}</Text>
    </View>
  );
}

export function ScreenLoading() {
  const colors = useColors();
  return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
}

export function Label({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return <Text style={{ color: muted ? colors.mutedForeground : colors.foreground, writingDirection: 'rtl', textAlign: 'right' }}>{children}</Text>;
}

export function showError(error: unknown) {
  const message = error instanceof Error ? error.message : 'حدث خطأ، حاول مرة أخرى.';
  Alert.alert('تعذّر إكمال العملية', message);
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 112, gap: 18 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, alignItems: 'flex-start' },
  back: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', writingDirection: 'rtl', textAlign: 'right' },
  subtitle: { marginTop: 3, fontSize: 13, writingDirection: 'rtl', textAlign: 'right' },
  card: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 12 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitleText: { fontSize: 17, fontWeight: '700', writingDirection: 'rtl', textAlign: 'right' },
  button: { minHeight: 50, paddingHorizontal: 16, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  buttonText: { fontSize: 15, fontWeight: '700', writingDirection: 'rtl', textAlign: 'center' },
  iconButton: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: '600', writingDirection: 'rtl', textAlign: 'right' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15, writingDirection: 'rtl' },
  error: { fontSize: 12, writingDirection: 'rtl', textAlign: 'right' },
  badge: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '700', writingDirection: 'rtl' },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  emptyText: { maxWidth: 280, fontSize: 14, lineHeight: 22, textAlign: 'center', writingDirection: 'rtl' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  utilityBottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 62, paddingBottom: Platform.OS === 'web' ? 4 : 8, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', zIndex: 100, elevation: 12 },
  utilityBottomNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  utilityBottomNavLabel: { fontSize: 10, fontWeight: '800' },
});
