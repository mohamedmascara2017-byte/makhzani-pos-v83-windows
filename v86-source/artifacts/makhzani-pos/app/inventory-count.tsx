import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppButton, AppPage, Card, EmptyState, PageHeader, TextField } from '@/components/common';
import { getProductDisplayName, Product, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

export default function InventoryCountScreen() {
  const colors = useColors();
  const { products, saveInventoryCount } = useStore();
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((product) => [product.id, `${product.quantity}`])),
  );
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return products.filter((product) => !q || `${product.name} ${product.variantName ?? ''}`.toLocaleLowerCase().includes(q) || product.barcode.toLocaleLowerCase().includes(q) || product.alternateBarcodes.some((code) => code.toLocaleLowerCase().includes(q)) || (product.sharedBarcode ?? '').toLocaleLowerCase().includes(q));
  }, [products, query]);
  const changed = products.reduce((sum, product) => sum + (Number(counted[product.id]) !== product.quantity ? 1 : 0), 0);

  const submit = () => {
    const values: Record<string, number> = {};
    for (const product of products) {
      const value = Number((counted[product.id] ?? '').replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) {
        Alert.alert('قيمة غير صحيحة', `راجع الكمية الفعلية لمنتج ${getProductDisplayName(product)}.`);
        return;
      }
      values[product.id] = value;
    }
    setSaving(true);
    try {
      saveInventoryCount(values, notes);
      Alert.alert('اكتمل الجرد', `تم تحديث كمية ${products.length} منتج.`);
      router.back();
    } catch (error) {
      Alert.alert('تعذر حفظ الجرد', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };
  const startScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('إذن الكاميرا مطلوب', 'فعّل إذن الكاميرا لمسح باركود المنتج.');
        return;
      }
    }
    setScanning(true);
  };

  return (
    <AppPage>
      <PageHeader title="جرد المخزون" subtitle="سجّل الكمية الفعلية لكل صنف قبل اعتماد التغييرات" onBack={() => router.back()} />
      {!products.length ? <Card><EmptyState title="لا توجد منتجات للجرد" description="أضف منتجاتك أولًا لتسجيل كمياتها." icon="check-square" /></Card> : (
        <>
          <Card style={styles.summary}>
            <Text style={[styles.summaryNumber, { color: colors.primary }]}>{changed}</Text>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Text style={[styles.summaryTitle, { color: colors.foreground }]}>تغييرات عن الكمية المسجلة</Text>
              <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>{products.length} صنف في عملية الجرد</Text>
            </View>
          </Card>
          <View style={styles.searchRow}>
            <View style={{ flex: 1 }}><TextField value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو الباركود" /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="مسح باركود للجرد" onPress={scanning ? () => setScanning(false) : startScan} style={[styles.scanButton, { backgroundColor: colors.secondary }]}>
              <Feather name={scanning ? 'x' : 'maximize'} size={18} color={colors.primary} />
            </Pressable>
          </View>
          {scanning && permission?.granted ? (
            <View style={styles.cameraFrame}>
              <CameraView
                style={StyleSheet.absoluteFill}
                active={scanning}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
                onBarcodeScanned={({ data }) => { setQuery(data); setScanning(false); }}
              />
              <Text style={styles.cameraHint}>وجّه الكاميرا نحو الباركود</Text>
            </View>
          ) : null}
          <View style={styles.list}>
            {visible.map((product) => (
              <CountRow
                key={product.id}
                product={product}
                value={counted[product.id] ?? ''}
                onChange={(value) => setCounted((old) => ({ ...old, [product.id]: value }))}
              />
            ))}
          </View>
          <TextField label="ملاحظات الجرد" value={notes} onChangeText={setNotes} placeholder="اختياري" multiline numberOfLines={3} style={styles.notes} />
          <AppButton title={`اعتماد الجرد (${products.length} صنف)`} icon="check" onPress={submit} loading={saving} testID="save-inventory-count" />
        </>
      )}
    </AppPage>
  );
}

function CountRow({ product, value, onChange }: { product: Product; value: string; onChange: (value: string) => void }) {
  const colors = useColors();
  const difference = Number(value) - product.quantity;
  const changed = value.trim() !== '' && difference !== 0;
  return (
    <Card style={styles.row}>
      <View style={styles.productInfo}>
        <Text style={[styles.productName, { color: colors.foreground }]}>{getProductDisplayName(product)}</Text>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>المسجل: {product.quantity} {product.unit}</Text>
        {changed ? <Text style={[styles.diff, { color: difference > 0 ? colors.primary : colors.destructive }]}>{difference > 0 ? '+' : ''}{difference} فرق</Text> : null}
      </View>
      <View style={styles.countInput}><TextField label="الفعلي" value={value} onChangeText={onChange} keyboardType="decimal-pad" /></View>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanButton: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cameraFrame: { height: 180, borderRadius: 20, overflow: 'hidden', backgroundColor: '#101713', alignItems: 'center', justifyContent: 'center' },
  cameraHint: { color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.5)', marginTop: 10, fontSize: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, writingDirection: 'rtl' },
  summaryNumber: { width: 45, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  summaryTitle: { fontSize: 13, fontWeight: '700', writingDirection: 'rtl', textAlign: 'right' },
  summaryNote: { marginTop: 3, fontSize: 10, writingDirection: 'rtl' },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  productInfo: { flex: 1, gap: 4, alignItems: 'flex-start' },
  productName: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  note: { fontSize: 10, writingDirection: 'rtl', textAlign: 'right' },
  diff: { fontSize: 10, fontWeight: '700', writingDirection: 'rtl' },
  countInput: { width: 94 },
  notes: { minHeight: 76, textAlignVertical: 'top' },
});
