import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/tokens';
import { haptic } from '../animations';
import { LayoutGrid, ClipboardList, Settings } from 'lucide-react-native';

export type WaiterTab = 'tables' | 'my-orders' | 'settings';

interface BottomNavProps {
  activeTab: WaiterTab;
  onTabChange: (tab: WaiterTab) => void;
  pendingCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  pendingCount = 0
}) => {
  const tabs = [
    {
      id: 'tables' as WaiterTab,
      label: 'الطاولات',
      icon: (color: string) => <LayoutGrid size={24} color={color} strokeWidth={1.8} />
    },
    {
      id: 'my-orders' as WaiterTab,
      label: 'طلباتي',
      icon: (color: string) => <ClipboardList size={24} color={color} strokeWidth={1.8} />,
      badge: pendingCount > 0 ? String(pendingCount) : null
    },
    {
      id: 'settings' as WaiterTab,
      label: 'الإعدادات',
      icon: (color: string) => <Settings size={24} color={color} strokeWidth={1.8} />
    }
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const color = isActive ? colors.orangeText : colors.muted;

        return (
          <TouchableOpacity
            key={tab.id}
            activeOpacity={0.7}
            onPress={() => {
              haptic.selection();
              onTabChange(tab.id);
            }}
            style={styles.tabItem}
          >
            <View style={styles.iconWrapper}>
              {tab.icon(color)}
              {tab.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 76,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  iconWrapper: {
    position: 'relative'
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.orange,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  badgeText: {
    fontFamily: fonts.balooBold,
    fontSize: 11,
    color: colors.text,
    lineHeight: 14
  },
  tabLabel: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12
  }
});
