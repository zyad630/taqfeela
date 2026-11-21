const crypto = require('crypto');

/**
 * Multi-Tenant Database Layer with Strict Café Isolation
 * Conforms to 02-ARCHITECTURE-AND-PROTOCOL.md § 8 & 04-SECURITY.md § 5
 */
class CloudDatabase {
  constructor() {
    this.cafes = new Map();
    this.relayTokens = new Map(); // cafeCode -> { hash, createdAt, revokedAt }
    this.adminUsers = new Map();  // email -> { id, email, passHash }
    this.adminCafes = new Map();  // adminId -> Set(cafeIds)
    this.snapshots = new Map();   // cafeId -> latest snapshot { at, json }
    this.dailyStats = new Map();  // cafeId -> Map(date -> { sales, invoices })
    this.topProducts = new Map(); // cafeId -> Map(range -> list of { name, qty })
    this.invoices = new Map();    // cafeId -> list of invoices
    this.auditLogs = [];
  }

  // Seed default test café
  seedDefaultCafe(code = 'TKYA-7Q2M', name = 'كافيه التكية', relayToken = 'relay_secret_test_token_12345') {
    const cafeId = 1;
    this.cafes.set(cafeId, {
      id: cafeId,
      code,
      name,
      status: 'active',
      plan: 'pro',
      licenseExpires: '2028-12-31'
    });

    const tokenHash = crypto.createHash('sha256').update(relayToken).digest('hex');
    this.relayTokens.set(code, {
      cafeId,
      hash: tokenHash,
      createdAt: new Date().toISOString(),
      revokedAt: null
    });

    return { cafeId, code, relayToken };
  }

  createCafe(name, code, relayToken) {
    const id = this.cafes.size + 1;
    this.cafes.set(id, {
      id,
      code,
      name,
      status: 'active',
      plan: 'standard',
      licenseExpires: new Date(Date.now() + 365*24*60*60*1000).toISOString()
    });

    const tokenHash = crypto.createHash('sha256').update(relayToken).digest('hex');
    this.relayTokens.set(code, {
      cafeId: id,
      hash: tokenHash,
      createdAt: new Date().toISOString(),
      revokedAt: null
    });

    return { id, code, name };
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
    const record = this.relayTokens.get(code);
    if (!record || record.revokedAt) return null;
    const computedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    if (computedHash === record.hash) {
      return this.cafes.get(record.cafeId) || null;
    }
    return null;
  }

  // --- Strict Tenant Isolated Data Access ---

  saveSnapshot(cafeId, snapshotData) {
    const cId = Number(cafeId);
    if (!this.cafes.has(cId)) throw new Error('Unknown café');

    this.snapshots.set(cId, {
      at: new Date().toISOString(),
      json: snapshotData
    });
  }

  getSnapshot(cafeId) {
    const cId = Number(cafeId);
    return this.snapshots.get(cId) || null;
  }

  saveDailyStats(cafeId, date, sales, invoices) {
    const cId = Number(cafeId);
    if (!this.dailyStats.has(cId)) this.dailyStats.set(cId, new Map());
    this.dailyStats.get(cId).set(date, { sales, invoices });
  }

  getDailyStats(cafeId) {
    const cId = Number(cafeId);
    const map = this.dailyStats.get(cId);
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
    this.topProducts.get(cId).set(range, products);
  }

  getTopProducts(cafeId, range = '7d') {
    const cId = Number(cafeId);
    const map = this.topProducts.get(cId);
    if (!map) return [];
    return map.get(range) || [];
  }

  saveInvoices(cafeId, invoicesList) {
    const cId = Number(cafeId);
    this.invoices.set(cId, invoicesList);
  }

  getInvoices(cafeId) {
    const cId = Number(cafeId);
    return this.invoices.get(cId) || [];
  }

  // Admin Café Association
  linkAdminToCafe(adminId, cafeId) {
    if (!this.adminCafes.has(adminId)) {
      this.adminCafes.set(adminId, new Set());
    }
    this.adminCafes.get(adminId).add(Number(cafeId));
  }

  isAdminAuthorizedForCafe(adminId, cafeId) {
    const set = this.adminCafes.get(adminId);
    return set ? set.has(Number(cafeId)) : false;
  }

  logAudit(cafeId, actor, action, ip) {
    this.auditLogs.push({
      id: this.auditLogs.length + 1,
      cafeId: cafeId ? Number(cafeId) : null,
      actor,
      action,
      ip,
      at: new Date().toISOString()
    });
  }
}

module.exports = new CloudDatabase();
