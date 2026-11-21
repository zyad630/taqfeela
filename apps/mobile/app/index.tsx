import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../src/store/useAppStore';
import { colors } from '../src/theme/tokens';

export default function Index() {
  const router = useRouter();
  const { initialized, isPaired, activeWaiter, init } = useAppStore();

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!initialized) return;

    if (!isPaired) {
      router.replace('/(auth)/pair');
    } else if (!activeWaiter) {
      router.replace('/(auth)/login');
    } else if (activeWaiter.role === 'admin') {
      router.replace('/(admin)/home');
    } else {
      router.replace('/(waiter)/tables');
    }
  }, [initialized, isPaired, activeWaiter]);

  return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <Image
          source={require('../assets/taqfeela-logo.jpg')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <ActivityIndicator size="large" color={colors.orange} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoWrapper: {
    width: 140,
    height: 140,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.orange,
    backgroundColor: colors.surface
  },
  logo: {
    width: '100%',
    height: '100%'
  }
});
