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
import { useAppStore } from '../../src/store/useAppStore';
import { api } from '../../src/api/client';

export default function AdminHomeScreen() {
  const { cafeInfo, isOnline } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  const [sales, setSales] = useState('0');
  const [comparisonText, setComparisonText] = useState('مبيعات اليوم المباشرة من الكاشير');
  const [invoicesCount, setInvoicesCount] = useState('0');
  const [cancelledCount, setCancelledCount] = useState(0);
  const [openShiftUser, setOpenShiftUser] = useState('جاري التحميل...');
  const [openShiftSince, setOpenShiftSince] = useState('');
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState('الآن');

  const [paymentMethods, setPaymentMethods] = useState([
    { name: 'كاش', amount: '0', percent: '100%', color: colors.orange },
    { name: 'كارت', amount: '0', percent: '0%', color: colors.darkBrown },
    { name: 'محفظة', amount: '0', percent: '0%', color: colors.tan }
  ]);

  const [alerts, setAlerts] = useState<Array<{ title: string; sub: string; dot: string }>>([
    { title: 'جاري مزامنة البيانات الحية...', sub: 'يتم جلب أحدث المبيعات والشيفت من الكاشير', dot: colors.orange }
  ]);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.getAdminDashboard();
      if (res && res.ok) {
        if (res.today) {
          setSales(res.today.sales || '0');
          setComparisonText(res.today.comparisonText || 'مبيعات اليوم المباشرة');
          setInvoicesCount(res.today.invoicesCount || '0');
          setCancelledCount(Number(res.today.cancelledCount) || 0);

          if (Array.isArray(res.today.paymentMethods)) {
            const colorMap: Record<string, string> = {
              'كاش': colors.orange,
              'كارت': colors.darkBrown,
              'محفظة': colors.tan
            };
            setPaymentMethods(
              res.today.paymentMethods.map((m: any) => ({
                name: m.name,
                amount: m.amount || '0',
                percent: m.percent || '0%',
                color: colorMap[m.name] || colors.orange
              }))
            );
          }
        }
        if (res.openShift) {
          setOpenShiftUser(res.openShift.userName || 'لا يوجد شيفت');
          setOpenShiftSince(res.openShift.since || '');
        }
        if (Array.isArray(res.alerts)) {
          setAlerts(
            res.alerts.map((a: any) => ({
              title: a.title,
              sub: a.sub,
              dot: a.type === 'danger' ? colors.red : a.type === 'warning' ? colors.orangeText : colors.darkBrown
            }))
          );
        }
        const now = new Date();
        setLastUpdatedLabel(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    setRefreshing(false);
  };

  const todayFormatted = (() => {
    try {
      return new Date().toLocaleDateString('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    } catch {
      return 'اليوم';
    }
  })();

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{cafeInfo?.name || 'تقفيلة كافيه'}</Text>
          <Text style={styles.headerSubtitle}>النهارده · {todayFormatted}</Text>
        </View>

        <View style={styles.updatePill}>
          <View style={[styles.greenDot, !isOnline && { backgroundColor: colors.red }]} />
          <Text style={styles.updatePillText}>
            {isOnline ? `مباشر · ${lastUpdatedLabel}` : 'غير متصل'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.orange} />}
      >
        {/* 2. Hero Sales Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>مبيعات النهارده</Text>
          <View style={styles.salesRow}>
            <Text style={styles.salesValue}>{sales}</Text>
            <Text style={styles.salesCurrency}>ج</Text>
          </View>
          <Text style={styles.heroComparison}>{comparisonText}</Text>
        </View>

        {/* 3. Two KPI Tiles */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>الفواتير</Text>
            <Text style={styles.kpiNumber}>{invoicesCount}</Text>
            <Text style={styles.kpiSub}>
              {cancelledCount > 0 ? `منها ${cancelledCount} ملغية` : 'لا توجد فواتير ملغية'}
            </Text>
          </View>
          <View style={styles.kpiTile}>
            <Text style={styles.kpiLabel}>الشيفت المفتوح</Text>
            <Text style={styles.kpiTextVal} numberOfLines={1}>{openShiftUser}</Text>
            <Text style={styles.kpiSub}>{openShiftSince}</Text>
          </View>
        </View>

        {/* 4. Payment Split Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>طرق الدفع</Text>

          {/* Segmented Bar */}
          <View style={styles.segmentedBar}>
            {paymentMethods.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.barSegment,
                  { width: m.percent as any, backgroundColor: m.color }
                ]}
              />
            ))}
          </View>

          {/* Legend */}
          <View style={styles.legendGrid}>
            {paymentMethods.map((m, i) => (
              <View key={i} style={styles.legendItem}>
                <View style={styles.legendLabelRow}>
                  <View style={[styles.legendSquare, { backgroundColor: m.color }]} />
                  <Text style={styles.legendName}>{m.name}</Text>
                </View>
                <Text style={styles.legendAmount}>{m.amount} ج</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 5. "محتاج انتباهك" Alerts */}
        <View style={styles.alertsContainer}>
          <Text style={styles.alertsSectionTitle}>محتاج انتباهك</Text>
          {alerts.map((a, i) => (
            <View key={i} style={styles.alertRow}>
              <View style={[styles.alertDot, { backgroundColor: a.dot }]} />
              <View style={styles.alertTextGroup}>
                <Text style={styles.alertTitle}>{a.title}</Text>
                <Text style={styles.alertSub}>{a.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerInfo: {
    gap: 2,
    flex: 1
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
  updatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green
  },
  updatePillText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12,
    color: colors.muted
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14
  },
  heroCard: {
    padding: 18,
    borderRadius: radii.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.orange,
    gap: 6
  },
  heroLabel: {
    fontFamily: fonts.cairoRegular,
    fontSize: 14,
    color: colors.muted
  },
  salesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8
  },
  salesValue: {
    fontFamily: fonts.balooBold,
    fontSize: 42,
    color: colors.orangeText,
    includeFontPadding: false,
    paddingVertical: 4
  },
  salesCurrency: {
    fontFamily: fonts.cairoBold,
    fontSize: 18,
    color: colors.orangeText
  },
  heroComparison: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12
  },
  kpiTile: {
    flex: 1,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4
  },
  kpiLabel: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  kpiNumber: {
    fontFamily: fonts.balooBold,
    fontSize: 28,
    color: colors.text,
    includeFontPadding: false,
    paddingVertical: 2
  },
  kpiTextVal: {
    fontFamily: fonts.cairoBold,
    fontSize: 16,
    color: colors.text,
    includeFontPadding: false,
    paddingVertical: 2
  },
  kpiSub: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted
  },
  card: {
    padding: 16,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  cardTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.text
  },
  segmentedBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    gap: 2
  },
  barSegment: {
    height: 14
  },
  legendGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  legendItem: {
    flex: 1,
    gap: 2
  },
  legendLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 3
  },
  legendName: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted
  },
  legendAmount: {
    fontFamily: fonts.cairoBold,
    fontSize: 15,
    color: colors.text
  },
  alertsContainer: {
    gap: 10
  },
  alertsSectionTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.text
  },
  alertRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  alertTextGroup: {
    flex: 1,
    gap: 2
  },
  alertTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.text
  },
  alertSub: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted
  }
});
