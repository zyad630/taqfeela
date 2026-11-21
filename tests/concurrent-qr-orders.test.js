const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

describe('⚡ Concurrent QR Orders Verification (محمد & زياد - طاولة 5)', () => {
  const testDbPath = path.join(__dirname, 'test-concurrent-qr-orders.db');
  let db;
  let server;
  let serverInstance;
  const receivedIpcOrders = [];
  const TEST_PORT = 3105;

  function makeRequest(urlPath, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method,
        headers: { 'Content-Type': 'application/json' }
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

  let tableMohamed = null;
  let tableZiad = null;
  let prodA = null;
  let prodB = null;

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../electron/db');
    await db.init(testDbPath);

    // Setup Sections: "محمد" and "زياد"
    db.saveSection('محمد');
    db.saveSection('زياد');

    // Create table 5 in section "محمد"
    tableMohamed = db.saveTable({
      number: '5',
      name: 'طاولة 5 (محمد)',
      hall: 'محمد',
      capacity: 4
    });

    // Create table 5 in section "زياد"
    tableZiad = db.saveTable({
      number: '5',
      name: 'طاولة 5 (زياد)',
      hall: 'زياد',
      capacity: 6
    });

    // Verify both exist with distinct IDs
    assert.ok(tableMohamed.id, 'Table Mohamed must have an ID');
    assert.ok(tableZiad.id, 'Table Ziad must have an ID');
    assert.notStrictEqual(tableMohamed.id, tableZiad.id, 'IDs must be distinct');

    const prods = db.listProducts();
    prodA = prods[0];
    prodB = prods[1];

    server = require('../electron/server');
    const mockMainWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          if (channel === 'qr-order-received') {
            receivedIpcOrders.push(data);
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

  test('Concurrent submission: Two distinct sections with same table number 5', async () => {
    const payload1 = {
      tableId: tableMohamed.id,
      hall: 'محمد',
      customerName: 'عميل محمد',
      items: [
        { id: prodA.id, name: prodA.name, qty: 2, price: prodA.price, notes: 'خاص بمحمد' }
      ],
      clientOrderId: 'ORD-MOHAMED-' + Date.now()
    };

    const payload2 = {
      tableId: tableZiad.id,
      hall: 'زياد',
      customerName: 'عميل زياد',
      items: [
        { id: prodB.id, name: prodB.name, qty: 3, price: prodB.price, notes: 'خاص بزياد' }
      ],
      clientOrderId: 'ORD-ZIAD-' + Date.now()
    };

    // Send both orders at the EXACT same moment via Promise.all
    const [res1, res2] = await Promise.all([
      makeRequest('/api/qr-order', 'POST', payload1),
      makeRequest('/api/qr-order', 'POST', payload2)
    ]);

    assert.strictEqual(res1.status, 200, 'Order 1 must succeed with 200');
    assert.strictEqual(res2.status, 200, 'Order 2 must succeed with 200');

    const data1 = JSON.parse(res1.data);
    const data2 = JSON.parse(res2.data);
    assert.strictEqual(data1.success, true);
    assert.strictEqual(data2.success, true);

    // (أ) التأكد أن كل طاولة سلتها فيها أصنافها هي بس
    const carts = db.getTableCarts();
    const cartMohamed = carts[tableMohamed.id] || {};
    const cartZiad = carts[tableZiad.id] || {};

    const itemsMohamed = cartMohamed.cart || cartMohamed.items || [];
    const itemsZiad = cartZiad.cart || cartZiad.items || [];

    assert.strictEqual(itemsMohamed.length, 1, 'سلة طاولة محمد يجب أن تحتوي على صنف واحد فقط');
    assert.strictEqual(Number(itemsMohamed[0].id), prodA.id, 'صنف سلة محمد يجب أن يكون الصنف A');
    assert.strictEqual(Number(itemsMohamed[0].qty), 2, 'كمية صنف محمد يجب أن تكون 2');

    assert.strictEqual(itemsZiad.length, 1, 'سلة طاولة زياد يجب أن تحتوي على صنف واحد فقط');
    assert.strictEqual(Number(itemsZiad[0].id), prodB.id, 'صنف سلة زياد يجب أن يكون الصنف B');
    assert.strictEqual(Number(itemsZiad[0].qty), 3, 'كمية صنف زياد يجب أن تكون 3');

    // (ب) التأكد أن الحدث qr-order-received اتبعت مرتين بالضبط، مرة لكل tableId
    assert.strictEqual(receivedIpcOrders.length, 2, 'الحدث qr-order-received يجب أن يُرسل مرتين بالضبط');
    const receivedIds = receivedIpcOrders.map(o => Number(o.tableId)).sort((a, b) => a - b);
    const expectedIds = [Number(tableMohamed.id), Number(tableZiad.id)].sort((a, b) => a - b);
    assert.deepStrictEqual(receivedIds, expectedIds, 'الحدث تم إرساله مرة لكل طاولة بالضبط');

    // (ج) التأكد أن /api/tables بيرجع الطاولتين occupied
    const tablesRes = await makeRequest('/api/tables');
    assert.strictEqual(tablesRes.status, 200);
    const tablesData = JSON.parse(tablesRes.data);
    assert.strictEqual(tablesData.success, true);

    const tblMohamedLive = tablesData.tables.find(t => Number(t.id) === Number(tableMohamed.id));
    const tblZiadLive = tablesData.tables.find(t => Number(t.id) === Number(tableZiad.id));

    assert.ok(tblMohamedLive, 'طاولة محمد يجب أن تكون موجودة في /api/tables');
    assert.ok(tblZiadLive, 'طاولة زياد يجب أن تكون موجودة في /api/tables');

    assert.strictEqual(tblMohamedLive.status, 'occupied', 'طاولة محمد يجب أن تكون occupied');
    assert.strictEqual(tblZiadLive.status, 'occupied', 'طاولة زياد يجب أن تكون occupied');
  });
});
