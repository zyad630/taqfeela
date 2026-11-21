import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/ui/Screen';
import { colors, fonts, radii } from '../../src/theme/tokens';
import { useAppStore, Table } from '../../src/store/useAppStore';
import { haptic } from '../../src/animations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 52) / 2;

export default function TablesScreen() {
  const router = useRouter();
  const {
    activeWaiter,
    shiftName,
    isOnline,
    halls,
    selectedHall,
    setSelectedHall,
    tables,
    loadTables,
    loadingTables
  } = useAppStore();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTables();
    setRefreshing(false);
  }, [loadTables]);

  useEffect(() => {
    loadTables();
  }, []);

  // Auto-refresh every 5 seconds to keep tables in sync with cashier
  useEffect(() => {
    const interval = setInterval(() => {
      loadTables();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadTables]);

  // Filter tables by selected hall
  const filteredTables = selectedHall === 'الكل'
    ? tables
    : tables.filter(t => t.hall === selectedHall || String(t.hall) === String(selectedHall));

  const getTableStyle = (state: Table['state']) => {
    switch (state) {
      case 'busy':
        return {
          bg: '#FFF5EB',
          borderColor: colors.orange,
          borderWidth: 1.5,
          markFill: colors.orange,
          markBorder: colors.orange,
          markRadius: 6,
          stateColor: colors.orangeText,
          defaultMeta: 'مشغولة'
        };
      case 'mine':
        return {
          bg: colors.orangeTint,
          borderColor: colors.orange,
          borderWidth: 2,
          markFill: colors.orange,
          markBorder: colors.orange,
          markRadius: 3,
          stateColor: colors.orangeText,
          defaultMeta: 'طلبك وصل للكاشير'
        };
      case 'waiting':
        return {
          bg: colors.surface,
          borderColor: colors.orange,
          borderWidth: 2,
          markFill: 'transparent',
          markBorder: colors.orange,
          markRadius: 3,
          stateColor: colors.orangeText,
          defaultMeta: 'هيتبعت لما الاتصال يرجع'
        };
      case 'free':
      default:
        return {
          bg: 'transparent',
          borderColor: colors.border,
          borderWidth: 1,
          markFill: 'transparent',
          markBorder: colors.muted,
          markRadius: 6,
          stateColor: colors.muted,
          defaultMeta: 'جاهزة للطلب'
        };
    }
  };

  const handleTablePress = (table: Table) => {
    haptic.selection();
    router.push({
      pathname: '/order/[tableId]',
      params: {
        tableId: String(table.id),
        tableNumber: String(table.tableNumber),
        hall: table.hall
      }
    });
  };

  const formatPrice = (price: number) => {
    if (price <= 0) return '';
    return `${price.toFixed(0)} ج.م`;
  };

  return (
    <Screen safeBottom={false}>
      {/* 1. Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>الطاولات</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {activeWaiter?.name || 'الويتر'} · {shiftName}
          </Text>
        </View>

        {/* Connection Status Pill */}
        <View style={[styles.statusPill, !isOnline && styles.statusPillOffline]}>
          <View style={[styles.statusDot, !isOnline && { backgroundColor: colors.orangeText }]} />
          <Text style={styles.statusPillText}>{isOnline ? 'متصل' : 'بدون نت'}</Text>
        </View>
      </View>

      {/* 2. Hall Pills */}
      <View style={styles.hallsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hallsScroll}
        >
          {halls.map((hall) => {
            const isSelected = selectedHall === hall;
            return (
              <TouchableOpacity
                key={hall}
                activeOpacity={0.7}
                onPress={() => {
                  haptic.selection();
                  setSelectedHall(hall);
                }}
                style={[
                  styles.hallPill,
                  isSelected && styles.hallPillActive
                ]}
              >
                <Text style={[
                  styles.hallText,
                  isSelected && styles.hallTextActive
                ]}>
                  {hall}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. 2-Column Table Grid */}
      <ScrollView
        contentContainerStyle={styles.gridContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || loadingTables}
            onRefresh={onRefresh}
            tintColor={colors.orange}
            colors={[colors.orange]}
          />
        }
      >
        <View style={styles.grid}>
          {filteredTables.map((table) => {
            const style = getTableStyle(table.state);
            const isBusy = table.state !== 'free';
            const stateLabel =
              table.state === 'busy' ? 'مشغولة' :
              table.state === 'mine' ? 'طلبك' :
              table.state === 'waiting' ? 'في الانتظار' : 'فاضية';

            return (
              <TouchableOpacity
                key={table.id}
                activeOpacity={0.75}
                onPress={() => handleTablePress(table)}
                style={[
                  styles.tableCard,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.borderColor,
                    borderWidth: style.borderWidth,
                    borderStyle: table.state === 'free' ? 'dashed' :
                                 table.state === 'waiting' ? 'dashed' : 'solid'
                  }
                ]}
              >
                {/* Top: Table Number + State Marker */}
                <View style={styles.tableCardTop}>
                  <Text style={styles.tableNumber} numberOfLines={1}>
                    {table.tableNumber}
                  </Text>
                  <View style={[
                    styles.marker,
                    {
                      backgroundColor: style.markFill,
                      borderColor: style.markBorder,
                      borderRadius: style.markRadius
                    }
                  ]} />
                </View>

                {/* Bottom: State + Price for busy tables */}
                <View style={styles.tableCardBottom}>
                  <View style={styles.stateRow}>
                    <Text
                      style={[styles.tableStateText, { color: style.stateColor }]}
                      numberOfLines={1}
                    >
                      {stateLabel}
                    </Text>
                    {isBusy && table.totalPrice > 0 && (
                      <Text style={styles.tablePriceText} numberOfLines={1}>
                        {formatPrice(table.totalPrice)}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.tableMetaText} numberOfLines={1}>
                    {isBusy && table.itemCount > 0
                      ? `${table.itemCount} أصناف${table.sinceMinutes > 0 ? ` · من ${table.sinceMinutes} د` : ''}`
                      : (table.meta || style.defaultMeta)
                    }
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {filteredTables.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد طاولات متاحة في هذا القسم</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerInfo: {
    gap: 2,
    flex: 1,
    marginRight: 12
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
  statusPill: {
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
  statusPillOffline: {
    backgroundColor: colors.orangeTint,
    borderColor: colors.orange
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green
  },
  statusPillText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 13,
    color: colors.muted
  },
  hallsWrapper: {
    paddingBottom: 14
  },
  hallsScroll: {
    paddingHorizontal: 20,
    gap: 8
  },
  hallPill: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  hallPillActive: {
    backgroundColor: colors.orange,
    borderColor: colors.orange
  },
  hallText: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 15,
    color: colors.text
  },
  hallTextActive: {
    color: colors.text
  },
  gridContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between'
  },
  tableCard: {
    width: CARD_WIDTH,
    height: 120,
    borderRadius: radii.card,
    padding: 14,
    justifyContent: 'space-between'
  },
  tableCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
    gap: 6
  },
  tableNumber: {
    fontFamily: fonts.balooBold,
    fontSize: 22,
    color: colors.text,
    includeFontPadding: false,
    paddingVertical: 2,
    flexShrink: 1
  },
  marker: {
    width: 12,
    height: 12,
    borderWidth: 2
  },
  tableCardBottom: {
    gap: 2
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tableStateText: {
    fontFamily: fonts.cairoBold,
    fontSize: 14,
    flexShrink: 1
  },
  tablePriceText: {
    fontFamily: fonts.balooBold,
    fontSize: 14,
    color: colors.orangeText,
    includeFontPadding: false
  },
  tableMetaText: {
    fontFamily: fonts.cairoRegular,
    fontSize: 11,
    color: colors.muted
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
