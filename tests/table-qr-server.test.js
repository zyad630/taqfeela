const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

describe('📱 Table QR Codes & Local Network Server Verification', () => {
  const testDbPath = path.join(__dirname, 'test-qr-tables.db');
  let db;
  let server;
  let serverInstance;
  let receivedIpcOrder = null;
  const TEST_PORT = 3099;

  function makeRequest(urlPath, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../electron/db');
    await db.init(testDbPath);
    db.setupInitialAdmin('AdminPassword2026!#', 'المدير العام');

    server = require('../electron/server');
    const mockMainWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          // Must match the channel electron/server.js sends on and electron/preload.js listens on
          if (channel === 'qr:new-order') {
            receivedIpcOrder = data;
          }
        }
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

  test('1. Local IP resolution returns a valid IPv4 string', () => {
    const ip = server.getLocalIp();
    assert(typeof ip === 'string', 'IP must be string');
    assert(/^(\d{1,3}\.){3}\d{1,3}$/.test(ip), `Invalid IPv4 format: ${ip}`);
  });

  test('2. GET /api/menu returns categories and products', async () => {
    const res = await makeRequest('/api/menu');
    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.data);
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.categories) && data.categories.length > 0, 'Must have categories');
    assert(Array.isArray(data.products) && data.products.length > 0, 'Must have products');
  });

  test('3. GET /api/qr-tables requires admin authentication and generates base64 QR codes for each table when authenticated', async () => {
    // Unauthenticated access must be rejected
    const unauthRes = await makeRequest('/api/qr-tables');
    assert([401, 403].includes(unauthRes.status), `Expected 401 or 403 for unauthenticated access, got ${unauthRes.status}`);

    // Authenticate as admin
    const loginRes = await makeRequest('/api/admin/login', 'POST', { password: 'AdminPassword2026!#' });
    assert.strictEqual(loginRes.status, 200, 'Admin login must succeed');
    const loginData = JSON.parse(loginRes.data);
    assert(loginData.token, 'Admin login must return a session token');

    // Authenticated request
    const res = await makeRequest('/api/qr-tables', 'GET', null, {
      'Authorization': `Bearer ${loginData.token}`
    });
    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.data);
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.tables) && data.tables.length > 0, 'Must have tables with QR');
    const firstTable = data.tables[0];
    assert(firstTable.qrCode.startsWith('data:image/png;base64,'), 'QR code must be a base64 PNG data URL');
    assert(firstTable.url.includes(`/menu?table=`), 'URL must link to the table menu');
  });

  test('4. GET /qr-tables serves printable HTML page for all tables', async () => {
    const res = await makeRequest('/qr-tables');
    assert.strictEqual(res.status, 200);
    assert(res.data.includes('طباعة بطاقات QR للطاولات') || res.data.includes('qr-card'), 'Must contain printable QR cards');
    assert(res.data.includes('window.print()'), 'Must have print action');
  });

  test('5. GET /menu?table=1 serves customer mobile menu web app', async () => {
    const res = await makeRequest('/menu?table=1');
    assert.strictEqual(res.status, 200);
    assert(res.data.includes('قائمة الطلبات') || res.data.includes('cart-bar'), 'Must contain mobile menu web app HTML');
  });

  test('6. POST /api/qr-order forwards items to cashier window via IPC', async () => {
    const tables = db.listTables();
    const targetTable = tables[0];
    const products = db.listProducts();
    const targetProduct = products[0];

    const orderPayload = {
      table: String(targetTable.number || targetTable.id),
      tableId: targetTable.id,
      token: targetTable.qr_token || '',
      customerName: 'عميل طاولة QR',
      items: [
        {
          id: targetProduct.id,
          name: targetProduct.name,
          qty: 2,
          price: targetProduct.price,
          notes: 'سكر زيادة'
        }
      ],
      notes: 'طلب من الموبايل'
    };

    const res = await makeRequest('/api/qr-order', 'POST', orderPayload);
    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.data);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.tableName, targetTable.name);

    assert(receivedIpcOrder !== null, 'IPC event must be received');
    assert.strictEqual(receivedIpcOrder.tableName, targetTable.name);
    assert.strictEqual(receivedIpcOrder.items.length, 1);
    assert.strictEqual(receivedIpcOrder.items[0].name, targetProduct.name);
    assert.strictEqual(receivedIpcOrder.items[0].qty, 2);
  });
});
