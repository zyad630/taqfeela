import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { BottomNav, WaiterTab } from '../../src/ui/BottomNav';
import { useAppStore } from '../../src/store/useAppStore';
import { colors } from '../../src/theme/tokens';

export default function WaiterLayout() {
  const { pendingOutboxCount, isPaired, activeWaiter } = useAppStore();
  const router = useRouter();

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
        tabBarStyle: { display: 'none' } // Hidden default bar, rendered custom below
      }}
      tabBar={({ state, navigation }) => {
        const routeName = state.routes[state.index].name;
        let activeTab: WaiterTab = 'tables';
        if (routeName === 'my-orders') activeTab = 'my-orders';
        if (routeName === 'settings') activeTab = 'settings';

        return (
          <BottomNav
            activeTab={activeTab}
            pendingCount={pendingOutboxCount}
            onTabChange={(tab) => {
              navigation.navigate(tab);
            }}
          />
        );
      }}
    >
      <Tabs.Screen name="tables" />
      <Tabs.Screen name="my-orders" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
