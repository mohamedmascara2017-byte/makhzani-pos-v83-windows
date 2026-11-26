import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { AppButton, AppPage, Card, EmptyState, PageHeader } from '@/components/common';
import { ProductInput, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

type ProductSheetRow = Record<string, string | number>;

export default function ExcelScreen() {
  const colors = useColors();
  const { products, bulkImportProducts } = useStore();
  const [staged, setStaged] = useState<ProductInput[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const importFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      setBusy(true);
      const asset = result.assets[0];
      const file = new File(asset.uri);
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false });
      const firstName = workbook.SheetNames[0];
      const sheet = firstName ? workbook.Sheets[firstName] : undefined;
      if (!sheet) throw new Error('الملف لا يحتوي على ورقة بيانات.');
      const rows = XLSX.utils.sheet_to_json<ProductSheetRow>(sheet, { defval: '' });
      const parsed = rows.map((row) => mapProductRow(row)).filter((item): item is ProductInput => item !== null);
      if (!parsed.length) throw new Error('لم يتم العثور على صفوف منتجات. تأكد من وجود عمود باسم المنتج أو name.');
      setStaged(parsed);
      setFileName(asset.name);
      setStatus(`تمت قراءة ${parsed.length} صفًا. راجع المعاينة ثم أكد الاستيراد.`);
    } catch (error) {
      Alert.alert('تعذر قراءة الملف', error instanceof Error ? error.message : 'اختر ملف XLSX أو CSV صالحًا.');
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!staged?.length) return;
    setBusy(true);
    try {
      const result = bulkImportProducts(staged);
      setStatus(`تم استيراد أو تحديث ${result.imported} منتج. تم تجاوز ${result.skipped} صف.`);
      setStaged(null);
      Alert.alert('اكتمل الاستيراد', `تم استيراد أو تحديث ${result.imported} منتج.\nصفوف تم تجاوزها: ${result.skipped}.`);
    } catch (error) {
      Alert.alert('تعذر استيراد المنتجات', error instanceof Error ? error.message : 'راجع الملف وحاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const exportProducts = async () => {
    if (!products.length) {
      Alert.alert('قائمة المنتجات فارغة', 'أضف منتجات قبل تصدير ملف Excel.');
      return;
    }
    setBusy(true);
    try {
      const rows = products.map((product) => ({
        'اسم المنتج': product.name,
        'النوع': product.variantName ?? '',
        'الباركود': product.barcode,
        'الباركود المشترك': product.sharedBarcode ?? '',
        'الرموز الإضافية': product.alternateBarcodes.join(', '),
        'سعر الشراء': product.purchasePrice,
        'سعر البيع': product.salePrice,
        'الكمية': product.quantity,
        'الحد الأدنى': product.minQuantity,
        'الوحدة': product.unit,
        'التصنيف': product.category,
        'المورد': product.supplier,
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'المنتجات');
      const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const data = new Uint8Array(bytes);
      if (Platform.OS === 'web') {
        const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'makhzani-products.xlsx';
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus(`تم تصدير ${products.length} منتج.`);
      } else {
        const file = new File(Paths.cache, 'makhzani-products.xlsx');
        file.create({ overwrite: true, intermediates: true });
        file.write(data);
        await Sharing.shareAsync(file.uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'تصدير قائمة المنتجات' });
        setStatus(`تم تجهيز ملف Excel، عدد المنتجات: ${products.length}.`);
      }
    } catch (error) {
      Alert.alert('تعذر تصدير الملف', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  const cancelPreview = () => {
    setStaged(null);
    setFileName('');
    setStatus('');
  };

  return (
    <AppPage>
      <PageHeader title="Excel" subtitle="استيراد المنتجات وتصدير قائمة المخزون" onBack={() => router.back()} />
      <Card style={styles.intro}>
        <View style={[styles.sheetIcon, { backgroundColor: '#F2F2F2' }]}><Feather name="grid" size={22} color="#000000" /></View>
        <Text style={[styles.introTitle, { color: colors.foreground }]}>قائمة منتجاتك في ملف واحد</Text>
        <Text style={[styles.introText, { color: colors.mutedForeground }]}>يدعم استيراد ملفات XLSX وCSV بأعمدة عربية أو إنجليزية. إذا تكرر الباركود، يتم تحديث بيانات المنتج الموجود.</Text>
      </Card>
      <AppButton title="اختيار ملف Excel أو CSV" icon="upload" onPress={importFile} loading={busy} testID="excel-import" />
      {products.length ? <AppButton title="تصدير قائمة المنتجات" icon="download" variant="secondary" onPress={exportProducts} loading={busy} testID="excel-export" /> : null}
      {status ? <Card><Text style={[styles.status, { color: colors.foreground }]}>{status}</Text></Card> : null}
      {staged?.length ? (
        <>
          <View style={styles.previewHead}>
            <Text style={[styles.section, { color: colors.foreground }]}>معاينة الاستيراد</Text>
            <Text style={[styles.fileName, { color: colors.mutedForeground }]}>{fileName}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>سيتم اعتماد {staged.length} صف. الصف ذو الباركود المطابق سيحدّث المنتج الحالي.</Text>
          {staged.slice(0, 6).map((product, index) => (
            <Card key={`${product.name}-${index}`} style={styles.preview}>
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>{product.barcode || 'بدون باركود'} · {product.quantity} {product.unit}</Text>
              </View>
              <Text style={[styles.price, { color: colors.primary }]}>{product.salePrice} دج</Text>
            </Card>
          ))}
          <AppButton title="اعتماد الاستيراد" icon="check" onPress={confirmImport} loading={busy} />
          <AppButton title="إلغاء المعاينة" variant="outline" onPress={cancelPreview} />
        </>
      ) : null}
      {!products.length && !staged?.length ? <Card><EmptyState title="لا توجد منتجات بعد" description="استورد ملفًا للبدء، أو أضف أول منتج من صفحة المخزون." icon="file-text" /></Card> : null}
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>أعمدة معروفة: اسم المنتج، الباركود، سعر الشراء، سعر البيع، الكمية، الحد الأدنى، الوحدة، التصنيف، المورد.</Text>
    </AppPage>
  );
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ');
}

function cell(row: ProductSheetRow, names: string[]) {
  const entries = Object.entries(row);
  const key = entries.find(([header]) => names.some((name) => normalize(header) === normalize(name)));
  return key?.[1] === undefined || key[1] === null ? '' : String(key[1]).trim();
}

function amount(value: string) {
  const parsed = Number(value.replace(/\s/g, '').replace(/دج/gi, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function mapProductRow(row: ProductSheetRow): ProductInput | null {
  const name = cell(row, ['اسم المنتج', 'المنتج', 'name', 'product', 'product name']);
  if (!name) return null;
  const codes = cell(row, ['الرموز الإضافية', 'باركود إضافي', 'additional barcodes'])
    .split(/[,،;]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const barcode = cell(row, ['الباركود', 'barcode', 'code']);
  const sharedBarcode = cell(row, ['الباركود المشترك', 'shared barcode', 'sharedbarcode']);
  const variantName = cell(row, ['النوع', 'النسخة', 'variant', 'variant name']);
  return {
    name,
    variantName,
    sharedBarcode,
    barcode,
    alternateBarcodes: codes,
    purchasePrice: amount(cell(row, ['سعر الشراء', 'purchase price', 'purchase_price', 'buy'])),
    salePrice: amount(cell(row, ['سعر البيع', 'sale price', 'sale_price', 'sell'])),
    quantity: amount(cell(row, ['الكمية', 'quantity', 'qty', 'stock'])),
    minQuantity: amount(cell(row, ['الحد الأدنى', 'minimum', 'min quantity', 'min_quantity'])),
    unit: cell(row, ['الوحدة', 'unit']) || 'قطعة',
    category: cell(row, ['التصنيف', 'الفئة', 'category']),
    supplier: cell(row, ['المورد', 'supplier']),
  };
}

const styles = StyleSheet.create({
  intro: { alignItems: 'center', padding: 20, gap: 10 },
  sheetIcon: { width: 49, height: 49, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  introText: { fontSize: 12, lineHeight: 20, textAlign: 'center', writingDirection: 'rtl' },
  status: { fontSize: 13, lineHeight: 20, textAlign: 'right', writingDirection: 'rtl' },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { fontSize: 15, fontWeight: '700', writingDirection: 'rtl', textAlign: 'right' },
  fileName: { maxWidth: 145, fontSize: 10, writingDirection: 'rtl' },
  hint: { fontSize: 11, lineHeight: 17, textAlign: 'right', writingDirection: 'rtl' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  productName: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  price: { fontSize: 11, fontWeight: '700', writingDirection: 'rtl' },
});
