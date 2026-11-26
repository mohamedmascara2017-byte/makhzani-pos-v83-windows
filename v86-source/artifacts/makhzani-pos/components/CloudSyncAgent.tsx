import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '@/components/StoreContext';
import {
  cloudPayloadFromStore,
  hasBusinessData,
  isCompleteCloudPayload,
  saveSyncBaseline,
  SYNC_BASELINE_PREFIX,
  SYNC_QUEUE_PREFIX,
  SYNC_CONFLICT_PREFIX,
  SYNC_SAFETY_PREFIX,
} from '@/lib/autoSync';
import { currentCloudEmail, fetchCloudSnapshot, getLinkedStore, saveCloudSnapshot } from '@/lib/supabaseSync';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function CloudSyncAgent() {
  const store = useStore();
  const latestStore = useRef(store);
  const busy = useRef(false);
  latestStore.current = store;

  useEffect(() => {
    let active = true;

    const syncOnce = async () => {
      if (!active || busy.current || AppState.currentState !== 'active' || !latestStore.current.ready) return;
      busy.current = true;
      try {
        if (!(await currentCloudEmail())) return;
        const linked = await getLinkedStore();
        const baseKey = SYNC_BASELINE_PREFIX + linked.storeId;
        const queueKey = SYNC_QUEUE_PREFIX + linked.storeId;
        const conflictKey = SYNC_CONFLICT_PREFIX + linked.storeId;
        if (await AsyncStorage.getItem(conflictKey)) return;

        const baselineRaw = await AsyncStorage.getItem(baseKey);
        if (!baselineRaw) return; // First connection must be bootstrapped by the owner from the sync screen.
        const baseline = JSON.parse(baselineRaw) as { revision: number; payload: unknown };
        const local = cloudPayloadFromStore(latestStore.current);
        const localChanged = !same(local, baseline.payload);
        const snapshot = await fetchCloudSnapshot(linked.storeId);
        const cloud = snapshot.payload;

        if (snapshot.revision === baseline.revision) {
          if (!localChanged) {
            await AsyncStorage.removeItem(queueKey);
            return;
          }
          if (linked.role !== 'owner') return;
          const queued = { payload: local, expectedRevision: baseline.revision, queuedAt: new Date().toISOString() };
          await AsyncStorage.setItem(queueKey, JSON.stringify(queued));
          const newRevision = await saveCloudSnapshot(linked.storeId, local, baseline.revision);
          await saveSyncBaseline(linked.storeId, newRevision, local);
          await AsyncStorage.removeItem(queueKey);
          return;
        }

        if (!localChanged) {
          if (!isCompleteCloudPayload(cloud)) return;
          if (!hasBusinessData(cloud) && hasBusinessData(local)) return;
          const current = latestStore.current;
          const safety = {
            format: 'makhzani-pos-backup-v1',
            app: 'Makhzani POS automatic pre-sync safety backup',
            exportedAt: new Date().toISOString(),
            products: current.products,
            employees: current.employees,
            sales: current.sales,
            purchases: current.purchases,
            returns: current.returns,
            counts: current.counts,
            audit: current.audit,
            expenses: current.expenses,
            quickShortcutIds: current.quickShortcutIds,
            quickShortcutKeys: current.quickShortcutKeys,
          };
          await AsyncStorage.setItem(SYNC_SAFETY_PREFIX + linked.storeId, JSON.stringify(safety));
          const verified = await AsyncStorage.getItem(SYNC_SAFETY_PREFIX + linked.storeId);
          if (!verified) return;
          const localPins = new Map(current.employees.map((employee) => [employee.id, employee.pin]));
          const employees = (cloud.employees as Array<Record<string, unknown>>).map((employee) => ({
            ...employee,
            pin: localPins.get(String(employee.id)) ?? '',
          }));
          await current.restoreBackup({ ...cloud, employees });
          await saveSyncBaseline(linked.storeId, snapshot.revision, cloud);
          return;
        }

        // Both devices changed since the same baseline. Never guess how to merge stock or sales.
        await AsyncStorage.setItem(conflictKey, JSON.stringify({
          detectedAt: new Date().toISOString(),
          baseRevision: baseline.revision,
          cloudRevision: snapshot.revision,
          localPayload: local,
          cloudPayload: cloud,
        }));
      } catch {
        // Offline/network errors leave the persistent local queue intact for the next retry.
      } finally {
        busy.current = false;
      }
    };

    void syncOnce();
    const interval = setInterval(() => { void syncOnce(); }, 5000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncOnce();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return null;
}
