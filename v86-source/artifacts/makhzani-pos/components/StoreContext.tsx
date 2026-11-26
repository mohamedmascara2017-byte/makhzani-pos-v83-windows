import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Role = 'owner' | 'employee';
export interface Product {
  id: string;
  name: string;
  /** Variant/type label. Each variant remains a separate product record with its own stock and prices. */
  variantName?: string;
  barcode: string;
  /** Optional group barcode shared by multiple variants; scanning it opens a variant picker. */
  sharedBarcode?: string;
  alternateBarcodes: string[];
  purchasePrice: number;
  salePrice: number;
  /** Optional quantity-promotion threshold, in product units. */
  offerQuantity?: number;
  /** Total price for each full offer bundle, in the same currency unit as salePrice (DZD). */
  offerPrice?: number;
  quantity: number;
  minQuantity: number;
  unit: string;
  category: string;
  supplier: string;
  imageUri?: string;
}
export interface Employee {
  id: string;
  name: string;
  username: string;
  pin: string;
  role: Role;
  active: boolean;
}
export interface SaleLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  salePrice: number;
  /** Original unit price before quantity promotion. */
  originalSalePrice?: number;
  purchasePrice: number;
}
export interface Sale {
  id: string;
  createdAt: string;
  subtotal: number;
  discount: number;
  total: number;
  /** True when invoice-level discount has already been distributed across line prices. */
  discountAllocated?: boolean;
  paymentMethod: string;
  employeeId: string;
  employeeName: string;
  items: SaleLine[];
}
export interface PurchaseLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number;
}
export interface Purchase {
  id: string;
  createdAt: string;
  supplier: string;
  total: number;
  items: PurchaseLine[];
}
export interface ReturnRecord {
  id: string;
  createdAt: string;
  saleId: string;
  total: number;
  employeeName: string;
  items: Array<{ saleItemId: string; productId: string; quantity: number; price: number }>;
}
export interface CountRecord {
  id: string;
  createdAt: string;
  employeeName: string;
  notes: string;
  items: Array<{ productId: string; productName: string; oldQuantity: number; countedQuantity: number; difference: number }>;
}
export interface AuditEntry {
  id: string;
  createdAt: string;
  employeeName: string;
  action: string;
  details: string;
}
export interface ExpenseRecord {
  id: string;
  createdAt: string;
  title: string;
  amount: number;
  note: string;
  employeeName: string;
}
interface StoreData {
  products: Product[];
  employees: Employee[];
  sales: Sale[];
  purchases: Purchase[];
  returns: ReturnRecord[];
  counts: CountRecord[];
  audit: AuditEntry[];
  expenses: ExpenseRecord[];
  sessionUserId: string | null;
  quickShortcutIds: string[] | null;
  quickShortcutKeys: Record<string, string>;
}
export interface ProductInput extends Omit<Product, 'id'> {
  id?: string;
}
export interface SaleInputLine {
  productId: string;
  quantity: number;
}
export interface PurchaseInputLine {
  productId: string;
  quantity: number;
  purchasePrice: number;
}
export interface EmployeeInput {
  id?: string;
  name: string;
  username: string;
  pin: string;
  role: Role;
}
interface StoreValue extends StoreData {
  ready: boolean;
  currentUser: Employee | null;
  addOrUpdateProduct: (input: ProductInput) => string;
  bulkImportProducts: (inputs: ProductInput[]) => { imported: number; skipped: number };
  deleteProduct: (id: string) => void;
  completeSale: (items: SaleInputLine[], discount: number, paymentMethod: string) => Sale;
  addPurchase: (supplier: string, items: PurchaseInputLine[]) => Purchase;
  returnSaleItems: (saleId: string, quantities: Record<string, number>) => ReturnRecord;
  saveInventoryCount: (counted: Record<string, number>, notes: string) => CountRecord;
  saveEmployee: (input: EmployeeInput) => string;
  setEmployeeActive: (id: string, active: boolean) => void;
  changePin: (oldPin: string, newPin: string) => void;
  login: (pin: string) => boolean;
  logout: () => void;
  addExpense: (title: string, amount: number, note?: string, createdAt?: string) => ExpenseRecord;
  restoreBackup: (backup: unknown) => Promise<void>;
  setQuickShortcutIds: (ids: string[]) => void;
  setQuickShortcutKey: (productId: string, key: string) => void;
}

const STORAGE_KEY = 'makhzani-pos:data:v1';
const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const owner: Employee = {
  id: 'owner-default',
  name: 'المالك',
  username: 'owner',
  pin: '1234',
  role: 'owner',
  active: true,
};
const emptyData = (): StoreData => ({
  products: [],
  employees: [owner],
  sales: [],
  purchases: [],
  returns: [],
  counts: [],
  audit: [],
  expenses: [],
  sessionUserId: null,
  quickShortcutIds: [],
  quickShortcutKeys: {},
});

function normalizeSaleRecord(value: unknown, index: number): Sale | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Sale>;
  const rawDate = raw.createdAt;
  const parsedDate = new Date(rawDate as string | number);
  const createdAt = Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();
  const items = Array.isArray(raw.items) ? raw.items.map((entry, itemIndex) => {
    const line = (entry && typeof entry === 'object' ? entry : {}) as Partial<SaleLine>;
    return {
      id: String(line.id ?? `restored-${index}-${itemIndex}`),
      productId: String(line.productId ?? ''),
      productName: String(line.productName ?? 'منتج غير معروف'),
      quantity: Number(line.quantity) || 0,
      salePrice: Number(line.salePrice) || 0,
      originalSalePrice: Number(line.originalSalePrice ?? line.salePrice) || 0,
      purchasePrice: Number(line.purchasePrice) || 0,
    };
  }) : [];
  const calculatedSubtotal = items.reduce((sum, line) => sum + line.quantity * (line.originalSalePrice ?? line.salePrice), 0);
  const calculatedTotal = items.reduce((sum, line) => sum + line.quantity * line.salePrice, 0);
  return {
    id: String(raw.id ?? `restored-sale-${index}`),
    createdAt,
    subtotal: Number.isFinite(Number(raw.subtotal)) ? Number(raw.subtotal) : calculatedSubtotal,
    discount: Number(raw.discount) || 0,
    total: Number.isFinite(Number(raw.total)) ? Number(raw.total) : calculatedTotal,
    discountAllocated: raw.discountAllocated === true,
    paymentMethod: String(raw.paymentMethod ?? 'غير محدد'),
    employeeId: String(raw.employeeId ?? ''),
    employeeName: String(raw.employeeName ?? 'غير محدد'),
    items,
  };
}

function normalizeSales(value: unknown): Sale[] {
  if (!Array.isArray(value)) return [];
  return value.map((sale, index) => normalizeSaleRecord(sale, index)).filter((sale): sale is Sale => !!sale);
}

interface MakhzaniDesktopBridge {
  isDesktop: boolean;
  platform: string;
  getBackupFolder: () => Promise<string>;
  selectBackupFolder: () => Promise<string | null>;
  writeBackup: (backup: unknown) => Promise<{ saved: boolean; folderPath?: string; reason?: string }>;
}

declare global {
  interface Window {
    makhzaniDesktop?: MakhzaniDesktopBridge;
  }
}

export function getProductDisplayName(product: Pick<Product, 'name' | 'variantName'>): string {
  const variant = String(product.variantName ?? '').trim();
  return variant ? `${product.name} — ${variant}` : product.name;
}

function canonicalBarcode(value: string): string {
  const clean = String(value ?? '').replace(/[\r\n\t\0]/g, '').trim().replace(/^\][A-Z][0-9]/, '').toLocaleLowerCase();
  // Treat UPC-A and its 13-digit EAN form as the same physical barcode.
  return clean.length === 13 && clean.startsWith('0') && /^\d{13}$/.test(clean) ? clean.slice(1) : clean;
}

function validateProductBarcodes(products: Product[], input: ProductInput): void {
  const independentCodes = [input.barcode, ...input.alternateBarcodes].map(canonicalBarcode).filter(Boolean);
  const sharedCode = canonicalBarcode(input.sharedBarcode ?? '');
  const variantName = String(input.variantName ?? '').trim();

  if (new Set(independentCodes).size !== independentCodes.length) {
    throw new Error('تأكد من عدم تكرار الباركود المستقل داخل المنتج نفسه.');
  }
  if (sharedCode && independentCodes.includes(sharedCode)) {
    throw new Error('لا يمكن استعمال الرمز نفسه كرمز مستقل ومشترك في المنتج نفسه.');
  }
  if (sharedCode && !variantName) {
    throw new Error('عند استعمال باركود مشترك، اكتب اسم النوع أو النسخة حتى يظهر واضحاً عند المسح.');
  }

  const others = products.filter((product) => product.id !== input.id);
  for (const code of independentCodes) {
    const conflict = others.find((product) =>
      [product.barcode, ...product.alternateBarcodes, product.sharedBarcode ?? ''].some((stored) => canonicalBarcode(stored) === code),
    );
    if (conflict) throw new Error(`الباركود المستقل مستخدم مسبقاً أو يتطابق مع رمز آخر للمنتج: ${getProductDisplayName(conflict)}`);
  }

  if (sharedCode) {
    const independentConflict = others.find((product) =>
      [product.barcode, ...product.alternateBarcodes].some((stored) => canonicalBarcode(stored) === sharedCode),
    );
    if (independentConflict) {
      throw new Error(`الباركود المشترك يتعارض مع باركود مستقل للمنتج: ${getProductDisplayName(independentConflict)}.`);
    }

    const sharedGroup = others.filter((product) => canonicalBarcode(product.sharedBarcode ?? '') === sharedCode);
    const wrongGroup = sharedGroup.find((product) => product.name.trim().toLocaleLowerCase() !== input.name.trim().toLocaleLowerCase());
    if (wrongGroup) {
      throw new Error(`هذا الباركود المشترك مرتبط بمجموعة «${wrongGroup.name}». استعمله فقط لأنواع المنتج نفسه.`);
    }
    const duplicateVariant = sharedGroup.find((product) => String(product.variantName ?? '').trim().toLocaleLowerCase() === variantName.toLocaleLowerCase());
    if (duplicateVariant) throw new Error(`النوع «${variantName}» مسجل مسبقاً تحت هذا الباركود المشترك.`);
  }
}

const StoreContext = createContext<StoreValue | null>(null);

function withAudit(data: StoreData, action: string, details: string): AuditEntry {
  const user = data.employees.find((employee) => employee.id === data.sessionUserId);
  return {
    id: makeId(),
    createdAt: new Date().toISOString(),
    employeeName: user?.name ?? 'النظام',
    action,
    details,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData>(emptyData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted) return;
        if (raw) {
          const saved = JSON.parse(raw) as Partial<StoreData>;
          const employees = saved.employees?.length ? saved.employees : [owner];
          setData({
            ...emptyData(),
            ...saved,
            sales: normalizeSales(saved.sales),
            products: Array.isArray(saved.products) ? saved.products.map((product) => ({
              ...product,
              id: String(product.id ?? makeId()),
              name: String(product.name ?? ''),
              variantName: String(product.variantName ?? ''),
              barcode: String(product.barcode ?? ''),
              sharedBarcode: String(product.sharedBarcode ?? ''),
              alternateBarcodes: Array.isArray(product.alternateBarcodes) ? product.alternateBarcodes.map(String) : [],
              purchasePrice: Number(product.purchasePrice) || 0,
              salePrice: Number(product.salePrice) || 0,
              quantity: Number(product.quantity) || 0,
              minQuantity: Number(product.minQuantity) || 0,
              unit: String(product.unit ?? 'قطعة'),
              category: String(product.category ?? ''),
              supplier: String(product.supplier ?? ''),
            })) : [],
            employees,
            quickShortcutIds: Array.isArray(saved.quickShortcutIds) ? saved.quickShortcutIds.map(String) : [],
            quickShortcutKeys: saved.quickShortcutKeys && typeof saved.quickShortcutKeys === 'object' ? Object.fromEntries(Object.entries(saved.quickShortcutKeys).map(([id, key]) => [String(id), String(key).toUpperCase()])) : {},
            sessionUserId: employees.some((employee) => employee.id === saved.sessionUserId && employee.active)
              ? saved.sessionUserId ?? null
              : null,
          });
        }
      })
      .catch(() => {
        if (mounted) setData(emptyData());
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(data);
    AsyncStorage.setItem(STORAGE_KEY, serialized).catch(() => undefined);

    // Windows desktop: when the owner selects a Google Drive for desktop folder,
    // keep a current backup and one dated snapshot per day after each data change.
    if (typeof window !== 'undefined' && window.makhzaniDesktop?.isDesktop && window.makhzaniDesktop.writeBackup) {
      const backup = {
        format: 'makhzani-pos-backup-v1',
        app: 'Makhzani POS',
        exportedAt: new Date().toISOString(),
        ...data,
      };
      window.makhzaniDesktop.writeBackup(backup).catch(() => undefined);
    }
  }, [data, ready]);

  const currentUser = data.employees.find((employee) => employee.id === data.sessionUserId && employee.active) ?? null;

  const addOrUpdateProduct = useCallback((input: ProductInput) => {
    const name = input.name.trim();
    if (!name) throw new Error('اكتب اسم المنتج.');
    validateProductBarcodes(data.products, input);
    const id = input.id ?? makeId();
    const product: Product = {
      ...input,
      id,
      name,
      variantName: String(input.variantName ?? '').trim(),
      barcode: input.barcode.trim(),
      sharedBarcode: String(input.sharedBarcode ?? '').trim(),
      alternateBarcodes: input.alternateBarcodes.map((code) => code.trim()).filter(Boolean),
      category: input.category.trim(),
      supplier: input.supplier.trim(),
      unit: input.unit.trim() || 'قطعة',
    };
    const products = input.id
      ? data.products.map((existing) => existing.id === id ? product : existing)
      : [...data.products, product];
    const audit = withAudit(data, input.id ? 'تعديل منتج' : 'إضافة منتج', product.name);
    setData({ ...data, products, audit: [audit, ...data.audit] });
    return id;
  }, [data]);

  const bulkImportProducts = useCallback((inputs: ProductInput[]) => {
    let nextProducts = [...data.products];
    let imported = 0;
    let skipped = 0;
    for (const input of inputs) {
      const name = input.name.trim();
      if (!name) {
        skipped += 1;
        continue;
      }
      const barcode = input.barcode.trim();
      const existingIndex = barcode
        ? nextProducts.findIndex((product) => product.barcode === barcode || product.alternateBarcodes.includes(barcode))
        : -1;
      const existingProduct = existingIndex >= 0 ? nextProducts[existingIndex] : undefined;
      try {
        validateProductBarcodes(nextProducts, { ...input, id: existingProduct?.id });
      } catch {
        skipped += 1;
        continue;
      }
      if (existingIndex >= 0) {
        const old = nextProducts[existingIndex];
        if (!old) {
          skipped += 1;
          continue;
        }
        nextProducts[existingIndex] = {
          ...old,
          ...input,
          id: old.id,
          name,
          variantName: String(input.variantName ?? old.variantName ?? '').trim(),
          sharedBarcode: String(input.sharedBarcode ?? old.sharedBarcode ?? '').trim(),
          barcode: barcode || old.barcode,
          alternateBarcodes: input.alternateBarcodes ?? old.alternateBarcodes,
          unit: input.unit.trim() || old.unit,
          category: input.category.trim(),
          supplier: input.supplier.trim(),
        };
      } else {
        nextProducts.push({
          ...input,
          id: makeId(),
          name,
          variantName: String(input.variantName ?? '').trim(),
          sharedBarcode: String(input.sharedBarcode ?? '').trim(),
          barcode,
          alternateBarcodes: input.alternateBarcodes ?? [],
          unit: input.unit.trim() || 'قطعة',
          category: input.category.trim(),
          supplier: input.supplier.trim(),
        });
      }
      imported += 1;
    }
    if (imported) {
      const audit = withAudit(data, 'استيراد منتجات', `${imported} منتج`);
      setData({ ...data, products: nextProducts, audit: [audit, ...data.audit] });
    }
    return { imported, skipped };
  }, [data]);

  const deleteProduct = useCallback((id: string) => {
    const product = data.products.find((item) => item.id === id);
    if (!product) return;
    if (data.sales.some((sale) => sale.items.some((item) => item.productId === id)) ||
        data.purchases.some((purchase) => purchase.items.some((item) => item.productId === id))) {
      throw new Error('لا يمكن حذف منتج مرتبط بفاتورة سابقة.');
    }
    const audit = withAudit(data, 'حذف منتج', product.name);
    setData({ ...data, products: data.products.filter((item) => item.id !== id), audit: [audit, ...data.audit] });
  }, [data]);

  const completeSale = useCallback((items: SaleInputLine[], discount: number, paymentMethod: string) => {
    if (!items.length) throw new Error('أضف منتجًا واحدًا على الأقل.');
    const lines: SaleLine[] = items.map((line) => {
      const product = data.products.find((item) => item.id === line.productId);
      if (!product) throw new Error('أحد المنتجات لم يعد متاحًا.');
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error('أدخل كمية صحيحة.');
      if (line.quantity > product.quantity) throw new Error(`المخزون غير كافٍ: ${product.name}`);
      const offerQuantity = Number(product.offerQuantity) || 0;
      const offerPrice = Number(product.offerPrice) || 0;
      const validOffer = offerQuantity >= 1 && offerPrice > 0 && offerPrice < product.salePrice * offerQuantity;
      const bundles = validOffer ? Math.floor((line.quantity + 1e-9) / offerQuantity) : 0;
      const remainder = line.quantity - bundles * offerQuantity;
      const lineTotal = validOffer
        ? bundles * offerPrice + remainder * product.salePrice
        : line.quantity * product.salePrice;
      const effectiveUnitPrice = lineTotal / line.quantity;
      return {
        id: makeId(),
        productId: product.id,
        productName: getProductDisplayName(product),
        quantity: line.quantity,
        salePrice: effectiveUnitPrice,
        originalSalePrice: product.salePrice,
        purchasePrice: product.purchasePrice,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * (line.originalSalePrice ?? line.salePrice), 0);
    const promotedTotal = lines.reduce((sum, line) => sum + line.quantity * line.salePrice, 0);
    const promotionDiscount = Math.max(0, subtotal - promotedTotal);
    if (!Number.isFinite(discount) || discount < 0 || discount > promotedTotal) throw new Error('قيمة الخصم غير صحيحة.');
    const totalDiscount = promotionDiscount + discount;
    const discountFactor = promotedTotal > 0 ? Math.max(0, (promotedTotal - discount) / promotedTotal) : 1;
    const payableLines = lines.map((line) => ({ ...line, salePrice: line.salePrice * discountFactor }));
    const user = currentUser;
    const sale: Sale = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      subtotal,
      discount: totalDiscount,
      total: promotedTotal - discount,
      discountAllocated: true,
      paymentMethod,
      employeeId: user?.id ?? '',
      employeeName: user?.name ?? 'النظام',
      items: payableLines,
    };
    const products = data.products.map((product) => {
      const sold = lines.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
      return sold ? { ...product, quantity: product.quantity - sold } : product;
    });
    const audit = withAudit(data, 'إتمام بيع', `فاتورة ${sale.id.slice(-6)} • ${sale.total.toFixed(2)} دج`);
    setData({ ...data, products, sales: [sale, ...data.sales], audit: [audit, ...data.audit] });
    return sale;
  }, [currentUser, data]);

  const addPurchase = useCallback((supplier: string, items: PurchaseInputLine[]) => {
    if (!items.length) throw new Error('أضف منتجات إلى فاتورة الشراء.');
    const lines: PurchaseLine[] = items.map((line) => {
      const product = data.products.find((item) => item.id === line.productId);
      if (!product) throw new Error('أحد المنتجات لم يعد متاحًا.');
      if (line.quantity <= 0 || line.purchasePrice < 0) throw new Error('راجع الكمية وسعر الشراء.');
      return {
        id: makeId(),
        productId: product.id,
        productName: getProductDisplayName(product),
        quantity: line.quantity,
        purchasePrice: line.purchasePrice,
      };
    });
    const purchase: Purchase = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      supplier: supplier.trim() || 'غير محدد',
      total: lines.reduce((sum, line) => sum + line.quantity * line.purchasePrice, 0),
      items: lines,
    };
    const products = data.products.map((product) => {
      const received = lines.filter((line) => line.productId === product.id);
      if (!received.length) return product;
      const quantity = received.reduce((sum, line) => sum + line.quantity, 0);
      const newestPrice = received[received.length - 1]?.purchasePrice ?? product.purchasePrice;
      return { ...product, quantity: product.quantity + quantity, purchasePrice: newestPrice };
    });
    const audit = withAudit(data, 'إضافة شراء', `${purchase.supplier} • ${purchase.total.toFixed(2)} دج`);
    setData({ ...data, products, purchases: [purchase, ...data.purchases], audit: [audit, ...data.audit] });
    return purchase;
  }, [data]);

  const returnSaleItems = useCallback((saleId: string, quantities: Record<string, number>) => {
    const sale = data.sales.find((item) => item.id === saleId);
    if (!sale) throw new Error('الفاتورة غير موجودة.');
    const items: ReturnRecord['items'] = [];
    for (const line of sale.items) {
      const quantity = quantities[line.id] ?? 0;
      if (!Number.isFinite(quantity) || quantity < 0) throw new Error('أدخل كميات إرجاع صحيحة.');
      const alreadyReturned = data.returns
        .flatMap((record) => record.saleId === saleId ? record.items : [])
        .filter((item) => item.saleItemId === line.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (quantity > line.quantity - alreadyReturned) throw new Error(`كمية الإرجاع تتجاوز المباع: ${line.productName}`);
      if (quantity > 0) {
        const oldPromotedTotal = sale.items.reduce((sum, saleLine) => sum + saleLine.quantity * saleLine.salePrice, 0);
        const oldPromotionDiscount = sale.items.reduce((sum, saleLine) => sum + saleLine.quantity * Math.max(0, (saleLine.originalSalePrice ?? saleLine.salePrice) - saleLine.salePrice), 0);
        const oldManualDiscount = Math.max(0, sale.discount - oldPromotionDiscount);
        const oldDiscountFactor = oldPromotedTotal > 0 ? Math.max(0, (oldPromotedTotal - oldManualDiscount) / oldPromotedTotal) : 1;
        const refundUnitPrice = sale.discountAllocated ? line.salePrice : line.salePrice * oldDiscountFactor;
        items.push({ saleItemId: line.id, productId: line.productId, quantity, price: refundUnitPrice });
      }
    }
    if (!items.length) throw new Error('أدخل كمية لمنتج واحد على الأقل.');
    const record: ReturnRecord = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      saleId,
      total: items.reduce((sum, item) => sum + item.quantity * item.price, 0),
      employeeName: currentUser?.name ?? 'النظام',
      items,
    };
    const products = data.products.map((product) => {
      const quantity = items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      return quantity ? { ...product, quantity: product.quantity + quantity } : product;
    });
    const audit = withAudit(data, 'مرتجع بيع', `مرتجع ${record.id.slice(-6)} من فاتورة ${sale.id.slice(-6)}`);
    setData({ ...data, products, returns: [record, ...data.returns], audit: [audit, ...data.audit] });
    return record;
  }, [currentUser, data]);

  const saveInventoryCount = useCallback((counted: Record<string, number>, notes: string) => {
    if (!data.products.length) throw new Error('أضف منتجات قبل بدء الجرد.');
    const items = data.products.map((product) => {
      const countedQuantity = counted[product.id];
      if (!Number.isFinite(countedQuantity) || countedQuantity < 0) throw new Error(`أدخل كمية صحيحة: ${product.name}`);
      return {
        productId: product.id,
        productName: getProductDisplayName(product),
        oldQuantity: product.quantity,
        countedQuantity,
        difference: countedQuantity - product.quantity,
      };
    });
    const record: CountRecord = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      employeeName: currentUser?.name ?? 'النظام',
      notes: notes.trim(),
      items,
    };
    const products = data.products.map((product) => ({ ...product, quantity: counted[product.id] }));
    const audit = withAudit(data, 'جرد المخزون', `${items.length} صنف • ${record.id.slice(-6)}`);
    setData({ ...data, products, counts: [record, ...data.counts], audit: [audit, ...data.audit] });
    return record;
  }, [currentUser, data]);

  const saveEmployee = useCallback((input: EmployeeInput) => {
    const name = input.name.trim();
    const username = input.username.trim();
    if (!name || !username) throw new Error('أدخل اسم المستخدم واسم الموظف.');
    if (!/^\d{4,8}$/.test(input.pin)) throw new Error('رمز PIN يجب أن يتكون من 4 إلى 8 أرقام.');
    if (data.employees.some((employee) => employee.username === username && employee.id !== input.id)) {
      throw new Error('اسم المستخدم مستخدم بالفعل.');
    }
    const id = input.id ?? makeId();
    const employee: Employee = { ...input, id, name, username, active: true };
    const employees = input.id
      ? data.employees.map((existing) => existing.id === id ? { ...existing, ...employee, active: existing.active } : existing)
      : [...data.employees, employee];
    const audit = withAudit(data, input.id ? 'تعديل مستخدم' : 'إضافة مستخدم', employee.name);
    setData({ ...data, employees, audit: [audit, ...data.audit] });
    return id;
  }, [data]);

  const setEmployeeActive = useCallback((id: string, active: boolean) => {
    const employee = data.employees.find((item) => item.id === id);
    if (!employee) throw new Error('المستخدم غير موجود.');
    if (!active && employee.id === currentUser?.id) throw new Error('لا يمكن إيقاف حسابك أثناء تسجيل الدخول.');
    if (!active && employee.role === 'owner' && data.employees.filter((item) => item.role === 'owner' && item.active).length <= 1) {
      throw new Error('يجب بقاء حساب مالك واحد مفعّل على الأقل.');
    }
    const audit = withAudit(data, active ? 'تفعيل مستخدم' : 'تعطيل مستخدم', employee.name);
    setData({
      ...data,
      employees: data.employees.map((item) => item.id === id ? { ...item, active } : item),
      audit: [audit, ...data.audit],
    });
  }, [currentUser, data]);

  const changePin = useCallback((oldPin: string, newPin: string) => {
    if (!currentUser || currentUser.pin !== oldPin) throw new Error('رمز PIN الحالي غير صحيح.');
    if (!/^\d{4,8}$/.test(newPin)) throw new Error('رمز PIN الجديد يجب أن يتكون من 4 إلى 8 أرقام.');
    const audit = withAudit(data, 'تغيير PIN', currentUser.name);
    setData({
      ...data,
      employees: data.employees.map((item) => item.id === currentUser.id ? { ...item, pin: newPin } : item),
      audit: [audit, ...data.audit],
    });
  }, [currentUser, data]);

  const login = useCallback((pin: string) => {
    const employee = data.employees.find((item) => item.pin === pin && item.active);
    if (!employee) return false;
    setData({ ...data, sessionUserId: employee.id });
    return true;
  }, [data]);
  const logout = useCallback(() => setData({ ...data, sessionUserId: null }), [data]);

  const addExpense = useCallback((title: string, amount: number, note = '', createdAt = new Date().toISOString()) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error('اكتب اسم المصروف.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('أدخل مبلغًا صحيحًا أكبر من صفر.');
    const record: ExpenseRecord = {
      id: makeId(),
      createdAt,
      title: cleanTitle,
      amount,
      note: note.trim(),
      employeeName: currentUser?.name ?? 'النظام',
    };
    const audit = withAudit(data, 'إضافة مصروف', `${record.title} • ${record.amount.toFixed(2)} دج`);
    setData({ ...data, expenses: [record, ...(data.expenses ?? [])], audit: [audit, ...data.audit] });
    return record;
  }, [currentUser, data]);

  const setQuickShortcutIds = useCallback((ids: string[]) => {
    const uniqueIds = [...new Set(ids)].filter((id) => data.products.some((product) => product.id === id));
    setData((current) => ({ ...current, quickShortcutIds: uniqueIds }));
  }, [data.products]);

  const setQuickShortcutKey = useCallback((productId: string, key: string) => {
    const normalized = key.trim().toUpperCase();
    setData((current) => {
      const next = { ...current.quickShortcutKeys };
      if (!normalized) delete next[productId];
      else {
        for (const [id, assigned] of Object.entries(next)) {
          if (assigned.toUpperCase() === normalized && id !== productId) delete next[id];
        }
        next[productId] = normalized;
      }
      return { ...current, quickShortcutKeys: next };
    });
  }, []);

  const restoreBackup = useCallback(async (backup: unknown) => {
    if (!backup || typeof backup !== 'object' || (backup as { format?: string }).format !== 'makhzani-pos-backup-v1') {
      throw new Error('هذا الملف ليس نسخة احتياطية صالحة من مخزني.');
    }
    const candidate = backup as Partial<StoreData>;
    if (!Array.isArray(candidate.products) || !Array.isArray(candidate.employees) ||
        !Array.isArray(candidate.sales) || !Array.isArray(candidate.purchases) ||
        !Array.isArray(candidate.returns) || !Array.isArray(candidate.counts) ||
        !Array.isArray(candidate.audit) || !Array.isArray(candidate.expenses)) {
      throw new Error('النسخة الاحتياطية ناقصة أو تالفة. يجب أن تحتوي على المنتجات والمبيعات والمشتريات والمرتجعات والمصاريف والجرد.');
    }
    const restoredEmployees = candidate.employees.length ? candidate.employees : [owner];
    const sessionUserId = restoredEmployees.some((employee) => employee.id === data.sessionUserId && employee.active)
      ? data.sessionUserId : null;
    const restored: StoreData = {
      products: candidate.products.map((product) => ({
        ...product,
        id: String(product.id ?? makeId()),
        name: String(product.name ?? ''),
        variantName: String(product.variantName ?? ''),
        barcode: String(product.barcode ?? ''),
        sharedBarcode: String(product.sharedBarcode ?? ''),
        alternateBarcodes: Array.isArray(product.alternateBarcodes) ? product.alternateBarcodes.map(String) : [],
        purchasePrice: Number(product.purchasePrice) || 0,
        salePrice: Number(product.salePrice) || 0,
        quantity: Number(product.quantity) || 0,
        minQuantity: Number(product.minQuantity) || 0,
        unit: String(product.unit ?? 'قطعة'),
        category: String(product.category ?? ''),
        supplier: String(product.supplier ?? ''),
      })),
      employees: restoredEmployees,
      sales: normalizeSales(candidate.sales),
      purchases: candidate.purchases,
      returns: Array.isArray(candidate.returns) ? candidate.returns : [],
      counts: Array.isArray(candidate.counts) ? candidate.counts : [],
      audit: Array.isArray(candidate.audit) ? candidate.audit : [],
      expenses: Array.isArray(candidate.expenses) ? candidate.expenses : [],
      sessionUserId,
      quickShortcutIds: Array.isArray(candidate.quickShortcutIds)
        ? candidate.quickShortcutIds.map(String)
        : [],
      quickShortcutKeys: candidate.quickShortcutKeys && typeof candidate.quickShortcutKeys === 'object'
        ? Object.fromEntries(Object.entries(candidate.quickShortcutKeys).map(([id, key]) => [String(id), String(key).toUpperCase()]))
        : {},
    };
    restored.quickShortcutIds = restored.quickShortcutIds?.filter((id) => restored.products.some((product) => product.id === id));
    const audit = withAudit(restored, 'استعادة نسخة احتياطية', `${restored.products.length} منتج`);
    const nextData = { ...restored, audit: [audit, ...restored.audit] };
    // Persist before reporting success so the restored data survives an app restart.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
    setData(nextData);
  }, [data.sessionUserId]);

  const value = useMemo<StoreValue>(() => ({
    ...data,
    ready,
    currentUser,
    addOrUpdateProduct,
    bulkImportProducts,
    deleteProduct,
    completeSale,
    addPurchase,
    returnSaleItems,
    saveInventoryCount,
    saveEmployee,
    setEmployeeActive,
    changePin,
    login,
    logout,
    addExpense,
    restoreBackup,
    setQuickShortcutIds,
    setQuickShortcutKey,
  }), [
    data, ready, currentUser, addOrUpdateProduct, bulkImportProducts, deleteProduct, completeSale, addPurchase,
    returnSaleItems, saveInventoryCount, saveEmployee, setEmployeeActive, changePin, login, logout, addExpense, restoreBackup, setQuickShortcutIds, setQuickShortcutKey,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside StoreProvider.');
  return context;
}
