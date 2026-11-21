/**
 * tests/test-phase1-security-audit-fixes.js
 *
 * Comprehensive Verification Suite for Phase 1 Security, Access Control,
 * Integrity, and Index Performance Fixes.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');

const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
const testDir = path.join(baseTemp, `cafe-phase1-audit-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'cafe-pos.db');

function makeRequest(port, method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers,
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
    };
    const req = http.request({ hostname: '127.0.0.1', port, path: pathUrl, method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), raw: data }); }
        catch (_) { resolve({ status: res.statusCode, body: null, raw: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('   PHASE 1 SECURITY & INTEGRITY VERIFICATION SUITE  ');
  console.log('====================================================\n');

  const db = require('../electron/db');
  await db.init(testDbPath);

  // Setup users, tables, shift
  db.setupInitialAdmin('AdminStrong#2026', 'المدير العام', { cafe_name: 'كافيه الخليج' });
  const admin = db.queryGet('SELECT id, username, name FROM users WHERE role = "admin" LIMIT 1');

  const waiterGarden = db.saveUser({
    username: 'waiter_g',
    name: 'ويتر الحديقة',
    role: 'waiter',
    password: 'WaiterPassword#1',
    pin: '1122',
    assigned_halls: JSON.stringify(['garden'])
  });

  db.saveTable({ number: '10', name: 'طاولة داخلية 10', hall: 'indoor', capacity: 4 });
  db.saveTable({ number: '20', name: 'طاولة حديقة 20', hall: 'garden', capacity: 4 });
  const tableIndoor = db.queryGet('SELECT id FROM tables WHERE number = "10"');
  const tableGarden = db.queryGet('SELECT id FROM tables WHERE number = "20"');
  const prod = db.queryGet('SELECT id FROM products WHERE is_deleted = 0 LIMIT 1');

  db.openShift(500, 'شيفت اختبار أمني', admin, 'الشيفت الصباحي');

  const app = express();
  app.use(express.json());
  const mobileApi = require('../electron/mobileApi');
  app.use('/m/v1', mobileApi.createRouter({ db, getMainWindow: () => null }));
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    // -------------------------------------------------------------
    // 1. Static Verification: Packaged Production Guards
    // -------------------------------------------------------------
    console.log('--- 1. Production Guards in main.js, db.js & package.json ---');
    const mainSrc = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
    const dbSrc = fs.readFileSync(path.join(__dirname, '../electron/db.js'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

    assert.ok(mainSrc.includes('!isPackagedApp && process.env.CAFE_TEST_AUTOMATION'), 'main.js must guard security stub with !isPackagedApp');
    assert.ok(mainSrc.includes('const isTestAutomation = !isPackagedApp &&'), 'main.js must guard isTestAutomation with !isPackagedApp');
    assert.ok(dbSrc.includes('!isPackagedElectron && process.env.CAFE_TEST_AUTOMATION'), 'db.js must guard security & license test bypass with !isPackagedElectron');

    const electronFilter = pkg.build.files.find(f => f && f.from === 'electron').filter;
    assert.ok(electronFilter.includes('!**/*.clean.js'), 'package.json must exclude *.clean.js from production asar');
    assert.ok(electronFilter.includes('!**/*.obfuscated.js'), 'package.json must exclude *.obfuscated.js from production asar');
    console.log('✓ Production guards and build filters verified');

    // -------------------------------------------------------------
    // 2. PRAGMA foreign_keys MUST stay ON after all backup functions
    // -------------------------------------------------------------
    console.log('\n--- 2. PRAGMA foreign_keys Integrity Across All Backups ---');
    // Static check: only safeDbExport() may call raw db.export()
    const rawExportMatches = dbSrc.match(/\bdb\.export\(\)/g) || [];
    assert.strictEqual(rawExportMatches.length, 1, `Expected exactly 1 raw db.export() inside safeDbExport(), found ${rawExportMatches.length}`);
    db.autoBackupPeriodic();
    assert.strictEqual(db.queryGet('PRAGMA foreign_keys').foreign_keys, 1, 'foreign_keys must remain ON after autoBackupPeriodic');
    db.createBackup();
    assert.strictEqual(db.queryGet('PRAGMA foreign_keys').foreign_keys, 1, 'foreign_keys must remain ON after createBackup');
    console.log('✓ PRAGMA foreign_keys remained ON (1) after all backup operations & zero raw db.export() leaks');

    // -------------------------------------------------------------
    // 3. Mobile API: Strict Access Control & Anti-Spoofing
    // -------------------------------------------------------------
    console.log('\n--- 3. Mobile API RBAC & Anti-Spoofing Checks ---');
    const pairSession = mobileApi.createPairingSession('كافيه الخليج', port);
    const pairRes = await makeRequest(port, 'POST', '/m/v1/pair', { code: pairSession.code, deviceName: 'Test Phone' });
    assert.strictEqual(pairRes.status, 200);
    const deviceHeaders = { Authorization: `Bearer ${pairRes.body.deviceToken}` };

    // 3a. Device token ONLY (no user token) -> MUST be rejected on /admin/dashboard, /tables, /orders
    const dashNoUser = await makeRequest(port, 'GET', '/m/v1/admin/dashboard', null, deviceHeaders);
    assert.strictEqual(dashNoUser.status, 401);
    assert.strictEqual(dashNoUser.body.code, 'USER_AUTH_REQUIRED');

    const tablesNoUser = await makeRequest(port, 'GET', '/m/v1/tables', null, deviceHeaders);
    assert.strictEqual(tablesNoUser.status, 401);

    // 3b. Spoofing X-Waiter-Id without X-Waiter-Token -> MUST be rejected 401
    const spoofNoTok = await makeRequest(port, 'GET', '/m/v1/admin/dashboard', null, {
      ...deviceHeaders,
      'X-Waiter-Id': String(admin.id)
    });
    assert.strictEqual(spoofNoTok.status, 401);
    assert.strictEqual(spoofNoTok.body.code, 'INVALID_USER_TOKEN');

    // Login as Waiter (garden only)
    const waiterLogin = await makeRequest(port, 'POST', '/m/v1/login', { userId: waiterGarden.id, pin: '1122' }, deviceHeaders);
    assert.strictEqual(waiterLogin.status, 200);
    const waiterHeaders = {
      ...deviceHeaders,
      'X-Waiter-Token': waiterLogin.body.token,
      'X-Waiter-Id': String(waiterGarden.id)
    };

    // 3c. Waiter calling /admin/dashboard -> MUST be rejected 403 ADMIN_REQUIRED
    const waiterDash = await makeRequest(port, 'GET', '/m/v1/admin/dashboard', null, waiterHeaders);
    assert.strictEqual(waiterDash.status, 403);
    assert.strictEqual(waiterDash.body.code, 'ADMIN_REQUIRED');

    // 3d. Waiter token paired with Admin X-Waiter-Id -> MUST be rejected 401 USER_ID_MISMATCH
    const mismatchRes = await makeRequest(port, 'GET', '/m/v1/admin/dashboard', null, {
      ...deviceHeaders,
      'X-Waiter-Token': waiterLogin.body.token,
      'X-Waiter-Id': String(admin.id)
    });
    assert.strictEqual(mismatchRes.status, 401);
    assert.strictEqual(mismatchRes.body.code, 'USER_ID_MISMATCH');

    // 3e. Waiter trying to bypass hall guard by sending waiterId: admin.id or null in POST /orders -> MUST be rejected 403 HALL_FORBIDDEN
    const spoofOrderAdmin = await makeRequest(port, 'POST', '/m/v1/orders', {
      clientOrderId: `spoof-1-${Date.now()}`,
      tableId: tableIndoor.id,
      waiterId: admin.id,
      items: [{ productId: prod.id, qty: 1 }]
    }, waiterHeaders);
    assert.strictEqual(spoofOrderAdmin.status, 403);
    assert.strictEqual(spoofOrderAdmin.body.code, 'HALL_FORBIDDEN');

    const spoofOrderNull = await makeRequest(port, 'POST', '/m/v1/orders', {
      clientOrderId: `spoof-2-${Date.now()}`,
      tableId: tableIndoor.id,
      waiterId: null,
      items: [{ productId: prod.id, qty: 1 }]
    }, waiterHeaders);
    assert.strictEqual(spoofOrderNull.status, 403);
    assert.strictEqual(spoofOrderNull.body.code, 'HALL_FORBIDDEN');

    // 3f. Waiter ordering on their own hall (garden) -> MUST succeed 200
    const okOrder = await makeRequest(port, 'POST', '/m/v1/orders', {
      clientOrderId: `valid-g-${Date.now()}`,
      tableId: tableGarden.id,
      items: [{ productId: prod.id, qty: 1 }]
    }, waiterHeaders);
    assert.strictEqual(okOrder.status, 200);
    assert.strictEqual(okOrder.body.ok, true);

    // 3g. Admin login -> /admin/dashboard MUST succeed 200
    const adminLogin = await makeRequest(port, 'POST', '/m/v1/login', {
      username: admin.username,
      password: 'AdminStrong#2026'
    }, deviceHeaders);
    assert.strictEqual(adminLogin.status, 200);
    const adminHeaders = {
      ...deviceHeaders,
      'X-Waiter-Token': adminLogin.body.token,
      'X-Waiter-Id': String(admin.id)
    };
    const adminDash = await makeRequest(port, 'GET', '/m/v1/admin/dashboard', null, adminHeaders);
    assert.strictEqual(adminDash.status, 200);
    assert.strictEqual(adminDash.body.ok, true);
    assert.ok(adminDash.body.today && adminDash.body.reports);
    console.log('✓ All Mobile API RBAC, Anti-Spoofing, and Admin Dashboard checks passed');

    // -------------------------------------------------------------
    // 4. SQLite Index Plan Verification (Sargable Range Query)
    // -------------------------------------------------------------
    console.log('\n--- 4. SQLite EXPLAIN QUERY PLAN for Dashboard Date Range ---');
    const plan = db.queryAll(
      "EXPLAIN QUERY PLAN SELECT id, total FROM orders WHERE created_at >= ? AND created_at < ?",
      ['2026-11-20', '2026-11-21']
    );
    const planStr = JSON.stringify(plan);
    assert.ok(planStr.includes('idx_orders_created_at'), `Expected idx_orders_created_at in query plan, got: ${planStr}`);
    console.log('✓ Dashboard date range query uses idx_orders_created_at:', plan.map(p => p.detail).join(' | '));

    // -------------------------------------------------------------
    // 5. CloudRelay Hardening (No Hardcoded Secrets)
    // -------------------------------------------------------------
    console.log('\n--- 5. CloudRelay Hardening ---');
    const CloudRelayClient = require('../electron/cloudRelay');
    const defaultClient = new CloudRelayClient(db);
    assert.strictEqual(defaultClient.relayToken, '', 'CloudRelay must not ship with hardcoded test token');
    assert.strictEqual(defaultClient.cafeCode, '', 'CloudRelay must not ship with hardcoded cafe code');
    assert.strictEqual(defaultClient.isConfigured(), false, 'Unconfigured CloudRelay must stay disabled');
    console.log('✓ CloudRelay has zero hardcoded secrets and fails closed when unconfigured');

    // -------------------------------------------------------------
    // 6. Updater Hardening (Strict Naming & Untrusted Dir Rejection)
    // -------------------------------------------------------------
    console.log('\n--- 6. Updater Hardening ---');
    const updaterSrc = fs.readFileSync(path.join(__dirname, '../electron/updater.js'), 'utf8');
    assert.ok(updaterSrc.includes('STRICT_PORTABLE_REGEX'), 'updater.js must enforce strict portable exe regex');
    assert.ok(updaterSrc.includes('untrustedSegments'), 'updater.js must block auto-spawning from Downloads/Temp/Desktop');
    console.log('✓ Updater strict filename & directory checks verified');

    console.log('\n====================================================');
    console.log('   ALL PHASE 1 SECURITY & INTEGRITY TESTS PASSED!   ');
    console.log('====================================================');
  } finally {
    server.close();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((err) => {
  console.error('❌ PHASE 1 TEST FAILED:', err);
  process.exit(1);
});
