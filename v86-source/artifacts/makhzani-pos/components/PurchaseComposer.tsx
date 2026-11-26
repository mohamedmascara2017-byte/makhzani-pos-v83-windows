import React, { useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppButton, Card, formatMoney, PageHeader, TextField } from '@/components/common';
import { getProductDisplayName, Product, PurchaseInputLine, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PurchaseComposer({ invoice = false }: { invoice?: boolean }) {
  const colors = useColors();
  const { products, addPurchase } = useStore();
  const [supplier, setSupplier] = useState(invoice ? 'فاتورة مصورة' : '');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = products.filter((product) => Number(quantities[product.id] ?? 0) > 0);
  const total = selected.reduce(
    (sum, product) => sum + Number(quantities[product.id] ?? 0) * Number(prices[product.id] ?? product.purchasePrice),
    0,
  );

  const attachPhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
        if (!result.canceled) setPhotoUri(result.assets[0]?.uri ?? null);
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('إذن الكاميرا مطلوب', 'فعّل إذن الكاميرا لتصوير فاتورة المورد.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!result.canceled) setPhotoUri(result.assets[0]?.uri ?? null);
    } catch {
      Alert.alert('تعذر فتح الكاميرا', 'يمكنك متابعة إدخال بنود الفاتورة دون صورة.');
    }
  };

  const submit = () => {
    if (!selected.length) {
      Alert.alert('لا توجد بنود', 'أدخل كمية لمنتج واحد على الأقل.');
      return;
    }
    const lines: PurchaseInputLine[] = selected.map((product) => ({
      productId: product.id,
      quantity: Number(quantities[product.id]),
      purchasePrice: Number(prices[product.id] ?? product.purchasePrice),
    }));
    setSaving(true);
    try {
      addPurchase(supplier, lines);
      Alert.alert(invoice ? 'تم حفظ الفاتورة' : 'تم حفظ المشتريات', `أُضيفت ${lines.length} أصناف إلى المخزون.`);
      router.back();
    } catch (error) {
      Alert.alert('تعذر حفظ الفاتورة', error instanceof Error ? error.message : 'راجع البيانات وحاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : 0, paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={70}>
        <PageHeader
          title={invoice ? 'الفاتورة المصورة' : 'إدخال مشتريات'}
          subtitle={invoice ? 'أرفق الصورة وأدخل البنود لمراجعتها قبل تحديث المخزون' : 'أدخل الكميات وأسعار المورد'}
          onBack={() => router.back()}
        />
        {invoice ? (
          <>
            <Pressable onPress={attachPhoto} style={({ pressed }) => [styles.photoButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.78 : 1 }]}>
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : <Feather name="camera" size={24} color={colors.primary} />}
              <Text style={[styles.photoLabel, { color: colors.secondaryForeground }]}>{photoUri ? 'تغيير صورة الفاتورة' : 'تصوير الفاتورة لإرفاقها'}</Text>
            </Pressable>
            <Text style={[styles.note, { color: colors.mutedForeground }]}>استخدم الصورة كمرجع، ثم راجع البنود والكميات يدويًا قبل اعتمادها.</Text>
          </>
        ) : null}
        <TextField label="اسم المورد" value={supplier} onChangeText={setSupplier} placeholder="اسم المورد" />
        {!products.length ? (
          <Card style={styles.empty}>
            <Feather name="archive" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>أضف المنتجات أولًا</Text>
            <Text style={[styles.note, { color: colors.mutedForeground }]}>يمكن إدخال فاتورة شراء بعد إضافة قائمة المنتجات.</Text>
          </Card>
        ) : (
          <>
            <Text style={[styles.heading, { color: colors.foreground }]}>بنود الفاتورة <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>— اكتب كمية الصنف المطلوب</Text></Text>
            {products.map((product) => (
              <PurchaseLine
                key={product.id}
                product={product}
                quantity={quantities[product.id] ?? ''}
                price={prices[product.id] ?? `${product.purchasePrice}`}
                onQuantity={(value) => setQuantities((old) => ({ ...old, [product.id]: value }))}
                onPrice={(value) => setPrices((old) => ({ ...old, [product.id]: value }))}
              />
            ))}
            <Card style={styles.summary}>
              <Text style={[styles.note, { color: colors.mutedForeground }]}>{selected.length} أصناف محددة</Text>
              <Text style={[styles.total, { color: colors.primary }]}>{formatMoney(total)}</Text>
            </Card>
            <AppButton title={invoice ? 'اعتماد الفاتورة وتحديث المخزون' : 'حفظ المشتريات'} icon="check" onPress={submit} loading={saving} disabled={!selected.length} />
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

function PurchaseLine({
  product,
  quantity,
  price,
  onQuantity,
  onPrice,
}: {
  product: Product;
  quantity: string;
  price: string;
  onQuantity: (value: string) => void;
  onPrice: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <Card style={styles.line}>
      <View style={styles.lineHead}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Text style={[styles.productName, { color: colors.foreground }]}>{getProductDisplayName(product)}</Text>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>المخزون الحالي: {product.quantity} {product.unit}</Text>
        </View>
        <Text style={[styles.lineTotal, { color: colors.primary }]}>{formatMoney((Number(quantity) || 0) * (Number(price) || 0))}</Text>
      </View>
      <View style={styles.lineInputs}>
        <View style={styles.half}><TextField label="الكمية" value={quantity} onChangeText={onQuantity} placeholder="0" keyboardType="decimal-pad" /></View>
        <View style={styles.half}><TextField label="سعر الشراء" value={price} onChangeText={onPrice} placeholder="0" keyboardType="decimal-pad" /></View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 35, gap: 13 },
  heading: { fontSize: 15, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  note: { fontSize: 11, lineHeight: 17, textAlign: 'right', writingDirection: 'rtl' },
  photoButton: { minHeight: 100, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  photo: { width: '100%', height: 160, resizeMode: 'cover' },
  photoLabel: { fontSize: 13, fontWeight: '700', paddingVertical: 10, writingDirection: 'rtl' },
  empty: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', writingDirection: 'rtl' },
  line: { padding: 12, gap: 11 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productName: { fontSize: 13, fontWeight: '700', writingDirection: 'rtl', textAlign: 'right' },
  lineTotal: { fontSize: 12, fontWeight: '700', writingDirection: 'rtl' },
  lineInputs: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  total: { fontSize: 18, fontWeight: '800', writingDirection: 'rtl' },
});
