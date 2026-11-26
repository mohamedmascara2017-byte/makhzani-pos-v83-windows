import React from 'react';
import { Feather } from '@expo/vector-icons';
import { AppPage, Card, EmptyState, formatDate, PageHeader } from '@/components/common';
import { useStore } from '@/components/StoreContext';
import { useColors } from '@/hooks/useColors';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function AuditScreen() {
  const colors = useColors();
  const { audit } = useStore();
  return (
    <AppPage>
      <PageHeader title="سجل العمليات" subtitle="تتبّع عمليات البيع والمخزون والمستخدمين" onBack={() => router.back()} />
      {!audit.length ? <Card><EmptyState title="لا توجد عمليات مسجلة" description="سيظهر سجل النشاط بعد أول عملية على المتجر." icon="activity" /></Card> : (
        <Card style={styles.list}>
          {audit.map((entry, index) => (
            <View key={entry.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name="activity" size={15} color={colors.primary} /></View>
              <View style={styles.details}>
                <Text style={[styles.action, { color: colors.foreground }]}>{entry.action}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>{entry.details}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>{entry.employeeName} · {formatDate(entry.createdAt)}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </AppPage>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 0, gap: 0 },
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  icon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, gap: 4, alignItems: 'flex-start' },
  action: { fontSize: 13, fontWeight: '700', writingDirection: 'rtl' },
  meta: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
});
