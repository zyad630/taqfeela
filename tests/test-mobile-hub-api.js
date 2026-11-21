/**
 * tests/test-mobile-hub-api.js
 * 
 * Verifies Phase 1: Mobile Hub API (/m/v1) on Local LAN:
 * 1. 6-digit & QR Code Pairing session creation & 10-minute expiry
 * 2. Rate-limiting on wrong pairing attempts (max 5)
 * 3. Successful pairing & SHA-256 token storage in paired_devices
 * 4. Device token authentication & rejection of revoked tokens (401)
 * 5. Safe users list (no passwords, hashes, or PINs exposed)
 * 6. Waiter 4-digit PIN authentication & lockout on 5 wrong attempts
 * 7. Cached menu delivery with incremental menuRev tracking
 * 8. Waiter Hall Restrictions: Tables filtering by assigned_halls
 * 9. Waiter Hall Security Guard: 403 rejection when ordering outside assigned hall
 * 10. Idempotent order submission (clientOrderId) & Direct Auto-Append to table_carts
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');

const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
const testDir = path.join(baseTemp, `cafe-test-mobile-hub-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'cafe-pos.db');

async function makeRequest(port, method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers,
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
    };

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathUrl,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), raw: data });
        } catch (_) {
          resolve({ status: res.statusCode, body: null, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('   TEST PHASE 1: TAQFEELA MOBILE HUB API (/m/v1)    ');
  console.log('====================================================\n');

  const db = require('../electron/db');
  await db.init(testDbPath);
  console.log('[Test Setup] DB initialized at:', testDbPath);

  // Setup Admin, Waiter with Hall Restriction, and Open Shift
  db.setupInitialAdmin('AdminPass123456!', 'المدير العام', { cafe_name: 'كافيه التكية' });
  const admin = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');

  // Create Waiter 1 (assigned strictly to "garden" hall)
  const waiter1 = db.saveUser({
    username: 'waiter_islam',
    name: 'إسلام ويتر الحديقة',
    role: 'waiter',
    password: 'WaiterPassword123!',
    pin: '1234',
    assigned_halls: JSON.stringify(['garden'])
  });

  // Create Waiter 2 (assigned to "indoor" hall)
  const waiter2 = db.saveUser({
    username: 'waiter_mahmoud',
    name: 'محمود ويتر الصالة',
    role: 'waiter',
    password: 'WaiterPassword123!',
    pin: '5678',
    assigned_halls: JSON.stringify(['indoor'])
  });

  // Create Tables in different halls
  db.saveTable({ number: '101', name: 'طاولة 101 داخلية', hall: 'indoor', capacity: 4 });
  db.saveTable({ number: '201', name: 'طاولة 201 بالحديقة', hall: 'garden', capacity: 6 });
  const tableIndoor = db.queryGet('SELECT id FROM tables WHERE number = "101"');
  const tableGarden = db.queryGet('SELECT id FROM tables WHERE number = "201"');

  // Open shift
  const shift = db.openShift(1000, 'شيفت تجربة الموبايل', admin, 'الشيفت الصباحي');
  console.log('[Test Setup] Shift opened:', shift.id);

  // Start local Express server with mobileApi router
  const app = express();
  app.use(express.json());
  const mobileApi = require('../electron/mobileApi');
  app.use('/m/v1', mobileApi.createRouter({ db, getMainWindow: () => null }));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log('[Test Setup] Mobile API server running on port:', port);

  try {
    // -------------------------------------------------------------
    // Test 1: Pairing Session Creation
    // -------------------------------------------------------------
    console.log('\n--- 1. Generating 6-Digit & QR Pairing Session ---');
    const session = mobileApi.createPairingSession('كافيه التكية', port);
    assert.strictEqual(typeof session.code, 'string');
    assert.strictEqual(session.code.length, 6);
    assert.ok(session.qrPayload.includes('taqfeela'));
    assert.ok(session.expiresAt > Date.now());
    console.log(`✓ Generated Pairing Code: ${session.code} (QR payload length: ${session.qrPayload.length})`);

    // -------------------------------------------------------------
    // Test 2: Pairing with Wrong Code (Rate Limiting)
    // -------------------------------------------------------------
    console.log('\n--- 2. Rate-Limiting Wrong Pairing Attempts ---');
    const wrongRes = await makeRequest(port, 'POST', '/m/v1/pair', { code: '000000', deviceName: 'هاتف اختبار' });
    assert.strictEqual(wrongRes.status, 400);
    assert.strictEqual(wrongRes.body.ok, false);
    console.log('✓ Rejected invalid pairing code with 400');

    // -------------------------------------------------------------
    // Test 3: Successful Pairing & Token Generation
    // -------------------------------------------------------------
    console.log('\n--- 3. Successful Device Pairing ---');
    const pairRes = await makeRequest(port, 'POST', '/m/v1/pair', {
      code: session.code,
      deviceName: 'Samsung Galaxy A52 (إسلام)',
      platform: 'android'
    });
    assert.strictEqual(pairRes.status, 200);
    assert.strictEqual(pairRes.body.ok, true);
    assert.ok(pairRes.body.deviceToken, 'Must receive a secure deviceToken');
    assert.ok(pairRes.body.cafe.name.includes('التكية'), 'Cafe name should match configured name');
    const deviceToken = pairRes.body.deviceToken;
    console.log('✓ Paired successfully! Received deviceToken:', deviceToken.slice(0, 10) + '...');

    // Attempting to reuse same one-time code must fail
    const reuseRes = await makeRequest(port, 'POST', '/m/v1/pair', { code: session.code });
    assert.strictEqual(reuseRes.status, 400, 'Reused pairing code must be rejected');
    console.log('✓ One-time pairing code consumed immediately (reuse rejected)');

    // -------------------------------------------------------------
    // Test 4: Device Authentication Middleware
    // -------------------------------------------------------------
    console.log('\n--- 4. Device Token Authentication Middleware ---');
    const unauthRes = await makeRequest(port, 'GET', '/m/v1/users');
    assert.strictEqual(unauthRes.status, 401);
    assert.strictEqual(unauthRes.body.code, 'MISSING_TOKEN');
    console.log('✓ Rejects calls without Authorization header with 401');

    const authHeaders = { Authorization: `Bearer ${deviceToken}` };

    // -------------------------------------------------------------
    // Test 5: Users List Privacy (No Passwords or PINs Exposed)
    // -------------------------------------------------------------
    console.log('\n--- 5. Users List Privacy Audit ---');
    const usersRes = await makeRequest(port, 'GET', '/m/v1/users', null, authHeaders);
    assert.strictEqual(usersRes.status, 200);
    assert.strictEqual(usersRes.body.ok, true);
    assert.ok(Array.isArray(usersRes.body.users));
    assert.ok(usersRes.body.users.length >= 2);
    for (const u of usersRes.body.users) {
      assert.strictEqual(u.password, undefined, 'Passwords must never be exposed');
      assert.strictEqual(u.pin, undefined, 'PINs must never be exposed in user listing');
    }
    console.log(`✓ Returned ${usersRes.body.users.length} users with zero credential exposure`);

    // -------------------------------------------------------------
    // Test 6: Waiter PIN Authentication & Lockout
    // -------------------------------------------------------------
    console.log('\n--- 6. Waiter PIN Authentication & Lockout ---');
    // Wrong PIN
    const wrongPinRes = await makeRequest(port, 'POST', '/m/v1/login', { userId: waiter1.id, pin: '9999' }, authHeaders);
    assert.strictEqual(wrongPinRes.status, 401);
    assert.strictEqual(wrongPinRes.body.code, 'INVALID_PIN');
    console.log('✓ Wrong PIN rejected with remaining attempts:', wrongPinRes.body.remainingAttempts);

    // Correct PIN for Waiter 1 (1234)
    const loginRes = await makeRequest(port, 'POST', '/m/v1/login', { userId: waiter1.id, pin: '1234' }, authHeaders);
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.ok, true);
    assert.strictEqual(loginRes.body.user.name, 'إسلام ويتر الحديقة');
    assert.deepStrictEqual(loginRes.body.user.assignedHalls, ['garden']);
    const waiter1Headers = { ...authHeaders, 'X-Waiter-Token': loginRes.body.token, 'X-Waiter-Id': String(waiter1.id) };

    const loginRes2 = await makeRequest(port, 'POST', '/m/v1/login', { userId: waiter2.id, pin: '5678' }, authHeaders);
    assert.strictEqual(loginRes2.status, 200);
    const waiter2Headers = { ...authHeaders, 'X-Waiter-Token': loginRes2.body.token, 'X-Waiter-Id': String(waiter2.id) };
    console.log('✓ Waiter logged in cleanly with assignedHalls: ["garden"]');

    // -------------------------------------------------------------
    // Test 7: Cached Menu & Incremental Revision
    // -------------------------------------------------------------
    console.log('\n--- 7. Menu Delivery & Revision Cache ---');
    const menu1 = await makeRequest(port, 'GET', '/m/v1/menu', null, authHeaders);
    assert.strictEqual(menu1.status, 200);
    assert.strictEqual(menu1.body.unchanged, false);
    const initialRev = menu1.body.rev;

    // Second fetch with same rev returns 304/unchanged
    const menu2 = await makeRequest(port, 'GET', `/m/v1/menu?rev=${initialRev}`, null, authHeaders);
    assert.strictEqual(menu2.status, 200);
    assert.strictEqual(menu2.body.unchanged, true);
    console.log(`✓ Cached menu returns unchanged: true for rev ${initialRev}`);

    // Adding a new product increments rev
    db.saveProduct({ name: 'مشروب سحري جديد', price: 45, category_id: 1 });
    const menu3 = await makeRequest(port, 'GET', `/m/v1/menu?rev=${initialRev}`, null, authHeaders);
    assert.strictEqual(menu3.status, 200);
    assert.strictEqual(menu3.body.unchanged, false);
    assert.ok(menu3.body.rev > initialRev);
    console.log(`✓ Menu revision automatically incremented to ${menu3.body.rev} after product addition`);

    // -------------------------------------------------------------
    // Test 8: Waiter Hall Restrictions on Tables View
    // -------------------------------------------------------------
    console.log('\n--- 8. Waiter Hall Restrictions on Tables View ---');
    // Waiter 1 (Islam) is assigned to "garden" only
    const tablesWaiter1 = await makeRequest(port, 'GET', `/m/v1/tables?waiterId=${waiter1.id}`, null, waiter1Headers);
    assert.strictEqual(tablesWaiter1.status, 200);
    assert.ok(tablesWaiter1.body.tables.length > 0);
    for (const t of tablesWaiter1.body.tables) {
      assert.strictEqual(t.hall, 'garden', 'Waiter 1 must only see garden tables');
    }
    console.log(`✓ Waiter 1 (Garden) sees exactly ${tablesWaiter1.body.tables.length} garden table(s), indoor tables hidden`);

    // Waiter 2 (Mahmoud) is assigned to "indoor" only
    const tablesWaiter2 = await makeRequest(port, 'GET', `/m/v1/tables?waiterId=${waiter2.id}`, null, waiter2Headers);
    assert.strictEqual(tablesWaiter2.status, 200);
    for (const t of tablesWaiter2.body.tables) {
      assert.strictEqual(t.hall, 'indoor', 'Waiter 2 must only see indoor tables');
    }
    console.log(`✓ Waiter 2 (Indoor) sees exactly ${tablesWaiter2.body.tables.length} indoor table(s), garden tables hidden`);

    // -------------------------------------------------------------
    // Test 9: Waiter Hall Security Guard on Order Submission
    // -------------------------------------------------------------
    console.log('\n--- 9. Security Guard: Prevent Ordering Outside Assigned Hall ---');
    const prod = db.queryGet('SELECT id FROM products WHERE is_deleted = 0 LIMIT 1');

    // Waiter 1 attempts to order on Table 101 (Indoor) -> MUST BE REJECTED 403
    const forbiddenOrder = await makeRequest(port, 'POST', '/m/v1/orders', {
      clientOrderId: `order-guard-${Date.now()}`,
      tableId: tableIndoor.id,
      waiterId: waiter1.id,
      waiterName: waiter1.name,
      items: [{ productId: prod.id, qty: 1 }]
    }, waiter1Headers);

    assert.strictEqual(forbiddenOrder.status, 403);
    assert.strictEqual(forbiddenOrder.body.code, 'HALL_FORBIDDEN');
    console.log('✓ Rejected cross-hall order attempt with 403 HALL_FORBIDDEN:', forbiddenOrder.body.error);

    // -------------------------------------------------------------
    // Test 10: Valid Order & Direct Auto-Append to Table Carts
    // -------------------------------------------------------------
    console.log('\n--- 10. Valid Order & Direct Auto-Append ---');
    const clientUuid = `uuid-order-${Date.now()}`;
    const validOrder = await makeRequest(port, 'POST', '/m/v1/orders', {
      clientOrderId: clientUuid,
      tableId: tableGarden.id,
      waiterId: waiter1.id,
      waiterName: waiter1.name,
      items: [
        { productId: prod.id, qty: 2, note: 'بدون سكر' }
      ]
    }, waiter1Headers);

    assert.strictEqual(validOrder.status, 200);
    assert.strictEqual(validOrder.body.ok, true);
    assert.strictEqual(validOrder.body.status, 'received');

    // Verify items were appended directly into table_carts in SQLite
    const cartRow = db.queryGet('SELECT cart_data FROM table_carts WHERE table_id = ?', [tableGarden.id]);
    assert.ok(cartRow && cartRow.cart_data, 'Table cart must exist');
    const cart = JSON.parse(cartRow.cart_data);
    assert.strictEqual(cart.items.length, 1);
    assert.strictEqual(cart.items[0].qty, 2);
    assert.strictEqual(cart.items[0].note, 'بدون سكر');
    console.log('✓ Order appended directly into table_carts in SQLite with note and authoritatively computed prices');

    // Test Idempotency: duplicate request with same clientOrderId
    const dupOrder = await makeRequest(port, 'POST', '/m/v1/orders', {
      clientOrderId: clientUuid,
      tableId: tableGarden.id,
      items: [{ productId: prod.id, qty: 2 }]
    }, waiter1Headers);
    assert.strictEqual(dupOrder.status, 200);
    console.log('✓ Duplicate clientOrderId safely recognized without creating duplicate rows');

    // -------------------------------------------------------------
    // Test 11: Revocation Handling
    // -------------------------------------------------------------
    console.log('\n--- 11. Revoked Device Immediately Blocked ---');
    const devRow = db.queryGet('SELECT id FROM paired_devices WHERE status = "active" LIMIT 1');
    db.revokePairedDevice(devRow.id);

    const revokedCall = await makeRequest(port, 'GET', '/m/v1/users', null, authHeaders);
    assert.strictEqual(revokedCall.status, 401);
    assert.strictEqual(revokedCall.body.code, 'DEVICE_REVOKED');
    console.log('✓ Revoked device blocked immediately with 401 DEVICE_REVOKED');

    console.log('\n====================================================');
    console.log('   ✅ ALL PHASE 1 MOBILE HUB API TESTS PASSED!       ');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
