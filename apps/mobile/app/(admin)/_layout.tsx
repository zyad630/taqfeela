import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { colors, fonts } from '../../src/theme/tokens';
import { haptic } from '../../src/animations';
import { useAppStore } from '../../src/store/useAppStore';
import { LayoutDashboard, BarChart3, Receipt, MoreHorizontal } from 'lucide-react-native';

export default function AdminLayout() {
  const router = useRouter();
  const { isPaired, activeWaiter } = useAppStore();

  useEffect(() => {
    if (!isPaired) {
      router.replace('/(auth)/pair');
    } else if (!activeWaiter) {
      router.replace('/(auth)/login');
    }
  }, [isPaired, activeWaiter]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }
      }}
      tabBar={({ state, navigation }) => {
        const routeName = state.routes[state.index].name;
        const tabs = [
          { id: 'home', label: 'اللوحة', icon: (c: string) => <LayoutDashboard size={24} color={c} strokeWidth={1.8} /> },
          { id: 'reports', label: 'التقارير', icon: (c: string) => <BarChart3 size={24} color={c} strokeWidth={1.8} /> },
          { id: 'invoices', label: 'الفواتير', icon: (c: string) => <Receipt size={24} color={c} strokeWidth={1.8} /> },
          { id: 'more', label: 'المزيد', icon: (c: string) => <MoreHorizontal size={24} color={c} strokeWidth={1.8} /> }
        ];

        return (
          <View style={styles.navContainer}>
            {tabs.map((tab) => {
              const isActive = routeName === tab.id;
              const color = isActive ? colors.orangeText : colors.muted;

              return (
                <TouchableOpacity
                  key={tab.id}
                  activeOpacity={0.7}
                  onPress={() => {
                    haptic.selection();
                    navigation.navigate(tab.id);
                  }}
                  style={styles.tabItem}
                >
                  {tab.icon(color)}
                  <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="invoices" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    height: 76,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  tabLabel: {
    fontFamily: fonts.cairoSemiBold,
    fontSize: 12
  }
});
