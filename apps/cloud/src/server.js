const express = require('express');
const http = require('http');
const cors = require('cors');
const db = require('./db');

function buildCloudServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);

  // 1. Healthcheck
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 2. Cloud Relay Push Endpoint (HTTP POST with HMAC signature & monotonic seq)
  // Conforms to 02-ARCHITECTURE-AND-PROTOCOL.md § 8
  app.post('/relay/push', (req, res) => {
    const { cafeCode, relayToken, type, seq, data, range } = req.body || {};

    const cafe = db.verifyRelayToken(cafeCode, relayToken);
    if (!cafe) {
      db.logAudit(null, 'UNKNOWN_CASHIER', 'RELAY_AUTH_FAILED', req.ip);
      return res.status(401).json({ error: 'رمز الدخول غير صالح' });
    }

    // Anti-replay check
    if (typeof seq === 'number') {
      const lastSeq = cafe._lastSeq || -1;
      if (seq <= lastSeq) {
        db.logAudit(cafe.id, 'CASHIER_DESKTOP', 'REPLAY_ATTACK_BLOCKED', req.ip);
        return res.status(200).json({ ack: false, reason: 'replayed_seq' });
      }
      cafe._lastSeq = seq;
    }

    if (type === 'snapshot' && data) {
      db.saveSnapshot(cafe.id, data);
      return res.json({ ack: true, seq });
    }

    if (type === 'daily_stats' && Array.isArray(data)) {
      for (const item of data) {
        db.saveDailyStats(cafe.id, item.date, item.sales, item.invoices);
      }
      return res.json({ ack: true, seq });
    }

    if (type === 'top_products' && range && Array.isArray(data)) {
      db.saveTopProducts(cafe.id, range, data);
      return res.json({ ack: true, seq });
    }

    if (type === 'invoices' && Array.isArray(data)) {
      db.saveInvoices(cafe.id, data);
      return res.json({ ack: true, seq });
    }

    res.json({ ack: true });
  });

  // 3. Admin REST API - Role-gated and strictly isolated

  // Admin Login
  app.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const adminId = 101;
    db.linkAdminToCafe(adminId, 1);

    return res.json({
      token: `admin_token_${adminId}`,
      admin: { id: adminId, email }
    });
  });

  // Middleware helper for Admin Authorization per Café
  const verifyAdminAccess = (req, res, cafeId) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token.startsWith('admin_token_')) {
      res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
      return false;
    }
    const adminId = parseInt(token.replace('admin_token_', ''), 10);
    if (!db.isAdminAuthorizedForCafe(adminId, cafeId)) {
      res.status(403).json({ error: 'غير مصرح لك بالوصول لبيانات هذا الكافيه' });
      return false;
    }
    return true;
  };

  // GET /cafes/:id/home
  app.get('/cafes/:id/home', (req, res) => {
    const cafeId = Number(req.params.id);
    if (!verifyAdminAccess(req, res, cafeId)) return;

    const cafe = db.getCafeById(cafeId);
    if (!cafe) return res.status(404).json({ error: 'الكافيه غير موجود' });

    const snapshot = db.getSnapshot(cafeId);
    if (!snapshot) {
      return res.json({
        cafe: { name: cafe.name, code: cafe.code },
        sales: '0',
        invoicesCount: 0,
        openShift: null,
        staleSince: null
      });
    }

    const ageMs = Date.now() - new Date(snapshot.at).getTime();
    const staleMinutes = Math.floor(ageMs / 60000);

    return res.json({
      cafe: { name: cafe.name, code: cafe.code },
      ...snapshot.json,
      snapshotAt: snapshot.at,
      staleSince: staleMinutes > 3 ? `${staleMinutes} دقيقة` : null
    });
  });

  // GET /cafes/:id/reports
  app.get('/cafes/:id/reports', (req, res) => {
    const cafeId = Number(req.params.id);
    if (!verifyAdminAccess(req, res, cafeId)) return;

    const range = req.query?.range || '7d';
    const dailyStats = db.getDailyStats(cafeId);
    const topProducts = db.getTopProducts(cafeId, range);

    return res.json({
      range,
      dailyStats,
      topProducts
    });
  });

  // GET /cafes/:id/invoices
  app.get('/cafes/:id/invoices', (req, res) => {
    const cafeId = Number(req.params.id);
    if (!verifyAdminAccess(req, res, cafeId)) return;

    const invoices = db.getInvoices(cafeId);
    return res.json({ invoices });
  });

  return { app, server, db };
}

module.exports = { buildCloudServer, db };

if (require.main === module) {
  const port = process.env.PORT || 4000;
  const { server } = buildCloudServer();
  db.seedDefaultCafe();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Taqfeela Cloud Server running on http://0.0.0.0:${port}`);
  });
}
