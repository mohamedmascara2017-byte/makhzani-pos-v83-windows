import AsyncStorage from '@react-native-async-storage/async-storage';

export const SYNC_BASELINE_PREFIX = 'makhzani-pos:auto-sync-baseline:v1:';
export const SYNC_QUEUE_PREFIX = 'makhzani-pos:auto-sync-queue:v1:';
export const SYNC_CONFLICT_PREFIX = 'makhzani-pos:auto-sync-conflict:v1:';
export const SYNC_SAFETY_PREFIX = 'makhzani-pos:auto-sync-safety:v1:';

export function cloudPayloadFromStore(store: any) {
  return {
    format: 'makhzani-pos-backup-v1',
    app: 'Makhzani POS',
    exportedAt: new Date().toISOString(),
    products: store.products,
    employees: store.employees.map(({ pin: _pin, ...employee }: any) => employee),
    sales: store.sales,
    purchases: store.purchases,
    returns: store.returns,
    counts: store.counts,
    audit: store.audit,
    expenses: store.expenses,
    quickShortcutIds: store.quickShortcutIds,
    quickShortcutKeys: store.quickShortcutKeys,
  };
}

export function isCompleteCloudPayload(value: any): boolean {
  return !!value && typeof value === 'object' &&
    value.format === 'makhzani-pos-backup-v1' &&
    ['products', 'employees', 'sales', 'purchases', 'returns', 'counts', 'audit', 'expenses']
      .every((key) => Array.isArray(value[key]));
}

export function hasBusinessData(value: any): boolean {
  return ['products', 'sales', 'purchases', 'returns', 'counts', 'expenses']
    .some((key) => Array.isArray(value?.[key]) && value[key].length > 0);
}

export async function saveSyncBaseline(storeId: string, revision: number, payload: unknown) {
  await AsyncStorage.setItem(SYNC_BASELINE_PREFIX + storeId, JSON.stringify({
    revision,
    payload,
    savedAt: new Date().toISOString(),
  }));
}
