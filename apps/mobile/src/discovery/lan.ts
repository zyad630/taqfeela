export interface DiscoveredCashier {
  host: string;
  port: number;
  cafeName: string;
  code?: string;
}

export function parsePairingPayload(payload: string): { host: string; port: number; code: string } | null {
  try {
    if (!payload) return null;
    
    // Check if URL format: taqfeela://pair?host=...&port=...&code=...
    if (payload.startsWith('taqfeela://pair')) {
      const url = new URL(payload.replace('taqfeela://pair', 'http://localhost'));
      const host = url.searchParams.get('host') || '127.0.0.1';
      const port = parseInt(url.searchParams.get('port') || '3000', 10);
      const code = url.searchParams.get('code') || '';
      if (code) {
        return { host, port, code };
      }
    }

    // Check if JSON format: {"host":"...","port":3000,"code":"123456"}
    if (payload.trim().startsWith('{')) {
      const data = JSON.parse(payload);
      if (data.code) {
        return {
          host: data.host || '127.0.0.1',
          port: data.port || 3000,
          code: String(data.code)
        };
      }
    }

    // Check if plain 6-digit code
    if (/^\d{6}$/.test(payload.trim())) {
      return {
        host: '127.0.0.1',
        port: 3000,
        code: payload.trim()
      };
    }

    return null;
  } catch (e) {
    console.warn('Failed to parse pairing QR payload:', e);
    return null;
  }
}
