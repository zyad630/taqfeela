const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

describe('📡 QR Order IPC Channel & Pending Queue Verification (Round 5)', () => {
  const testDbPath = path.join(__dirname, 'test-qr-channel.db');
  let db;
  let server;
  const TEST_PORT = 3198;

  let sentEvents = [];
  let isWindowLoading = false;

  const mockMainWindow = {
    isDestroyed: () => false,
    webContents: {
      isLoading: () => isWindowLoading,
      send: (channel, data) => {
        sentEvents.push({ channel, data });
      }
    }
  };

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

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../electron/db');
    await db.init(testDbPath);

    server = require('../electron/server');
    server.startServer({
      db,
      mainWindow: mockMainWindow,
      port: TEST_PORT
    });
  });

  after(() => {
    if (server) server.stopServer();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('1. Server sends event exactly on "qr-order-received" channel when window is ready', async () => {
    sentEvents = [];
    isWindowLoading = false;

    const tables = db.listTables();
    const targetTable = tables[0];
    const products = db.listProducts();
    const targetProduct = products[0];

    const orderPayload = {
      table: String(targetTable.number || targetTable.id),
      tableId: targetTable.id,
      customerName: 'عميل اختبار القناة',
      items: [
        {
          id: targetProduct.id,
          name: targetProduct.name,
          qty: 1,
          price: targetProduct.price,
          notes: ''
        }
      ],
      clientOrderId: 'test-chan-1',
      notes: 'فحص القناة'
    };

    const res = await makeRequest('/api/qr-order', 'POST', orderPayload);
    assert.strictEqual(res.status, 200);
    const data = JSON.parse(res.data);
    assert.strictEqual(data.success, true);

    // Verify exact channel name
    assert.strictEqual(sentEvents.length, 1, 'Exactly one IPC event should be sent');
    assert.strictEqual(sentEvents[0].channel, 'qr-order-received', 'Channel must be exactly "qr-order-received"');
    assert.notStrictEqual(sentEvents[0].channel, 'new-qr-order', 'Channel must NOT be "new-qr-order"');
    assert.strictEqual(sentEvents[0].data.tableName, targetTable.name);
  });

  test('2. When window is loading / not ready, event is queued and sent on flushPendingQrOrders', async () => {
    sentEvents = [];
    isWindowLoading = true; // window is loading

    const tables = db.listTables();
    const targetTable = tables[0];
    const products = db.listProducts();
    const targetProduct = products[0];

    const orderPayload = {
      table: String(targetTable.number || targetTable.id),
      tableId: targetTable.id,
      customerName: 'عميل أثناء التحميل',
      items: [
        {
          id: targetProduct.id,
          name: targetProduct.name,
          qty: 2,
          price: targetProduct.price,
          notes: ''
        }
      ],
      clientOrderId: 'test-chan-2',
      notes: 'انتظار النافذة'
    };

    const res = await makeRequest('/api/qr-order', 'POST', orderPayload);
    assert.strictEqual(res.status, 200);

    // Should NOT have sent yet because window is loading
    assert.strictEqual(sentEvents.length, 0, 'No event should be sent while window is loading');

    // Now window finishes loading
    isWindowLoading = false;
    server.flushPendingQrOrders();

    // Now event should have been flushed on 'qr-order-received'
    assert.strictEqual(sentEvents.length, 1, 'Queued event should be sent after flushPendingQrOrders');
    assert.strictEqual(sentEvents[0].channel, 'qr-order-received');
    assert.strictEqual(sentEvents[0].data.items[0].qty, 2);

    // Second flush should not send duplicate
    server.flushPendingQrOrders();
    assert.strictEqual(sentEvents.length, 1, 'Queue should be empty on second flush');
  });
});
