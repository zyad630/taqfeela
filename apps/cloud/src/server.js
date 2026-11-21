'use strict';

const express = require('express');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');
const defaultDb = require('./db');
const { CloudDatabase } = defaultDb;

// Ephemeral fallback secret for local dev/test ONLY; production MUST set CLOUD_JWT_SECRET
const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(overrideSecret) {
  const secret = overrideSecret || process.env.CLOUD_JWT_SECRET;
  if (secret && String(secret).trim().length >= 16) {
    return String(secret).trim();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CLOUD_JWT_SECRET environment variable (min 16 chars) is required in production');
  }
  return EPHEMERAL_DEV_SECRET;
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload, secret, expiresInSeconds = 8 * 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: nowSec,
    exp: nowSec + expiresInSeconds
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedBody, providedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || nowSec >= payload.exp) {
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
}

function createRateLimiter({ maxRequests, windowMs, errorMessage }) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of buckets.entries()) {
      const valid = times.filter(t => now - t < windowMs);
      if (valid.length === 0) buckets.delete(ip);
      else buckets.set(ip, valid);
    }
  }, Math.min(windowMs, 60 * 1000));
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    const ip = String(req.socket?.remoteAddress || req.ip || 'unknown');
    const now = Date.now();
    const times = (buckets.get(ip) || []).filter(t => now - t < windowMs);
    if (times.length >= maxRequests) {
      return res.status(429).json({ error: errorMessage || 'تم تجاوز الحد المسموح من المحاولات، يرجى الانتظار' });
    }
    times.push(now);
    buckets.set(ip, times);
    next();
  };
}

function buildCloudServer(options = {}) {
  const db = options.db || (options.dbPath ? new CloudDatabase(options.dbPath) : defaultDb);
  const jwtSecret = getJwtSecret(options.jwtSecret);
  const allowedOrigins = options.corsOrigins || (
    process.env.CLOUD_CORS_ORIGINS
      ? process.env.CLOUD_CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
      : []
  );

  const app = express();
  app.set('env', 'production');
  app.disable('x-powered-by');

  // Issue 16: Strict CORS allowlist (never wildcard '*')
  app.use(cors({
    origin: (origin, callback) => {
      // Allow non-browser / server-to-server requests with no Origin header
      if (!origin) return callback(null, false);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  app.use(express.json({ limit: '1mb' }));

  const loginRateLimiter = createRateLimiter({
    maxRequests: options.loginMaxRequests || 5,
    windowMs: options.loginWindowMs || 5 * 60 * 1000,
    errorMessage: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول، يرجى الانتظار 5 دقائق'
  });

  const relayRateLimiter = createRateLimiter({
    maxRequests: options.relayMaxRequests || 120,
    windowMs: options.relayWindowMs || 60 * 1000,
    errorMessage: 'تم تجاوز الحد المسموح لطلبات المزامنة'
  });

  const server = http.createServer(app);

  // 1. Healthcheck
  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 2. Cloud Relay Push Endpoint (Strict Relay Token + Mandatory Integer Monotonic Seq)
  app.post('/relay/push', relayRateLimiter, (req, res) => {
    const { cafeCode, relayToken, type, seq, data, range } = req.body || {};

    if (!cafeCode || typeof cafeCode !== 'string' || !relayToken || typeof relayToken !== 'string') {
      db.logAudit(null, 'UNKNOWN_CASHIER', 'RELAY_AUTH_MISSING', req.ip);
      return res.status(401).json({ error: 'بيانات المصادقة ناقصة أو غير صالحة' });
    }

    const cafe = db.verifyRelayToken(cafeCode, relayToken);
    if (!cafe) {
      db.logAudit(null, 'UNKNOWN_CASHIER', 'RELAY_AUTH_FAILED', req.ip);
      return res.status(401).json({ error: 'رمز الدخول غير صالح' });
    }

    // Issue 13: Mandatory strictly integer non-negative seq (rejects missing, string, float, or negative)
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
      db.logAudit(cafe.id, 'CASHIER_DESKTOP', 'INVALID_SEQ_REJECTED', req.ip);
      return res.status(400).json({ ack: false, error: 'رقم التسلسل (seq) مطلوب ويجب أن يكون رقماً صحيحاً موجباً' });
    }

    // Issue 13 & 14: Persistent monotonic anti-replay check (survives restarts)
    const seqCheck = db.checkAndAdvanceSeq(cafe.id, seq);
    if (!seqCheck.ok) {
      db.logAudit(cafe.id, 'CASHIER_DESKTOP', 'REPLAY_ATTACK_BLOCKED', req.ip);
      return res.status(200).json({ ack: false, reason: 'replayed_seq' });
    }

    if (type === 'snapshot' && data && typeof data === 'object') {
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

    return res.status(400).json({ ack: false, error: 'نوع البيانات غير مدعوم' });
  });

  // 3. Admin REST API - Real bcrypt + Signed JWT Authentication + Strict Tenant Isolation

  app.post('/auth/login', loginRateLimiter, (req, res) => {
    const { email, password } = req.body || {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    const admin = db.verifyAdminLogin(email, password);
    if (!admin) {
      db.logAudit(null, 'ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED', req.ip);
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }

    const expiresInSeconds = 8 * 60 * 60;
    const token = signJwt({ sub: admin.id, email: admin.email }, jwtSecret, expiresInSeconds);
    db.logAudit(null, `ADMIN:${admin.id}`, 'ADMIN_LOGIN_SUCCESS', req.ip);

    return res.json({
      token,
      expiresIn: expiresInSeconds,
      admin: { id: admin.id, email: admin.email }
    });
  });

  // Middleware helper for Admin Authorization per Café (JWT signature + expiry + DB link)
  const verifyAdminAccess = (req, res, cafeId) => {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'غير مصرح - يرجى تسجيل الدخول' });
      return false;
    }
    const token = authHeader.slice(7).trim();
    const payload = verifyJwt(token, jwtSecret);
    if (!payload || !payload.sub) {
      res.status(401).json({ error: 'جلسة الدخول غير صالحة أو منتهية الصلاحية' });
      return false;
    }
    const adminId = Number(payload.sub);
    if (!db.isAdminAuthorizedForCafe(adminId, cafeId)) {
      res.status(403).json({ error: 'غير مصرح لك بالوصول لبيانات هذا الكافيه' });
      return false;
    }
    return true;
  };

  // GET /cafes/:id/home
  app.get('/cafes/:id/home', (req, res) => {
    const cafeId = Number(req.params.id);
    if (!Number.isInteger(cafeId) || cafeId <= 0) {
      return res.status(400).json({ error: 'معرف الكافيه غير صالح' });
    }
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
    if (!Number.isInteger(cafeId) || cafeId <= 0) {
      return res.status(400).json({ error: 'معرف الكافيه غير صالح' });
    }
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
    if (!Number.isInteger(cafeId) || cafeId <= 0) {
      return res.status(400).json({ error: 'معرف الكافيه غير صالح' });
    }
    if (!verifyAdminAccess(req, res, cafeId)) return;

    const invoices = db.getInvoices(cafeId);
    return res.json({ invoices });
  });

  // 404 handler (JSON only, no HTML leak)
  app.use((req, res) => {
    res.status(404).json({ error: 'المسار غير موجود' });
  });

  // Issue 16: Centralized error handler — NEVER leaks stack traces or disk paths
  app.use((err, req, res, _next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({ error: 'تنسيق البيانات (JSON) غير صالح' });
    }
    console.error('[Cloud Server] Unhandled error:', err?.message || 'Internal error');
    return res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
  });

  return { app, server, db, signJwt: (p, exp) => signJwt(p, jwtSecret, exp) };
}

module.exports = { buildCloudServer, db: defaultDb, CloudDatabase, signJwt, verifyJwt };

if (require.main === module) {
  const port = process.env.PORT || 4000;
  const { server } = buildCloudServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Taqfeela Cloud Server running on http://0.0.0.0:${port}`);
  });
}
