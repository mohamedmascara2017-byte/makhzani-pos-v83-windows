import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppBottomNav, AppButton, AppPage, Card, formatMoney, PageHeader } from '@/components/common';
import { CountRecord, getProductDisplayName, Purchase, ReturnRecord, Sale, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';
import { router } from 'expo-router';

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = (value: number) => formatMoney(value);
const monthLabel = (date: Date) => date.toLocaleDateString('ar-DZ', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

function Metric({ label, value, icon, accent }: { label: string; value: string; icon: keyof typeof Feather.glyphMap; accent?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: colors.secondary }]}><Feather name={icon} size={18} color={colors.primary} /></View>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: accent ? colors.primary : colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function ReportsScreen() {
  const colors = useColors();
  const { products, sales, purchases, returns, counts, expenses, addExpense } = useStore();
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(() => dayKey(today));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [periodStart, setPeriodStart] = useState(() => dayKey(today));
  const [periodEnd, setPeriodEnd] = useState(() => dayKey(today));
  const [choosingEnd, setChoosingEnd] = useState(false);
  const [reportType, setReportType] = useState<'profits' | 'inventory'>('profits');
  const [expenseVisible, setExpenseVisible] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');

  const selectedDate = new Date(`${selectedDay}T12:00:00`);
  const daySales = useMemo(() => sales.filter(x => Number.isFinite(new Date(x.createdAt).getTime()) && dayKey(new Date(x.createdAt)) === selectedDay), [sales, selectedDay]);
  const allSales = useMemo(() => [...sales].filter(sale => sale && Array.isArray(sale.items)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [sales]);
  const dayPurchases = useMemo(() => purchases.filter(x => dayKey(new Date(x.createdAt)) === selectedDay), [purchases, selectedDay]);
  const dayReturns = useMemo(() => returns.filter(x => dayKey(new Date(x.createdAt)) === selectedDay), [returns, selectedDay]);
  const dayExpenses = useMemo(() => (expenses ?? []).filter(x => dayKey(new Date(x.createdAt)) === selectedDay), [expenses, selectedDay]);

  const normalizedStart = periodStart <= periodEnd ? periodStart : periodEnd;
  const normalizedEnd = periodStart <= periodEnd ? periodEnd : periodStart;
  const inPeriod = (value: string) => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) && dayKey(new Date(time)) >= normalizedStart && dayKey(new Date(time)) <= normalizedEnd;
  };
  const periodSales = useMemo(() => sales.filter(x => inPeriod(x.createdAt)), [sales, normalizedStart, normalizedEnd]);
  const periodReturns = useMemo(() => returns.filter(x => inPeriod(x.createdAt)), [returns, normalizedStart, normalizedEnd]);
  const periodExpenses = useMemo(() => (expenses ?? []).filter(x => inPeriod(x.createdAt)), [expenses, normalizedStart, normalizedEnd]);
  const periodRevenue = periodSales.reduce((sum, x) => sum + x.total, 0);
  const periodCost = periodSales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.purchasePrice * item.quantity, 0), 0);
  const periodReturnedRevenue = periodReturns.reduce((sum, x) => sum + x.total, 0);
  const periodReturnedCost = periodReturns.reduce((sum, ret) => {
    const sale = sales.find(item => item.id === ret.saleId);
    return sum + ret.items.reduce((sub, item) => {
      const line = sale?.items.find(i => i.id === item.saleItemId);
      return sub + (line?.purchasePrice ?? 0) * item.quantity;
    }, 0);
  }, 0);
  const periodGrossProfit = periodRevenue - periodCost - periodReturnedRevenue + periodReturnedCost;
  const periodExpenseTotal = periodExpenses.reduce((sum, x) => sum + x.amount, 0);
  const periodNetProfit = periodGrossProfit - periodExpenseTotal;

  // Profit per stock record (each variant has its own productId and purchase cost).
  // Returns are posted on their actual return date and linked back to their sale line.
  const periodProductProfits = useMemo(() => {
    const byProduct = new Map<string, { productId: string; name: string; soldQuantity: number; netRevenue: number; netCost: number }>();
    const ensure = (productId: string, name: string) => {
      let row = byProduct.get(productId);
      if (!row) {
        row = { productId, name, soldQuantity: 0, netRevenue: 0, netCost: 0 };
        byProduct.set(productId, row);
      }
      return row;
    };

    for (const sale of periodSales) {
      const promotedTotal = sale.items.reduce((sum, line) => sum + line.quantity * line.salePrice, 0);
      const promotionDiscount = sale.items.reduce((sum, line) => sum + line.quantity * Math.max(0, (line.originalSalePrice ?? line.salePrice) - line.salePrice), 0);
      const manualDiscount = Math.max(0, sale.discount - promotionDiscount);
      const legacyDiscountFactor = promotedTotal > 0 ? Math.max(0, (promotedTotal - manualDiscount) / promotedTotal) : 1;
      const factor = sale.discountAllocated ? 1 : legacyDiscountFactor;
      for (const line of sale.items) {
        const row = ensure(line.productId, line.productName || 'منتج غير معروف');
        row.soldQuantity += line.quantity;
        row.netRevenue += line.quantity * line.salePrice * factor;
        row.netCost += line.quantity * line.purchasePrice;
      }
    }

    for (const record of periodReturns) {
      const sale = sales.find((item) => item.id === record.saleId);
      for (const returned of record.items) {
        const sourceLine = sale?.items.find((line) => line.id === returned.saleItemId);
        const name = sourceLine?.productName ?? products.find((item) => item.id === returned.productId)?.name ?? 'منتج غير معروف';
        const row = ensure(returned.productId, name);
        row.soldQuantity -= returned.quantity;
        row.netRevenue -= returned.quantity * returned.price;
        row.netCost -= returned.quantity * (sourceLine?.purchasePrice ?? 0);
      }
    }

    return [...byProduct.values()]
      .map((row) => ({ ...row, profit: row.netRevenue - row.netCost }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8);
  }, [periodSales, periodReturns, sales, products]);
  const chooseCalendarDay = (day: number) => {
    const key = dayKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
    setSelectedDay(key);
    if (!choosingEnd) {
      setPeriodStart(key);
      setPeriodEnd(key);
      setChoosingEnd(true);
    } else {
      if (key < periodStart) { setPeriodStart(key); setPeriodEnd(periodStart); }
      else setPeriodEnd(key);
      setChoosingEnd(false);
    }
  };

  const revenue = daySales.reduce((sum, x) => sum + x.total, 0);
  const soldQuantity = daySales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.quantity, 0), 0);
  const purchasedQuantity = dayPurchases.reduce((sum, purchase) => sum + purchase.items.reduce((subtotal, item) => subtotal + item.quantity, 0), 0);
  const cost = daySales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.purchasePrice * item.quantity, 0), 0);
  const returnedRevenue = dayReturns.reduce((sum, x) => sum + x.total, 0);
  const returnedCost = dayReturns.reduce((sum, ret) => {
    const sale = sales.find(s => s.id === ret.saleId);
    return sum + ret.items.reduce((sub, item) => {
      const line = sale?.items.find(i => i.id === item.saleItemId);
      return sub + (line?.purchasePrice ?? 0) * item.quantity;
    }, 0);
  }, 0);
  // Sale.total already includes the discount, so do not subtract the discount a second time.
  const grossProfit = revenue - cost - returnedRevenue + returnedCost;
  const expenseTotal = dayExpenses.reduce((sum, x) => sum + x.amount, 0);
  const netProfit = grossProfit - expenseTotal;

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const leading = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return [...Array(leading).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [calendarMonth]);

  const moveCalendar = (monthDelta: number) => {
    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + monthDelta, 1);
    setCalendarMonth(nextMonth);
    const wantedDay = Number(selectedDay.slice(-2));
    const safeDay = Math.min(wantedDay, new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate());
    setSelectedDay(dayKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), safeDay)));
  };
  const moveYear = (yearDelta: number) => {
    const nextMonth = new Date(calendarMonth.getFullYear() + yearDelta, calendarMonth.getMonth(), 1);
    setCalendarMonth(nextMonth);
    const wantedDay = Number(selectedDay.slice(-2));
    const safeDay = Math.min(wantedDay, new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate());
    setSelectedDay(dayKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), safeDay)));
  };
  const selectDay = (day: number) => setSelectedDay(dayKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)));
  const goToday = () => {
    const now = new Date();
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(dayKey(now));
  };

  const historicalInventory = useMemo(() => {
    const quantities: Record<string, number> = Object.fromEntries(products.map(product => [product.id, product.quantity]));
    const unitCosts: Record<string, number> = Object.fromEntries(products.map(product => [product.id, product.purchasePrice]));
    const movements: Array<{ createdAt: string; type: 'sale' | 'purchase' | 'return' | 'count'; record: Sale | Purchase | ReturnRecord | CountRecord }> = [
      ...sales.map(record => ({ createdAt: record.createdAt, type: 'sale' as const, record })),
      ...purchases.map(record => ({ createdAt: record.createdAt, type: 'purchase' as const, record })),
      ...returns.map(record => ({ createdAt: record.createdAt, type: 'return' as const, record })),
      ...(counts ?? []).map(record => ({ createdAt: record.createdAt, type: 'count' as const, record })),
    ];
    // Reverse movements after the selected day to estimate the end-of-day stock.
    movements
      .filter(movement => dayKey(new Date(movement.createdAt)) > selectedDay)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach(movement => {
        if (movement.type === 'sale') {
          const record = movement.record as Sale;
          record.items.forEach(item => { quantities[item.productId] = (quantities[item.productId] ?? 0) + item.quantity; });
        } else if (movement.type === 'purchase') {
          const record = movement.record as Purchase;
          record.items.forEach(item => { quantities[item.productId] = (quantities[item.productId] ?? 0) - item.quantity; });
        } else if (movement.type === 'return') {
          const record = movement.record as ReturnRecord;
          record.items.forEach(item => { quantities[item.productId] = (quantities[item.productId] ?? 0) - item.quantity; });
        } else {
          const record = movement.record as CountRecord;
          record.items.forEach(item => { quantities[item.productId] = item.oldQuantity; });
        }
      });

    // Prefer the latest recorded purchase price on or before the selected date where available.
    [...purchases]
      .filter(purchase => dayKey(new Date(purchase.createdAt)) <= selectedDay)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach(purchase => purchase.items.forEach(item => {
        if (!Object.prototype.hasOwnProperty.call(unitCosts, `purchase:${item.productId}`)) {
          unitCosts[`purchase:${item.productId}`] = item.purchasePrice;
        }
      }));
    const rows = products.map(product => {
      const quantity = Math.max(0, quantities[product.id] ?? 0);
      const purchaseCost = unitCosts[`purchase:${product.id}`] ?? product.purchasePrice;
      return { ...product, historicalQuantity: quantity, historicalUnitCost: purchaseCost, historicalValue: quantity * purchaseCost };
    }).filter(product => product.historicalQuantity > 0).sort((a, b) => b.historicalValue - a.historicalValue);
    return { rows, totalQuantity: rows.reduce((sum, product) => sum + product.historicalQuantity, 0), totalValue: rows.reduce((sum, product) => sum + product.historicalValue, 0) };
  }, [products, sales, purchases, returns, counts, selectedDay]);

  const saveExpense = () => {
    const amount = Number(expenseAmount.trim().replace(',', '.'));
    if (!expenseTitle.trim()) {
      Alert.alert('نوع المصروف مطلوب', 'اكتب اسم المصروف مثل النقل أو الكهرباء.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('مبلغ غير صحيح', 'أدخل مبلغًا أكبر من صفر بالدينار الجزائري (دج).');
      return;
    }
    try {
      addExpense(expenseTitle.trim(), amount, expenseNote.trim(), new Date(`${selectedDay}T12:00:00`).toISOString());
      setExpenseTitle(''); setExpenseAmount(''); setExpenseNote(''); setExpenseVisible(false);
      Alert.alert('تم حفظ المصروف', 'أُضيف المصروف إلى تقرير اليوم المحدد.');
    } catch (e) { Alert.alert('تعذر الحفظ', e instanceof Error ? e.message : 'راجع البيانات.'); }
  };

  const dateLabel = selectedDate.toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
    <AppPage>
      <PageHeader title="لوحة التقارير" subtitle="ملخص المبيعات والربح والمخزون في مكان واحد" right={<Pressable accessibilityRole="button" accessibilityLabel="رجوع إلى القائمة" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/more')} style={{ minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}><Feather name="arrow-right" size={16} color={colors.foreground} /><Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12 }}>رجوع</Text></Pressable>} />
      <View style={[styles.switcher, { backgroundColor: colors.secondary }]}>
        <Pressable onPress={() => setReportType('profits')} style={[styles.switchButton, reportType === 'profits' && { backgroundColor: colors.primary }]}>
          <Feather name="trending-up" size={16} color={reportType === 'profits' ? colors.primaryForeground : colors.secondaryForeground} />
          <Text style={{ color: reportType === 'profits' ? colors.primaryForeground : colors.secondaryForeground, fontWeight: '700' }}>الأداء المالي</Text>
        </Pressable>
        <Pressable onPress={() => setReportType('inventory')} style={[styles.switchButton, reportType === 'inventory' && { backgroundColor: colors.primary }]}>
          <Feather name="archive" size={16} color={reportType === 'inventory' ? colors.primaryForeground : colors.secondaryForeground} />
          <Text style={{ color: reportType === 'inventory' ? colors.primaryForeground : colors.secondaryForeground, fontWeight: '700' }}>حالة المخزون</Text>
        </Pressable>
      </View>

      <Card style={[styles.datePanel, { borderColor: colors.primary, borderWidth: 1.5 }]}>
        <View style={styles.datePanelTop}>
          <Pressable accessibilityRole="button" onPress={() => moveCalendar(-1)} style={[styles.dateArrow, { borderColor: colors.border }]}>
            <Feather name="chevron-right" size={22} color={colors.primary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={[styles.dateMain, { color: colors.foreground }]}>{monthLabel(calendarMonth)}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>اختر يوم البداية ثم يوم النهاية لحساب أرباح الفترة</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => moveCalendar(1)} style={[styles.dateArrow, { borderColor: colors.border }]}>
            <Feather name="chevron-left" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.calendarGrid}>
          {WEEKDAYS.map(day => <Text key={day} style={[styles.calendarWeekday, { color: colors.mutedForeground }]}>{day.slice(0, 1)}</Text>)}
          {calendarCells.map((day, index) => {
            const key = day ? dayKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)) : '';
            const selected = !!day && key >= normalizedStart && key <= normalizedEnd;
            const edge = !!day && (key === normalizedStart || key === normalizedEnd);
            const hasSales = !!day && sales.some(item => dayKey(new Date(item.createdAt)) === key);
            return <Pressable key={`${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}-${index}`} disabled={!day} onPress={() => day && chooseCalendarDay(day)} style={[styles.calendarDay, { backgroundColor: edge ? colors.primary : selected ? colors.secondary : 'transparent', borderColor: edge ? colors.primary : 'transparent' }]}>
              {day ? <><Text style={{ color: edge ? colors.primaryForeground : colors.foreground, fontWeight: edge ? '900' : '600' }}>{day}</Text>{hasSales ? <View style={[styles.calendarDot, { backgroundColor: edge ? colors.primaryForeground : colors.accent }]} /> : <View style={styles.calendarDotPlaceholder} />}</> : null}
            </Pressable>;
          })}
        </View>
        <View style={styles.periodActions}>
          <Pressable onPress={() => { const now = new Date(); const key = dayKey(now); setPeriodStart(key); setPeriodEnd(key); setSelectedDay(key); setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setChoosingEnd(false); }} style={[styles.periodChip, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.secondaryForeground, fontWeight: '800' }}>اليوم</Text></Pressable>
          <Pressable onPress={() => { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1); setPeriodStart(dayKey(start)); setPeriodEnd(dayKey(now)); setSelectedDay(dayKey(now)); setCalendarMonth(start); setChoosingEnd(false); }} style={[styles.periodChip, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.secondaryForeground, fontWeight: '800' }}>هذا الشهر</Text></Pressable>
          <Pressable onPress={() => { setPeriodStart(dayKey(today)); setPeriodEnd(dayKey(today)); setChoosingEnd(false); }} style={[styles.periodChip, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.secondaryForeground, fontWeight: '800' }}>إلغاء الفترة</Text></Pressable>
        </View>
        <Text style={{ color: colors.mutedForeground, textAlign: 'center', fontSize: 12 }}>الفترة: {normalizedStart} ← {normalizedEnd}</Text>
      </Card>

      {reportType === 'profits' ? <Card style={[styles.periodSummary, { backgroundColor: colors.card, borderColor: colors.accent }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>نتيجة الفترة المحددة</Text>
        <Text style={[styles.periodProfit, { color: periodNetProfit >= 0 ? '#000000' : colors.destructive }]}>{money(periodNetProfit)}</Text>
        <Text style={{ color: colors.mutedForeground, textAlign: 'center', fontSize: 12 }}>صافي الربح من {normalizedStart} إلى {normalizedEnd}</Text>
        <View style={styles.periodStats}>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>إجمالي المبيعات</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodRevenue)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>قيمة المرتجعات ({periodReturns.length} عملية)</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodReturnedRevenue)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>صافي المبيعات</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodRevenue - periodReturnedRevenue)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>تكلفة البضاعة المباعة</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodCost)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>تكلفة المرتجعات المستعادة</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodReturnedCost)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>صافي تكلفة البضاعة</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodCost - periodReturnedCost)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>الربح قبل المصاريف</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodGrossProfit)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>المصاريف</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{money(periodExpenseTotal)}</Text></View>
          <View style={styles.periodStat}><Text style={{ color: colors.mutedForeground, fontSize: 11 }}>الفواتير</Text><Text style={{ color: colors.foreground, fontWeight: '800' }}>{periodSales.length}</Text></View>
        </View>
      </Card> : null}
      {reportType === 'profits' ? <Card style={styles.summary}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>المنتجات الأكثر ربحاً في الفترة</Text>
        {periodProductProfits.length ? periodProductProfits.map((item, index) => (
          <View key={item.productId} style={[styles.stockRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.expenseName, { color: colors.foreground }]}>{index + 1}. {item.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>الكمية الصافية: {Number(item.soldQuantity.toFixed(3))} · صافي المبيعات: {money(item.netRevenue)}</Text>
            </View>
            <Text style={[styles.expenseValue, { color: item.profit >= 0 ? colors.foreground : colors.destructive }]}>{money(item.profit)}</Text>
          </View>
        )) : <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد مبيعات أو مرتجعات ضمن الفترة المحددة.</Text>}
      </Card> : null}

      <Card style={styles.datePanel}>
        <View style={styles.datePanelTop}>
          <Pressable accessibilityRole="button" onPress={() => setSelectedDay(dayKey(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1)))} style={[styles.dateArrow, { borderColor: colors.border }]}>
            <Feather name="chevron-right" size={22} color={colors.primary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={[styles.dateMain, { color: colors.foreground }]}>{selectedDate.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{selectedDate.toLocaleDateString('ar-DZ', { weekday: 'long' })}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setSelectedDay(dayKey(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1)))} style={[styles.dateArrow, { borderColor: colors.border }]}>
            <Feather name="chevron-left" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.datePanelBottom}>
          <Pressable onPress={goToday} style={[styles.todayPill, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>العودة إلى اليوم</Text></Pressable>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>التقارير محسوبة حسب التاريخ المختار</Text>
        </View>
      </Card>

      {reportType === 'profits' ? (
        <>
          <View style={[styles.netProfitCard, { backgroundColor: colors.primary }]}>
            <View style={styles.netProfitHeading}>
              <Feather name="trending-up" size={22} color={colors.primaryForeground} />
              <Text style={[styles.netProfitLabel, { color: colors.primaryForeground }]}>صافي الربح لهذا اليوم</Text>
            </View>
            <Text style={[styles.netProfitValue, { color: colors.primaryForeground }]}>{money(netProfit)}</Text>
            <Text style={[styles.netProfitHint, { color: colors.primaryForeground }]}>بعد تكلفة البضاعة والمرتجعات والمصاريف المسجلة</Text>
          </View>
          <View style={styles.grid}>
            <Metric label="إجمالي المبيعات" value={money(revenue)} icon="shopping-bag" accent />
            <Metric label="تكلفة البضاعة المباعة" value={money(cost)} icon="package" />
            <Metric label="الربح قبل المصاريف" value={money(grossProfit)} icon="bar-chart-2" accent />
            <Metric label="المصاريف المسجلة" value={money(expenseTotal)} icon="credit-card" />
          </View>
          <Card style={styles.summary}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>ملخص يوم {selectedDay}</Text>
            <Row label="عدد فواتير البيع" value={String(daySales.length)} />
            <Row label="إجمالي الكميات المباعة" value={String(soldQuantity)} />
            <Row label="عدد عمليات الإرجاع" value={String(dayReturns.length)} />
            <Row label="المبالغ المسترجعة للزبائن" value={money(returnedRevenue)} />
            <Row label="صافي المبيعات بعد المرتجعات" value={money(revenue - returnedRevenue)} />
            <Row label="تكلفة البضاعة المعادة للمخزون" value={money(returnedCost)} />
            <Row label="تكلفة البضاعة بعد المرتجعات" value={money(cost - returnedCost)} />
            <Row label="الربح بعد المرتجعات وقبل المصاريف" value={money(grossProfit)} />
            <Row label="مشتريات الموردين (ليست مصروف ربح مباشر)" value={money(dayPurchases.reduce((sum, x) => sum + x.total, 0))} />
            <Row label="إجمالي الكميات المضافة للمخزون" value={String(purchasedQuantity)} />
            <Row label="عدد المصاريف المسجلة" value={String(dayExpenses.length)} />
          </Card>
          <AppButton title={`إضافة مصروف ليوم ${selectedDay}`} icon="plus-circle" onPress={() => setExpenseVisible(true)} />
          <Card style={styles.summary}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>مصاريف اليوم</Text>
            {dayExpenses.length ? dayExpenses.map(x => <View key={x.id} style={[styles.expenseRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.expenseName, { color: colors.foreground }]}>{x.title}</Text>
                {!!x.note && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{x.note}</Text>}
              </View>
              <Text style={[styles.expenseValue, { color: colors.foreground }]}>{money(x.amount)}</Text>
            </View>) : <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد مصاريف مسجلة في هذا اليوم.</Text>}
          </Card>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>صافي الربح = (مبيعات الفواتير بعد الخصومات − المبالغ المسترجعة) − (تكلفة البضاعة المباعة − تكلفة البضاعة المعادة للمخزون) − المصاريف المسجلة. مشتريات الموردين لا تُخصم كاملة من ربح اليوم لأنها تبقى مخزونًا حتى تُباع. لا يشمل المصاريف القديمة غير المسجلة.</Text>
        </>
      ) : (
        <>
          <View style={styles.grid}>
            <Metric label="قيمة المخزون التقديرية" value={money(historicalInventory.totalValue)} icon="archive" accent />
            <Metric label="إجمالي الكميات المتبقية" value={String(historicalInventory.totalQuantity)} icon="package" />
            <Metric label="عدد الأصناف المتوفرة" value={String(historicalInventory.rows.length)} icon="layers" />
          </View>
          <Card style={styles.summary}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>المخزون في نهاية يوم {selectedDay}</Text>
            {historicalInventory.rows.length ? historicalInventory.rows.map(product => (
              <View key={product.id} style={[styles.stockRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.expenseName, { color: colors.foreground }]}>{getProductDisplayName(product)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>سعر الشراء: {money(product.historicalUnitCost)}</Text>
                </View>
                <View style={styles.stockNumbers}>
                  <Text style={[styles.stockQuantity, { color: colors.foreground }]}>{product.historicalQuantity} {product.unit}</Text>
                  <Text style={[styles.expenseValue, { color: colors.primary }]}>{money(product.historicalValue)}</Text>
                </View>
              </View>
            )) : <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد كميات متاحة في هذا التاريخ حسب السجلات الحالية.</Text>}
          </Card>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>هذا تقرير تاريخي تقديري يُعاد بناؤه من حركات البيع والشراء والمرتجعات والجرد المحفوظة. قيمة المخزون تعتمد على أسعار الشراء المسجلة المتاحة؛ إذا كانت حركات قديمة غير مسجلة، فقد تختلف النتيجة.</Text>
        </>
      )}

      {reportType === 'profits' ? (
        <>
          <Card style={styles.summary}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>تفاصيل مبيعات يوم {selectedDay}</Text>
            {daySales.length ? daySales.map((sale) => (
              <View key={sale.id} style={[styles.detailCard, { borderBottomColor: colors.border }]}>
                <View style={styles.detailHeader}>
                  <Text style={[styles.detailTime, { color: colors.mutedForeground }]}>{new Date(sale.createdAt).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}</Text>
                  <Text style={[styles.detailTotal, { color: colors.primary }]}>{money(sale.total)}</Text>
                </View>
                {sale.items.map((item) => (
                  <View key={item.id} style={styles.detailLine}>
                    <Text style={[styles.detailName, { color: colors.foreground }]}>{item.productName}</Text>
                    <Text style={[styles.detailQty, { color: colors.mutedForeground }]}>{item.quantity} × {money(item.salePrice)}</Text>
                  </View>
                ))}
                <Text style={[styles.detailMeta, { color: colors.mutedForeground }]}>الدفع: {sale.paymentMethod} · الفاتورة: {sale.id.slice(-8)}</Text>
              </View>
            )) : <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد مبيعات في هذا اليوم.</Text>}
          </Card>
          <Card style={styles.summary}>
            <View style={styles.detailHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>سجل معاملات البيع</Text>
              <Text style={[styles.detailMeta, { color: colors.mutedForeground }]}>{allSales.length} فاتورة</Text>
            </View>
            {allSales.length ? allSales.map((sale) => (
              <View key={`history-${sale.id}`} style={[styles.detailCard, { borderBottomColor: colors.border }]}>
                <View style={styles.detailHeader}>
                  <Text style={[styles.detailTime, { color: colors.mutedForeground }]}>{Number.isFinite(new Date(sale.createdAt).getTime()) ? new Date(sale.createdAt).toLocaleString('ar-DZ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'تاريخ غير محدد'}</Text>
                  <Text style={[styles.detailTotal, { color: colors.primary }]}>{money(Number(sale.total) || 0)}</Text>
                </View>
                {(sale.items ?? []).map((item, index) => (
                  <View key={item.id || `${sale.id}-${index}`} style={styles.detailLine}>
                    <Text style={[styles.detailName, { color: colors.foreground }]}>{item.productName || 'منتج'}</Text>
                    <Text style={[styles.detailQty, { color: colors.mutedForeground }]}>{Number(item.quantity) || 0} × {money(Number(item.salePrice) || 0)}</Text>
                  </View>
                ))}
                <Text style={[styles.detailMeta, { color: colors.mutedForeground }]}>الدفع: {sale.paymentMethod || 'غير محدد'} · الفاتورة: {String(sale.id).slice(-6)} · {sale.employeeName || 'غير محدد'}</Text>
              </View>
            )) : <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد معاملات بيع محفوظة حتى الآن.</Text>}
          </Card>
          <Card style={styles.summary}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>تفاصيل المشتريات / الإضافة للمخزون</Text>
            {dayPurchases.length ? dayPurchases.map((purchase) => (
              <View key={purchase.id} style={[styles.detailCard, { borderBottomColor: colors.border }]}>
                <View style={styles.detailHeader}>
                  <Text style={[styles.detailTime, { color: colors.mutedForeground }]}>{new Date(purchase.createdAt).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}</Text>
                  <Text style={[styles.detailTotal, { color: colors.primary }]}>{money(purchase.total)}</Text>
                </View>
                <Text style={[styles.detailMeta, { color: colors.foreground }]}>المورد: {purchase.supplier}</Text>
                {purchase.items.map((item) => (
                  <View key={item.id} style={styles.detailLine}>
                    <Text style={[styles.detailName, { color: colors.foreground }]}>{item.productName}</Text>
                    <Text style={[styles.detailQty, { color: colors.mutedForeground }]}>{item.quantity} × {money(item.purchasePrice)}</Text>
                  </View>
                ))}
              </View>
            )) : <Text style={{ color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12 }}>لا توجد مشتريات أو إضافات للمخزون في هذا اليوم.</Text>}
          </Card>
        </>
      ) : null}

      <Modal visible={expenseVisible} transparent animationType="fade" onRequestClose={() => setExpenseVisible(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>إضافة مصروف ليوم {selectedDay}</Text>
          <TextInput value={expenseTitle} onChangeText={setExpenseTitle} placeholder="نوع المصروف (نقل، كهرباء...)" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <TextInput value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" placeholder="المبلغ بالدينار" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <TextInput value={expenseNote} onChangeText={setExpenseNote} placeholder="ملاحظة (اختياري)" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <AppButton title="حفظ المصروف" icon="check" onPress={saveExpense} />
          <Pressable onPress={() => setExpenseVisible(false)} style={{ padding: 12 }}><Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>إلغاء</Text></Pressable>
        </View></View>
      </Modal>
    </AppPage>
    <AppBottomNav />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return <View style={styles.summaryRow}><Text style={{ color: colors.mutedForeground }}>{label}</Text><Text style={[styles.summaryValue, { color: colors.foreground }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  datePanel: { padding: 16, gap: 14, borderRadius: 18 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', rowGap: 5 },
  calendarWeekday: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '800', paddingVertical: 5 },
  calendarDay: { width: '14.2857%', minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  calendarDot: { width: 5, height: 5, borderRadius: 3 },
  calendarDotPlaceholder: { width: 5, height: 5 },
  periodActions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  periodChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12 },
  periodSummary: { borderWidth: 1.5, borderRadius: 20, padding: 17, gap: 12 },
  periodProfit: { fontSize: 30, fontWeight: '900', textAlign: 'center' },
  periodStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodStat: { width: '48%', backgroundColor: '#F5F5F5', borderRadius: 12, padding: 10, gap: 4 },
  datePanelTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateArrow: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dateMain: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  datePanelBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#99999944', paddingTop: 12 },
  todayPill: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  netProfitCard: { borderRadius: 20, padding: 20, gap: 10, marginBottom: 2 },
  netProfitHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  netProfitLabel: { fontSize: 15, fontWeight: '800', textAlign: 'right' },
  netProfitValue: { fontSize: 30, fontWeight: '900', textAlign: 'right' },
  netProfitHint: { fontSize: 11, textAlign: 'right', opacity: 0.9 },
  switcher: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  switchButton: { flex: 1, minHeight: 42, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  calendarCard: { padding: 12, gap: 10 },
  calendarTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  calendarNav: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  calendarHeading: { flex: 1, alignItems: 'center', gap: 3 },
  calendarMonth: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  weekdays: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  dayCell: { width: `${100 / 7}%`, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginVertical: 1 },
  dayButton: { borderWidth: StyleSheet.hairlineWidth },
  calendarBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4 },
  todayButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  selectedDateText: { flex: 1, fontSize: 12, textAlign: 'right', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', flexGrow: 1, minHeight: 120, borderWidth: 1, borderRadius: 16, padding: 12, gap: 7 },
  metricIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 12, textAlign: 'right' },
  metricValue: { fontSize: 16, fontWeight: '800', textAlign: 'right' },
  summary: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', textAlign: 'right' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  summaryValue: { fontWeight: '800' },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  stockNumbers: { alignItems: 'flex-end', gap: 3 },
  stockQuantity: { fontSize: 12, fontWeight: '700' },
  expenseName: { fontWeight: '700', textAlign: 'right' },
  expenseValue: { fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 20, padding: 18, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, textAlign: 'right' },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'right', marginBottom: 20 },
  detailCard: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailTime: { fontSize: 11 },
  detailTotal: { fontSize: 14, fontWeight: '800' },
  detailLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  detailName: { flex: 1, fontSize: 12, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  detailQty: { fontSize: 11, writingDirection: 'rtl' },
  detailMeta: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
});
