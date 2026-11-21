import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEYS = {
  DEVICE_TOKEN: 'taqfeela_device_token',
  WAITER_TOKEN: 'taqfeela_waiter_token',
  CAFE_INFO: 'taqfeela_cafe_info',
  ACTIVE_WAITER: 'taqfeela_active_waiter',
  ADMIN_TOKEN: 'taqfeela_admin_token'
} as const;

// Memory fallback for Web or environments without native secure store
const memStorage = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    memStorage.set(key, value);
    try { localStorage.setItem(key, value); } catch (_) {}
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
  });
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return memStorage.get(key) || (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null);
  }
  return await SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    memStorage.delete(key);
    try { localStorage.removeItem(key); } catch (_) {}
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export interface CafeInfo {
  name: string;
  code?: string;
  host: string;
  port: number;
  protocol?: 'http' | 'https';
}

export interface ActiveWaiter {
  id: number;
  name: string;
  username?: string;
  role?: string;
  assignedHalls: string[];
}

export const secureStorage = {
  // Device Token (Permanent pairing)
  setDeviceToken: (token: string) => setItem(KEYS.DEVICE_TOKEN, token),
  getDeviceToken: () => getItem(KEYS.DEVICE_TOKEN),
  clearDeviceToken: () => deleteItem(KEYS.DEVICE_TOKEN),

  // Waiter Session Token (8 hours)
  setWaiterToken: (token: string) => setItem(KEYS.WAITER_TOKEN, token),
  getWaiterToken: () => getItem(KEYS.WAITER_TOKEN),
  clearWaiterToken: () => deleteItem(KEYS.WAITER_TOKEN),

  // Café Info
  setCafeInfo: async (info: CafeInfo) => {
    await setItem(KEYS.CAFE_INFO, JSON.stringify(info));
  },
  getCafeInfo: async (): Promise<CafeInfo | null> => {
    const raw = await getItem(KEYS.CAFE_INFO);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  clearCafeInfo: () => deleteItem(KEYS.CAFE_INFO),

  // Active Waiter
  setActiveWaiter: async (waiter: ActiveWaiter) => {
    await setItem(KEYS.ACTIVE_WAITER, JSON.stringify(waiter));
  },
  getActiveWaiter: async (): Promise<ActiveWaiter | null> => {
    const raw = await getItem(KEYS.ACTIVE_WAITER);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  clearActiveWaiter: () => deleteItem(KEYS.ACTIVE_WAITER),

  // Admin Cloud Token
  setAdminToken: (token: string) => setItem(KEYS.ADMIN_TOKEN, token),
  getAdminToken: () => getItem(KEYS.ADMIN_TOKEN),
  clearAdminToken: () => deleteItem(KEYS.ADMIN_TOKEN),

  // Total Reset
  clearAll: async () => {
    await Promise.all([
      deleteItem(KEYS.DEVICE_TOKEN),
      deleteItem(KEYS.WAITER_TOKEN),
      deleteItem(KEYS.CAFE_INFO),
      deleteItem(KEYS.ACTIVE_WAITER),
      deleteItem(KEYS.ADMIN_TOKEN)
    ]);
  }
};
