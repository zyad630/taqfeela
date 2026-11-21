'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

/**
 * Persistent Multi-Tenant Database Layer with Strict Café Isolation
 * Uses atomic fsync JSON persistence on disk (or ':memory:' for isolated tests)
 * so all cafés, admins, snapshots, and anti-replay sequence numbers survive restarts.
 */
class CloudDatabase {
  constructor(dbPath = null) {
    this.dbPath = dbPath || process.env.CLOUD_DB_PATH || path.resolve(__dirname, '../../data/cloud-store.json');
    this._resetMemory();
    this._loadFromDisk();
  }

  _resetMemory() {
    this.nextCafeId = 1;
    this.nextAdminId = 1;
    this.nextAuditId = 1;
    this.cafes = new Map();       // cafeId -> { id, code, name, status, plan, licenseExpires, lastSeq }
    this.relayTokens = new Map(); // cafeCode -> { cafeId, hash, createdAt, revokedAt }
    this.adminUsers = new Map();  // email (lower) -> { id, email, passHash, createdAt }
    this.adminCafes = new Map();  // adminId -> Set(cafeIds)
    this.snapshots = new Map();   // cafeId -> { at, json }
    this.dailyStats = new Map();  // cafeId -> Map(date -> { sales, invoices })
    this.topProducts = new Map(); // cafeId -> Map(range -> list)
    this.invoices = new Map();    // cafeId -> list
    this.auditLogs = [];
  }

  _loadFromDisk() {
    if (!this.dbPath || this.dbPath === ':memory:') return;
    if (!fs.existsSync(this.dbPath)) return;
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      if (!raw || !raw.trim()) return;
      const data = JSON.parse(raw);
      this.nextCafeId = Number(data.nextCafeId) || 1;
      this.nextAdminId = Number(data.nextAdminId) || 1;
      this.nextAuditId = Number(data.nextAuditId) || 1;

      for (const c of (data.cafes || [])) {
        this.cafes.set(Number(c.id), c);
      }
      for (const [code, rec] of Object.entries(data.relayTokens || {})) {
        this.relayTokens.set(code, rec);
      }
      for (const u of (data.adminUsers || [])) {
        this.adminUsers.set(String(u.email).toLowerCase(), u);
      }
      for (const [adminId, cafeIds] of Object.entries(data.adminCafes || {})) {
        this.adminCafes.set(Number(adminId), new Set((cafeIds || []).map(Number)));
      }
      for (const [cafeId, snap] of Object.entries(data.snapshots || {})) {
        this.snapshots.set(Number(cafeId), snap);
      }
      for (const [cafeId, statsObj] of Object.entries(data.dailyStats || {})) {
        const m = new Map();
        for (const [date, val] of Object.entries(statsObj || {})) {
          m.set(date, val);
        }
        this.dailyStats.set(Number(cafeId), m);
      }
      for (const [cafeId, prodObj] of Object.entries(data.topProducts || {})) {
        const m = new Map();
        for (const [range, list] of Object.entries(prodObj || {})) {
          m.set(range, list);
        }
        this.topProducts.set(Number(cafeId), m);
      }
      for (const [cafeId, invList] of Object.entries(data.invoices || {})) {
        this.invoices.set(Number(cafeId), invList || []);
      }
      this.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
    } catch (err) {
      console.error('[CloudDB] Failed to load persistent store:', err.message);
    }
  }

  _persistToDisk() {
    if (!this.dbPath || this.dbPath === ':memory:') return;
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const serialized = {
        nextCafeId: this.nextCafeId,
        nextAdminId: this.nextAdminId,
        nextAuditId: this.nextAuditId,
        cafes: Array.from(this.cafes.values()),
        relayTokens: Object.fromEntries(this.relayTokens.entries()),
        adminUsers: Array.from(this.adminUsers.values()),
        adminCafes: Object.fromEntries(
          Array.from(this.adminCafes.entries()).map(([k, set]) => [String(k), Array.from(set)])
        ),
        snapshots: Object.fromEntries(
          Array.from(this.snapshots.entries()).map(([k, v]) => [String(k), v])
        ),
        dailyStats: Object.fromEntries(
          Array.from(this.dailyStats.entries()).map(([k, m]) => [String(k), Object.fromEntries(m.entries())])
        ),
        topProducts: Object.fromEntries(
          Array.from(this.topProducts.entries()).map(([k, m]) => [String(k), Object.fromEntries(m.entries())])
        ),
        invoices: Object.fromEntries(
          Array.from(this.invoices.entries()).map(([k, v]) => [String(k), v])
        ),
        auditLogs: this.auditLogs.slice(-5000)
      };

      const tmpPath = `${this.dbPath}.tmp-${process.pid}-${Date.now()}`;
      const fd = fs.openSync(tmpPath, 'w');
      try {
        fs.writeSync(fd, JSON.stringify(serialized, null, 2), 0, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, this.dbPath);
    } catch (err) {
      console.error('[CloudDB] Failed to persist store:', err.message);
    }
  }

  // --- Admin User Management (Real bcrypt Authentication) ---

  createAdminUser(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('بريد إلكتروني غير صالح');
    }
    if (cleanPass.length < 8) {
      throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    }
    if (this.adminUsers.has(cleanEmail)) {
      throw new Error('هذا البريد الإلكتروني مسجل مسبقاً');
    }
    const id = this.nextAdminId++;
    const passHash = bcrypt.hashSync(cleanPass, 10);
    const user = {
      id,
      email: cleanEmail,
      passHash,
      createdAt: new Date().toISOString()
    };
    this.adminUsers.set(cleanEmail, user);
    this._persistToDisk();
    return { id: user.id, email: user.email };
  }

  verifyAdminLogin(email, password) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');
    if (!cleanEmail || !cleanPass) return null;
    const user = this.adminUsers.get(cleanEmail);
    if (!user || !user.passHash) return null;
    try {
      if (!bcrypt.compareSync(cleanPass, user.passHash)) return null;
    } catch (_) {
      return null;
    }
    return { id: user.id, email: user.email };
  }

  // --- Café Management ---

  createCafe(name, code, relayToken) {
    if (!name || !code || !relayToken || typeof relayToken !== 'string') {
      throw new Error('name, code, and relayToken are required');
    }
    const id = this.nextCafeId++;
    this.cafes.set(id, {
      id,
      code: String(code),
      name: String(name),
      status: 'active',
      plan: 'standard',
      licenseExpires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      lastSeq: -1
    });

    const tokenHash = crypto.createHash('sha256').update(relayToken).digest('hex');
    this.relayTokens.set(String(code), {
      cafeId: id,
      hash: tokenHash,
      createdAt: new Date().toISOString(),
      revokedAt: null
    });

    this._persistToDisk();
    return { id, code: String(code), name: String(name) };
  }

  getCafeByCode(code) {
    for (const cafe of this.cafes.values()) {
      if (cafe.code === code) return cafe;
    }
    return null;
  }

  getCafeById(id) {
    return this.cafes.get(Number(id)) || null;
  }

  verifyRelayToken(code, rawToken) {
    if (!code || typeof code !== 'string' || !rawToken || typeof rawToken !== 'string') {
      return null;
    }
    const record = this.relayTokens.get(code);
    if (!record || record.revokedAt) return null;
    const computedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const a = Buffer.from(computedHash, 'hex');
    const b = Buffer.from(String(record.hash || ''), 'hex');
    if (a.length !== b.length || a.length === 0) return null;
    if (crypto.timingSafeEqual(a, b)) {
      return this.cafes.get(record.cafeId) || null;
    }
    return null;
  }

  /**
   * Persistent strictly monotonic anti-replay check (survives server restarts)
   */
  checkAndAdvanceSeq(cafeId, seq) {
    const cafe = this.cafes.get(Number(cafeId));
    if (!cafe) return { ok: false, reason: 'unknown_cafe' };
    const lastSeq = typeof cafe.lastSeq === 'number' ? cafe.lastSeq : -1;
    if (seq <= lastSeq) {
      return { ok: false, reason: 'replayed_seq', lastSeq };
    }
    cafe.lastSeq = seq;
    this._persistToDisk();
    return { ok: true, seq };
  }

  // --- Strict Tenant Isolated Data Access ---

  saveSnapshot(cafeId, snapshotData) {
    const cId = Number(cafeId);
    if (!this.cafes.has(cId)) throw new Error('Unknown café');
    this.snapshots.set(cId, {
      at: new Date().toISOString(),
      json: snapshotData
    });
    this._persistToDisk();
  }

  getSnapshot(cafeId) {
    return this.snapshots.get(Number(cafeId)) || null;
  }

  saveDailyStats(cafeId, date, sales, invoices) {
    const cId = Number(cafeId);
    if (!this.dailyStats.has(cId)) this.dailyStats.set(cId, new Map());
    this.dailyStats.get(cId).set(String(date), { sales, invoices });
    this._persistToDisk();
  }

  getDailyStats(cafeId) {
    const map = this.dailyStats.get(Number(cafeId));
    if (!map) return [];
    return Array.from(map.entries()).map(([date, data]) => ({
      date,
      sales: data.sales,
      invoices: data.invoices
    }));
  }

  saveTopProducts(cafeId, range, products) {
    const cId = Number(cafeId);
    if (!this.topProducts.has(cId)) this.topProducts.set(cId, new Map());
    this.topProducts.get(cId).set(String(range), products);
    this._persistToDisk();
  }

  getTopProducts(cafeId, range = '7d') {
    const map = this.topProducts.get(Number(cafeId));
    if (!map) return [];
    return map.get(String(range)) || [];
  }

  saveInvoices(cafeId, invoicesList) {
    const cId = Number(cafeId);
    this.invoices.set(cId, invoicesList);
    this._persistToDisk();
  }

  getInvoices(cafeId) {
    return this.invoices.get(Number(cafeId)) || [];
  }

  // Admin Café Association
  linkAdminToCafe(adminId, cafeId) {
    const aId = Number(adminId);
    if (!this.adminCafes.has(aId)) {
      this.adminCafes.set(aId, new Set());
    }
    this.adminCafes.get(aId).add(Number(cafeId));
    this._persistToDisk();
  }

  isAdminAuthorizedForCafe(adminId, cafeId) {
    const set = this.adminCafes.get(Number(adminId));
    return set ? set.has(Number(cafeId)) : false;
  }

  logAudit(cafeId, actor, action, ip) {
    this.auditLogs.push({
      id: this.nextAuditId++,
      cafeId: cafeId ? Number(cafeId) : null,
      actor,
      action,
      ip,
      at: new Date().toISOString()
    });
    if (this.auditLogs.length > 5000) {
      this.auditLogs = this.auditLogs.slice(-5000);
    }
    this._persistToDisk();
  }
}

const defaultDb = new CloudDatabase();
module.exports = defaultDb;
module.exports.CloudDatabase = CloudDatabase;
