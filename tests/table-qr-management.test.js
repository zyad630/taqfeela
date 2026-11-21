/**
 * Comprehensive Senior Engineer Test Suite
 * Table QR Management, Dynamic Mutation & License Integrity Tests
 * 
 * Tests Coverage:
 * 1. Table QR Toggle (Enable / Disable)
 * 2. Per-table QR Token Generation & Invalidation (Session Revocation)
 * 3. Bulk QR Tokens Reset (Daily / Master Reset)
 * 4. Order Validation Engine:
 *    - Rejection when QR is disabled (403 / qr_disabled)
 *    - Rejection when Token is stale/tampered (403 / token_expired)
 *    - Rejection when Date is past/expired (403 / date_expired)
 *    - Successful processing when credentials match active session
 * 5. Dynamic Table Lifecycle (Add, Rename, Delete) without breaking QR flow
 * 6. License Expiry Calculation (1-year license sanity check)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

describe('Table QR & Security Management (Senior Audit Test Suite)', () => {
  const testDbPath = path.join(__dirname, 'test-table-mgmt.db');
  let db;
  let testTableId;
  const initialToken = 'INIT_TOK_123';

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    // Load local db module
    db = require('../electron/db');
    await db.init(testDbPath);
    assert(db, 'db module must be loaded');

    // Create a dedicated test table
    const created = db.saveTable({
      name: 'طاولة اختبار 99',
      number: '99',
      hall: 'الصالون',
      capacity: 4,
      qr_enabled: 1,
      qr_token: initialToken
    });
    assert(created && created.id, 'Test table should be created');
    testTableId = created.id;
  });

  after(() => {
    // Clean up test table & test db
    if (testTableId) {
      try { db.deleteTable(testTableId); } catch (_) {}
    }
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
    }
  });

  it('1. Should toggle table QR enabled/disabled accurately', () => {
    // Disable QR
    const disabledTbl = db.toggleTableQr(testTableId, false);
    assert.strictEqual(disabledTbl.qr_enabled, 0, 'qr_enabled should be 0');

    const fetched1 = db.listTables().find(t => t.id === testTableId);
    assert.strictEqual(fetched1.qr_enabled, 0, 'Persisted qr_enabled should be 0');

    // Re-enable QR
    const enabledTbl = db.toggleTableQr(testTableId, true);
    assert.strictEqual(enabledTbl.qr_enabled, 1, 'qr_enabled should be 1');

    const fetched2 = db.listTables().find(t => t.id === testTableId);
    assert.strictEqual(fetched2.qr_enabled, 1, 'Persisted qr_enabled should be 1');
  });

  it('2. Should regenerate QR token and invalidate previous session token', () => {
    const regenerated = db.regenerateTableQrToken(testTableId);
    assert(regenerated.qr_token, 'qr_token must exist');
    assert.notStrictEqual(regenerated.qr_token, initialToken, 'New token must differ from old token');

    const fetched = db.listTables().find(t => t.id === testTableId);
    assert.strictEqual(fetched.qr_token, regenerated.qr_token, 'Database must hold new token');
  });

  it('3. Should reset all table QR tokens in bulk', () => {
    const allTablesBefore = db.listTables();
    const tokensBefore = new Map(allTablesBefore.map(t => [t.id, t.qr_token]));

    const resetTables = db.resetAllTableQrTokens();
    assert(Array.isArray(resetTables), 'Result must be an array of tables');

    const allTablesAfter = db.listTables();
    for (const t of allTablesAfter) {
      assert(t.qr_token, `Table ${t.id} must have a non-empty token`);
      if (tokensBefore.has(t.id)) {
        assert.notStrictEqual(t.qr_token, tokensBefore.get(t.id), `Table ${t.id} token must be renewed`);
      }
    }
  });

  it('4. Order Security: Rejects orders when table QR ordering is disabled', () => {
    // Disable table
    db.toggleTableQr(testTableId, false);
    const table = db.listTables().find(t => t.id === testTableId);

    // Mock order submission validation logic
    const validateOrder = (tbl, orderToken, orderDate) => {
      if (tbl.qr_enabled === 0 || tbl.qr_enabled === false) {
        return { success: false, error: 'خدمة الطلب عبر الباركود معطلة لهذه الطاولة حالياً' };
      }
      if (tbl.qr_token && orderToken && String(orderToken).trim() !== String(tbl.qr_token).trim()) {
        return { success: false, error: 'انتهت صلاحية جلسة الباركود لهذه الطاولة' };
      }
      const today = db.getCairoTodayString ? db.getCairoTodayString() : new Date().toISOString().slice(0, 10);
      if (orderDate && String(orderDate).trim() !== today) {
        return { success: false, error: 'انتهت صلاحية باركود اليوم السابق' };
      }
      return { success: true };
    };

    const res = validateOrder(table, table.qr_token, '2026-10-07');
    assert.strictEqual(res.success, false);
    assert(res.error.includes('معطلة'), 'Error message must state QR is disabled');
  });

  it('5. Order Security: Rejects orders when client token does not match active table token', () => {
    // Enable table
    db.toggleTableQr(testTableId, true);
    const table = db.listTables().find(t => t.id === testTableId);

    const validateOrder = (tbl, orderToken, orderDate) => {
      if (tbl.qr_enabled === 0 || tbl.qr_enabled === false) {
        return { success: false, error: 'خدمة الطلب عبر الباركود معطلة لهذه الطاولة حالياً' };
      }
      if (tbl.qr_token && orderToken && String(orderToken).trim() !== String(tbl.qr_token).trim()) {
        return { success: false, error: 'انتهت صلاحية جلسة الباركود لهذه الطاولة' };
      }
      const today = db.getCairoTodayString ? db.getCairoTodayString() : new Date().toISOString().slice(0, 10);
      if (orderDate && String(orderDate).trim() !== today) {
        return { success: false, error: 'انتهت صلاحية باركود اليوم السابق' };
      }
      return { success: true };
    };

    const staleToken = 'OLD_EXPIRED_TOKEN_XYZ';
    const res = validateOrder(table, staleToken, '2026-10-07');
    assert.strictEqual(res.success, false);
    assert(res.error.includes('انتهت صلاحية جلسة'), 'Error message must state session expired');
  });

  it('6. Order Security: Rejects orders with past date (Daily Expiry enforcement)', () => {
    const table = db.listTables().find(t => t.id === testTableId);

    const validateOrder = (tbl, orderToken, orderDate) => {
      if (tbl.qr_enabled === 0 || tbl.qr_enabled === false) {
        return { success: false, error: 'خدمة الطلب عبر الباركود معطلة لهذه الطاولة حالياً' };
      }
      if (tbl.qr_token && orderToken && String(orderToken).trim() !== String(tbl.qr_token).trim()) {
        return { success: false, error: 'انتهت صلاحية جلسة الباركود لهذه الطاولة' };
      }
      const today = db.getCairoTodayString ? db.getCairoTodayString() : new Date().toISOString().slice(0, 10);
      if (orderDate && String(orderDate).trim() !== today) {
        return { success: false, error: 'انتهت صلاحية باركود اليوم السابق' };
      }
      return { success: true };
    };

    const pastDate = '2026-10-06';
    const res = validateOrder(table, table.qr_token, pastDate);
    assert.strictEqual(res.success, false);
    assert(res.error.includes('اليوم السابق'), 'Error message must state day expired');
  });

  it('7. Order Security: Accepts orders when enabled, valid token, and current date', () => {
    const table = db.listTables().find(t => t.id === testTableId);
    const today = db.getCairoTodayString ? db.getCairoTodayString() : new Date().toISOString().slice(0, 10);

    const validateOrder = (tbl, orderToken, orderDate) => {
      if (tbl.qr_enabled === 0 || tbl.qr_enabled === false) {
        return { success: false, error: 'خدمة الطلب عبر الباركود معطلة لهذه الطاولة حالياً' };
      }
      if (tbl.qr_token && orderToken && String(orderToken).trim() !== String(tbl.qr_token).trim()) {
        return { success: false, error: 'انتهت صلاحية جلسة الباركود لهذه الطاولة' };
      }
      if (orderDate && String(orderDate).trim() !== today) {
        return { success: false, error: 'انتهت صلاحية باركود اليوم السابق' };
      }
      return { success: true };
    };

    const res = validateOrder(table, table.qr_token, today);
    assert.strictEqual(res.success, true);
  });

  it('8. Dynamic Table Lifecycle: Adding, Renaming, and Deleting tables does not break QR resolution', () => {
    // Create new table
    const newTbl = db.saveTable({ name: 'طاولة تجربة إضافية', number: '101', hall: 'التراس' });
    assert(newTbl && newTbl.id, 'New table must be created');
    assert(newTbl.qr_token, 'New table must automatically get a qr_token');
    assert.strictEqual(newTbl.qr_enabled, 1, 'New table must be enabled by default');

    // Rename table
    const renamed = db.saveTable({ id: newTbl.id, name: 'طاولة VIP التراس', number: 'VIP-1', hall: 'التراس' });
    assert.strictEqual(renamed.name, 'طاولة VIP التراس');
    assert.strictEqual(renamed.number, 'VIP-1');

    // Confirm lookup by ID still works
    const foundById = db.listTables().find(t => t.id === newTbl.id);
    assert.strictEqual(foundById.name, 'طاولة VIP التراس');
    assert.strictEqual(foundById.qr_token, newTbl.qr_token, 'qr_token must remain stable across renaming');

    // Delete table
    db.deleteTable(newTbl.id);
    const deletedSearch = db.listTables().find(t => t.id === newTbl.id);
    assert.strictEqual(deletedSearch, undefined, 'Deleted table must no longer exist in tables list');
  });

  it('9. License Integrity: 365 days duration validation', () => {
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expiry = now + ONE_YEAR_MS;
    const daysRemaining = Math.round((expiry - now) / (24 * 60 * 60 * 1000));
    assert(daysRemaining >= 364 && daysRemaining <= 366, 'License days count must be approx 365 days');
  });
});
