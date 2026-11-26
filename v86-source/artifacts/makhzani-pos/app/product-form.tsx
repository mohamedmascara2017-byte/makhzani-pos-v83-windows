import React, { useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppButton, PageHeader, TextField } from '@/components/common';
import { ProductInput, useStore } from '@/components/StoreContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function ProductFormScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { products, addOrUpdateProduct } = useStore();
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  // Keep our own granted flag: the hook state may not refresh before the modal mounts.
  // Without this, the first scan attempt can open a black preview after permission is granted.
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMounted, setCameraMounted] = useState(false);
  const [barcodeScanned, setBarcodeScanned] = useState(false);

  const openBarcodeScanner = async () => {
    try {
      let granted = cameraPermission?.granted === true;
      if (!granted) {
        const result = await requestCameraPermission();
        granted = result.granted;
      }
      if (!granted) {
        Alert.alert('إذن الكاميرا مطلوب', 'اسمح للتطبيق باستخدام الكاميرا من إعدادات الهاتف، أو اكتب الرمز يدويًا.');
        return;
      }
      setCameraAllowed(true);
      setCameraReady(false);
      setCameraMounted(false);
      setBarcodeScanned(false);
      setCameraVisible(true);
    } catch (error) {
      Alert.alert('تعذر فتح الكاميرا', error instanceof Error ? error.message : 'تحقق من إذن الكاميرا ثم أعد المحاولة.');
    }
  };

  const takeProductPhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('إذن الكاميرا مطلوب', 'اسمح للتطبيق باستخدام الكاميرا لتصوير المنتج.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
      if (!result.canceled && result.assets[0]?.uri) {
        setForm((old) => ({ ...old, imageUri: result.assets[0].uri }));
      }
    } catch (error) {
      Alert.alert('تعذر تصوير المنتج', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (barcodeScanned || !data) return;
    setBarcodeScanned(true);
    const scanned = data.trim();
    setForm((old) => {
      if (!old.barcode.trim()) return { ...old, barcode: scanned };
      const all = [old.barcode, ...(old.alternateBarcodes ?? [])].map((code) => code.trim());
      if (all.includes(scanned)) return old;
      return { ...old, alternateBarcodes: [...(old.alternateBarcodes ?? []), scanned] };
    });
    setCameraVisible(false);
    setCameraMounted(false);
    Alert.alert('تم مسح الباركود بنجاح', `تمت قراءة الرمز: ${data.trim()}`);
  };
  const existing = products.find((product) => product.id === id);
  const [form, setForm] = useState<ProductInput>(() => existing ? {
    ...existing,
    alternateBarcodes: [...existing.alternateBarcodes],
  } : {
    name: '',
    variantName: '',
    barcode: '',
    sharedBarcode: '',
    alternateBarcodes: [],
    purchasePrice: 0,
    salePrice: 0,
    quantity: 0,
    minQuantity: 0,
    unit: 'قطعة',
    category: '',
    supplier: '',
    imageUri: '',
    offerQuantity: 0,
    offerPrice: 0,
  });
  const [customUnitVisible, setCustomUnitVisible] = useState(false);
  const setText = (key: keyof ProductInput, value: string) => setForm((old) => ({
    ...old,
    [key]: value,
  }));
  const setNumber = (key: 'purchasePrice' | 'salePrice' | 'offerQuantity' | 'offerPrice' | 'quantity' | 'minQuantity', value: string) => {
    const number = Number(value.replace(',', '.'));
    // All prices are entered and stored directly in Algerian dinars (DZD).
    setForm((old) => ({ ...old, [key]: Number.isFinite(number) ? number : 0 }));
  };
  const save = () => {
    try {
      if (form.salePrice < 0 || form.purchasePrice < 0 || form.quantity < 0 || form.minQuantity < 0 || (form.offerQuantity ?? 0) < 0 || (form.offerPrice ?? 0) < 0) {
        throw new Error('لا يمكن إدخال قيمة سالبة.');
      }
      addOrUpdateProduct(form);
      router.back();
    } catch (error) {
      Alert.alert('تعذر حفظ المنتج', error instanceof Error ? error.message : 'راجع البيانات وحاول مرة أخرى.');
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : 0, paddingBottom: Platform.OS === 'web' ? 34 : 0 }}>
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={70}>
        <PageHeader title={existing ? 'تعديل المنتج' : 'منتج جديد'} subtitle="بيانات المنتج والأسعار والكميات" onBack={() => router.back()} />
        <Text style={[styles.section, { color: colors.foreground }]}>التعريف</Text>
        <TextField label="اسم المنتج الأساسي *" value={form.name} onChangeText={(value) => setText('name', value)} placeholder="مثال: ياغورت فور" autoCapitalize="sentences" testID="product-name" />
        <TextField label="النوع أو النسخة" value={form.variantName ?? ''} onChangeText={(value) => setText('variantName', value)} placeholder="مثال: فراولة 100غ أو طبيعي 1كغ" />
        <TextField label="الباركود الأساسي" value={form.barcode} onChangeText={(value) => setText('barcode', value)} placeholder="أدخل أو امسح الباركود الأول" />
        <Pressable onPress={takeProductPhoto} style={[styles.scanButton, { borderColor: colors.primary, backgroundColor: colors.card }]} accessibilityRole="button">
          <Feather name="camera" size={18} color={colors.primary} />
          <Text style={[styles.scanButtonText, { color: colors.primary }]}>{form.imageUri ? 'إعادة تصوير المنتج' : 'تصوير المنتج وإرفاق صورته'}</Text>
        </Pressable>
        {form.imageUri ? <Image source={{ uri: form.imageUri }} style={styles.productPhoto} resizeMode="contain" /> : null}
        <Pressable onPress={openBarcodeScanner} style={[styles.scanButton, { borderColor: colors.primary, backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel="مسح الباركود بالكاميرا">
          <Feather name="camera" size={18} color={colors.primary} />
          <Text style={[styles.scanButtonText, { color: colors.primary }]}>مسح الباركود بالكاميرا</Text>
        </Pressable>
        <TextField label="الباركود المشترك لمجموعة الأنواع (اختياري)" value={form.sharedBarcode ?? ''} onChangeText={(value) => setText('sharedBarcode', value)} placeholder="استعمل الرمز نفسه لكل أنواع ياغورت فور مثلاً" />
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>عند إدخال باركود مشترك، اسم النوع إلزامي. أمّا الباركود المستقل فيُسجّل لهذا النوع فقط ويفتحه مباشرة عند المسح.</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>لإضافة نوع آخر من المنتج نفسه: أنشئ سجلاً جديداً بالاسم الأساسي نفسه، واكتب النوع وسعره وكمّيته، ثم أدخل الباركود المشترك نفسه. لكل نوع مخزون وسعر شراء وبيع مستقل.</Text>
        <View style={{ gap: 9 }}>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700', textAlign: 'right' }}>باركودات إضافية للمنتج (عدد غير محدود)</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: 'right' }}>يمكنك إضافة أي عدد من الرموز للمنتج نفسه. كل رمز يفتح المنتج نفسه عند المسح، كما يمكنك مسح الرموز واحداً تلو الآخر بالكاميرا.</Text>
          {(form.alternateBarcodes ?? []).map((code, index) => (
            <View key={`barcode-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <TextField label={`باركود إضافي ${index + 1}`} value={code} onChangeText={(value) => setForm((old) => ({ ...old, alternateBarcodes: old.alternateBarcodes.map((item, i) => i === index ? value : item) }))} placeholder="اكتب أو الصق الباركود" />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`حذف الباركود ${index + 1}`} onPress={() => setForm((old) => ({ ...old, alternateBarcodes: old.alternateBarcodes.filter((_, i) => i !== index) }))} style={{ width: 42, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
                <Feather name="trash-2" size={17} color={colors.primary} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => setForm((old) => ({ ...old, alternateBarcodes: [...(old.alternateBarcodes ?? []), ''] }))} style={[styles.scanButton, { borderColor: colors.primary, backgroundColor: colors.primary, marginTop: 0 }]}>
            <Feather name="plus" size={17} color={colors.primaryForeground} />
            <Text style={[styles.scanButtonText, { color: colors.primaryForeground }]}>إضافة باركود آخر</Text>
          </Pressable>
          <Pressable onPress={openBarcodeScanner} style={[styles.scanButton, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 0 }]}>
            <Feather name="camera" size={17} color={colors.primary} />
            <Text style={[styles.scanButtonText, { color: colors.primary }]}>مسح باركود إضافي بالكاميرا</Text>
          </Pressable>
        </View>
        <TextField label="التصنيف" value={form.category} onChangeText={(value) => setText('category', value)} placeholder="مواد غذائية" />
        <Text style={[styles.section, { color: colors.foreground }]}>الأسعار والمخزون</Text>
        <TextField label="سعر البيع للوحدة (دج)" value={`${form.salePrice ?? 0}` } onChangeText={(value) => setNumber('salePrice', value)} keyboardType="decimal-pad" />
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>عروض الكمية اختيارية. أدخل جميع الأسعار بالدينار الجزائري (دج)، بما فيها سعر البيع والشراء وسعر عرض الكمية.</Text>
        <TextField label="عدد القطع في العرض (0 لتعطيله)" value={`${form.offerQuantity ?? 0}`} onChangeText={(value) => setNumber('offerQuantity', value)} keyboardType="decimal-pad" placeholder="مثال: 6" />
        <TextField label="سعر العرض للمجموعة (دج)" value={`${form.offerPrice ?? 0}` } onChangeText={(value) => setNumber('offerPrice', value)} keyboardType="decimal-pad" placeholder="مثال: 22000" />
        {(form.offerQuantity ?? 0) > 0 && (form.offerPrice ?? 0) > 0 && form.salePrice > 0 ? <Text style={{ color: colors.primary, fontSize: 12, lineHeight: 18 }}>كل {form.offerQuantity} وحدات بسعر {form.offerPrice} دج. ما تبقى من الكمية يُحسب بالسعر العادي.</Text> : null}
        <TextField label="سعر الشراء (دج)" value={`${form.purchasePrice ?? 0}` } onChangeText={(value) => setNumber('purchasePrice', value)} keyboardType="decimal-pad" />
        <TextField label="الكمية الحالية" value={`${form.quantity}`} onChangeText={(value) => setNumber('quantity', value)} keyboardType="decimal-pad" />
        <TextField label="حد التنبيه للمخزون" value={`${form.minQuantity}`} onChangeText={(value) => setNumber('minQuantity', value)} keyboardType="decimal-pad" />
        <Text style={[styles.unitLabel, { color: colors.foreground }]}>وحدة البيع</Text>
        <View style={styles.unitOptions}>
          {['قطعة', 'كغ', 'غرام', 'لتر', 'مل'].map((unit) => (
            <Pressable key={unit} onPress={() => setForm((old) => ({ ...old, unit }))} style={[styles.unitOption, { backgroundColor: form.unit === unit ? colors.primary : colors.card, borderColor: form.unit === unit ? colors.primary : colors.border }]}>
              <Text style={{ color: form.unit === unit ? colors.primaryForeground : colors.foreground, fontWeight: '700' }}>{unit}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => setCustomUnitVisible((visible) => !visible)}
          style={[styles.customUnitButton, { backgroundColor: colors.card, borderColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="تخصيص وحدة البيع"
        >
          <Feather name="sliders" size={17} color={colors.primary} />
          <Text style={[styles.scanButtonText, { color: colors.primary }]}>{customUnitVisible ? 'إخفاء تخصيص وحدة البيع' : 'تخصيص وحدة البيع'}</Text>
        </Pressable>
        {customUnitVisible ? (
          <TextField label="اسم وحدة البيع المخصصة" value={form.unit} onChangeText={(value) => setText('unit', value)} placeholder="مثال: صندوق، حبة، نصف لتر..." />
        ) : null}
        <TextField label="المورد المعتاد" value={form.supplier} onChangeText={(value) => setText('supplier', value)} placeholder="اختياري" />
        <AppButton title={existing ? 'حفظ التعديلات' : 'إضافة المنتج'} icon="check" onPress={save} testID="save-product" />
      </KeyboardAwareScrollViewCompat>
      <Modal
        visible={cameraVisible}
        animationType="slide"
        onRequestClose={() => { setCameraVisible(false); setCameraMounted(false); setCameraReady(false); setCameraAllowed(false); }}
        onShow={() => { setCameraReady(false); setCameraMounted(true); }}
      >
        <View style={styles.cameraContainer}>
          {cameraAllowed && cameraMounted ? (
            <CameraView
              key={cameraVisible ? 'product-barcode-camera-open' : 'product-barcode-camera-closed'}
              active={cameraVisible && cameraAllowed}
              style={styles.cameraPreview}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'codabar', 'itf14', 'qr', 'pdf417', 'datamatrix', 'aztec'] }}
              onCameraReady={() => setCameraReady(true)}
              onBarcodeScanned={barcodeScanned ? undefined : handleBarcodeScanned}
              onMountError={(event) => {
                setCameraReady(false);
                Alert.alert('تعذر تشغيل الكاميرا', event.message || 'أغلق التطبيقات الأخرى التي تستخدم الكاميرا، وتأكد من إذن الكاميرا ثم أعد المحاولة.');
              }}
            />
          ) : null}
          <View style={styles.cameraTop}>
            <Pressable onPress={() => { setCameraVisible(false); setCameraMounted(false); setCameraReady(false); setCameraAllowed(false); }} style={styles.closeCamera} accessibilityRole="button" accessibilityLabel="إغلاق الكاميرا">
              <Feather name="x" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.cameraTitle}>وجّه الكاميرا نحو الباركود</Text>
          </View>
          <View pointerEvents="none" style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>{cameraReady ? 'ثبّت الرمز داخل الإطار' : 'جارٍ تشغيل الكاميرا...'}</Text>
          </View>
          {!cameraReady ? (
            <View style={styles.cameraStatus}>
              <Text style={styles.cameraStatusText}>جارٍ تشغيل الكاميرا. إذا بقيت الشاشة سوداء، أعد تشغيل المعاينة أو أغلق التطبيقات الأخرى التي تستخدم الكاميرا.</Text>
              <Pressable
                onPress={() => { setCameraMounted(false); setCameraReady(false); requestAnimationFrame(() => setCameraMounted(true)); }}
                style={styles.retryCamera}
                accessibilityRole="button"
              >
                <Text style={styles.retryCameraText}>إعادة تشغيل الكاميرا</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 35, gap: 14 },
  unitLabel: { fontSize: 14, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  unitOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  customUnitButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 12 },
  unitOption: { minWidth: 52, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 10, alignItems: 'center' },
  section: { marginTop: 7, fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  productPhoto: { width: '100%', height: 170, borderRadius: 12, backgroundColor: '#EEEEEE' },
  scanButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: -6 },
  scanButtonText: { fontSize: 14, fontWeight: '700', writingDirection: 'rtl' },
  cameraContainer: { flex: 1, backgroundColor: '#000000', overflow: 'hidden' },
  cameraPreview: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  cameraTop: { zIndex: 2, elevation: 2, paddingTop: 55, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(0,0,0,0.35)' },
  closeCamera: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  cameraTitle: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  scanOverlay: { zIndex: 2, elevation: 2, flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 20, gap: 18 },
  cameraStatus: { zIndex: 3, elevation: 3, position: 'absolute', left: 18, right: 18, bottom: 28, alignItems: 'center' },
  cameraStatusText: { color: '#FFFFFF', fontSize: 12, lineHeight: 18, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.62)', padding: 10, borderRadius: 10 },
  retryCamera: { marginTop: 10, backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  retryCameraText: { color: '#111111', fontSize: 13, fontWeight: '700' },
  scanFrame: { width: '78%', height: 150, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 16, backgroundColor: 'transparent' },
  scanHint: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, writingDirection: 'rtl' },
});
