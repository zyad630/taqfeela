/**
 * electron/mobileApi.js
 * 
 * Taqfeela Mobile Hub API (/m/v1)
 * High-performance, secure local LAN backend for Waiter and Admin Mobile Apps.
 * 
 * Features:
 * - One-time 6-digit & QR Code Pairing with 10-minute expiry and 5-attempt rate-limiting.
 * - Device Token authentication (SHA-256 hashed in database).
 * - Fast Waiter PIN authentication with rate-limiting and lockout.
 * - Real-time Waiter Hall Restrictions (assigned_halls filter & security guard).
 * - Cached menu delivery with incremental menuRev tracking.
 * - Idempotent order creation with clientOrderId deduplication.
 * - Direct Auto-Append to table carts with cashier notification and bar printer trigger.
 * - Real-time Server-Sent Events (SSE) stream for live table updates.
 */

'use strict';

const crypto = require('crypto');
const os = require('os');

// Shared active pairing codes across all module instances and esbuild bundles
if (!global.__taqfeela_active_pairing_codes) {
  global.__taqfeela_active_pairing_codes = new Map();
}
const activePairingCodes = global.__taqfeela_active_pairing_codes;

if (!global.__taqfeela_sse_clients) {
  global.__taqfeela_sse_clients = new Set();
}
const SSE_CLIENTS = global.__taqfeela_sse_clients;
const LOGIN_RATE_LIMITS = new Map(); // userId/username -> { attempts, lockedUntil }
const PAIR_IP_RATE_LIMITS = new Map(); // clientIp -> [timestamps]
const PAIR_IP_MAX_ATTEMPTS = 10;
const PAIR_IP_WINDOW_MS = 60 * 1000;

function checkPairIpRateLimit(clientIp) {
  const ip = String(clientIp || 'unknown');
  const now = Date.now();
  if (PAIR_IP_RATE_LIMITS.size > 1000) {
    for (const [k, arr] of PAIR_IP_RATE_LIMITS.entries()) {
      const valid = arr.filter(t => now - t < PAIR_IP_WINDOW_MS);
      if (valid.length === 0) PAIR_IP_RATE_LIMITS.delete(k);
      else PAIR_IP_RATE_LIMITS.set(k, valid);
    }
  }
  const times = (PAIR_IP_RATE_LIMITS.get(ip) || []).filter(t => now - t < PAIR_IP_WINDOW_MS);
  if (times.length >= PAIR_IP_MAX_ATTEMPTS) {
    return false;
  }
  times.push(now);
  PAIR_IP_RATE_LIMITS.set(ip, times);
  return true;
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const addr = iface.address;
        if (addr.startsWith('169.254.')) continue;
        let priority = 10;
        const lowerName = name.toLowerCase();
        if (lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wireless') || lowerName.includes('wlan')) {
          priority = 100;
        } else if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('lan')) {
          priority = 80;
        } else if (lowerName.includes('tailscale') || lowerName.includes('vethernet') || lowerName.includes('virtual')) {
          priority = 1;
        }
        if (addr.startsWith('192.168.1.') || addr.startsWith('192.168.0.')) {
          priority += 30;
        } else if (addr.startsWith('192.168.')) {
          priority += 20;
        }
        candidates.push({ address: addr, priority });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].address;
  }
  return '127.0.0.1';
}

function cleanExpiredPairingCodes() {
  const now = Date.now();
  for (const [code, entry] of activePairingCodes.entries()) {
    if (now > entry.expiresAt || entry.attempts >= 5) {
      activePairingCodes.delete(code);
    }
  }
}

/**
 * Generate a new 6-digit + QR pairing session (valid for 10 minutes)
 */
function createPairingSession(cafeName = 'تقفيلة كافيه', port = 3000) {
  cleanExpiredPairingCodes();

  // Generate 6-digit numeric code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const qrToken = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + (10 * 60 * 1000); // 10 minutes

  const session = {
    code,
    qrToken,
    createdAt: now,
    expiresAt,
    attempts: 0
  };

  activePairingCodes.set(code, session);
  activePairingCodes.set(qrToken, session);

  const localIp = getLocalIp();
  const qrPayload = JSON.stringify({
    app: 'taqfeela',
    cafe: cafeName,
    code,
    qrToken,
    host: localIp,
    port,
    v: 1
  });

  return {
    code,
    qrToken,
    qrPayload,
    expiresAt,
    expiresInMinutes: 10,
    localIp,
    port
  };
}

/**
 * Broadcast SSE event to all connected waiter mobile phones
 */
function broadcastSseEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of SSE_CLIENTS) {
    try {
      client.res.write(payload);
    } catch (_) {
      SSE_CLIENTS.delete(client);
    }
  }
}

function notifyDeviceRevoked(tokenHash) {
  broadcastSseEvent('revoked', { tokenHash });
}

function getUserAuthSignature(u) {
  if (!u) return '';
  return crypto
    .createHash('sha256')
    .update(`${u.id}:${u.username || ''}:${u.password || ''}:${u.pin || ''}:${u.role || ''}`)
    .digest('hex')
    .slice(0, 16);
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function nextIsoDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function createRouter(options = {}) {
  const { db, getMainWindow } = options;
  const express = require('express');
  const router = express.Router();

  // Helper to notify desktop window
  function notifyDesktop(channel, payload) {
    try {
      const win = typeof getMainWindow === 'function' ? getMainWindow() : null;
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send(channel, payload);
      }
    } catch (e) {
      console.warn('[Mobile API] Desktop notification error:', e.message);
    }
  }

  // -------------------------------------------------------------
  // Middleware: Device Authentication (Bearer <deviceToken>)
  // -------------------------------------------------------------
  function requireDeviceAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        error: 'يجب توفير توكن ربط الجهاز (Authorization: Bearer <token>)',
        code: 'MISSING_TOKEN'
      });
    }

    const deviceToken = authHeader.slice(7).trim();
    if (!deviceToken) {
      return res.status(401).json({
        ok: false,
        error: 'توكن الجهاز فارغ',
        code: 'EMPTY_TOKEN'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    const device = db.queryGet(
      'SELECT id, device_name, platform, status FROM paired_devices WHERE device_token_hash = ?',
      [tokenHash]
    );

    if (!device || device.status !== 'active') {
      return res.status(401).json({
        ok: false,
        error: 'الجهاز ده اتفصل أو غير مصرح له، اطلب من الكاشير ربط جديد',
        code: 'DEVICE_REVOKED'
      });
    }

    // Update last_seen_at
    try {
      db.runSql(
        'UPDATE paired_devices SET last_seen_at = datetime("now") WHERE id = ?',
        [device.id],
        { skipSave: true }
      );
    } catch (_) { }

    req.pairedDevice = device;
    req.deviceTokenHash = tokenHash;

    // Validate waiter/user session strictly via signed X-Waiter-Token (<userId>.<sig>.<nonce>)
    const waiterIdHeader = req.headers['x-waiter-id'];
    const waiterPassHeader = String(req.headers['x-waiter-token'] || '').trim();
    if ((waiterPassHeader || waiterIdHeader) && req.path !== '/login' && req.path !== '/pair' && req.path !== '/health') {
      if (!waiterPassHeader || !waiterPassHeader.includes('.')) {
        return res.status(401).json({
          ok: false,
          error: 'توكن الجلسة مفقود أو غير صالح، يرجى تسجيل الدخول مجدداً',
          code: 'INVALID_USER_TOKEN'
        });
      }
      const parts = waiterPassHeader.split('.');
      const tokenUserId = Number(parts[0]);
      const tokenSig = parts[1] || '';
      if (!Number.isInteger(tokenUserId) || tokenUserId <= 0 || !tokenSig) {
        return res.status(401).json({
          ok: false,
          error: 'توكن الجلسة غير صالح، يرجى تسجيل الدخول مجدداً',
          code: 'INVALID_USER_TOKEN'
        });
      }
      if (waiterIdHeader && Number(waiterIdHeader) !== tokenUserId) {
        return res.status(401).json({
          ok: false,
          error: 'تعارض في هوية المستخدم، يرجى تسجيل الدخول مجدداً',
          code: 'USER_ID_MISMATCH'
        });
      }
      try {
        let u = null;
        try {
          u = db.queryGet('SELECT id, name, username, password, pin, role, COALESCE(assigned_halls, \'ALL\') AS assigned_halls FROM users WHERE id = ?', [tokenUserId]);
        } catch (_) {
          u = db.queryGet('SELECT id, name, username, password, role FROM users WHERE id = ?', [tokenUserId]);
        }
        if (!u) {
          return res.status(401).json({
            ok: false,
            error: 'تم حذف هذا الحساب من السيستم، يرجى تسجيل الدخول مجدداً',
            code: 'WAITER_REMOVED'
          });
        }
        const currentSig = getUserAuthSignature(u);
        if (!currentSig || !timingSafeEqualStr(tokenSig, currentSig)) {
          return res.status(401).json({
            ok: false,
            error: 'تم تعديل كلمة السر أو صلاحية الحساب في الكاشير، يرجى تسجيل الدخول مجدداً',
            code: 'WAITER_AUTH_CHANGED'
          });
        }
        req.currentUser = u;
      } catch (_) {
        return res.status(401).json({
          ok: false,
          error: 'تعذر التحقق من جلسة المستخدم',
          code: 'USER_VERIFY_ERROR'
        });
      }
    }

    next();
  }

  // Middleware: Require authenticated user session (valid X-Waiter-Token)
  function requireUserAuth(req, res, next) {
    if (!req.currentUser || !req.currentUser.id) {
      return res.status(401).json({
        ok: false,
        error: 'يجب تسجيل الدخول بحساب موظف صالح أولاً',
        code: 'USER_AUTH_REQUIRED'
      });
    }
    next();
  }

  // Middleware: Require Admin role for sensitive dashboard & financial reports
  function requireAdminAuth(req, res, next) {
    if (!req.currentUser || !req.currentUser.id) {
      return res.status(401).json({
        ok: false,
        error: 'يجب تسجيل الدخول كمدير (Admin) أولاً',
        code: 'USER_AUTH_REQUIRED'
      });
    }
    if (String(req.currentUser.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({
        ok: false,
        error: 'غير مصرح: هذه البيانات متاحة للمدير العام (Admin) فقط',
        code: 'ADMIN_REQUIRED'
      });
    }
    next();
  }

  // -------------------------------------------------------------
  // Route 1: Health & Discovery Ping
  // -------------------------------------------------------------
  router.get('/health', (req, res) => {
    const settings = db.getSettings ? db.getSettings() : {};
    res.json({
      ok: true,
      service: 'taqfeela-mobile-hub',
      version: '1.0.2',
      cafe: settings.cafe_name || 'تقفيلة كافيه',
      ip: getLocalIp(),
      time: new Date().toISOString()
    });
  });

  // -------------------------------------------------------------
  // Route 2: Device Pairing (POST /m/v1/pair)
  // -------------------------------------------------------------
  router.post('/pair', (req, res) => {
    cleanExpiredPairingCodes();
    const clientIp = req.socket?.remoteAddress || req.ip || 'unknown';
    if (!checkPairIpRateLimit(clientIp)) {
      return res.status(429).json({
        ok: false,
        error: 'تم تجاوز الحد المسموح لمحاولات الاقتران. انتظر دقيقة وأعد المحاولة',
        code: 'PAIR_RATE_LIMITED'
      });
    }

    const { code, qrToken, deviceName = 'موبايل ويتر', platform = 'android' } = req.body || {};

    const cleanCode = code != null ? String(code).trim() : '';
    const cleanToken = qrToken != null ? String(qrToken).trim() : '';
    const lookupKey = cleanToken || cleanCode;
    if (!lookupKey) {
      return res.status(400).json({
        ok: false,
        error: 'كود الاقتران أو رمز QR مطلوب',
        code: 'MISSING_CODE'
      });
    }

    const session = activePairingCodes.get(lookupKey) || (cleanCode ? activePairingCodes.get(cleanCode) : null);
    if (!session) {
      // Count failed guesses against active pairing sessions so brute-force exhausts session attempts too
      const seenSessions = new Set();
      for (const s of activePairingCodes.values()) {
        if (!seenSessions.has(s)) {
          seenSessions.add(s);
          s.attempts = (s.attempts || 0) + 1;
          if (s.attempts >= 5) {
            activePairingCodes.delete(s.code);
            activePairingCodes.delete(s.qrToken);
          }
        }
      }
      return res.status(400).json({
        ok: false,
        error: 'كود الاقتران غير صحيح أو انتهت صلاحيته',
        code: 'INVALID_CODE'
      });
    }

    session.attempts = (session.attempts || 0) + 1;
    if (Date.now() > session.expiresAt) {
      activePairingCodes.delete(session.code);
      activePairingCodes.delete(session.qrToken);
      return res.status(400).json({
        ok: false,
        error: 'انتهت مهلة كود الاقتران (10 دقائق)، اطلب كوداً جديداً من الكاشير',
        code: 'EXPIRED_CODE'
      });
    }

    if (session.attempts > 5) {
      activePairingCodes.delete(session.code);
      activePairingCodes.delete(session.qrToken);
      return res.status(400).json({
        ok: false,
        error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة (5 محاولات)',
        code: 'MAX_ATTEMPTS'
      });
    }

    // Successfully paired! Consume the one-time code immediately
    activePairingCodes.delete(session.code);
    activePairingCodes.delete(session.qrToken);

    // Generate permanent high-entropy device token
    const deviceToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    const nowIso = new Date().toISOString();

    db.runSql(`
      INSERT INTO paired_devices (device_token_hash, device_name, platform, paired_at, last_seen_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `, [tokenHash, String(deviceName).slice(0, 50), String(platform).slice(0, 20), nowIso, nowIso]);

    const settings = db.getSettings ? db.getSettings() : {};
    const cafeName = settings.cafe_name || 'تقفيلة كافيه';
    const menuRev = Number(settings.menu_rev) || 1;

    notifyDesktop('mobile-device-paired', {
      deviceName,
      platform,
      pairedAt: nowIso
    });

    res.json({
      ok: true,
      deviceToken,
      cafe: {
        name: cafeName,
        code: settings.cafe_code || 'TKEE-7X2P'
      },
      menuRev
    });
  });

  // -------------------------------------------------------------
  // Route 2.1: Unpair Device (POST /m/v1/device/unpair)
  // -------------------------------------------------------------
  router.post('/device/unpair', requireDeviceAuth, (req, res) => {
    try {
      const dev = req.pairedDevice || req.device;
      if (dev && dev.id) {
        db.revokePairedDevice(dev.id);
        notifyDesktop('mobile-device-revoked', { deviceId: dev.id });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[Mobile API] /device/unpair error:', err);
      res.status(500).json({ ok: false, error: err.message || 'خطأ داخلي' });
    }
  });

  // -------------------------------------------------------------
  // Route 3: Waiters & Users List (GET /m/v1/users)
  // -------------------------------------------------------------
  router.get('/users', requireDeviceAuth, (req, res) => {
    try {
      let allUsers = [];
      try {
        allUsers = db.queryAll(`
          SELECT id, name, username, role, COALESCE(assigned_halls, 'ALL') AS assigned_halls
          FROM users
          WHERE role IN ('waiter', 'cashier', 'admin')
          ORDER BY id ASC
        `);
      } catch (colErr) {
        allUsers = db.queryAll(`
          SELECT id, name, username, role
          FROM users
          WHERE role IN ('waiter', 'cashier', 'admin')
          ORDER BY id ASC
        `);
      }

      const formatted = (allUsers || []).map(u => {
        let halls = ['ALL'];
        if (u.assigned_halls) {
          try {
            halls = u.assigned_halls === 'ALL' ? ['ALL'] : JSON.parse(u.assigned_halls);
          } catch (_) {
            halls = [u.assigned_halls];
          }
        }
        return {
          id: u.id,
          name: u.name,
          username: u.username,
          role: u.role,
          assignedHalls: halls
        };
      });

      res.json({ ok: true, users: formatted });
    } catch (err) {
      console.error('[Mobile API] /users error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Route 4: Waiter PIN Login (POST /m/v1/login)
  // -------------------------------------------------------------
  router.post('/login', requireDeviceAuth, (req, res) => {
    try {
      const { userId, pin, username, password } = req.body || {};

      // Support both login methods:
      // 1. Legacy: userId + pin
      // 2. New: username + password
      const isUsernameLogin = !!(username && password !== undefined && password !== null);
      const isLegacyLogin = !!(userId && (pin !== undefined && pin !== null));

      if (!isUsernameLogin && !isLegacyLogin) {
        return res.status(400).json({ ok: false, error: 'اسم المستخدم وكلمة السر مطلوبان' });
      }

      // Rate limiting key
      const rateKey = isUsernameLogin ? `user-name-${username}` : `user-${userId}`;
      const now = Date.now();
      const rateInfo = LOGIN_RATE_LIMITS.get(rateKey) || { attempts: 0, lockedUntil: 0 };

      if (now < rateInfo.lockedUntil) {
        const waitSec = Math.ceil((rateInfo.lockedUntil - now) / 1000);
        return res.status(429).json({
          ok: false,
          error: `تم تجاوز الحد المسموح من المحاولات. انتظر ${waitSec} ثانية وأعد المحاولة`,
          code: 'PIN_LOCKED',
          waitSec
        });
      }

      let user = null;
      try {
        if (isUsernameLogin) {
          user = db.queryGet(`
            SELECT id, name, username, role, password, pin, COALESCE(assigned_halls, 'ALL') AS assigned_halls
            FROM users WHERE LOWER(username) = LOWER(?)
          `, [username.trim()]);
        } else {
          user = db.queryGet(`
            SELECT id, name, username, role, password, pin, COALESCE(assigned_halls, 'ALL') AS assigned_halls
            FROM users WHERE id = ?
          `, [userId]);
        }
      } catch (_) {
        try {
          if (isUsernameLogin) {
            user = db.queryGet(`
              SELECT id, name, username, role, password
              FROM users WHERE LOWER(username) = LOWER(?)
            `, [username.trim()]);
          } else {
            user = db.queryGet(`
              SELECT id, name, username, role, password
              FROM users WHERE id = ?
            `, [userId]);
          }
        } catch (_) { }
      }

      // Prevent unbounded growth of rate-limit map
      if (LOGIN_RATE_LIMITS.size > 500) {
        for (const [k, v] of LOGIN_RATE_LIMITS.entries()) {
          if (v.lockedUntil && now >= v.lockedUntil) LOGIN_RATE_LIMITS.delete(k);
        }
      }

      const credential = isUsernameLogin ? String(password).trim() : String(pin).trim();
      let isMatch = false;
      let matchedLegacyPlaintextPin = false;
      let matchedLegacyPlaintextPassword = false;
      const bcrypt = require('bcryptjs');

      if (user) {
        // 1. Check explicit PIN if configured on user (supports bcrypt + auto-migrates legacy plaintext PIN)
        if (user.pin && String(user.pin).trim() !== '') {
          const storedPin = String(user.pin).trim();
          if (/^\$2[aby]\$/.test(storedPin)) {
            try { isMatch = bcrypt.compareSync(credential, storedPin); } catch (_) { isMatch = false; }
          } else {
            isMatch = timingSafeEqualStr(storedPin, credential);
            if (isMatch) matchedLegacyPlaintextPin = true;
          }
        }

        // 2. Check against user password (bcrypt + auto-migrates legacy plaintext password)
        if (!isMatch && user.password) {
          const storedPw = String(user.password);
          if (/^\$2[aby]\$/.test(storedPw)) {
            try { isMatch = bcrypt.compareSync(credential, storedPw); } catch (_) { isMatch = false; }
          } else {
            isMatch = timingSafeEqualStr(storedPw, credential);
            if (isMatch) matchedLegacyPlaintextPassword = true;
          }
        }
      }

      // Unified failure response for both missing user and wrong credential (prevents user enumeration)
      if (!user || !isMatch) {
        rateInfo.attempts += 1;
        if (rateInfo.attempts >= 5) {
          rateInfo.lockedUntil = now + 60000; // 60 seconds lockout
          LOGIN_RATE_LIMITS.set(rateKey, rateInfo);
          return res.status(429).json({
            ok: false,
            error: 'تم قفل الحساب لكثرة المحاولات. انتظر 60 ثانية',
            code: 'PIN_LOCKED',
            waitSec: 60
          });
        }
        LOGIN_RATE_LIMITS.set(rateKey, rateInfo);
        return res.status(401).json({
          ok: false,
          error: 'بيانات الدخول غير صحيحة',
          code: 'INVALID_PIN',
          remainingAttempts: Math.max(0, 5 - rateInfo.attempts)
        });
      }

      // Issue 11: Mandatory bcrypt migration on first successful login for legacy plaintext PIN/password
      if (matchedLegacyPlaintextPin) {
        try {
          const hashedPin = bcrypt.hashSync(credential, 10);
          db.runSql('UPDATE users SET pin = ? WHERE id = ?', [hashedPin, user.id]);
          user.pin = hashedPin;
        } catch (migErr) {
          console.warn('[Mobile API] Waiter PIN bcrypt migration warning:', migErr?.message || migErr);
        }
      }
      if (matchedLegacyPlaintextPassword) {
        try {
          const hashedPw = bcrypt.hashSync(credential, 10);
          db.runSql('UPDATE users SET password = ? WHERE id = ?', [hashedPw, user.id]);
          user.password = hashedPw;
        } catch (migErr) {
          console.warn('[Mobile API] Waiter password bcrypt migration warning:', migErr?.message || migErr);
        }
      }

      // Reset rate limit on success
      LOGIN_RATE_LIMITS.delete(rateKey);

      let assignedHalls = ['ALL'];
      if (user.assigned_halls) {
        try {
          assignedHalls = user.assigned_halls === 'ALL' ? ['ALL'] : JSON.parse(user.assigned_halls);
        } catch (_) {
          assignedHalls = [user.assigned_halls];
        }
      }

      const curShift = db.currentShift ? db.currentShift() : null;
      const sig = getUserAuthSignature(user);
      const waiterToken = `${user.id}.${sig}.${crypto.randomBytes(16).toString('base64url')}`;

      const waiterPayload = {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        assignedHalls: user.role === 'admin' ? ['ALL'] : assignedHalls
      };

      res.json({
        ok: true,
        token: waiterToken,
        waiter: waiterPayload,
        user: waiterPayload,
        shift: curShift ? {
          id: curShift.id,
          name: curShift.shift_type || curShift.shift_name || 'الشيفت الحالي',
          userName: curShift.user_name || 'الكاشير'
        } : null
      });
    } catch (err) {
      console.error('[Mobile API] /login error:', err);
      res.status(500).json({ ok: false, error: err.message || 'خطأ داخلي في الخادم' });
    }
  });

  // -------------------------------------------------------------
  // Route 5: Cached Menu with Revision (GET /m/v1/menu)
  // -------------------------------------------------------------
  router.get('/menu', requireDeviceAuth, (req, res) => {
    try {
      const settings = db.getSettings ? db.getSettings() : {};
      const currentRev = Number(settings.menu_rev) || 1;
      const clientRev = Number(req.query.rev);

      if (clientRev && clientRev === currentRev) {
        return res.json({ ok: true, unchanged: true, rev: currentRev });
      }

      const categories = db.listCategories ? db.listCategories() : [];
      const products = db.listProducts ? db.listProducts() : [];

      const cleanCategories = (categories || []).map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon || '☕',
        sortOrder: c.sort_order || 0
      }));

      const cleanProducts = (products || [])
        .filter(p => !p.is_deleted)
        .map(p => ({
          id: p.id,
          name: p.name,
          price: Number(p.price) || 0,
          categoryId: p.category_id,
          stockQty: p.stock_qty || 0,
          hasNote: true
        }));

      res.json({
        ok: true,
        unchanged: false,
        rev: currentRev,
        categories: cleanCategories,
        products: cleanProducts
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Route 6: Tables with Waiter Hall Restrictions (GET /m/v1/tables)
  // -------------------------------------------------------------
  router.get('/tables', requireDeviceAuth, requireUserAuth, (req, res) => {
    try {
      // Security Hardening: ALWAYS use verified req.currentUser from signed X-Waiter-Token
      const waiter = req.currentUser;
      const waiterId = waiter.id;
      let allowedHalls = ['ALL'];

      if (waiter.role !== 'admin' && waiter.assigned_halls && waiter.assigned_halls !== 'ALL') {
        try {
          allowedHalls = JSON.parse(waiter.assigned_halls);
        } catch (_) {
          allowedHalls = [waiter.assigned_halls];
        }
      }

      let allTables = db.listTables ? db.listTables() : [];

      // Filter by assigned halls if not 'ALL'
      if (!allowedHalls.includes('ALL') && allowedHalls.length > 0) {
        const allowedLower = allowedHalls.map(h => String(h).toLowerCase().trim());
        allTables = allTables.filter(t => allowedLower.includes(String(t.hall || 'indoor').toLowerCase().trim()));
      }

      // Collect distinct halls present
      const hallsSet = new Set();
      const tablesWithCartState = allTables.map(t => {
        const hallName = t.hall || 'indoor';
        hallsSet.add(hallName);

        // Check if table has active cart or active orders
        let itemCount = 0;
        let cartData = null;
        try {
          const cartRow = db.queryGet('SELECT cart_data, updated_at FROM table_carts WHERE table_id = ?', [t.id]);
          if (cartRow && cartRow.cart_data) {
            cartData = JSON.parse(cartRow.cart_data);
            const items = Array.isArray(cartData.cart)
              ? cartData.cart
              : (Array.isArray(cartData.items) ? cartData.items : (Array.isArray(cartData) ? cartData : []));
            if (Array.isArray(items)) {
              itemCount = items.reduce((sum, item) => sum + (Number(item.qty || item.quantity) || 0), 0);
            }
          }
        } catch (_) { }

        let state = 'free'; // 'free' | 'busy' | 'mine' | 'waiting'
        if (itemCount > 0) {
          state = (cartData && cartData.waiterId && String(cartData.waiterId) === String(waiterId)) ? 'mine' : 'busy';
        }

        // Calculate total price from cart items
        let totalPrice = 0;
        let cartItems = [];
        if (itemCount > 0 && cartData) {
          const items = Array.isArray(cartData.cart)
            ? cartData.cart
            : (Array.isArray(cartData.items) ? cartData.items : (Array.isArray(cartData) ? cartData : []));
          if (Array.isArray(items)) {
            cartItems = items.map(item => ({
              id: item.id || item.productId,
              name: item.name || item.productName || 'صنف',
              qty: Number(item.qty || item.quantity) || 1,
              price: Number(item.price || item.unitPrice) || 0,
              note: item.note || item.notes || ''
            }));
            totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
          }
        }

        return {
          id: t.id,
          number: t.number || String(t.id),
          name: t.name || `طاولة ${t.number || t.id}`,
          hall: hallName,
          capacity: t.capacity || 4,
          state,
          itemCount,
          totalPrice,
          cartItems,
          sinceMinutes: t.sinceMinutes || 0
        };
      });

      const curShift = db.currentShift ? db.currentShift() : null;

      res.json({
        ok: true,
        halls: Array.from(hallsSet),
        assignedHalls: allowedHalls,
        shift: curShift && !curShift.error ? {
          id: curShift.id,
          name: curShift.shift_type || curShift.shift_name || 'الشيفت الحالي',
          userName: curShift.user_name || 'الكاشير'
        } : null,
        tables: tablesWithCartState
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Route 7: Submit Order (POST /m/v1/orders) — Idempotent
  // -------------------------------------------------------------
  router.post('/orders', requireDeviceAuth, requireUserAuth, (req, res) => {
    try {
      const { clientOrderId, tableId, items } = req.body || {};
      // Security Hardening: Derive waiter identity strictly from verified X-Waiter-Token (never trust client-supplied waiterId)
      const waiterId = req.currentUser.id;
      const waiterName = req.currentUser.name || req.currentUser.username || 'الويتر';

      if (!clientOrderId || typeof clientOrderId !== 'string') {
        return res.status(400).json({ ok: false, error: 'معرّف الطلب (clientOrderId) مطلوب لضمان عدم التكرار' });
      }

      if (!tableId) {
        return res.status(400).json({ ok: false, error: 'رقم الطاولة (tableId) مطلوب' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ ok: false, error: 'يجب اختيار صنف واحد على الأقل' });
      }

      if (items.length > 60) {
        return res.status(400).json({ ok: false, error: 'الحد الأقصى للأصناف في الطلب الواحد 60 صنفاً' });
      }

      // Check active shift
      const shift = db.currentShift ? db.currentShift() : null;
      if (!shift || shift.error) {
        return res.status(409).json({
          ok: false,
          error: 'الوردية مغلقة حالياً. يرجى فتح الوردية على جهاز الكاشير أولاً',
          code: 'SHIFT_CLOSED'
        });
      }

      // Verify Table & Waiter Hall Permissions
      const table = db.queryGet('SELECT id, number, name, hall FROM tables WHERE id = ?', [tableId]);
      if (!table) {
        return res.status(404).json({ ok: false, error: 'الطاولة المحددة غير موجودة' });
      }

      if (req.currentUser.role !== 'admin') {
        const assignedHallsRaw = req.currentUser.assigned_halls;
        if (assignedHallsRaw && assignedHallsRaw !== 'ALL') {
          let allowed = [];
          try { allowed = JSON.parse(assignedHallsRaw); } catch (_) { allowed = [assignedHallsRaw]; }
          const tableHallLower = String(table.hall || 'indoor').toLowerCase().trim();
          const match = allowed.some(h => String(h).toLowerCase().trim() === tableHallLower);
          if (!match) {
            return res.status(403).json({
              ok: false,
              error: `غير مصرح لك بالطلب على طاولة ${table.number || table.id} خارج صالتك المخصصة`,
              code: 'HALL_FORBIDDEN'
            });
          }
        }
      }

      // Check Idempotency: Has this clientOrderId already been processed?
      const existingOrder = db.queryGet(
        'SELECT id, status, total FROM orders WHERE client_order_id = ?',
        [clientOrderId]
      );
      if (existingOrder) {
        return res.json({
          ok: true,
          orderId: existingOrder.id,
          status: 'received',
          deduplicated: true
        });
      }

      // Authoritative Price Calculation from Database (never trust client prices)
      const sanitizedItems = [];
      for (const item of items) {
        const pId = Number(item.productId || item.id);
        const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty || item.quantity) || 1)));
        const note = item.note ? String(item.note).slice(0, 120) : '';

        const product = db.queryGet(
          `SELECT p.id, p.name, p.price, p.is_deleted, p.category_id, c.name AS category_name
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           WHERE p.id = ?`,
          [pId]
        );
        if (!product || product.is_deleted) {
          return res.status(409).json({
            ok: false,
            error: `الصنف المختار (رقم ${pId}) غير متاح حالياً في القائمة`,
            code: 'PRODUCT_UNAVAILABLE'
          });
        }

        sanitizedItems.push({
          productId: product.id,
          id: product.id,
          name: product.name,
          price: Number(product.price) || 0,
          category_id: product.category_id || null,
          category_name: product.category_name || '',
          qty,
          quantity: qty,
          total: (Number(product.price) || 0) * qty,
          note
        });
      }

      // Check direct append setting (default: true)
      const settings = db.getSettings ? db.getSettings() : {};
      const autoAppend = settings.waiter_auto_append_to_tables !== '0';

      let existingCartObj = {};
      let currentCart = [];
      let currentRev = null;
      let processedOrderIds = [];
      try {
        const cartRow = db.queryGet('SELECT rev, cart_data FROM table_carts WHERE table_id = ?', [tableId]);
        if (cartRow) {
          currentRev = cartRow.rev != null ? Number(cartRow.rev) : null;
          if (cartRow.cart_data) {
            const parsed = JSON.parse(cartRow.cart_data);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              existingCartObj = parsed;
            }
            currentCart = Array.isArray(parsed.cart) ? parsed.cart : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []));
            processedOrderIds = Array.isArray(parsed.processedClientOrderIds) ? parsed.processedClientOrderIds : [];
          }
        }
      } catch (_) { }

      // If this clientOrderId was already appended to this table cart, return deduplicated success
      if (processedOrderIds.includes(clientOrderId)) {
        return res.json({
          ok: true,
          orderId: `table-${tableId}-${clientOrderId}`,
          status: 'received',
          deduplicated: true
        });
      }

      // Mark items as already sent to bar
      const itemsToAppend = sanitizedItems.map(it => ({
        ...it,
        sent_qty: it.qty
      }));

      // Merge items (matching desktop/QR semantics: combine same id + same note)
      const mergedCart = [...currentCart];
      for (const incoming of itemsToAppend) {
        const inNote = incoming.note || incoming.notes || '';
        const idx = mergedCart.findIndex(
          (it) => Number(it.id || it.productId) === Number(incoming.id) && (it.notes || it.note || '') === inNote
        );
        if (idx >= 0) {
          mergedCart[idx] = {
            ...mergedCart[idx],
            qty: (Number(mergedCart[idx].qty || mergedCart[idx].quantity) || 0) + incoming.qty,
            sent_qty: (Number(mergedCart[idx].sent_qty) || 0) + incoming.qty
          };
        } else {
          mergedCart.push({
            ...incoming,
            notes: inNote
          });
        }
      }

      const cartPayload = {
        ...existingCartObj,
        tableId,
        tableName: table.name || `طاولة ${table.number || tableId}`,
        waiterId: waiterId || existingCartObj.waiterId || null,
        waiterName: waiterName || existingCartObj.waiterName || 'الويتر',
        items: mergedCart,
        cart: mergedCart,
        printedCheck: false,
        printedCheckTime: null,
        processedClientOrderIds: [...processedOrderIds, clientOrderId],
        _rev: currentRev,
        _force: true,
        lastUpdated: new Date().toISOString()
      };

      // Save into table_carts and capture the NEW authoritative _rev
      const saveRes = db.saveTableCart(tableId, cartPayload);
      const savedRev = (saveRes && saveRes.rev !== undefined) ? saveRes.rev : ((currentRev || 0) + 1);

      const qrPayload = {
        tableId,
        tableName: table.name || `طاولة ${table.number || tableId}`,
        tableNumber: table.number || String(tableId),
        hall: table.hall || '',
        customerName: existingCartObj.customerName || '',
        waiterName: waiterName || 'الويتر (تطبيق الموبايل)',
        items: sanitizedItems.map(it => ({
          id: it.productId || it.id,
          name: it.name,
          price: it.price,
          category_id: it.category_id || null,
          category_name: it.category_name || '',
          qty: it.qty,
          notes: it.note || ''
        })),
        notes: existingCartObj.orderNotes || '',
        tableCart: { ...cartPayload, _rev: savedRev }
      };

      // Notify desktop cashier live (triggers bar & shisha printer, sound chime, and table status update)
      notifyDesktop('qr-order-received', qrPayload);
      notifyDesktop('qr:new-order', qrPayload);
      notifyDesktop('mobile-order-received', qrPayload);

      // Broadcast SSE table update so all phones see table state
      broadcastSseEvent('tables', { tableId, state: 'busy' });

      res.json({
        ok: true,
        orderId: `table-${tableId}-${Date.now()}`,
        status: 'received',
        tableId,
        itemCount: sanitizedItems.length
      });
    } catch (err) {
      console.error('[Mobile API] Order submission error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Route 7.1: Get Recent / Waiter Orders (GET /m/v1/orders)
  // -------------------------------------------------------------
  router.get('/orders', requireDeviceAuth, requireUserAuth, (req, res) => {
    try {
      const isAdmin = String(req.currentUser.role || '').toLowerCase() === 'admin';
      const curShift = db.currentShift ? db.currentShift() : null;
      let rows = [];
      if (isAdmin) {
        rows = db.queryAll(`
          SELECT o.id, o.invoice_no, o.table_id, o.order_type, o.created_at, o.total, o.payment_method, o.status, o.notes, o.cashier_name,
                 t.name AS table_name, t.number AS table_number
          FROM orders o
          LEFT JOIN tables t ON o.table_id = t.id
          ORDER BY o.id DESC
          LIMIT 50
        `) || [];
      } else if (curShift && !curShift.error && curShift.id) {
        rows = db.queryAll(`
          SELECT o.id, o.invoice_no, o.table_id, o.order_type, o.created_at, o.total, o.payment_method, o.status, o.notes, o.cashier_name,
                 t.name AS table_name, t.number AS table_number
          FROM orders o
          LEFT JOIN tables t ON o.table_id = t.id
          WHERE o.shift_id = ?
          ORDER BY o.id DESC
          LIMIT 50
        `, [curShift.id]) || [];
      }
      res.json({ ok: true, orders: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Route 7.2: Live Admin Dashboard & Reports (GET /m/v1/admin/dashboard)
  // -------------------------------------------------------------
  router.get('/admin/dashboard', requireDeviceAuth, requireAdminAuth, (req, res) => {
    try {
      const settings = db.getSettings ? db.getSettings() : {};
      const curShift = db.currentShift ? db.currentShift() : null;
      const hasOpenShift = !!(curShift && !curShift.error && curShift.id);

      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const tomorrowIso = nextIsoDate(todayIso);
      const yesterdayDate = new Date(now.getTime() - 86400000);
      const yesterdayIso = yesterdayDate.toISOString().slice(0, 10);

      // 1. Today's orders — sargable range query so SQLite uses idx_orders_created_at
      const todayOrders = db.queryAll(`
        SELECT id, invoice_no, table_id, order_type, created_at, total, payment_method,
               cash_amount, card_amount, wallet_amount, status, notes, cashier_name
        FROM orders
        WHERE created_at >= ? AND created_at < ?
        ORDER BY id DESC
      `, [todayIso, tomorrowIso]) || [];

      const completedToday = todayOrders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
      const cancelledToday = todayOrders.filter(o => o.status === 'cancelled' || o.status === 'refunded');

      const todaySalesTotal = completedToday.reduce((s, o) => s + (Number(o.total) || 0), 0);
      let cashTotal = 0;
      let cardTotal = 0;
      let walletTotal = 0;

      for (const o of completedToday) {
        const tot = Number(o.total) || 0;
        const pm = String(o.payment_method || 'cash').toLowerCase();
        const isNotebook = o.order_type === 'notebook' || pm === 'notebook';
        if (isNotebook) {
          cashTotal += Number(o.cash_amount) || 0;
        } else if (pm === 'card' || pm === 'visa') {
          cardTotal += tot;
        } else if (pm === 'wallet') {
          walletTotal += tot;
        } else if (pm === 'split' || pm === 'mixed') {
          cashTotal += Number(o.cash_amount) || 0;
          cardTotal += Number(o.card_amount) || 0;
          walletTotal += Number(o.wallet_amount) || 0;
        } else {
          cashTotal += tot;
        }
      }

      const denom = todaySalesTotal > 0 ? todaySalesTotal : 1;
      const cashPct = todaySalesTotal > 0 ? Math.round((cashTotal / denom) * 100) : 100;
      const cardPct = todaySalesTotal > 0 ? Math.round((cardTotal / denom) * 100) : 0;
      const walletPct = todaySalesTotal > 0 ? Math.max(0, 100 - cashPct - cardPct) : 0;

      // Yesterday comparison (sargable range query using idx_orders_created_at)
      const yesterdayRow = db.queryGet(`
        SELECT COALESCE(SUM(total), 0) AS total
        FROM orders
        WHERE created_at >= ? AND created_at < ? AND status NOT IN ('cancelled', 'refunded')
      `, [yesterdayIso, todayIso]);
      const yesterdaySales = Number(yesterdayRow?.total) || 0;
      let comparisonText = 'مبيعات اليوم المباشرة من الكاشير';
      if (yesterdaySales > 0) {
        const diffPct = Math.round(((todaySalesTotal - yesterdaySales) / yesterdaySales) * 100);
        if (diffPct >= 0) {
          comparisonText = `أعلى من إجمالي أمس بـ ${diffPct}%`;
        } else {
          comparisonText = `أقل من إجمالي أمس بـ ${Math.abs(diffPct)}% (${Math.round(yesterdaySales).toLocaleString('en-US')} ج)`;
        }
      }

      // Open tables active sales (unpaid carts currently on tables)
      let openTablesCount = 0;
      let openTablesTotal = 0;
      try {
        const carts = db.queryAll('SELECT cart_data FROM table_carts') || [];
        for (const c of carts) {
          if (!c.cart_data) continue;
          const parsed = JSON.parse(c.cart_data);
          const items = parsed.items || parsed.cart || parsed;
          if (Array.isArray(items) && items.length > 0) {
            openTablesCount += 1;
            for (const it of items) {
              openTablesTotal += (Number(it.price || it.unitPrice) || 0) * (Number(it.qty || it.quantity) || 1);
            }
          }
        }
      } catch (_) { }

      // Alerts ("محتاج انتباهك")
      const alerts = [];
      if (openTablesCount > 0) {
        alerts.push({
          title: `${openTablesCount} طاولات مشغولة حالياً بالصالة`,
          sub: `إجمالي الطلبات المفتوحة تحت الحساب: ${Math.round(openTablesTotal).toLocaleString('en-US')} ج`,
          type: 'info'
        });
      }
      for (const co of cancelledToday.slice(0, 3)) {
        const tStr = co.created_at ? new Date(co.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
        alerts.push({
          title: `فاتورة ملغية رقم #${co.invoice_no || co.id}`,
          sub: `${co.cashier_name || 'الكاشير'} · ${tStr} · ${co.notes || 'تم الإلغاء'}`,
          type: 'danger'
        });
      }
      try {
        const lowStock = db.queryAll(`
          SELECT name, stock_qty, COALESCE(low_stock_threshold, 5) AS thresh
          FROM products
          WHERE COALESCE(is_deleted, 0) = 0 AND stock_qty <= COALESCE(low_stock_threshold, 5)
          ORDER BY stock_qty ASC
          LIMIT 3
        `) || [];
        for (const lp of lowStock) {
          alerts.push({
            title: `${lp.name} قرّب يخلص`,
            sub: `المتبقي في المخزن: ${lp.stock_qty} فقط`,
            type: 'warning'
          });
        }
      } catch (_) { }
      try {
        const todayExpenses = db.queryAll(`
          SELECT amount, category, notes, user_name, created_at
          FROM expenses
          WHERE created_at >= ? AND created_at < ?
          ORDER BY id DESC
          LIMIT 3
        `, [todayIso, tomorrowIso]) || [];
        for (const ex of todayExpenses) {
          alerts.push({
            title: `مصروف اليوم: ${Math.round(Number(ex.amount) || 0)} ج`,
            sub: `${ex.user_name || 'الكاشير'} · ${ex.category || ''} ${ex.notes ? '— ' + ex.notes : ''}`,
            type: 'info'
          });
        }
      } catch (_) { }

      if (alerts.length === 0) {
        alerts.push({
          title: 'لا توجد تنبيهات حرجة أو إلغاءات اليوم',
          sub: 'جميع العمليات والمخزون في الوضع الطبيعي ✨',
          type: 'info'
        });
      }

      // Recent Invoices (last 50 orders)
      const recentRows = db.queryAll(`
        SELECT o.id, o.invoice_no, o.table_id, o.order_type, o.created_at, o.total,
               o.payment_method, o.status, o.notes, o.cashier_name,
               t.name AS table_name, t.number AS table_number
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        ORDER BY o.id DESC
        LIMIT 50
      `) || [];

      const recentInvoices = recentRows.map(r => {
        let timeStr = '';
        try {
          const d = new Date(r.created_at);
          timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } catch (_) { }
        const pm = String(r.payment_method || 'cash').toLowerCase();
        const isNb = r.order_type === 'notebook' || pm === 'notebook';
        const methodAr = isNb ? 'آجل / نوتة' : (pm === 'split' || pm === 'mixed') ? 'مقسم' : (pm === 'card' || pm === 'visa') ? 'فيزا' : pm === 'wallet' ? 'محفظة' : 'كاش';
        const tblLabel = r.table_name || (r.table_number ? `طاولة ${r.table_number}` : (r.table_id ? `طاولة ${r.table_id}` : 'تيك أواي'));
        return {
          id: String(r.invoice_no || r.id),
          table: tblLabel,
          time: timeStr,
          date: r.created_at ? String(r.created_at).slice(0, 10) : todayIso,
          waiter: r.cashier_name || 'الكاشير',
          amount: Math.round(Number(r.total) || 0).toLocaleString('en-US'),
          method: methodAr,
          status: (r.status === 'cancelled' || r.status === 'refunded') ? 'cancelled' : 'paid',
          reason: (r.status === 'cancelled' || r.status === 'refunded') ? (r.notes || 'ملغية') : undefined
        };
      });

      // Reports for 'today', '7d', 'month'
      const dayNamesAr = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
      const last7Days = [];
      let maxDayTotal = 1;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const iso = d.toISOString().slice(0, 10);
        const nextIso = nextIsoDate(iso);
        const row = db.queryGet(`
          SELECT COALESCE(SUM(total), 0) AS total
          FROM orders
          WHERE created_at >= ? AND created_at < ? AND status NOT IN ('cancelled', 'refunded')
        `, [iso, nextIso]);
        const tot = Number(row?.total) || 0;
        if (tot > maxDayTotal) maxDayTotal = tot;
        last7Days.push({
          iso,
          name: dayNamesAr[d.getDay()],
          rawTotal: tot,
          isToday: i === 0
        });
      }

      const daysChart = last7Days.map(d => ({
        name: d.name,
        val: d.rawTotal >= 1000 ? (d.rawTotal / 1000).toFixed(1) : String(Math.round(d.rawTotal)),
        h: Math.max(14, Math.round((d.rawTotal / maxDayTotal) * 95)),
        isToday: d.isToday
      }));

      function buildPeriodStats(daysBack) {
        const sinceDate = new Date(now.getTime() - daysBack * 86400000).toISOString().slice(0, 10);
        const statsRow = db.queryGet(`
          SELECT COALESCE(SUM(total), 0) AS totalSales, COUNT(*) AS invoicesCount
          FROM orders
          WHERE created_at >= ? AND status NOT IN ('cancelled', 'refunded')
        `, [sinceDate]);
        const totalSales = Math.round(Number(statsRow?.totalSales) || 0);
        const invoicesCount = Number(statsRow?.invoicesCount) || 0;
        const avgInvoice = invoicesCount > 0 ? Math.round(totalSales / invoicesCount) : 0;

        let topRows = [];
        try {
          topRows = db.queryAll(`
            SELECT COALESCE(oi.product_name, p.name, 'صنف') AS name, SUM(oi.qty) AS qty
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.created_at >= ? AND o.status NOT IN ('cancelled', 'refunded')
            GROUP BY COALESCE(oi.product_name, p.name, 'صنف')
            ORDER BY qty DESC
            LIMIT 5
          `, [sinceDate]) || [];
        } catch (_) { }

        const maxQty = topRows.length > 0 ? Math.max(1, Number(topRows[0].qty) || 1) : 1;
        const topProducts = topRows.map(tr => ({
          name: tr.name,
          qty: Number(tr.qty) || 0,
          w: `${Math.max(15, Math.round(((Number(tr.qty) || 0) / maxQty) * 100))}%`
        }));

        return {
          totalSales: totalSales.toLocaleString('en-US'),
          invoicesCount: String(invoicesCount),
          avgInvoice: String(avgInvoice),
          topProducts
        };
      }

      let openShiftSince = 'مغلق حالياً';
      if (hasOpenShift && curShift.opened_at) {
        try {
          const od = new Date(curShift.opened_at);
          openShiftSince = `من ${String(od.getHours()).padStart(2, '0')}:${String(od.getMinutes()).padStart(2, '0')}`;
        } catch (_) {
          openShiftSince = 'مفتوح الآن';
        }
      }

      res.json({
        ok: true,
        cafe: {
          name: settings.cafe_name || 'تقفيلة كافيه',
          code: settings.cafe_code || 'TKEE-7X2P'
        },
        today: {
          sales: Math.round(todaySalesTotal).toLocaleString('en-US'),
          comparisonText,
          invoicesCount: String(todayOrders.length),
          cancelledCount: cancelledToday.length,
          openTablesCount,
          openTablesTotal: Math.round(openTablesTotal).toLocaleString('en-US'),
          paymentMethods: [
            { name: 'كاش', amount: Math.round(cashTotal).toLocaleString('en-US'), percent: `${cashPct}%` },
            { name: 'كارت', amount: Math.round(cardTotal).toLocaleString('en-US'), percent: `${cardPct}%` },
            { name: 'محفظة', amount: Math.round(walletTotal).toLocaleString('en-US'), percent: `${walletPct}%` }
          ]
        },
        openShift: {
          isOpen: hasOpenShift,
          userName: hasOpenShift ? (curShift.user_name || 'الكاشير') : 'لا يوجد شيفت',
          shiftName: hasOpenShift ? (curShift.shift_type || 'الشيفت الحالي') : 'مغلق',
          since: openShiftSince
        },
        alerts,
        recentInvoices,
        reports: {
          daysChart,
          today: buildPeriodStats(0),
          '7d': buildPeriodStats(6),
          month: buildPeriodStats(29),
          custom: buildPeriodStats(89)
        }
      });
    } catch (err) {
      console.error('[Mobile API] /admin/dashboard error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Route 8: Live Stream (GET /m/v1/stream) — SSE
  // -------------------------------------------------------------
  router.get('/stream', requireDeviceAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const client = { res, tokenHash: req.deviceTokenHash };
    SSE_CLIENTS.add(client);

    // Initial hello event
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, time: Date.now() })}\n\n`);

    // Keepalive ping every 15 seconds
    const interval = setInterval(() => {
      try {
        res.write(':keepalive\n\n');
      } catch (_) {
        clearInterval(interval);
        SSE_CLIENTS.delete(client);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
      SSE_CLIENTS.delete(client);
    });
  });

  return router;
}

module.exports = {
  createRouter,
  createPairingSession,
  broadcastSseEvent,
  notifyDeviceRevoked,
  getLocalIp
};
