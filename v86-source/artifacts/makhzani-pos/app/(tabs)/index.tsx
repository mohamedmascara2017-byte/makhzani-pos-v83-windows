import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppPage, Badge, Card, formatDate, formatMoney, SectionTitle } from '@/components/common';
import { useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: keyof typeof Feather.glyphMap }) {
  const colors = useColors();
  return (
    <Card style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricNote, { color: colors.primary }]}>{note}</Text>
    </Card>
  );
}

function QuickAction({ label, icon, onPress, tone }: { label: string; icon: keyof typeof Feather.glyphMap; onPress: () => void; tone?: 'amber' | 'green' }) {
  const colors = useColors();
  const backgroundColor = colors.secondary;
  const color = colors.primary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 }]}>
      <View style={[styles.actionIcon, { backgroundColor }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.foreground }]}>{label}</Text>
      <Feather name="arrow-up-left" size={15} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { currentUser, products, sales, audit, logout } = useStore();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = sales.filter((sale) => new Date(sale.createdAt) >= start);
  const todayRevenue = today.reduce((sum, sale) => sum + sale.total, 0);
  const todayProfit = today.reduce(
    (sum, sale) => sum + sale.items.reduce((lineSum, line) => lineSum + ((line.originalSalePrice ?? line.salePrice) - line.purchasePrice) * line.quantity, 0) - sale.discount,
    0,
  );
  const lowStock = products.filter((product) => product.quantity <= product.minQuantity);

  const signOut = () => Alert.alert('تسجيل الخروج', 'هل تريد إنهاء الجلسة الحالية؟', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'خروج', style: 'destructive', onPress: () => { logout(); router.replace('/login' as never); } },
  ]);

  return (
    <AppPage>
      <View style={styles.topLine}>
        <View style={styles.brandMark}><Feather name="shopping-bag" size={18} color={colors.primaryForeground} /></View>
        <View style={styles.greeting}>
          <Text style={[styles.greetingText, { color: colors.mutedForeground }]}>صباح الخير</Text>
          <Text style={[styles.userName, { color: colors.foreground }]}>{currentUser?.name ?? 'المالك'}</Text>
        </View>
        <Pressable accessibilityLabel="تسجيل الخروج" onPress={signOut} style={styles.signout}>
          <Feather name="log-out" size={19} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={styles.heroTop}>
          <Text style={styles.heroCaption}>ملخص اليوم</Text>
          <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>محلي</Text></View>
        </View>
        <Text style={styles.heroValue}>{formatMoney(todayRevenue)}</Text>
        <Text style={styles.heroFoot}>{today.length} فاتورة اليوم</Text>
        <View style={styles.heroBottom}>
          <View style={styles.heroStat}>
            <Feather name="trending-up" size={15} color="#FFFFFF" />
            <Text style={styles.heroStatText}>صافي ربح تقريبي {formatMoney(todayProfit)}</Text>
          </View>
          <Pressable accessibilityLabel="الانتقال إلى نقطة البيع" onPress={() => router.push('/(tabs)/pos' as never)} style={styles.heroButton}>
            <Feather name="arrow-up-left" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="عدد المنتجات" value={`${products.length}`} note="في المخزون" icon="archive" />
        <Metric label="مخزون منخفض" value={`${lowStock.length}`} note="يحتاج متابعة" icon="alert-circle" />
      </View>

      <SectionTitle>إجراءات سريعة</SectionTitle>
      <View style={styles.actions}>
        <QuickAction label="بيع جديد" icon="shopping-cart" tone="green" onPress={() => router.push('/(tabs)/pos' as never)} />
        <QuickAction label="إضافة منتج" icon="plus-circle" onPress={() => router.push('/product-form' as never)} />
        <QuickAction label="إدخال مشتريات" icon="truck" tone="amber" onPress={() => router.push('/purchases' as never)} />
        <QuickAction label="جرد المخزون" icon="check-square" onPress={() => router.push('/inventory-count' as never)} />
      </View>

      <SectionTitle right={<Text style={[styles.smallLink, { color: colors.mutedForeground }]}>آخر العمليات</Text>}>سجل النشاط</SectionTitle>
      <Card style={styles.activityCard}>
        {!audit.length ? (
          <View style={styles.activityEmpty}>
            <Feather name="clock" size={19} color={colors.mutedForeground} />
            <Text style={[styles.activityEmptyText, { color: colors.mutedForeground }]}>ستظهر عمليات البيع والمخزون هنا</Text>
          </View>
        ) : audit.slice(0, 5).map((entry, index) => (
          <View key={entry.id} style={[styles.activityRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.activityDot, { backgroundColor: colors.secondary }]}><Feather name="activity" size={14} color={colors.primary} /></View>
            <View style={styles.activityDetails}>
              <Text style={[styles.activityTitle, { color: colors.foreground }]}>{entry.action}</Text>
              <Text style={[styles.activityMeta, { color: colors.mutedForeground }]}>{entry.employeeName} · {formatDate(entry.createdAt)}</Text>
            </View>
            {index === 0 ? <Badge label="الآن" tone="success" /> : null}
          </View>
        ))}
      </Card>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 2 },
  brandMark: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  greeting: { flex: 1, alignItems: 'flex-start' },
  greetingText: { fontSize: 12, writingDirection: 'rtl' },
  userName: { marginTop: 2, fontSize: 17, fontWeight: '700', writingDirection: 'rtl' },
  signout: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 26, padding: 20, gap: 8, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroCaption: { color: '#FFFFFF', fontSize: 13, writingDirection: 'rtl' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.15)' },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#FFFFFF' },
  liveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  heroValue: { color: '#FFFFFF', fontSize: 30, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', marginTop: 3 },
  heroFoot: { color: '#FFFFFF', fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  heroBottom: { marginTop: 6, paddingTop: 12, borderTopColor: 'rgba(255,255,255,0.35)', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroStat: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  heroStatText: { color: '#FFFFFF', fontSize: 11, writingDirection: 'rtl' },
  heroButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, minHeight: 140, alignItems: 'flex-start', padding: 13, gap: 4 },
  metricIcon: { width: 32, height: 32, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  metricValue: { fontSize: 22, fontWeight: '700' },
  metricLabel: { fontSize: 12, writingDirection: 'rtl' },
  metricNote: { fontSize: 10, fontWeight: '600', writingDirection: 'rtl' },
  actions: { gap: 9 },
  action: { minHeight: 58, borderWidth: 1, borderRadius: 17, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  smallLink: { fontSize: 12, writingDirection: 'rtl' },
  activityCard: { paddingVertical: 2, gap: 0 },
  activityEmpty: { minHeight: 64, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  activityEmptyText: { fontSize: 13, writingDirection: 'rtl' },
  activityRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  activityDot: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activityDetails: { flex: 1, gap: 4, alignItems: 'flex-start' },
  activityTitle: { fontSize: 13, fontWeight: '600', writingDirection: 'rtl' },
  activityMeta: { fontSize: 10, writingDirection: 'rtl' },
});
