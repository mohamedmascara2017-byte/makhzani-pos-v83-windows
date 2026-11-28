import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { AppPage, Card, formatMoney, TextField } from '@/components/common';
import { getProductDisplayName, Product, Sale, useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';

const isWeightOrVolumeUnit = (unit: string) => ['كغ', 'kg', 'كيلوغرام', 'كيلو', 'كجم', 'كيلوجرام', 'لتر', 'ل', 'l', 'liter', 'litre'].includes((unit || '').trim().toLowerCase());
const isSmallUnit = (unit: string) => ['كغ', 'kg', 'كيلوغرام', 'كيلو', 'كجم', 'كيلوجرام', 'لتر', 'ل', 'l', 'liter', 'litre'].includes((unit || '').trim().toLowerCase());
const money = (value: number) => formatMoney(Number.isFinite(value) ? value : 0);
const quantityText = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));

export default function PosScreen() {
  const baseColors = useColors();
  const colors = { ...baseColors, background: '#FFFFFF', foreground: '#111111', card: '#FFFFFF', cardForeground: '#111111', primary: '#111111', primaryForeground: '#FFFFFF', secondary: '#F2F2F2', secondaryForeground: '#111111', muted: '#F2F2F2', mutedForeground: '#555555', border: '#D6D6D6', input: '#D6D6D6' };
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const { products, completeSale, quickShortcutIds, setQuickShortcutIds, quickShortcutKeys, setQuickShortcutKey } = useStore();
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});
  const [discountText, setDiscountText] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('نقدي');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  const [manageShortcuts, setManageShortcuts] = useState(false);
  const [amountProduct, setAmountProduct] = useState<Product | null>(null);
  const [amountText, setAmountText] = useState('');
  const [amountMode, setAmountMode] = useState<'amount' | 'quantity'>('amount');
  const [quantityScale, setQuantityScale] = useState<'main' | 'small'>('main');
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [variantChoices, setVariantChoices] = useState<Product[]>([]);
  const scannedOnce = useRef(false);
  const cameraHostRef = useRef<any>(null);
  // USB/Bluetooth barcode scanners usually behave like a keyboard and send Enter.
  const hardwareBarcodeBuffer = useRef('');
  const hardwareBarcodeLastKeyAt = useRef(0);

  const selected = useMemo(() => Object.entries(cart).map(([productId, quantity]) => ({
    product: products.find((item) => item.id === productId), quantity,
  })).filter((item): item is { product: Product; quantity: number } => !!item.product), [cart, products]);
  const subtotal = selected.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);
  const promotionalTotal = selected.reduce((sum, item) => {
    const threshold = Number(item.product.offerQuantity) || 0;
    const offerPrice = Number(item.product.offerPrice) || 0;
    if (threshold < 1 || offerPrice <= 0 || offerPrice >= item.product.salePrice * threshold) return sum + item.product.salePrice * item.quantity;
    const bundles = Math.floor((item.quantity + 1e-9) / threshold);
    return sum + bundles * offerPrice + (item.quantity - bundles * threshold) * item.product.salePrice;
  }, 0);
  const promotionDiscount = Math.max(0, subtotal - promotionalTotal);
  const discount = Number(discountText.replace(',', '.')) || 0;
  const total = Math.max(0, promotionalTotal - discount);
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [];
    return products.filter((product) => `${product.name} ${product.variantName ?? ''}`.toLocaleLowerCase().includes(q) || product.barcode.toLocaleLowerCase().includes(q) || product.alternateBarcodes.some((code) => code.toLocaleLowerCase().includes(q)) || (product.sharedBarcode ?? '').toLocaleLowerCase().includes(q)).slice(0, 12);
  }, [products, query]);
  const quickProducts = useMemo(() => {
    const ids = quickShortcutIds ?? []; // No automatic products: shortcuts are chosen manually.
    return ids.map((id) => products.find((product) => product.id === id)).filter((product): product is Product => !!product && product.quantity > 0);
  }, [products, quickShortcutIds]);

  const addProduct = (product: Product) => {
    // Products sold by weight/volume must never be inserted with an assumed
    // quantity. Ask the cashier for the amount or quantity on every entry path.
    if (isWeightOrVolumeUnit(product.unit)) {
      setAmountProduct(product);
      setAmountText('');
      setAmountMode('amount');
      setQuantityScale('main');
      return;
    }
    setCart((old) => {
      const next = Number(((old[product.id] ?? 0) + 1).toFixed(3));
      if (next > product.quantity + 1e-9) {
        Alert.alert('المخزون غير كافٍ', `المتاح من ${product.name}: ${quantityText(product.quantity)} ${product.unit}`);
        return old;
      }
      return { ...old, [product.id]: next };
    });
  };
  const setQuantity = (product: Product, raw: string) => {
    setEditingQty((old) => ({ ...old, [product.id]: raw }));
    if (!raw.trim()) return;
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > product.quantity) return;
    setCart((old) => ({ ...old, [product.id]: Number(value.toFixed(3)) }));
  };
  const commitQuantity = (product: Product) => {
    const raw = editingQty[product.id];
    if (raw === undefined) return;
    const value = Number(raw.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setCart((old) => { const next = { ...old }; delete next[product.id]; return next; });
    } else if (value > product.quantity) {
      Alert.alert('المخزون غير كافٍ', `المتاح: ${quantityText(product.quantity)} ${product.unit}`);
      setCart((old) => ({ ...old, [product.id]: product.quantity }));
    } else setCart((old) => ({ ...old, [product.id]: Number(value.toFixed(3)) }));
    setEditingQty((old) => { const next = { ...old }; delete next[product.id]; return next; });
  };
  const adjustQuantity = (product: Product, direction: 1 | -1) => {
    const step = isSmallUnit(product.unit) ? 0.1 : 1;
    setCart((old) => {
      const nextValue = Number(((old[product.id] ?? 0) + direction * step).toFixed(3));
      if (nextValue <= 0) { const next = { ...old }; delete next[product.id]; return next; }
      if (nextValue > product.quantity + 1e-9) {
        Alert.alert('المخزون غير كافٍ', `المتاح: ${quantityText(product.quantity)} ${product.unit}`);
        return old;
      }
      return { ...old, [product.id]: nextValue };
    });
  };
  const normalizeBarcode = (value: string) => {
    // Remove scanner control characters and common AIM symbology prefixes.
    return String(value ?? '').replace(/[\r\n\t\0]/g, '').trim().replace(/^\][A-Z][0-9]/, '').toLocaleLowerCase();
  };

  const addByCode = (code: string) => {
    const normalized = normalizeBarcode(code);
    if (!normalized) return;
    const comparable = (value: string) => {
      const clean = normalizeBarcode(value);
      // Some scanners report EAN-13 with a leading zero while stock contains UPC-A (12 digits).
      return clean.length === 13 && clean.startsWith('0') ? [clean, clean.slice(1)] : [clean];
    };
    const scannedVariants = comparable(normalized);
    const directMatches = products.filter((product) =>
      [product.barcode, ...product.alternateBarcodes].some((stored) =>
        comparable(stored).some((candidate) => scannedVariants.includes(candidate)),
      ),
    );
    const sharedMatches = products.filter((product) => comparable(product.sharedBarcode ?? '').some((candidate) => scannedVariants.includes(candidate)));
    if (directMatches.length === 1 && sharedMatches.length === 0) {
      // A variant-specific barcode adds that exact stock record directly.
      addProduct(directMatches[0]);
    } else if (directMatches.length === 0 && sharedMatches.length > 1) {
      // A group barcode intentionally opens the variant selector.
      setVariantChoices(sharedMatches);
    } else if (directMatches.length === 0 && sharedMatches.length === 1) {
      addProduct(sharedMatches[0]);
    } else if (directMatches.length > 1 || (directMatches.length > 0 && sharedMatches.length > 0)) {
      Alert.alert('تعارض في الباركود', 'هذا الرمز مسجل بأكثر من طريقة. افتح بيانات المنتجات وأزل التعارض حتى لا تُضاف كمية إلى نوع غير صحيح.');
    } else {
      Alert.alert('لم يتم العثور على المنتج', `الباركود المقروء: ${normalized}\nتأكد أن الرمز مسجل في بيانات المنتج.`);
    }
    setQuery('');
    setScanning(false);
  };

  // Capture keyboard-wedge scanners globally, even when the search box is not focused.
  // A real scanner sends characters rapidly followed by Enter (or Tab).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onHardwareScannerKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const now = Date.now();
      const elapsed = now - hardwareBarcodeLastKeyAt.current;
      if (elapsed > 120) hardwareBarcodeBuffer.current = '';

      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = hardwareBarcodeBuffer.current;
        hardwareBarcodeBuffer.current = '';
        hardwareBarcodeLastKeyAt.current = now;
        // Require a minimum-length rapid burst to avoid hijacking normal Enter/Tab use.
        if (code.length >= 4 && elapsed <= 150) {
          event.preventDefault();
          event.stopImmediatePropagation();
          addByCode(code);
        }
        return;
      }

      if (event.key.length === 1 && /^[A-Za-z0-9]$/.test(event.key)) {
        hardwareBarcodeBuffer.current += event.key;
        hardwareBarcodeLastKeyAt.current = now;
        if (hardwareBarcodeBuffer.current.length > 64) hardwareBarcodeBuffer.current = '';
      } else if (event.key === 'Backspace' || event.key === 'Escape') {
        hardwareBarcodeBuffer.current = '';
        hardwareBarcodeLastKeyAt.current = now;
      }
    };
    window.addEventListener('keydown', onHardwareScannerKey, true);
    return () => window.removeEventListener('keydown', onHardwareScannerKey, true);
  }, [products]);
  const addByAmount = () => {
    const product = amountProduct;
    const entered = Number(amountText.replace(',', '.'));
    if (!product) return;
    if (!Number.isFinite(entered) || entered <= 0 || product.salePrice <= 0) {
      Alert.alert('قيمة غير صحيحة', 'أدخل مبلغاً أو كمية صحيحة أكبر من صفر.');
      return;
    }
    const unit = product.unit.trim().toLowerCase();
    const isKg = ['كغ', 'kg', 'كيلوغرام', 'كيلو', 'كجم', 'كيلوجرام'].includes(unit);
    const isLiter = ['لتر', 'ل', 'l', 'liter', 'litre'].includes(unit);
    const quantity = amountMode === 'amount' ? entered / product.salePrice : (quantityScale === 'small' && (isKg || isLiter) ? entered / 1000 : entered);
    if (quantity > product.quantity + 1e-9) { Alert.alert('المخزون غير كافٍ', `المتاح: ${quantityText(product.quantity)} ${product.unit}`); return; }
    setCart((old) => ({ ...old, [product.id]: Number(((old[product.id] ?? 0) + quantity).toFixed(3)) }));
    setAmountProduct(null); setAmountText(''); setQuery(''); Keyboard.dismiss();
  };
  const finish = () => {
    if (!selected.length || submitting) return;
    setSubmitting(true);
    try {
      const sale = completeSale(selected.map(({ product, quantity }) => ({ productId: product.id, quantity })), discount, paymentMethod);
      setLastSale(sale);
      setCart({}); setEditingQty({}); setDiscountText('0');
      Alert.alert('تم حفظ البيع', `رقم الفاتورة ${sale.id.slice(-8)}\nالإجمالي: ${money(sale.total)}\nيمكنك طباعة الفاتورة من زر الطباعة.`);
    } catch (error) {
      Alert.alert('تعذر إتمام البيع', error instanceof Error ? error.message : 'حاول مرة أخرى.');
    } finally { setSubmitting(false); }
  };
  const openCamera = async () => {
    setCameraError('');
    try {
      // On Windows/Electron use the browser camera stream + BarcodeDetector directly.
      // This avoids relying on the Expo web camera barcode bridge in desktop builds.
      if (Platform.OS !== 'web' && !permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) { setCameraError('لم يتم منح إذن الكاميرا. فعّل الإذن من إعدادات الجهاز ثم أعد المحاولة.'); return; }
      }
      scannedOnce.current = false;
      setScanning(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'تعذر طلب إذن الكاميرا.');
    }
  };

  useEffect(() => {
    if (!scanning || Platform.OS !== 'web') return;
    let disposed = false;
    let video: HTMLVideoElement | null = null;
    let scannerControls: { stop: () => void } | null = null;

    const startBrowserScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('الكاميرا غير متاحة. تأكد من تشغيل مخزني على localhost ومن تفعيل إذن الكاميرا في Windows.');
        }
        if (!cameraHostRef.current) return;

        // ZXing decodes the camera stream itself; it does not depend on Chromium's
        // optional BarcodeDetector API, which is missing in some Electron builds.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (disposed || !cameraHostRef.current) return;

        video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.position = 'absolute';
        video.style.inset = '0';
        cameraHostRef.current.prepend(video);

        const reader = new BrowserMultiFormatReader();
        scannerControls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (disposed || scannedOnce.current || !result) return;
          const code = result.getText().trim();
          if (!code) return;
          scannedOnce.current = true;
          addByCode(code);
        });

        if (disposed) scannerControls.stop();
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : 'تعذر تشغيل قارئ الباركود.';
          setCameraError(message.includes('Permission') || message.includes('NotAllowed')
            ? 'لم يُسمح للتطبيق باستخدام الكاميرا. فعّل إذن الكاميرا في إعدادات Windows ثم أعد المحاولة.'
            : `تعذر تشغيل قارئ الباركود: ${message}`);
          setScanning(false);
        }
      }
    };

    void startBrowserScanner();
    return () => {
      disposed = true;
      if (scannerControls) scannerControls.stop();
      if (video) {
        const stream = video.srcObject as MediaStream | null;
        if (stream) stream.getTracks().forEach((track) => track.stop());
        video.pause();
        video.srcObject = null;
        video.remove();
      }
    };
  }, [scanning, products]);
  const printLastSale = () => {
    if (!lastSale) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.print();
    else Alert.alert('طباعة الفاتورة', 'الطباعة المباشرة متاحة في نسخة Windows.');
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      const isFunctionKey = /^F([1-9]|1[0-2])$/.test(key);
      const target = event.target as HTMLElement | null;
      if (!isFunctionKey && target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const code = event.code.toUpperCase();
      const productId = Object.entries(quickShortcutKeys).find(([, assigned]) => {
        const shortcut = assigned.trim().toUpperCase();
        return shortcut === key || shortcut === code;
      })?.[0];
      if (!productId) return;
      const product = quickProducts.find((item) => item.id === productId);
      if (!product) return;
      event.preventDefault();
      event.stopPropagation();
      addProduct(product);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [quickShortcutKeys, quickProducts, cart, products]);

  const effectiveIds = quickShortcutIds ?? []; // Default to an empty shortcut list.
  const moveShortcut = (productId: string, direction: -1 | 1) => {
    const index = effectiveIds.indexOf(productId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= effectiveIds.length) return;
    const next = [...effectiveIds];
    [next[index], next[target]] = [next[target], next[index]];
    setQuickShortcutIds(next);
  };

  return (
    <AppPage scroll={false}>
      <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
        <View style={[styles.titleRow, { borderBottomColor: '#D6D6D6' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heading, { color: colors.foreground }]}>نقطة البيع</Text>
            <Text style={[styles.subheading, { color: colors.mutedForeground }]}>واجهة بيع سريعة — السلة أولاً، والاختصارات في مساحة جانبية</Text>
          </View>
          {lastSale ? <Pressable onPress={printLastSale} style={[styles.printButton, { backgroundColor: '#111111' }]}><Feather name="printer" size={16} color="#fff" /><Text style={styles.whiteButtonText}>طباعة آخر فاتورة</Text></Pressable> : null}
          <Pressable accessibilityLabel="مسح باركود" onPress={scanning ? () => setScanning(false) : openCamera} style={[styles.scanButton, { backgroundColor: scanning ? colors.destructive : colors.primary }]}>
            <Feather name={scanning ? 'x' : 'camera'} size={17} color="#FFFFFF" /><Text style={styles.scanButtonText}>{scanning ? 'إغلاق' : 'مسح بالكاميرا'}</Text>
          </Pressable>
        </View>

        <View style={[styles.workspace, isWide && styles.workspaceWide]}>
          <View style={[styles.productsPanel, isWide ? styles.productsPanelWide : styles.productsPanelMobile, { backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }]}>
            <View style={[styles.searchRow, { backgroundColor: '#F2F2F2' }]}>
              <View style={{ flex: 1 }}><TextField label="" value={query} onChangeText={setQuery} onSubmitEditing={() => addByCode(query)} placeholder="ابحث بالاسم أو امسح الباركود" returnKeyType="search" testID="pos-search" placeholderTextColor="#666666" style={{ minHeight: 43, color: '#111111', backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }} /></View>
              <Pressable accessibilityLabel="بحث" onPress={() => addByCode(query)} style={[styles.searchButton, { backgroundColor: colors.secondary }]}><Feather name="search" size={18} color={colors.primary} /></Pressable>
            </View>
            {cameraError ? <Text style={[styles.cameraError, { color: colors.destructive }]}>{cameraError}</Text> : null}
            {scanning && Platform.OS === 'web' ? <View ref={cameraHostRef} style={styles.cameraFrame}><Text style={styles.cameraHint}>وجّه الباركود داخل إطار الكاميرا</Text></View> : null}
            {scanning && Platform.OS !== 'web' ? <View style={styles.cameraFrame}>
              <CameraView key="makhzani-mobile-barcode-camera" active={scanning} style={StyleSheet.absoluteFill} facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
                onMountError={(event) => { setScanning(false); setCameraError(event.message || 'تعذر تشغيل الكاميرا.'); }}
                onBarcodeScanned={({ data }) => { if (scannedOnce.current) return; scannedOnce.current = true; addByCode(data); }} />
              <Text style={styles.cameraHint}>وجّه الباركود داخل إطار الكاميرا</Text>
            </View> : null}
            {!query.trim() ? <View style={styles.quickHeader}>
              <View style={{ flex: 1 }}><Text style={[styles.quickProductsTitle, { color: colors.foreground }]}>اختصارات البيع</Text><Text style={[styles.productMeta, { color: colors.mutedForeground }]}>اضغط المنتج أو مفتاحه من لوحة المفاتيح</Text></View>
              <Pressable onPress={() => setManageShortcuts(true)} style={[styles.manageButton, { backgroundColor: colors.secondary }]}><Feather name="sliders" size={13} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 11 }}>إدارة</Text></Pressable>
            </View> : null}
            {!query.trim() ? <ScrollView style={styles.shortcutScroll} contentContainerStyle={styles.shortcutGrid} nestedScrollEnabled>
              {quickProducts.map((product) => <Pressable key={product.id} onPress={() => addProduct(product)} style={[styles.shortcutChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text numberOfLines={1} style={[styles.shortcutName, { color: colors.foreground }]}>{getProductDisplayName(product)}</Text>
                <View style={styles.shortcutMeta}><Text style={[styles.shortcutPrice, { color: colors.primary }]}>{money(product.salePrice)}</Text>{quickShortcutKeys[product.id] ? <Text style={[styles.keyBadge, { backgroundColor: colors.secondary, color: colors.primary }]}>{quickShortcutKeys[product.id]}</Text> : null}</View>
              </Pressable>)}
              {!quickProducts.length ? <Text style={[styles.emptyShortcuts, { color: colors.mutedForeground }]}>لا توجد اختصارات. اضغط إدارة لاختيار المنتجات.</Text> : null}
            </ScrollView> : null}
            {matches.length > 0 ? <FlatList data={matches} keyExtractor={(item) => item.id} style={styles.searchResults} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <View style={[styles.resultRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}><Text style={[styles.productName, { color: colors.foreground }]}>{getProductDisplayName(item)}</Text><Text style={[styles.productMeta, { color: colors.mutedForeground }]}>{money(item.salePrice)} / {item.unit} · المتوفر {quantityText(item.quantity)}</Text></View>
              {isWeightOrVolumeUnit(item.unit) ? <Pressable onPress={() => { setAmountProduct(item); setAmountText(''); setAmountMode('amount'); }} style={[styles.amountButton, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>بالمبلغ</Text></Pressable> : null}
              <Pressable onPress={() => { addProduct(item); setQuery(''); }} style={{ padding: 7 }}><Feather name="plus-circle" size={21} color={colors.primary} /></Pressable>
            </View>} /> : null}
          </View>

          <View style={[styles.cartPanel, { backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }]}>
            <View style={styles.cartHeader}>
              <View><Text style={[styles.cartTitle, { color: colors.foreground }]}>سلة المبيعات</Text><Text style={[styles.productMeta, { color: colors.mutedForeground }]}>{selected.length} أصناف في الفاتورة الحالية</Text></View>
              {selected.length ? <Pressable onPress={() => { setCart({}); setEditingQty({}); }} style={[styles.clearButton, { backgroundColor: colors.secondary }]}><Feather name="trash-2" size={13} color={colors.destructive} /><Text style={{ color: colors.destructive, fontSize: 11, fontWeight: '700' }}>تفريغ السلة</Text></Pressable> : null}
            </View>
            <FlatList data={selected} keyExtractor={(item) => item.product.id} style={styles.cartListView} contentContainerStyle={selected.length ? styles.cartList : styles.cartEmpty} keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<View style={styles.emptyCart}><Feather name="shopping-cart" size={34} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>السلة فارغة</Text><Text style={[styles.emptyNote, { color: colors.mutedForeground }]}>ابحث عن منتج أو استخدم الباركود أو الاختصارات.</Text></View>}
              renderItem={({ item }) => {
                const threshold = Number(item.product.offerQuantity) || 0; const offerPrice = Number(item.product.offerPrice) || 0;
                const lineTotal = threshold >= 1 && offerPrice > 0 && offerPrice < item.product.salePrice * threshold
                  ? Math.floor((item.quantity + 1e-9) / threshold) * offerPrice + (item.quantity - Math.floor((item.quantity + 1e-9) / threshold) * threshold) * item.product.salePrice
                  : item.product.salePrice * item.quantity;
                return <View style={[styles.cartItem, { backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }]}>
                  <View style={[styles.cartProductIcon, { backgroundColor: colors.secondary }]}><Feather name="package" size={22} color={colors.primary} /></View>
                  <View style={styles.cartProductInfo}><Text numberOfLines={2} style={[styles.cartProductName, { color: colors.foreground }]}>{getProductDisplayName(item.product)}</Text><Text style={[styles.cartProductMeta, { color: colors.mutedForeground }]}>{money(item.product.salePrice)} / {item.product.unit}</Text></View>
                  <View style={styles.quantityControls}>
                    <Pressable accessibilityLabel="زيادة الكمية" onPress={() => adjustQuantity(item.product, 1)} style={[styles.stepButton, { backgroundColor: colors.secondary }]}><Feather name="plus" size={15} color={colors.primary} /></Pressable>
                    <TextInput value={editingQty[item.product.id] ?? quantityText(item.quantity)} onChangeText={(value) => setQuantity(item.product, value)} onBlur={() => commitQuantity(item.product)} keyboardType="decimal-pad" selectTextOnFocus style={[styles.quantityInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
                    <Pressable accessibilityLabel="تقليل الكمية" onPress={() => adjustQuantity(item.product, -1)} style={[styles.stepButton, { backgroundColor: colors.secondary }]}><Feather name="minus" size={15} color={colors.primary} /></Pressable>
                  </View>
                  <View style={styles.lineTotalBox}><Text style={[styles.lineTotal, { color: colors.foreground }]}>{money(lineTotal)}</Text><Pressable accessibilityLabel="حذف المنتج من السلة" onPress={() => setCart((old) => { const next = { ...old }; delete next[item.product.id]; return next; })} style={styles.removeButton}><Feather name="trash-2" size={14} color={colors.destructive} /></Pressable></View>
                </View>;
              }} />
            <Card style={[styles.footer, { backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }]}>
              <View style={styles.payRow}><Text style={[styles.payLabel, { color: colors.mutedForeground }]}>طريقة الدفع</Text><View style={styles.paymentOptions}>{['نقدي', 'بطاقة'].map((method) => <Pressable key={method} onPress={() => setPaymentMethod(method)} style={[styles.paymentOption, { backgroundColor: paymentMethod === method ? colors.primary : colors.secondary }]}><Text style={{ color: paymentMethod === method ? colors.primaryForeground : colors.secondaryForeground, fontSize: 12, fontWeight: '800' }}>{method}</Text></Pressable>)}</View></View>
              <View style={styles.totalRow}><Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>المجموع قبل العروض</Text><Text style={[styles.totalValue, { color: colors.foreground }]}>{money(subtotal)}</Text></View>
              {promotionDiscount > 0 ? <View style={styles.totalRow}><Text style={[styles.totalLabel, { color: colors.primary }]}>تخفيض العروض</Text><Text style={[styles.totalValue, { color: colors.primary }]}>− {money(promotionDiscount)}</Text></View> : null}
              <View style={styles.discountRow}><View style={{ width: 112, gap: 4 }}><Text style={{ color: '#111111', fontSize: 12, fontWeight: '700', textAlign: 'right' }}>خصم إضافي</Text><TextField label="" value={discountText} onChangeText={setDiscountText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#666666" style={{ minHeight: 38, width: 112, textAlign: 'right', color: '#111111', backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }} /></View><View style={styles.totalRight}><Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>المبلغ المطلوب</Text><Text style={[styles.grandTotal, { color: colors.primary }]}>{money(total)}</Text></View></View>
              <Pressable accessibilityRole="button" accessibilityLabel="تأكيد البيع وحفظ الفاتورة" testID="complete-sale" onPress={finish} disabled={!selected.length || discount > promotionalTotal || discount < 0 || submitting} style={({ pressed }) => ({ minHeight: 48, borderRadius: 11, paddingHorizontal: 14, backgroundColor: '#111111', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!selected.length || discount > promotionalTotal || discount < 0 || submitting) ? 0.45 : pressed ? 0.78 : 1 })}>
                <Feather name="check-circle" size={18} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>{submitting ? 'جارٍ حفظ الفاتورة...' : 'تأكيد البيع وحفظ الفاتورة'}</Text>
              </Pressable>
            </Card>
          </View>
        </View>

        {lastSale ? <View nativeID="pos-print-receipt" style={styles.printReceipt}>
          <Text style={styles.receiptStore}>مخزني — فاتورة بيع</Text><Text style={styles.receiptMuted}>رقم الفاتورة: {lastSale.id.slice(-8)}</Text><Text style={styles.receiptMuted}>التاريخ: {new Date(lastSale.createdAt).toLocaleString('ar-DZ')}</Text><Text style={styles.receiptMuted}>البائع: {lastSale.employeeName} · الدفع: {lastSale.paymentMethod}</Text>
          <View style={styles.receiptDivider} /><View style={styles.receiptTableHead}><Text style={styles.receiptCell}>المنتج</Text><Text style={styles.receiptCell}>الكمية</Text><Text style={styles.receiptCell}>السعر</Text><Text style={styles.receiptCell}>المجموع</Text></View>
          {lastSale.items.map((line) => <View key={line.id} style={styles.receiptTableRow}><Text style={[styles.receiptCell, { flex: 2 }]}>{line.productName}</Text><Text style={styles.receiptCell}>{quantityText(line.quantity)}</Text><Text style={styles.receiptCell}>{money(line.salePrice)}</Text><Text style={styles.receiptCell}>{money(line.salePrice * line.quantity)}</Text></View>)}
          <View style={styles.receiptDivider} /><View style={styles.receiptSummary}><Text style={styles.receiptCell}>المجموع قبل التخفيض</Text><Text style={styles.receiptCell}>{money(lastSale.subtotal)}</Text></View><View style={styles.receiptSummary}><Text style={styles.receiptCell}>التخفيضات</Text><Text style={styles.receiptCell}>{money(lastSale.discount)}</Text></View><View style={styles.receiptSummary}><Text style={styles.receiptGrand}>الإجمالي</Text><Text style={styles.receiptGrand}>{money(lastSale.total)}</Text></View><Text style={styles.receiptThanks}>شكراً لزيارتكم</Text>
        </View> : null}
      </View>

      <Modal visible={manageShortcuts} transparent animationType="fade" onRequestClose={() => setManageShortcuts(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.manageDialog, { backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }]}>
          <Text style={[styles.dialogTitle, { color: colors.foreground }]}>إعداد اختصارات البيع</Text><Text style={[styles.productMeta, { color: colors.mutedForeground, textAlign: 'right' }]}>اختر المنتجات، رتّبها بالأسهم، واكتب مفتاحاً مثل F1 أو F2 أو A أو 1. لا يمكن تكرار المفتاح لمنتجين.</Text>
          <ScrollView style={{ width: '100%' }}>{products.map((product) => { const index = effectiveIds.indexOf(product.id); const chosen = index >= 0; return <View key={product.id} style={[styles.manageRow, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setQuickShortcutIds(chosen ? effectiveIds.filter((id) => id !== product.id) : [...effectiveIds, product.id])} style={{ padding: 5 }}><Feather name={chosen ? 'check-square' : 'square'} size={19} color={chosen ? colors.primary : colors.mutedForeground} /></Pressable>
            <View style={{ flexDirection: 'row', gap: 2 }}>{chosen ? <><Pressable disabled={index === 0} onPress={() => moveShortcut(product.id, -1)} style={{ padding: 5, opacity: index === 0 ? 0.25 : 1 }}><Feather name="chevron-up" size={17} color={colors.primary} /></Pressable><Pressable disabled={index === effectiveIds.length - 1} onPress={() => moveShortcut(product.id, 1)} style={{ padding: 5, opacity: index === effectiveIds.length - 1 ? 0.25 : 1 }}><Feather name="chevron-down" size={17} color={colors.primary} /></Pressable></> : null}</View>
            <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, textAlign: 'right', fontWeight: '700' }}>{getProductDisplayName(product)}</Text><Text style={{ color: colors.mutedForeground, textAlign: 'right', fontSize: 10 }}>{money(product.salePrice)} · المتوفر {quantityText(product.quantity)}{chosen ? ` · ${index + 1}` : ''}</Text></View>
            <TextInput value={quickShortcutKeys[product.id] ?? ''} onChangeText={(value) => setQuickShortcutKey(product.id, value.replace(/\s/g, '').slice(0, 3))} placeholder="F1" autoCapitalize="characters" maxLength={3} style={[styles.keyInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
          </View>; })}</ScrollView>
          <View style={styles.dialogActions}><Pressable onPress={() => { setQuickShortcutIds([]); }} style={[styles.dialogSecondary, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.primary, fontWeight: '800' }}>مسح الاختصارات</Text></Pressable><Pressable onPress={() => setManageShortcuts(false)} style={[styles.dialogPrimary, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>حفظ وإغلاق</Text></Pressable></View>
        </View></View>
      </Modal>

      <Modal visible={variantChoices.length > 0} transparent animationType="fade" onRequestClose={() => setVariantChoices([])}>
        <View style={styles.modalBackdrop}><View style={[styles.manageDialog, { backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }]}>
          <Text style={[styles.dialogTitle, { color: '#111111' }]}>اختر نوع المنتج</Text>
          <Text style={{ color: '#555555', textAlign: 'right', fontSize: 12 }}>تمت قراءة الباركود المشترك. اختر النوع والسعر المطلوب.</Text>
          <ScrollView style={{ width: '100%', maxHeight: 360 }}>{variantChoices.map((product) => <Pressable key={product.id} disabled={product.quantity <= 0} onPress={() => { setVariantChoices([]); addProduct(product); }} style={{ minHeight: 58, borderBottomWidth: 1, borderBottomColor: '#D6D6D6', flexDirection: 'row', alignItems: 'center', gap: 8, opacity: product.quantity <= 0 ? 0.45 : 1 }}>
            <View style={{ flex: 1 }}><Text style={{ color: '#111111', textAlign: 'right', fontWeight: '800', fontSize: 14 }}>{getProductDisplayName(product)}</Text><Text style={{ color: '#555555', textAlign: 'right', fontSize: 12 }}>المتاح: {quantityText(product.quantity)} {product.unit}</Text></View>
            <Text style={{ color: '#111111', fontWeight: '900', fontSize: 14 }}>{money(product.salePrice)}</Text>
          </Pressable>)}</ScrollView>
          <Pressable onPress={() => setVariantChoices([])} style={{ padding: 12, alignItems: 'center', backgroundColor: '#F2F2F2', borderRadius: 9 }}><Text style={{ color: '#111111', fontWeight: '800' }}>إلغاء</Text></Pressable>
        </View></View>
      </Modal>

      <Modal visible={!!amountProduct} transparent animationType="fade" onRequestClose={() => setAmountProduct(null)}>
        <View style={styles.modalBackdrop}><View style={[styles.amountDialog, { backgroundColor: '#FFFFFF', borderColor: '#D6D6D6' }]}>
          <Text style={[styles.dialogTitle, { color: colors.foreground }]}>بيع بالكمية أو المبلغ</Text><Text style={[styles.productMeta, { color: colors.mutedForeground }]}>{amountProduct ? getProductDisplayName(amountProduct) : ''} — {money(amountProduct?.salePrice ?? 0)} / {amountProduct?.unit}</Text>
          <View style={styles.amountActions}><Pressable onPress={() => { setAmountMode('amount'); setAmountText(''); }} style={[styles.modeButton, { backgroundColor: amountMode === 'amount' ? colors.primary : colors.secondary }]}><Text style={{ color: amountMode === 'amount' ? colors.primaryForeground : colors.secondaryForeground, fontWeight: '800' }}>أدخل المبلغ</Text></Pressable><Pressable onPress={() => { setAmountMode('quantity'); setQuantityScale('main'); setAmountText(''); }} style={[styles.modeButton, { backgroundColor: amountMode === 'quantity' ? colors.primary : colors.secondary }]}><Text style={{ color: amountMode === 'quantity' ? colors.primaryForeground : colors.secondaryForeground, fontWeight: '800' }}>أدخل الكمية</Text></Pressable></View>
          {amountMode === 'quantity' && amountProduct && isSmallUnit(amountProduct.unit) ? <View style={styles.amountActions}><Pressable onPress={() => setQuantityScale('main')} style={[styles.modeButton, { backgroundColor: quantityScale === 'main' ? colors.primary : colors.secondary }]}><Text style={{ color: quantityScale === 'main' ? colors.primaryForeground : colors.secondaryForeground }}>الوحدة الأساسية</Text></Pressable><Pressable onPress={() => setQuantityScale('small')} style={[styles.modeButton, { backgroundColor: quantityScale === 'small' ? colors.primary : colors.secondary }]}><Text style={{ color: quantityScale === 'small' ? colors.primaryForeground : colors.secondaryForeground }}>غرام / مليلتر</Text></Pressable></View> : null}
          <Text style={[styles.amountLabel, { color: colors.foreground }]}>{amountMode === 'amount' ? 'المبلغ بالدينار' : 'الكمية'}</Text><TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder={amountMode === 'amount' ? 'مثال: 1000' : 'مثال: 0.5'} placeholderTextColor={colors.mutedForeground} style={[styles.amountInput, { color: colors.foreground, borderColor: colors.border }]} />
          {amountProduct && Number(amountText.replace(',', '.')) > 0 ? <Text style={[styles.amountPreview, { color: colors.primary }]}>{amountMode === 'amount' ? `الكمية: ${(Number(amountText.replace(',', '.')) / amountProduct.salePrice).toFixed(3)} ${amountProduct.unit}` : `السعر: ${money(Number(amountText.replace(',', '.')) * (quantityScale === 'small' && isSmallUnit(amountProduct.unit) ? amountProduct.salePrice / 1000 : amountProduct.salePrice))}`}</Text> : null}
          <View style={styles.amountActions}><Pressable onPress={() => setAmountProduct(null)} style={[styles.amountAction, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.secondaryForeground, fontWeight: '800' }}>إلغاء</Text></Pressable><Pressable onPress={addByAmount} style={[styles.amountAction, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>إضافة للسلة</Text></Pressable></View>
        </View></View>
      </Modal>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 12, minHeight: 0, backgroundColor: '#FFFFFF' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingHorizontal: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#D6D6D6' },
  heading: { fontSize: 21, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl', letterSpacing: -0.4 },
  subheading: { marginTop: 4, fontSize: 13, textAlign: 'right', writingDirection: 'rtl', letterSpacing: 0.1 },
  scanButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#111111' },
  scanButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, whiteButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  printButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7, shadowColor: '#111111', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  workspace: { flex: 1, minHeight: 0, gap: 12 }, workspaceWide: { flexDirection: 'row-reverse' },
  productsPanel: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10, minHeight: 0, shadowColor: '#000000', shadowOpacity: 0.045, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, productsPanelWide: { width: '29%', minWidth: 285, maxWidth: 365 }, productsPanelMobile: { height: 180, maxHeight: 180 },
  cartPanel: { flex: 1, minHeight: 0, borderRadius: 14, padding: 12, gap: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D6D6D6' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 4, backgroundColor: '#F5F5F5', borderRadius: 13 }, searchButton: { marginTop: 17, width: 42, height: 42, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  cameraFrame: { height: 130, position: 'relative', borderRadius: 10, overflow: 'hidden', backgroundColor: '#101713', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 }, cameraHint: { color: '#fff', backgroundColor: 'rgba(0,0,0,.55)', fontSize: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }, cameraError: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  quickHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 }, quickProductsTitle: { fontSize: 14, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' }, productMeta: { marginTop: 2, fontSize: 10, textAlign: 'right', writingDirection: 'rtl' }, manageButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#D6D6D6' },
  shortcutScroll: { flex: 1, minHeight: 50 }, shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', paddingBottom: 4 }, shortcutChip: { width: '31.5%', minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 7, justifyContent: 'center', gap: 5 }, shortcutName: { fontSize: 12, fontWeight: '800', textAlign: 'center', writingDirection: 'rtl' }, shortcutMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }, shortcutPrice: { fontSize: 11, fontWeight: '800' }, keyBadge: { fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 4, borderRadius: 4 }, emptyShortcuts: { width: '100%', textAlign: 'center', padding: 14, fontSize: 12 },
  searchResults: { flex: 1, minHeight: 60 }, resultRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 }, productName: { fontSize: 14, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' }, amountButton: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7 },
  cartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 4, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: '#D6D6D6' }, cartTitle: { fontSize: 17, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl', letterSpacing: -0.3 }, clearButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  cartListView: { flex: 1, minHeight: 60 }, cartList: { gap: 5, paddingBottom: 4 }, cartEmpty: { flexGrow: 1, justifyContent: 'center' }, emptyCart: { alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 15 }, emptyTitle: { fontSize: 15, fontWeight: '800' }, emptyNote: { fontSize: 12, textAlign: 'center' },
  cartItem: { minHeight: 66, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9, shadowColor: '#000000', shadowOpacity: 0.035, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, cartProductIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, cartProductInfo: { flex: 1, minWidth: 90, gap: 3 }, cartProductName: { fontSize: 15, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' }, cartProductMeta: { marginTop: 3, fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' }, quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 4 }, stepButton: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: '#D6D6D6', alignItems: 'center', justifyContent: 'center' }, quantityInput: { width: 52, height: 32, borderWidth: 1.5, borderRadius: 9, textAlign: 'center', fontSize: 15, fontWeight: '900', padding: 2 }, lineTotalBox: { minWidth: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }, lineTotal: { fontSize: 16, fontWeight: '900', textAlign: 'right' }, removeButton: { padding: 5 },
  footer: { padding: 9, gap: 5, marginTop: 2, borderRadius: 16, borderWidth: 1, borderColor: '#D6D6D6', shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, payLabel: { fontSize: 13, fontWeight: '700' }, paymentOptions: { flexDirection: 'row', gap: 5 }, paymentOption: { minWidth: 72, minHeight: 36, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D6D6D6' }, totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, totalLabel: { fontSize: 13, textAlign: 'right' }, totalValue: { fontSize: 12, fontWeight: '700' }, discountRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }, totalRight: { flex: 1, alignItems: 'flex-end', paddingBottom: 2, gap: 1 }, grandTotal: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, .62)', justifyContent: 'center', padding: 18 }, manageDialog: { maxHeight: '88%', borderWidth: 1, borderRadius: 20, padding: 18, gap: 11, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 }, amountDialog: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 13, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 }, dialogTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right', writingDirection: 'rtl' }, manageRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, borderBottomWidth: 1 }, keyInput: { width: 58, height: 31, borderWidth: 1, borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: '800', padding: 2 }, dialogActions: { flexDirection: 'row', gap: 8, marginTop: 6 }, dialogSecondary: { padding: 11, borderRadius: 8 }, dialogPrimary: { flex: 1, padding: 11, borderRadius: 8, alignItems: 'center' }, amountActions: { flexDirection: 'row', gap: 8, marginTop: 4 }, modeButton: { flex: 1, minHeight: 37, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, amountLabel: { fontSize: 12, fontWeight: '800', textAlign: 'right' }, amountInput: { minHeight: 50, borderWidth: 1.5, borderRadius: 9, paddingHorizontal: 12, textAlign: 'right', fontSize: 19 }, amountPreview: { fontSize: 13, fontWeight: '800', textAlign: 'right' }, amountAction: { flex: 1, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  printReceipt: { display: 'none', backgroundColor: '#fff', padding: 24, color: '#000' }, receiptStore: { color: '#000', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8 }, receiptMuted: { color: '#222', fontSize: 11, textAlign: 'right', marginBottom: 3 }, receiptDivider: { height: 1, backgroundColor: '#333', marginVertical: 9 }, receiptTableHead: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 5 }, receiptTableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#aaa' }, receiptCell: { color: '#000', fontSize: 10, flex: 1, textAlign: 'right' }, receiptSummary: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }, receiptGrand: { color: '#000', fontSize: 15, fontWeight: '900' }, receiptThanks: { color: '#000', fontSize: 13, textAlign: 'center', marginTop: 20 },
});
