import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl
} from 'react-native';
import { Screen } from '../../src/ui/Screen';
import { Banner } from '../../src/ui/Banner';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/useAppStore';
import { outbox } from '../../src/outbox/worker';
import { getDb, OutboxRow } from '../../src/db/sqlite';
import { haptic } from '../../src/animations';
import { Clock, Check, AlertCircle } from 'lucide-react-native';

export default function MyOrdersScreen() {
  const { shiftName, isOnline } = useAppStore();
  const [orders, setOrders] = useState<OutboxRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    try {
      const db = await getDb();
      const all = await db.getAllOrders(50);
      setOrders(all);
    } catch (_) {}
  };

  useEffect(() => {
    loadOrders();
    const unsub = outbox.subscribe(() => {
      loadOrders();
    });
    return unsub;
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await outbox.retryNow();
    await loadOrders();
    setRefreshing(false);
  };

  const handleRetryNow = async () => {
    haptic.medium();
    await outbox.retryNow();
  };

  const pendingCount = orders.filter(o => o.state === 'pending').length;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  };

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>طلباتي</Text>
        <Text style={styles.headerSubtitle}>
          {shiftName} · {orders.length} طلبات
        </Text>
      </View>

      {/* 2. Offline / Pending Banner */}
      {(!isOnline || pendingCount > 0) && (
        <View style={styles.bannerWrapper}>
          <Banner
            kind="offline"
            title={!isOnline ? 'مفيش اتصال بالكاشير' : `${pendingCount} طلبات في انتظار الإرسال`}
            message={
              pendingCount > 0
                ? `${pendingCount} طلبات محفوظة على موبايلك، هيتبعتوا لوحدهم أول ما الاتصال يرجع.`
                : 'أنت غير متصل بشبكة الكاشير حالياً، الطلبات الجديدة ستُحفظ تلقائياً على الموبايل.'
            }
            actionLabel={pendingCount > 0 ? 'جرّب الإرسال دلوقتي' : undefined}
            onAction={pendingCount > 0 ? handleRetryNow : undefined}
          />
        </View>
      )}

      {/* 3. Orders List */}
      <ScrollView
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange}
            colors={[colors.orange]}
          />
        }
      >
        {orders.map((order) => {
          const isPending = order.state === 'pending';
          const isSent = order.state === 'sent';
          const isFailed = order.state === 'failed';

          return (
            <View
              key={order.id}
              style={[
                styles.orderCard,
                isPending && styles.orderCardPending,
                isSent && styles.orderCardSent,
                isFailed && styles.orderCardFailed
              ]}
            >
              {/* Card Top: Table + Time + Status Chip */}
              <View style={styles.cardTop}>
                <View style={styles.tableAndTime}>
                  <Text style={styles.tableName}>{order.tableName}</Text>
                  <Text style={styles.orderTime}>{formatTime(order.createdAt)}</Text>
                </View>

                {/* Status Chip */}
                {isPending && (
                  <View style={[styles.statusChip, styles.chipPending]}>
                    <Clock size={14} color={colors.text} strokeWidth={2.4} />
                    <Text style={styles.chipTextPending}>في الانتظار</Text>
                  </View>
                )}
                {isSent && (
                  <View style={[styles.statusChip, styles.chipSent]}>
                    <Check size={14} color={colors.greenText} strokeWidth={2.4} />
                    <Text style={styles.chipTextSent}>وصل للكاشير</Text>
                  </View>
                )}
                {isFailed && (
                  <View style={[styles.statusChip, styles.chipFailed]}>
                    <AlertCircle size={14} color={colors.red} strokeWidth={2.4} />
                    <Text style={styles.chipTextFailed}>اترفض</Text>
                  </View>
                )}
              </View>

              {/* Items Line */}
              <Text style={styles.itemsSummary}>{order.itemsSummary}</Text>

              {/* Error Reason if failed */}
              {isFailed && order.lastError && (
                <Text style={styles.errorReason}>السبب: {order.lastError}</Text>
              )}

              {/* Retry Button for Pending */}
              {isPending && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleRetryNow}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryButtonText}>جرّب الإرسال دلوقتي</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {orders.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لم تقم بتسجيل أي طلبات في هذا الشيفت بعد</Text>
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
    lineHeight: 30
  },
  headerSubtitle: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  bannerWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 14
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12
  },
  orderCard: {
    borderRadius: radii.card,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 10
  },
  orderCardPending: {
    borderWidth: 2,
    borderColor: colors.orange,
    borderStyle: 'dashed'
  },
  orderCardSent: {
    borderWidth: 1,
    borderColor: colors.border
  },
  orderCardFailed: {
    borderWidth: 1,
    borderColor: colors.red
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  tableAndTime: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10
  },
  tableName: {
    fontFamily: fonts.balooBold,
    fontSize: 22,
    color: colors.text
  },
  orderTime: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.muted,
    direction: 'ltr'
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: radii.pill
  },
  chipPending: {
    backgroundColor: colors.orange
  },
  chipTextPending: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.text
  },
  chipSent: {
    backgroundColor: colors.greenTint
  },
  chipTextSent: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.greenText
  },
  chipFailed: {
    backgroundColor: colors.redTint
  },
  chipTextFailed: {
    fontFamily: fonts.cairoBold,
    fontSize: 13,
    color: colors.red
  },
  itemsSummary: {
    fontFamily: fonts.cairoRegular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.text2
  },
  errorReason: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12.5,
    color: colors.red
  },
  retryButton: {
    height: 44,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: colors.orange,
    justifyContent: 'center',
    alignItems: 'center'
  },
  retryButtonText: {
    fontFamily: fonts.cairoBold,
    fontSize: 15,
    color: colors.orangeText
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center'
  },
  emptyText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: colors.muted
  }
});
