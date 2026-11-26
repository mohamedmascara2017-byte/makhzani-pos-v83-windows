import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppPage, Badge, Card, EmptyState, formatMoney, IconButton, PageHeader, TextField } from '@/components/common';
import { getProductDisplayName, Product, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

export default function ProductsScreen() {
  const colors = useColors();
  const { products, deleteProduct } = useStore();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return products.filter((product) => !q || `${product.name} ${product.variantName ?? ''}`.toLocaleLowerCase().includes(q) || product.barcode.toLocaleLowerCase().includes(q) || product.alternateBarcodes.some((code) => code.toLocaleLowerCase().includes(q)) || (product.sharedBarcode ?? '').toLocaleLowerCase().includes(q) || product.category.toLocaleLowerCase().includes(q));
  }, [products, query]);

  const edit = (product: Product) => router.push({ pathname: '/product-form', params: { id: product.id } } as never);
  const remove = (product: Product) => Alert.alert('حذف المنتج', `حذف «${getProductDisplayName(product)}» من قائمة المخزون؟`, [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: () => {
      try { deleteProduct(product.id); }
      catch (error) { Alert.alert('تعذر الحذف', error instanceof Error ? error.message : 'حاول مرة أخرى.'); }
    } },
  ]);

  return (
    <AppPage>
      <PageHeader title="المنتجات والمخزون" subtitle={`${products.length} منتج في متجرك`} right={
        <IconButton icon="plus" label="إضافة منتج" testID="add-product" onPress={() => router.push('/product-form' as never)} />
      } />
      <TextField value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو الباركود أو التصنيف" testID="products-search" />
      {!products.length ? (
        <Card><EmptyState title="ابدأ بقائمة منتجاتك" description="أضف منتجًا أو استورد قائمة Excel ليصبح متاحًا للبيع." icon="archive" /></Card>
      ) : !filtered.length ? (
        <Card><EmptyState title="لا توجد نتائج" description="جرّب اسمًا أو باركودًا آخر." icon="search" /></Card>
      ) : (
        <View style={styles.list}>
          {filtered.map((product) => (
            <Card key={product.id} style={styles.productCard}>
              <Pressable onPress={() => edit(product)} style={styles.productMain}>
                <View style={[styles.productIcon, { backgroundColor: colors.secondary }]}><Feather name="package" size={19} color={colors.primary} /></View>
                <View style={styles.productInfo}>
                  <Text numberOfLines={0} style={[styles.productName, { color: colors.foreground }]}>{getProductDisplayName(product)}</Text>
                  <Text style={[styles.productMeta, { color: colors.mutedForeground }]}>{product.category || 'غير مصنف'} {product.barcode ? `· مستقل: ${product.barcode}` : ''} {product.sharedBarcode ? `· مشترك: ${product.sharedBarcode}` : ''}</Text>
                  <View style={styles.productFoot}>
                    <Text style={[styles.productPrice, { color: colors.primary }]}>{formatMoney(product.salePrice)}</Text>
                    <Text style={[styles.productCost, { color: colors.mutedForeground }]}>شراء {formatMoney(product.purchasePrice)}</Text>
                  </View>
                </View>
                <View style={styles.stockWrap}>
                  <Badge label={`${product.quantity} ${product.unit}`} tone={product.quantity <= product.minQuantity ? 'warning' : 'success'} />
                  <Text style={[styles.min, { color: colors.mutedForeground }]}>حد {product.minQuantity}</Text>
                </View>
              </Pressable>
              <View style={[styles.actions, { borderTopColor: colors.border }]}>
                <Pressable onPress={() => edit(product)} style={styles.actionBtn}><Feather name="edit-2" size={14} color={colors.primary} /><Text style={[styles.actionText, { color: colors.primary }]}>تعديل</Text></Pressable>
                <Pressable onPress={() => remove(product)} style={styles.actionBtn}><Feather name="trash-2" size={14} color={colors.destructive} /><Text style={[styles.actionText, { color: colors.destructive }]}>حذف</Text></Pressable>
              </View>
            </Card>
          ))}
        </View>
      )}
    </AppPage>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  productCard: { padding: 13, gap: 0 },
  productMain: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 11 },
  productIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1, minWidth: 0, gap: 3, alignItems: 'flex-start' },
  productName: { fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', flexShrink: 1, width: '100%' },
  productMeta: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  productFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  productPrice: { fontSize: 12, fontWeight: '700', writingDirection: 'rtl' },
  productCost: { fontSize: 10, writingDirection: 'rtl' },
  stockWrap: { alignItems: 'flex-end', gap: 5 },
  min: { fontSize: 9, writingDirection: 'rtl' },
  actions: { minHeight: 36, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 7, flexDirection: 'row', justifyContent: 'flex-start', gap: 18 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 11, fontWeight: '600', writingDirection: 'rtl' },
});
