const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

describe('🔒 Phase 2 Security Hardening: Server Vulnerability & Penetration Tests', () => {
  const testDbPath = path.join(__dirname, 'test-phase2-security.db');
  let db;
  let server;
  let serverInstance;
  const TEST_PORT = 3105;
  let targetTable;

  function makeRequest(urlPath, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, raw: data, json: parsed });
        });
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../electron/db');
    await db.init(testDbPath);

    // Create a test table with an explicit token
    targetTable = db.saveTable({
      name: 'طاولة أمنية 1',
      number: '101',
      hall: 'الصالون',
      capacity: 4,
      qr_enabled: 1,
      qr_token: 'SECRET_TOKEN_ABC_123'
    });

    server = require('../electron/server');
    const mockMainWindow = {
      isDestroyed: () => false,
      webContents: {
        send: () => {}
      }
    };

    serverInstance = server.startServer({
      db,
      mainWindow: mockMainWindow,
      port: TEST_PORT
    });
  });

  after(() => {
    if (server) server.stopServer();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('1. ADV-01: Order with missing token MUST be rejected with 403', async () => {
    const products = db.listProducts();
    const prod = products[0] || { id: 1, name: 'شاي', price: 15 };
    const payload = {
      tableId: targetTable.id,
      items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }]
    };
    const res = await makeRequest('/api/qr-order', 'POST', payload);
    assert.strictEqual(res.status, 403, `Expected 403 for missing token, got ${res.status}`);
  });

  test('2. ADV-02: Order with empty string token "" MUST be rejected with 403', async () => {
    const products = db.listProducts();
    const prod = products[0] || { id: 1, name: 'شاي', price: 15 };
    const payload = {
      tableId: targetTable.id,
      token: '',
      items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }]
    };
    const res = await makeRequest('/api/qr-order', 'POST', payload);
    assert.strictEqual(res.status, 403, `Expected 403 for empty token, got ${res.status}`);
  });

  test('3. ADV-03: Order with invalid/tampered token MUST be rejected with 403', async () => {
    const products = db.listProducts();
    const prod = products[0] || { id: 1, name: 'شاي', price: 15 };
    const payload = {
      tableId: targetTable.id,
      token: 'WRONG_TAMPERED_TOKEN',
      items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }]
    };
    const res = await makeRequest('/api/qr-order', 'POST', payload);
    assert.strictEqual(res.status, 403, `Expected 403 for invalid token, got ${res.status}`);
  });

  test('4. ADV-04: GET /api/table-cart with missing/empty token MUST be rejected with 403', async () => {
    const resMissing = await makeRequest(`/api/table-cart?tableId=${targetTable.id}`);
    assert.strictEqual(resMissing.status, 403, `Expected 403 for missing token in table-cart, got ${resMissing.status}`);

    const resEmpty = await makeRequest(`/api/table-cart?tableId=${targetTable.id}&token=`);
    assert.strictEqual(resEmpty.status, 403, `Expected 403 for empty token in table-cart, got ${resEmpty.status}`);
  });

  test('5. ADV-05: Order with spoofed waiterName in body MUST NOT bypass token check without valid waiter auth', async () => {
    const products = db.listProducts();
    const prod = products[0] || { id: 1, name: 'شاي', price: 15 };
    const spoofedPayload = {
      tableId: targetTable.id,
      waiterName: 'SpoofedCaptain',
      items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }]
    };
    const res = await makeRequest('/api/qr-order', 'POST', spoofedPayload);
    assert.strictEqual(res.status, 403, `Expected 403 when spoofing waiterName without waiter auth, got ${res.status}`);
  });

  test('6. ADV-06: Admin routes without admin session MUST return 401 or 403', async () => {
    const resToggle = await makeRequest('/api/table/toggle-qr', 'POST', { id: targetTable.id, enabled: false });
    assert([401, 403].includes(resToggle.status), `Expected 401/403 for unauthenticated toggle-qr, got ${resToggle.status}`);

    const resRegen = await makeRequest('/api/table/regenerate-token', 'POST', { id: targetTable.id });
    assert([401, 403].includes(resRegen.status), `Expected 401/403 for unauthenticated regenerate-token, got ${resRegen.status}`);

    const resResetAll = await makeRequest('/api/table/reset-all-tokens', 'POST', {});
    assert([401, 403].includes(resResetAll.status), `Expected 401/403 for unauthenticated reset-all-tokens, got ${resResetAll.status}`);
  });

  test('7. ADV-07: GET /api/qr-tables without admin session MUST return 401 or 403 and NOT leak tokens', async () => {
    const res = await makeRequest('/api/qr-tables');
    assert([401, 403].includes(res.status), `Expected 401/403 for unauthenticated qr-tables, got ${res.status}`);
    assert(!res.raw.includes('SECRET_TOKEN_ABC_123'), 'Secret table token must not be leaked in response');
  });

  test('8. ADV-08: Admin login with valid credentials yields token, and admin routes succeed with that token', async () => {
    // Phase 4: Default admin/1234 no longer exists. Setup a strong admin password first.
    const strongAdminPass = 'TestAdmin2026Secure!';
    if (typeof db.setupInitialAdmin === 'function') {
      db.setupInitialAdmin(strongAdminPass, 'مدير اختبار');
    }
    const loginRes = await makeRequest('/api/admin/login', 'POST', { password: strongAdminPass });
    assert.strictEqual(loginRes.status, 200, `Expected 200 for admin login, got ${loginRes.status}`);
    assert(loginRes.json?.token, 'Login response must contain a token');

    const adminToken = loginRes.json.token;
    const res = await makeRequest('/api/qr-tables', 'GET', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(res.status, 200, `Expected 200 for authenticated qr-tables, got ${res.status}`);
    assert(res.json?.success === true, 'Authenticated request must succeed');
  });

  test('9. ADV-09: Rate limiting on login and sensitive endpoints triggers 429', async () => {
    // Attempt 15 rapid failed logins from this IP
    let triggered429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await makeRequest('/api/admin/login', 'POST', { password: 'wrong_password_' + i });
      if (res.status === 429) {
        triggered429 = true;
        break;
      }
    }
    assert.strictEqual(triggered429, true, 'Rapid login failures must trigger 429 Rate Limit');
  });
});
