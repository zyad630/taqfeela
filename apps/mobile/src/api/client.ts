import { secureStorage, CafeInfo } from '../store/secureStore';

export interface ApiError {
  status: number;
  code?: string;
  message: string;
}

export class MobileApiClient {
  private static instance: MobileApiClient;
  private currentCafe: CafeInfo | null = null;
  private isOnline: boolean = true;
  private listeners: Set<(online: boolean) => void> = new Set();
  private revocationListeners: Set<() => void> = new Set();
  private authErrorListeners: Set<() => void> = new Set();

  private constructor() {}

  public static getInstance(): MobileApiClient {
    if (!MobileApiClient.instance) {
      MobileApiClient.instance = new MobileApiClient();
    }
    return MobileApiClient.instance;
  }

  public onConnectionChange(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onDeviceRevoked(listener: () => void): () => void {
    this.revocationListeners.add(listener);
    return () => this.revocationListeners.delete(listener);
  }

  public onAuthExpired(listener: () => void): () => void {
    this.authErrorListeners.add(listener);
    return () => this.authErrorListeners.delete(listener);
  }

  private setOnlineState(online: boolean) {
    if (this.isOnline !== online) {
      this.isOnline = online;
      this.listeners.forEach(fn => fn(online));
    }
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public async getBaseUrl(): Promise<string> {
    if (!this.currentCafe) {
      this.currentCafe = await secureStorage.getCafeInfo();
    }
    if (!this.currentCafe) {
      throw new Error('لم يتم ربط التطبيق بكاشير بعد');
    }
    const rawHost = (this.currentCafe.host || '127.0.0.1').trim().replace(/\/+$/, '');
    const port = this.currentCafe.port || 3000;
    if (rawHost.startsWith('http://') || rawHost.startsWith('https://')) {
      return rawHost.endsWith('/m/v1') ? rawHost : `${rawHost}/m/v1`;
    }
    if (
      rawHost.includes('.trycloudflare.com') ||
      rawHost.includes('.ngrok') ||
      rawHost.includes('.loca.lt') ||
      (/[a-zA-Z]/.test(rawHost) && !rawHost.startsWith('localhost'))
    ) {
      return `https://${rawHost}/m/v1`;
    }
    return `http://${rawHost}:${port}/m/v1`;
  }

  public setCafe(cafe: CafeInfo) {
    this.currentCafe = cafe;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    requiresAuth = true
  ): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (requiresAuth) {
      const deviceToken = await secureStorage.getDeviceToken();
      if (deviceToken) {
        headers['Authorization'] = `Bearer ${deviceToken}`;
      }
      const waiterToken = await secureStorage.getWaiterToken();
      if (waiterToken) {
        headers['X-Waiter-Token'] = waiterToken;
      }
      const activeWaiter = await secureStorage.getActiveWaiter();
      if (activeWaiter && activeWaiter.id) {
        headers['X-Waiter-Id'] = String(activeWaiter.id);
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      this.setOnlineState(true);

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        try { data = JSON.parse(text); } catch { data = { text }; }
      }

      if (!res.ok) {
        // Check for device revocation
        if (res.status === 401 && data?.code === 'DEVICE_REVOKED') {
          this.revocationListeners.forEach(fn => fn());
        }
        // Check for waiter removed, password changed, or token invalid
        if (
          res.status === 401 &&
          (data?.code === 'WAITER_REMOVED' ||
            data?.code === 'WAITER_AUTH_CHANGED' ||
            data?.code === 'INVALID_WAITER')
        ) {
          this.authErrorListeners.forEach(fn => fn());
        }
        const error: ApiError = {
          status: res.status,
          code: data?.code || data?.error,
          message: data?.message || data?.error || `خطأ في الخادم (${res.status})`
        };
        throw error;
      }

      return data as T;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('Network request failed') || err.message?.includes('Failed to fetch')) {
        this.setOnlineState(false);
        const netErr: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'مفيش اتصال بالكاشير'
        };
        throw netErr;
      }
      throw err;
    }
  }

  // --- API Methods ---

  public async pair(payload: { code: string; deviceName: string; platform: string; host?: string; port?: number }): Promise<any> {
    if (payload.host && payload.port) {
      this.currentCafe = {
        name: 'كافيه التكية',
        host: payload.host,
        port: payload.port
      };
    }
    const res = await this.request<any>('/pair', {
      method: 'POST',
      body: JSON.stringify({
        code: payload.code,
        deviceName: payload.deviceName,
        platform: payload.platform
      })
    }, false);

    if (res.deviceToken && this.currentCafe) {
      await secureStorage.setDeviceToken(res.deviceToken);
      await secureStorage.setCafeInfo({
        ...this.currentCafe,
        name: res.cafe?.name || this.currentCafe.name,
        code: res.cafe?.code
      });
    }

    return res;
  }

  public async getUsers(): Promise<{ users: any[] }> {
    return await this.request<{ users: any[] }>('/users', { method: 'GET' });
  }

  public async login(userId: number, pin: string): Promise<any> {
    const res = await this.request<any>('/login', {
      method: 'POST',
      body: JSON.stringify({ userId, pin })
    });

    if (res.token && res.waiter) {
      await secureStorage.setWaiterToken(res.token);
      await secureStorage.setActiveWaiter(res.waiter);
    }
    return res;
  }

  public async loginByUsername(username: string, password: string): Promise<any> {
    const res = await this.request<any>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (res.token && (res.waiter || res.user)) {
      const waiter = res.waiter || res.user;
      await secureStorage.setWaiterToken(res.token);
      await secureStorage.setActiveWaiter(waiter);
    }
    return res;
  }

  public async getMenu(rev?: number): Promise<{ rev: number; unchanged?: boolean; categories: any[]; products: any[] }> {
    const query = typeof rev === 'number' ? `?rev=${rev}` : '';
    return await this.request<any>(`/menu${query}`, { method: 'GET' });
  }

  public async getTables(): Promise<{ shift: any; halls: string[]; tables: any[] }> {
    return await this.request<any>('/tables', { method: 'GET' });
  }

  public async sendOrder(order: {
    clientOrderId: string;
    tableId: number;
    items: Array<{ productId: number; qty: number; note?: string }>;
    waiterId?: number;
    waiterName?: string;
  }): Promise<any> {
    return await this.request<any>('/orders', {
      method: 'POST',
      body: JSON.stringify(order)
    });
  }

  public async getMyOrders(): Promise<{ orders: any[] }> {
    return await this.request<any>('/orders?mine=1', { method: 'GET' });
  }

  public async getAdminDashboard(): Promise<any> {
    return await this.request<any>('/admin/dashboard', { method: 'GET' });
  }

  public async unpairDevice(): Promise<void> {
    try {
      await this.request<any>('/device/unpair', { method: 'POST' });
    } catch (_) {
      // Even if network fails or offline, local cleanup will continue
    }
  }
}

export const api = MobileApiClient.getInstance();
