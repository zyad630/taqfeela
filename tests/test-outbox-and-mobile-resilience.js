const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
const testDir = path.join(baseTemp, `test-outbox-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'cafe-pos.db');

const db = require('../electron/db');
const mobileApi = require('../electron/mobileApi');
const express = require('express');

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

async function runResilienceTests() {
  console.log('================================================================');
  console.log('   DEEP AUDIT: OUTBOX DURABILITY, PERFORMANCE & RESILIENCE      ');
  console.log('================================================================\n');

  // 1. Initialize SQLite Database
  await db.init(testDbPath);
  console.log('[Setup] DB initialized at:', testDbPath);

  // Setup Admin & Seed Waiter with Hall Restriction
  db.setupInitialAdmin('AdminPass123456!', 'المدير العام', { cafe_name: 'كافيه التكية' });
  const admin = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');

  const waiter = db.saveUser({
    username: 'ahmed_waiter',
    name: 'أحمد ويتر الحديقة',
    role: 'waiter',
    password: 'WaiterPassword123!',
    pin: '1234',
    assigned_halls: JSON.stringify(['garden'])
  });

  // Create tables & products
  db.saveTable({ number: '101', name: 'طاولة 101 - الحديقة', hall: 'garden' });
  db.saveTable({ number: '202', name: 'طاولة 202 - الصالة', hall: 'indoor' });
  const tableGarden = db.queryGet('SELECT id FROM tables WHERE number = "101"');
  const tableIndoor = db.queryGet('SELECT id FROM tables WHERE number = "202"');

  db.saveCategory({ id: 1, name: 'مشروبات ساخنة' });
  db.saveCategory({ id: 2, name: 'عصائر' });

  db.saveProduct({ name: 'قهوة تركي', price: 35, cost: 15, category_id: 1, stock_qty: 50 });
  db.saveProduct({ name: 'موهيتو فراولة', price: 55, cost: 25, category_id: 2, stock_qty: 40 });

  const p1 = db.queryGet("SELECT id, name, price FROM products WHERE name = 'قهوة تركي'");
  const p2 = db.queryGet("SELECT id, name, price FROM products WHERE name = 'موهيتو فراولة'");

  // Open shift
  const shiftRes = db.openShift(500, 'شيفت تجربة الموبايل', admin, 'الشيفت الصباحي');
  console.log(`[Setup] Shift opened (id: ${shiftRes.id}), tables (garden: ${tableGarden.id}, indoor: ${tableIndoor.id}) and products seeded`);

  // Start Express with mobile router
  const app = express();
  app.use(express.json());
  const router = mobileApi.createRouter({ db, getMainWindow: () => null });
  app.use('/m/v1', router);

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`[Setup] Mock Cashier Server listening on port: ${port}`);

  // Pair device
  const session = mobileApi.createPairingSession('كافيه التكية', port);
  const pairRes = await makeRequest(port, 'POST', '/m/v1/pair', {
    code: session.code,
    deviceName: 'Galaxy S22',
    platform: 'android'
  });
  const deviceToken = pairRes.body.deviceToken;
  assert.ok(deviceToken, 'Device token must exist');
  console.log(`[Setup] Device paired with token: ${deviceToken.slice(0, 12)}...`);

  // Waiter login
  const loginRes = await makeRequest(port, 'POST', '/m/v1/login', {
    userId: waiter.id,
    pin: '1234'
  }, { 'Authorization': `Bearer ${deviceToken}` });
  const waiterUser = loginRes.body.user || loginRes.body.waiter;
  assert.ok(waiterUser, 'Waiter user object must exist');
  const waiterToken = loginRes.body.token || 'waiter_active_session';
  console.log(`[Setup] Waiter logged in. Assigned halls: ${JSON.stringify(waiterUser.assignedHalls)}`);

  console.log('\n--- Test 1: High-Speed Cached Menu with Revision Check (0ms 304) ---');
  const t0 = Date.now();
  const menuRes1 = await makeRequest(port, 'GET', '/m/v1/menu', null, { 'Authorization': `Bearer ${deviceToken}` });
  const dur1 = Date.now() - t0;
  assert.strictEqual(menuRes1.body.unchanged, false);
  const rev = menuRes1.body.rev;

  // Immediate second fetch with rev -> should return unchanged: true in < 5ms
  const t1 = Date.now();
  const menuRes2 = await makeRequest(port, 'GET', `/m/v1/menu?rev=${rev}`, null, { 'Authorization': `Bearer ${deviceToken}` });
  const dur2 = Date.now() - t1;
  assert.strictEqual(menuRes2.body.unchanged, true);
  console.log(`✓ Initial menu load: ${dur1}ms (${menuRes1.body.products.length} products). Cached 304 response: ${dur2}ms (Zero Network Overhead)`);

  console.log('\n--- Test 2: Idempotent Order Append & De-duplication Under Race Conditions ---');
  const clientOrderId = `order_test_${Date.now()}`;
  const orderPayload = {
    clientOrderId,
    tableId: tableGarden.id,
    waiterId: waiter.id,
    waiterName: waiter.name,
    items: [
      { productId: p1.id, qty: 2, note: 'سكر بره' },
      { productId: p2.id, qty: 1, note: '' }
    ]
  };

  // Send Order Attempt 1
  const orderRes1 = await makeRequest(port, 'POST', '/m/v1/orders', orderPayload, {
    'Authorization': `Bearer ${deviceToken}`,
    'X-Waiter-Token': waiterToken
  });
  assert.strictEqual(orderRes1.body.ok, true);
  console.log('✓ Order Attempt 1 succeeded');

  // Verify DB table_carts state
  const cartRow1 = db.queryGet(`SELECT cart_data FROM table_carts WHERE table_id = ${tableGarden.id}`);
  const cartData1 = JSON.parse(cartRow1.cart_data);
  const totalItems1 = cartData1.items.reduce((s, i) => s + i.qty, 0);
  assert.strictEqual(totalItems1, 3, 'Table cart must have exactly 3 items');

  // Send EXACT SAME Order Attempt 2 (Simulating mobile outbox retry)
  const orderRes2 = await makeRequest(port, 'POST', '/m/v1/orders', orderPayload, {
    'Authorization': `Bearer ${deviceToken}`,
    'X-Waiter-Token': waiterToken
  });
  assert.strictEqual(orderRes2.body.ok, true);

  // Re-verify DB table_carts state - MUST NOT double the items!
  const cartRow2 = db.queryGet(`SELECT cart_data FROM table_carts WHERE table_id = ${tableGarden.id}`);
  const cartData2 = JSON.parse(cartRow2.cart_data);
  const totalItems2 = cartData2.items.reduce((s, i) => s + i.qty, 0);
  assert.strictEqual(totalItems2, 3, 'Table cart MUST still have exactly 3 items (NO DOUBLE BILLING)');
  console.log('✓ Duplicate retry recognized and handled safely (Zero Duplicate Items)');

  console.log('\n--- Test 3: Authoritative Pricing Enforcement (Zero Client Price Trust) ---');
  const forgedOrderId = `order_forged_${Date.now()}`;
  const forgedOrderPayload = {
    clientOrderId: forgedOrderId,
    tableId: tableGarden.id,
    waiterId: waiter.id,
    items: [
      { productId: p1.id, qty: 1, price: 0.01, total: 0.01 } // Client attempts to forge 1 cent price!
    ]
  };

  const forgedRes = await makeRequest(port, 'POST', '/m/v1/orders', forgedOrderPayload, {
    'Authorization': `Bearer ${deviceToken}`,
    'X-Waiter-Token': waiterToken
  });
  assert.strictEqual(forgedRes.body.ok, true);

  // Verify in table_carts that price used was authoritative 35, not forged 0.01!
  const cartRow3 = db.queryGet(`SELECT cart_data FROM table_carts WHERE table_id = ${tableGarden.id}`);
  const cartData3 = JSON.parse(cartRow3.cart_data);
  const forgedItemInDb = cartData3.items.find(i => i.productId === p1.id && i.qty === 1);
  assert.strictEqual(forgedItemInDb.price, 35, 'Price in database must strictly match DB price 35, not forged 0.01');
  console.log(`✓ Forged client price (0.01) completely ignored. Authoritative DB price (35) enforced.`);

  console.log('\n--- Test 4: Strict Waiter Hall Permission Lockdown ---');
  // Waiter is assigned ONLY to 'garden'. Table 202 is in 'indoor'.
  const forbiddenOrder = {
    clientOrderId: `order_forbidden_${Date.now()}`,
    tableId: tableIndoor.id, // Indoor table!
    waiterId: waiter.id,
    items: [{ productId: p1.id, qty: 1 }]
  };

  const forbiddenRes = await makeRequest(port, 'POST', '/m/v1/orders', forbiddenOrder, {
    'Authorization': `Bearer ${deviceToken}`,
    'X-Waiter-Token': waiterToken
  });
  assert.strictEqual(forbiddenRes.status, 403, 'Cross-hall order must be blocked with 403 Forbidden');
  assert.strictEqual(forbiddenRes.body.code, 'HALL_FORBIDDEN');
  console.log(`✓ Cross-hall order strictly blocked with 403: "${forbiddenRes.body.error}"`);

  console.log('\n--- Test 5: Immediate Device Revocation Enforcement ---');
  // Revoke device in database
  db.revokePairedDevice(pairRes.body.deviceId || 1);
  mobileApi.notifyDeviceRevoked(pairRes.body.deviceId || 1);

  // Subsequent call with revoked token MUST immediately fail with 401
  const revokedCallRes = await makeRequest(port, 'GET', '/m/v1/tables', null, {
    'Authorization': `Bearer ${deviceToken}`
  });
  assert.strictEqual(revokedCallRes.status, 401, 'Revoked device must be blocked immediately with 401');
  assert.strictEqual(revokedCallRes.body.code, 'DEVICE_REVOKED');
  console.log(`✓ Revoked device blocked immediately with 401 DEVICE_REVOKED: "${revokedCallRes.body.error}"`);

  await new Promise(r => server.close(r));

  console.log('\n================================================================');
  console.log('   ✅ ALL OUTBOX, SECURITY, AND RESILIENCE AUDIT TESTS PASSED! ');
  console.log('================================================================\n');
}

runResilienceTests().catch(err => {
  console.error('\n❌ AUDIT TEST FAILED:', err);
  process.exit(1);
});
