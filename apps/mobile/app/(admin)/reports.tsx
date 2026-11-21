import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl
} from 'react-native';
import { Screen } from '../../src/ui/Screen';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { haptic } from '../../src/animations';
import { api } from '../../src/api/client';

export default function AdminReportsScreen() {
  const [period, setPeriod] = useState<'today' | '7d' | 'month' | 'custom'>('7d');
  const [refreshing, setRefreshing] = useState(false);
  const [reportsData, setReportsData] = useState<any>(null);

  const periods = [
    { id: 'today', name: 'اليوم' },
    { id: '7d', name: '7 أيام' },
    { id: 'month', name: 'الشهر' },
    { id: 'custom', name: '3 شهور' }
  ];

  const fetchReports = useCallback(async () => {
    try {
      const res = await api.getAdminDashboard();
      if (res && res.ok && res.reports) {
        setReportsData(res.reports);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReports();
    setRefreshing(false);
  };

  const activeStats = reportsData?.[period] || {
    totalSales: '0',
    invoicesCount: '0',
    avgInvoice: '0',
    topProducts: []
  };

  const days = reportsData?.daysChart || [
    { name: 'السبت', val: '0', h: 14, isToday: false },
    { name: 'الأحد', val: '0', h: 14, isToday: false },
    { name: 'الاتنين', val: '0', h: 14, isToday: false },
    { name: 'التلات', val: '0', h: 14, isToday: false },
    { name: 'الأربع', val: '0', h: 14, isToday: false },
    { name: 'الخميس', val: '0', h: 14, isToday: false },
    { name: 'الجمعة', val: '0', h: 14, isToday: true }
  ];

  const topProducts = activeStats.topProducts || [];

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>التقارير</Text>
        <Text style={styles.headerSubtitle}>
          إحصائيات المبيعات والأصناف الأكثر طلباً من الكاشير مباشرة
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.orange} />}
      >
        {/* 2. Period Selector */}
        <View style={styles.periodSelector}>
          {periods.map((p) => {
            const isSelected = period === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.7}
                onPress={() => {
                  haptic.selection();
                  setPeriod(p.id as any);
                }}
                style={[
                  styles.periodTab,
                  isSelected && styles.periodTabActive
                ]}
              >
                <Text style={[
                  styles.periodText,
                  isSelected && styles.periodTextActive
                ]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 3. KPI Tiles Row */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiTileLarge}>
            <Text style={styles.kpiLabel}>إجمالي المبيعات</Text>
            <Text style={styles.kpiValueOrange}>{activeStats.totalSales} ج</Text>
          </View>
          <View style={styles.kpiTileSmall}>
            <Text style={styles.kpiLabel}>الفواتير</Text>
            <Text style={styles.kpiValueDark}>{activeStats.invoicesCount}</Text>
          </View>
          <View style={styles.kpiTileSmall}>
            <Text style={styles.kpiLabel}>متوسط الفاتورة</Text>
            <Text style={styles.kpiValueDark}>{activeStats.avgInvoice} ج</Text>
          </View>
        </View>

        {/* 4. Daily Sales Bar Chart Card */}
        <View style={styles.card}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>المبيعات اليومية (آخر 7 أيام)</Text>
            <Text style={styles.chartUnit}>بالجنيه / ألف</Text>
          </View>

          {/* Bars */}
          <View style={styles.barsContainer}>
            {days.map((d: any, i: number) => (
              <View key={i} style={styles.barColumn}>
                <Text style={[
                  styles.barValueText,
                  { color: d.isToday ? colors.orangeText : colors.text }
                ]}>
                  {d.val}
                </Text>
                <View style={[
                  styles.barVisual,
                  {
                    height: d.h,
                    backgroundColor: d.isToday ? colors.orange : colors.brown
                  }
                ]} />
                <Text style={styles.dayNameText}>{d.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 5. Top Selling Products */}
        <View style={styles.topSection}>
          <Text style={styles.topSectionTitle}>الأكتر مبيعًا</Text>
          <View style={styles.topList}>
            {topProducts.length > 0 ? (
              topProducts.map((t: any, i: number) => (
                <View key={i} style={styles.topRow}>
                  <Text style={styles.topName} numberOfLines={1}>{t.name}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: t.w as any }]} />
                  </View>
                  <Text style={styles.topQty}>{t.qty}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>لا توجد مبيعات مسجلة في هذه الفترة بعد</Text>
            )}
          </View>
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
    gap: 14
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  periodTab: {
    flex: 1,
    height: 40,
    borderRadius: radii.chip,
    justifyContent: 'center',
    alignItems: 'center'
  },
  periodTabActive: {
    backgroundColor: colors.orange
  },
  periodText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: colors.text
  },
  periodTextActive: {
    color: colors.text
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 10
  },
  kpiTileLarge: {
    flex: 1.5,
    padding: 12,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2
  },
  kpiTileSmall: {
    flex: 1,
    padding: 12,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2
  },
  kpiLabel: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted
  },
  kpiValueOrange: {
    fontFamily: fonts.balooBold,
    fontSize: 22,
    color: colors.orangeText,
    includeFontPadding: false,
    paddingVertical: 2
  },
  kpiValueDark: {
    fontFamily: fonts.balooBold,
    fontSize: 22,
    color: colors.text,
    includeFontPadding: false,
    paddingVertical: 2
  },
  card: {
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  chartTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.text
  },
  chartUnit: {
    fontFamily: fonts.cairoRegular,
    fontSize: 12,
    color: colors.muted
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    paddingTop: 16
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6
  },
  barValueText: {
    fontFamily: fonts.balooBold,
    fontSize: 12
  },
  barVisual: {
    width: '80%',
    maxWidth: 24,
    borderRadius: 4
  },
  dayNameText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4
  },
  topSection: {
    gap: 8
  },
  topSectionTitle: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    color: colors.text
  },
  topList: {
    gap: 10
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  topName: {
    width: 120,
    fontFamily: fonts.cairoSemiBold,
    fontSize: 14,
    color: colors.text
  },
  progressTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden'
  },
  progressFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.orange
  },
  topQty: {
    width: 36,
    textAlign: 'left',
    fontFamily: fonts.balooBold,
    fontSize: 15,
    color: colors.text
  },
  emptyText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 16
  }
});
