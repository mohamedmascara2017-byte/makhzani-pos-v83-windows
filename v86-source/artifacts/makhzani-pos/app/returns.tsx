import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppBottomNav, AppButton, AppPage, Card, EmptyState, formatDate, formatMoney, PageHeader, TextField } from '@/components/common';
import { Sale, SaleLine, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

export default function ReturnsScreen() {
  const colors = useColors();
  const { sales, returns, returnSaleItems } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const selected = sales.find((sale) => sale.id === selectedId) ?? null;

  const remaining = useMemo(() => {
    const result: Record<string, number> = {};
    for (const sale of sales) {
      for (const line of sale.items) {
        const alreadyReturned = returns
          .filter((item) => item.saleId === sale.id)
          .flatMap((item) => item.items)
          .filter((item) => item.saleItemId === line.id)
          .reduce((sum, item) => sum + item.quantity, 0);
        result[line.id] = Math.max(0, line.quantity - alreadyReturned);
      }
    }
    return result;
  }, [returns, sales]);

  const submit = () => {
    if (!selected) return;
    setSaving(true);
    try {
      const record = returnSaleItems(selected.id, Object.fromEntries(
        Object.entries(quantities).map(([id, value]) => [id, Number(value.replace(',', '.')) || 0]),
      ));
      Alert.alert('تم تسجيل المرتجع', `قيمة المنتجات المعادة: ${formatMoney(record.total)}\nتم تحديث المخزون.`);
      setSelectedId(null);
      setQuantities({});
    } catch (error) {
      Alert.alert('تعذر تسجيل المرتجع', error instanceof Error ? error.message : 'راجع الكميات وحاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <AppPage>
      <PageHeader title="المرتجعات" subtitle="اختر فاتورة البيع وحدد الكميات المعادة" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/more')} />
      {!selected ? (
        <>
          {!sales.length ? <Card><EmptyState title="لا توجد فواتير بيع" description="ستظهر الفواتير هنا بعد إتمام أول عملية بيع." icon="file-text" /></Card> : (
            <View style={styles.list}>
              {sales.map((sale) => (
                <SaleCard key={sale.id} sale={sale} onPress={() => { setSelectedId(sale.id); setQuantities({}); }} />
              ))}
            </View>
          )}
          {returns.length ? (
            <>
              <Text style={[styles.section, { color: colors.foreground }]}>آخر المرتجعات</Text>
              {returns.map((record) => (
                <Card key={record.id} style={styles.returnRow}>
                  <View style={styles.returnIcon}><Feather name="corner-up-left" size={17} color={colors.destructive} /></View>
                  <View style={{ flex: 1, alignItems: 'flex-start' }}>
                    <Text style={[styles.lineTitle, { color: colors.foreground }]}>مرتجع {record.id.slice(-6)} · فاتورة {record.saleId.slice(-8)}</Text>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>تاريخ الإرجاع: {formatDate(record.createdAt)} · {record.employeeName}</Text>
                  </View>
                  <Text style={[styles.money, { color: colors.destructive }]}>{formatMoney(record.total)}</Text>
                </Card>
              ))}
            </>
          ) : null}
        </>
      ) : (
        <>
          <Card style={styles.saleSummary}>
            <Text style={[styles.lineTitle, { color: colors.foreground }]}>فاتورة {selected.id.slice(-8)}</Text>
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>{formatDate(selected.createdAt)} · {selected.employeeName}</Text>
            <Text style={[styles.total, { color: colors.primary }]}>{formatMoney(selected.total)}</Text>
          </Card>
          <Text style={[styles.section, { color: colors.foreground }]}>أدخل كمية الإرجاع</Text>
          {selected.items.map((line) => (
            <ReturnLine
              key={line.id}
              line={line}
              remaining={remaining[line.id] ?? 0}
              value={quantities[line.id] ?? ''}
              onChange={(value) => setQuantities((old) => ({ ...old, [line.id]: value }))}
            />
          ))}
          <AppButton title="تسجيل المرتجع وتحديث المخزون" icon="check" onPress={submit} loading={saving} />
          <AppButton title="اختيار فاتورة أخرى" onPress={() => setSelectedId(null)} variant="outline" />
        </>
      )}
    </AppPage>
    <AppBottomNav />
    </>
  );
}

function SaleCard({ sale, onPress }: { sale: Sale; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.saleCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 }]}>
      <View style={[styles.saleIcon, { backgroundColor: colors.secondary }]}><Feather name="file-text" size={17} color={colors.primary} /></View>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Text style={[styles.lineTitle, { color: colors.foreground }]}>فاتورة {sale.id.slice(-8)}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{sale.items.length} أصناف · {formatDate(sale.createdAt)}</Text>
      </View>
      <Text style={[styles.money, { color: colors.primary }]}>{formatMoney(sale.total)}</Text>
      <Feather name="chevron-left" size={17} color={colors.mutedForeground} />
    </Pressable>
  );
}

function ReturnLine({ line, remaining, value, onChange }: { line: SaleLine; remaining: number; value: string; onChange: (value: string) => void }) {
  const colors = useColors();
  return (
    <Card style={styles.line}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Text style={[styles.lineTitle, { color: colors.foreground }]}>{line.productName}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>المباع {line.quantity} · المتبقي للإرجاع {remaining} · {formatMoney(line.salePrice)}</Text>
      </View>
      <View style={styles.quantityInput}>
        <TextField label="الكمية المعادة" value={value} onChangeText={onChange} placeholder="0" keyboardType="decimal-pad" editable={remaining > 0} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: 9 },
  saleCard: { minHeight: 68, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  saleIcon: { width: 36, height: 36, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  lineTitle: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  meta: { marginTop: 4, fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  money: { fontSize: 11, fontWeight: '700', writingDirection: 'rtl' },
  section: { fontSize: 15, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  returnRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12 },
  returnIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  saleSummary: { gap: 5 },
  total: { marginTop: 3, fontSize: 18, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  quantityInput: { width: 105 },
});
