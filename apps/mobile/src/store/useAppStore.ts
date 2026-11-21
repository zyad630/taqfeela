import { create } from 'zustand';
import { secureStorage, CafeInfo, ActiveWaiter } from './secureStore';
import { api } from '../api/client';
import { getDb } from '../db/sqlite';
import { outbox } from '../outbox/worker';

export interface CartItem {
  name: string;
  qty: number;
  price: number;
  note?: string;
}

export interface Table {
  id: number;
  tableNumber: string | number;
  hall: string;
  state: 'free' | 'busy' | 'mine' | 'waiting';
  itemCount: number;
  totalPrice: number;
  cartItems: CartItem[];
  sinceMinutes: number;
  meta?: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  categoryId: number;
  hasNote?: boolean;
}

interface AppState {
  initialized: boolean;
  isPaired: boolean;
  cafeInfo: CafeInfo | null;
  activeWaiter: ActiveWaiter | null;
  isOnline: boolean;
  pendingOutboxCount: number;
  selectedHall: string;
  halls: string[];
  tables: Table[];
  categories: Category[];
  products: Product[];
  menuRev: number;
  shiftName: string;
  loadingTables: boolean;

  init: () => Promise<void>;
  setPairing: (cafe: CafeInfo, token: string) => Promise<void>;
  setLogin: (waiter: ActiveWaiter, token: string) => Promise<void>;
  setSelectedHall: (hall: string) => void;
  loadTables: () => Promise<void>;
  loadMenu: () => Promise<void>;
  logoutWaiter: () => Promise<void>;
  unpairDevice: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  isPaired: false,
  cafeInfo: null,
  activeWaiter: null,
  isOnline: true,
  pendingOutboxCount: 0,
  selectedHall: 'الكل',
  halls: ['الكل'],
  tables: [],
  categories: [],
  products: [],
  menuRev: 0,
  shiftName: 'شيفت الصبح',
  loadingTables: false,

  init: async () => {
    try {
      const db = await getDb();
      const cafeInfo = await secureStorage.getCafeInfo();
      const deviceToken = await secureStorage.getDeviceToken();
      const activeWaiter = await secureStorage.getActiveWaiter();

      const isPaired = !!(cafeInfo && deviceToken);

      // Load cached menu
      const cachedMenu = await db.getMenu();
      const categories = cachedMenu ? cachedMenu.categories : [];
      const products = cachedMenu ? cachedMenu.products : [];
      const menuRev = cachedMenu ? cachedMenu.rev : 0;

      // Load cached tables
      const cachedTables = await db.getTables();
      const tables = cachedTables ? cachedTables.tables : [];
      const halls = cachedTables ? cachedTables.halls : ['الكل'];
      const shiftName = cachedTables?.shift?.shiftName || 'شيفت الصبح';

      // Subscribe to outbox updates
      outbox.subscribe((pendingCount) => {
        set({ pendingOutboxCount: pendingCount });
        if (pendingCount === 0) {
          get().loadTables();
        }
      });

      // Subscribe to connection changes
      api.onConnectionChange((online) => {
        set({ isOnline: online });
      });

      // Subscribe to device revocation
      api.onDeviceRevoked(async () => {
        await secureStorage.clearDeviceToken();
        await secureStorage.clearWaiterToken();
        set({ isPaired: false, activeWaiter: null });
      });

      // Subscribe to auth expired (e.g. user deleted from desktop system)
      api.onAuthExpired(async () => {
        await secureStorage.clearWaiterToken();
        await secureStorage.clearActiveWaiter();
        set({ activeWaiter: null });
      });

      set({
        initialized: true,
        isPaired,
        cafeInfo,
        activeWaiter,
        categories,
        products,
        menuRev,
        tables,
        halls,
        shiftName,
        selectedHall: halls[0] || 'الكل'
      });

      // Background fresh fetch if paired
      if (isPaired) {
        get().loadMenu();
        if (activeWaiter) {
          get().loadTables();
        }
      }
    } catch (e) {
      console.warn('App store init error:', e);
      set({ initialized: true });
    }
  },

  setPairing: async (cafe, token) => {
    await secureStorage.setCafeInfo(cafe);
    await secureStorage.setDeviceToken(token);
    api.setCafe(cafe);
    set({ isPaired: true, cafeInfo: cafe });
  },

  setLogin: async (waiter, token) => {
    await secureStorage.setActiveWaiter(waiter);
    await secureStorage.setWaiterToken(token);
    set({ activeWaiter: waiter });
    get().loadTables();
  },

  setSelectedHall: (hall) => {
    set({ selectedHall: hall });
  },

  loadTables: async () => {
    set({ loadingTables: true });
    try {
      const res: any = await api.getTables();
      const db = await getDb();

      const currentWaiter = get().activeWaiter;
      const assignedHalls: string[] = res.assignedHalls || currentWaiter?.assignedHalls || ['ALL'];
      if (
        currentWaiter &&
        res.assignedHalls &&
        JSON.stringify(currentWaiter.assignedHalls) !== JSON.stringify(res.assignedHalls)
      ) {
        const updatedWaiter = { ...currentWaiter, assignedHalls: res.assignedHalls };
        await secureStorage.setActiveWaiter(updatedWaiter);
        set({ activeWaiter: updatedWaiter });
      }

      const allowedHalls = assignedHalls.includes('ALL')
        ? ['الكل', ...(res.halls || [])]
        : (res.halls || []).filter((h: string) => assignedHalls.includes(h));

      // Map server fields to client fields (server returns 'number', client expects 'tableNumber')
      const mappedTables: Table[] = (res.tables || []).map((t: any) => ({
        id: t.id,
        tableNumber: t.tableNumber || t.number || t.name || String(t.id),
        hall: t.hall || 'indoor',
        state: t.state || 'free',
        itemCount: t.itemCount || 0,
        totalPrice: t.totalPrice || 0,
        cartItems: t.cartItems || [],
        sinceMinutes: t.sinceMinutes || 0,
        meta: t.meta
      }));

      // Cache in SQLite
      await db.saveTables(res.shift, allowedHalls, mappedTables);

      const currentSelected = get().selectedHall;
      const nextSelectedHall =
        currentSelected !== 'الكل' && !allowedHalls.includes(currentSelected)
          ? (allowedHalls[0] || 'الكل')
          : currentSelected;

      set({
        tables: mappedTables,
        halls: allowedHalls.length > 0 ? allowedHalls : ['الكل'],
        selectedHall: nextSelectedHall,
        shiftName: res.shift?.shiftName || res.shift?.name || 'الشيفت الحالي',
        loadingTables: false
      });
    } catch (err) {
      // If offline, tables remain from SQLite cache
      set({ loadingTables: false });
    }
  },

  loadMenu: async () => {
    try {
      const currentRev = get().menuRev;
      const res = await api.getMenu(currentRev);

      if (res.unchanged) {
        return; // Cache still fresh
      }

      const db = await getDb();
      await db.saveMenu(res.rev, res.categories, res.products);

      set({
        categories: res.categories,
        products: res.products,
        menuRev: res.rev
      });
    } catch (_) {}
  },

  logoutWaiter: async () => {
    await secureStorage.clearWaiterToken();
    await secureStorage.clearActiveWaiter();
    set({ activeWaiter: null });
  },

  unpairDevice: async () => {
    try {
      await api.unpairDevice();
    } catch (_) {}
    await secureStorage.clearAll();
    try {
      const db = await getDb();
      await db.clear();
    } catch (_) {}
    set({
      isPaired: false,
      cafeInfo: null,
      activeWaiter: null,
      tables: [],
      categories: [],
      products: []
    });
  }
}));
