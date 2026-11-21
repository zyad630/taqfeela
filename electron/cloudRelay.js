let WebSocket = null;
try { WebSocket = require('ws'); } catch (_) {}
let electronApp = null;
try { electronApp = require('electron').app; } catch (_) {}

class CloudRelayClient {
  constructor(db, options = {}) {
    this.db = db;
    this.cloudUrl = options.cloudUrl || process.env.TAQFEELA_CLOUD_URL || '';
    this.cafeCode = options.cafeCode || process.env.TAQFEELA_CAFE_CODE || '';
    this.relayToken = options.relayToken || process.env.TAQFEELA_RELAY_TOKEN || '';
    this.ws = null;
    this.connected = false;
    this.seq = 1;
    this.reconnectTimer = null;
    this.snapshotTimer = null;
  }

  isConfigured() {
    if (!WebSocket) return false;
    if (!this.cloudUrl || !this.cafeCode || !this.relayToken) return false;
    const isPackaged = Boolean(electronApp && electronApp.isPackaged);
    // In production builds, require encrypted TLS WebSocket (wss://)
    if (isPackaged && !/^wss:\/\//i.test(this.cloudUrl)) {
      console.warn('[CloudRelay] Refusing insecure ws:// URL in packaged production build. Use wss://');
      return false;
    }
    return true;
  }

  start() {
    if (!this.isConfigured()) {
      return;
    }
    this.connect();
    // Schedule periodic snapshot every 60 seconds
    this.snapshotTimer = setInterval(() => {
      this.pushSnapshot();
    }, 60000);
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    this.connected = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.cloudUrl);

      this.ws.on('open', () => {
        // Step 1: Authenticate Handshake
        this.send({
          type: 'auth',
          cafeCode: this.cafeCode,
          relayToken: this.relayToken
        });
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth_ok') {
            this.connected = true;
            // Push immediate snapshot upon connecting
            this.pushSnapshot();
          }
        } catch (_) {}
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        this.connected = false;
      });
    } catch (_) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // Exponential jitter between 3s and 10s
    const delay = 3000 + Math.floor(Math.random() * 7000);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Pushes latest sales snapshot to Cloud
   */
  pushSnapshot() {
    if (!this.connected) return;

    try {
      const shift = this.db.getCurrentShift ? this.db.getCurrentShift() : null;
      const sales = this.db.getShiftSales ? this.db.getShiftSales(shift?.id) : { total: 0, cash: 0, card: 0, wallet: 0, count: 0 };

      const snapshotData = {
        sales: String(sales.total || 0),
        invoicesCount: String(sales.count || 0),
        openShift: shift ? {
          user: shift.user_name || 'الكاشير',
          since: shift.opened_at ? new Date(shift.opened_at).toLocaleTimeString('ar-EG') : 'منذ بداية الشيفت'
        } : null,
        paymentSplit: [
          { name: 'كاش', amount: String(sales.cash || 0), color: '#EE7F14' },
          { name: 'كارت', amount: String(sales.card || 0), color: '#5A3A28' },
          { name: 'محفظة', amount: String(sales.wallet || 0), color: '#D9B38A' }
        ]
      };

      this.send({
        type: 'snapshot',
        seq: this.seq++,
        data: snapshotData
      });
    } catch (err) {
      console.warn('[CloudRelay] Failed to push snapshot:', err.message);
    }
  }
}

module.exports = CloudRelayClient;
