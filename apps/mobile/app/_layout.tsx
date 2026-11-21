import React, { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts, Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold } from '@expo-google-fonts/cairo';
import { BalooBhaijaan2_600SemiBold, BalooBhaijaan2_700Bold, BalooBhaijaan2_800ExtraBold } from '@expo-google-fonts/baloo-bhaijaan-2';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Keep splash screen visible while loading resources
SplashScreen.preventAutoHideAsync().catch(() => {});

// Force RTL layout
try {
  if (!I18nManager.isRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  }
} catch (_) {}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    BalooBhaijaan2_600SemiBold,
    BalooBhaijaan2_700Bold,
    BalooBhaijaan2_800ExtraBold
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_left' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)/pair" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(waiter)" />
        <Stack.Screen name="order/[tableId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="(admin)" />
      </Stack>
    </SafeAreaProvider>
  );
}
