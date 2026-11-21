/**
 * ==============================================================================================
 * senior-architectural-hardening.test.js
 * Comprehensive Architectural & Engine Resilience Verification Suite
 * ==============================================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

describe('🏛️ Senior Architectural Hardening & Engine Resilience Suite', () => {
  let testEnvDir;
  let db;

  before(async () => {
    testEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-arch-test-'));
    process.env.NODE_ENV = 'test';
    delete require.cache[require.resolve('../electron/db')];
    db = require('../electron/db');
  });

  after(() => {
    if (testEnvDir && fs.existsSync(testEnvDir)) {
      try { fs.rmSync(testEnvDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  test('1. WASM Shield: Persistent copy is created in userData to survive Temp purges', async () => {
    const testDbPath = path.join(testEnvDir, 'wasm-shield-test.db');
    await db.init(testDbPath);

    // Verify persistent sql-wasm.wasm copy exists in effectiveUserDataPath
    const cachedWasmPath = path.join(testEnvDir, 'sql-wasm.wasm');
    assert.ok(fs.existsSync(cachedWasmPath), 'Persistent sql-wasm.wasm must be cached in userData directory');
    const wasmStat = fs.statSync(cachedWasmPath);
    assert.ok(wasmStat.size > 500000, 'Cached WASM binary must be valid and non-empty (>500KB)');
  });

  test('2. Orphaned Temp Cleaner: Automatically sweeps abandoned .tmp-* files on startup', async () => {
    const fakeTempFile1 = path.join(testEnvDir, 'cafe-pos.db.tmp-1700000001');
    const fakeTempFile2 = path.join(testEnvDir, 'cafe-pos.db.tmp-1700000002');
    const fakeCorruptFile = path.join(testEnvDir, 'cafe-pos.db.corrupt-1700000001');

    fs.writeFileSync(fakeTempFile1, 'orphaned temp content 1');
    fs.writeFileSync(fakeTempFile2, 'orphaned temp content 2');
    fs.writeFileSync(fakeCorruptFile, 'orphaned corrupt content');

    // Set mtime to 1 hour ago
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(fakeTempFile1, oneHourAgo, oneHourAgo);
    fs.utimesSync(fakeTempFile2, oneHourAgo, oneHourAgo);
    fs.utimesSync(fakeCorruptFile, oneHourAgo, oneHourAgo);

    assert.ok(fs.existsSync(fakeTempFile1));
    assert.ok(fs.existsSync(fakeTempFile2));
    assert.ok(fs.existsSync(fakeCorruptFile));

    // Run cleaner
    db.cleanupOrphanedTempFiles(testEnvDir);

    assert.strictEqual(fs.existsSync(fakeTempFile1), false, 'Old .tmp file must be pruned');
    assert.strictEqual(fs.existsSync(fakeTempFile2), false, 'Old .tmp file must be pruned');
    assert.strictEqual(fs.existsSync(fakeCorruptFile), false, 'Old .corrupt file must be pruned');
  });

  test('3. Database Maintenance: Automatically prunes stale available table carts and old audit logs', async () => {
    const testDbPath = path.join(testEnvDir, 'maint-test.db');
    await db.init(testDbPath);

    // Seed dummy data
    db.runSql("INSERT INTO tables (id, number, name, capacity, status, current_order_id) VALUES (901, 'T901', 'طاولة مهجورة', 4, 'available', NULL)");
    db.runSql("INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at) VALUES (901, '{\"items\":[]}', ?)", [new Date().toISOString()]);

    const activeOrderTbl = 902;
    db.runSql("INSERT INTO tables (id, number, name, capacity, status, current_order_id) VALUES (902, 'T902', 'طاولة مشغولة', 4, 'occupied', 555)");
    db.runSql("INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at) VALUES (902, '{\"items\":[{\"name\":\"شاي\"}]}', ?)", [new Date().toISOString()]);

    // Seed old audit logs (100 days old)
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    db.runSql("INSERT INTO audit_log (action, entity_type, details, actor_name, created_at) VALUES ('ROUTINE_EVENT', 'table', 'حدث قديم روتيني', 'cashier', ?)", [oldDate]);
    db.runSql("INSERT INTO audit_log (action, entity_type, details, actor_name, created_at) VALUES ('RESET_ADMIN_PASSWORD', 'user', 'حدث أمني حساس يجب ألا يحذف', 'vendor', ?)", [oldDate]);

    // Verify presence before maintenance
    const cart901Before = db.queryGet('SELECT * FROM table_carts WHERE table_id = 901');
    assert.ok(cart901Before, 'Cart 901 must exist before maintenance');

    // Run maintenance
    db.runDatabaseMaintenance();

    // Verify cart for available table was purged, while occupied table cart remains
    const cart901After = db.queryGet('SELECT * FROM table_carts WHERE table_id = 901');
    assert.strictEqual(cart901After, null, 'Stale cart for available table must be cleaned');

    const cart902After = db.queryGet('SELECT * FROM table_carts WHERE table_id = 902');
    assert.ok(cart902After, 'Occupied table cart must be safely preserved');

    // Verify routine audit log was pruned while security event was kept
    const routineLog = db.queryGet("SELECT * FROM audit_log WHERE action = 'ROUTINE_EVENT'");
    assert.strictEqual(routineLog, null, 'Routine audit log >90 days must be pruned');

    const securityLog = db.queryGet("SELECT * FROM audit_log WHERE action = 'RESET_ADMIN_PASSWORD'");
    assert.ok(securityLog, 'Critical administrative audit log must NEVER be deleted');
  });

  test('4. Clean Preload Interface: Exposes authoritative API surface cleanly', () => {
    const preloadPath = path.join(__dirname, '..', 'electron', 'preload.js');
    assert.ok(fs.existsSync(preloadPath), 'electron/preload.js must exist');
    const content = fs.readFileSync(preloadPath, 'utf8');

    // Must NOT be obfuscated with _0x variables
    assert.strictEqual(/_0x[a-f0-9]{4,6}/i.test(content), false, 'electron/preload.js must be clean and un-obfuscated');

    // Must expose essential methods
    const requiredMethods = [
      'loginUser', 'logoutUser', 'getSession',
      'createOrder', 'cancelOrder', 'clearAllOrders',
      'openShift', 'closeShift', 'currentShift',
      'listTables', 'saveTableCart', 'transferTable',
      'listProducts', 'saveProduct', 'deleteProduct',
      'listDebts', 'payDebt', 'listExpenses', 'addExpense',
      'getReportSales', 'getReportDaily', 'getSettings', 'saveSettings',
      'printSilent', 'printTicketHtml', 'getLicenseStatus', 'activateLicense'
    ];

    for (const method of requiredMethods) {
      assert.ok(content.includes(`${method}:`), `preload.js must expose ${method}`);
    }
  });
});
