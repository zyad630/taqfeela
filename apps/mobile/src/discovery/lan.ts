export interface DiscoveredCashier {
  host: string;
  port: number;
  cafeName: string;
  code?: string;
}

export interface ParsedPairingPayload {
  code: string;
  qrToken?: string;
  cafeName?: string;
  port: number;
  /**
   * Security (Issue 20): Host from QR is NEVER trusted automatically to prevent
   * pairing-hijack MITM attacks via forged QR codes. Pairing must target an
   * mDNS-discovered (_taqfeela._tcp) or explicitly user-confirmed local cashier host.
   */
  hostIgnoredForSecurity: true;
}

export function isPrivateLanHost(host: string): boolean {
  const clean = String(host || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (!clean) return false;
  if (clean === 'localhost' || clean === '127.0.0.1' || clean.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  return false;
}

export function parsePairingPayload(payload: string): ParsedPairingPayload | null {
  try {
    if (!payload || typeof payload !== 'string') return null;
    const trimmed = payload.trim();

    // 1. Official Cashier JSON QR format: {"app":"taqfeela","cafe":"...","code":"123456","qrToken":"...","port":3000}
    // Note: Any "host" field in QR is intentionally ignored to prevent QR-based MITM hijacking.
    if (trimmed.startsWith('{')) {
      const data = JSON.parse(trimmed);
      if (data.app && data.app !== 'taqfeela') return null;
      const code = data.code ? String(data.code).trim() : '';
      const qrToken = data.qrToken ? String(data.qrToken).trim() : undefined;
      const port = Number.isInteger(Number(data.port)) && Number(data.port) > 0 && Number(data.port) <= 65535
        ? Number(data.port)
        : 3000;
      if (qrToken || /^\d{6}$/.test(code)) {
        return {
          code,
          qrToken,
          cafeName: data.cafe ? String(data.cafe).trim() : undefined,
          port,
          hostIgnoredForSecurity: true
        };
      }
      return null;
    }

    // 2. Deep-link format: taqfeela://pair?code=...&qrToken=...&port=...
    // Security (Issue 20): Explicitly ignore any "host" query parameter!
    if (trimmed.startsWith('taqfeela://pair')) {
      const url = new URL(trimmed.replace('taqfeela://pair', 'http://localhost'));
      const port = parseInt(url.searchParams.get('port') || '3000', 10) || 3000;
      const code = (url.searchParams.get('code') || '').trim();
      const qrToken = (url.searchParams.get('qrToken') || '').trim() || undefined;
      const cafeName = (url.searchParams.get('cafe') || '').trim() || undefined;
      if (qrToken || /^\d{6}$/.test(code)) {
        return {
          code,
          qrToken,
          cafeName,
          port,
          hostIgnoredForSecurity: true
        };
      }
      return null;
    }

    // 3. Plain 6-digit numeric code
    if (/^\d{6}$/.test(trimmed)) {
      return {
        code: trimmed,
        port: 3000,
        hostIgnoredForSecurity: true
      };
    }

    return null;
  } catch (e) {
    console.warn('Failed to parse pairing QR payload:', e);
    return null;
  }
}
