import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl
} from 'react-native';
import { Screen } from '../../src/ui/Screen';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { api } from '../../src/api/client';

export default function AdminInvoicesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await api.getAdminDashboard();
      if (res && res.ok && Array.isArray(res.recentInvoices)) {
        setInvoices(res.recentInvoices);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchInvoices();
    const interval = setInterval(fetchInvoices, 10000);
    return () => clearInterval(interval);
  }, [fetchInvoices]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchInvoices();
    setRefreshing(false);
  };

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الفواتير</Text>
        <Text style={styles.headerSubtitle}>أحدث الفواتير المسجلة · {invoices.length} فاتورة</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.orange} />}
      >
        {invoices.map((inv, idx) => {
          const isCancelled = inv.status === 'cancelled';

          return (
            <View
              key={`${inv.id}-${idx}`}
              style={[
                styles.invoiceCard,
                isCancelled && styles.invoiceCardCancelled
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.idAndTable}>
                  <Text style={styles.invoiceId}>#{inv.id}</Text>
                  <Text style={styles.tableName}>{inv.table}</Text>
                </View>
                <View style={styles.amountGroup}>
                  <Text style={[
                    styles.amountText,
                    isCancelled && styles.amountCancelled
                  ]}>
                    {inv.amount} ج
                  </Text>
                  <View style={[
                    styles.methodBadge,
                    isCancelled ? styles.badgeCancelled : styles.badgePaid
                  ]}>
                    <Text style={[
                      styles.methodText,
                      isCancelled ? styles.textCancelled : styles.textPaid
                    ]}>
                      {isCancelled ? 'ملغية' : inv.method}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.waiterText}>الكاشير/الويتر: {inv.waiter}</Text>
                <Text style={styles.timeText}>{inv.date ? `${inv.date} · ` : ''}{inv.time}</Text>
              </View>

              {isCancelled && inv.reason && (
                <Text style={styles.cancelReason}>سبب الإلغاء: {inv.reason}</Text>
              )}
            </View>
          );
        })}

        {invoices.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>لا توجد فواتير مسجلة حتى الآن</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 2
  },
  headerTitle: {
    fontFamily: fonts.balooBold,
    fontSize: 26,
    color: colors.text,
    includeFontPadding: false,
    paddingVertical: 2
  },
  headerSubtitle: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12
  },
  invoiceCard: {
    padding: 16,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8
  },
  invoiceCardCancelled: {
    borderColor: colors.red,
    backgroundColor: colors.redTint
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  idAndTable: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8
  },
  invoiceId: {
    fontFamily: fonts.balooBold,
    fontSize: 18,
    color: colors.text
  },
  tableName: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.muted
  },
  amountGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  amountText: {
    fontFamily: fonts.balooBold,
    fontSize: 20,
    color: colors.text
  },
  amountCancelled: {
    color: colors.red,
    textDecorationLine: 'line-through'
  },
  methodBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radii.pill
  },
  badgePaid: {
    backgroundColor: colors.bg
  },
  badgeCancelled: {
    backgroundColor: colors.surface
  },
  methodText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12
  },
  textPaid: {
    color: colors.muted
  },
  textCancelled: {
    color: colors.red
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  waiterText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.text2
  },
  timeText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12,
    color: colors.muted,
    direction: 'ltr'
  },
  cancelReason: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12,
    color: colors.red,
    marginTop: 2
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center'
  },
  emptyText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 14,
    color: colors.muted
  }
});
