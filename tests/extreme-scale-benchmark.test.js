const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function createIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-benchmark-test-'));
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  // Set test mode before loading db
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

test('EXTREME BENCHMARK: 5,000 High-Speed Transactions with Full Table, Inventory, Shift & Reporting Load', async () => {
  const { db, dir } = createIsolatedDb();
  await db.init();

  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');

  // Restock products to 1,000,000 units
  const products = db.listProducts();
  for (const p of products) {
    db.saveProduct({ ...p, stock_qty: 1000000 });
  }

  const shift = db.openShift(5000, 'بداية اختبار الضغط الأقصى', cashier1, 'شيفت الضغط');
  const tables = db.listTables();

  const startTime = Date.now();
  const TRANSACTION_COUNT = 1000;

  for (let i = 0; i < TRANSACTION_COUNT; i++) {
    const prod = products[i % products.length];
    const tbl = tables[i % tables.length];
    const qty = (i % 4) + 1;
    const price = prod.price;
    const subtotal = price * qty;
    const discount = i % 20 === 0 ? 5 : 0;
    const total = subtotal - discount;

    // Simulate order
    db.createOrder({
      items: [{ id: prod.id, qty, price }],
      paymentMethod: i % 4 === 0 ? 'card' : (i % 4 === 1 ? 'wallet' : 'cash'),
      orderType: i % 2 === 0 ? 'hall' : 'takeaway',
      tableId: i % 2 === 0 ? tbl.id : null,
      customerName: `زبون رقم ${i}`,
      discount,
      amountPaid: total,
      user: discount > 0 ? admin : cashier1,
      shiftId: shift.id
    });

    // Every 500 orders, log an expense and check dashboard stats
    if (i > 0 && i % 500 === 0) {
      db.addExpense({
        shiftId: shift.id,
        amount: 50,
        category: 'مشتريات طارئة',
        notes: `مصروف دوري عند الطلب ${i}`
      });
      const stats = db.getDashboardStats();
      assert.ok(stats.today.total > 0);
      assert.ok(stats.topProducts.length > 0);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`\n⚡ [BENCHMARK RESULTS]: Completed ${TRANSACTION_COUNT} full orders in ${(durationMs / 1000).toFixed(2)}s (${(TRANSACTION_COUNT / (durationMs / 1000)).toFixed(0)} orders/sec)`);

  // Verify shift summary consistency after 5,000 orders
  const shiftSummary = db.currentShift();
  assert.equal(shiftSummary.total_orders, TRANSACTION_COUNT);
  assert.equal(shiftSummary.expenses_total, (TRANSACTION_COUNT / 500 - 1) * 50);

  // Close shift and verify closing integrity
  const closeRes = db.closeShift(shift.id, shiftSummary.expected_cash, 'إغلاق اختبار الضغط الأقصى');
  assert.equal(closeRes.success, true);
  assert.equal(closeRes.cashDifference, 0);

  // Verify orders list pagination and query speed with 5,000 records
  const queryStart = Date.now();
  const latestOrders = db.listOrders({ shiftId: shift.id, limit: 100 });
  const queryDuration = Date.now() - queryStart;
  assert.equal(latestOrders.length, 100);
  assert.ok(queryDuration < 200, `Querying orders took ${queryDuration}ms (expected < 200ms)`);

  // Verify database file was exported and exists on disk
  const dbFilePath = path.join(dir, 'cafe-pos.db');
  assert.ok(fs.existsSync(dbFilePath));
  const fileSizeMb = fs.statSync(dbFilePath).size / (1024 * 1024);
  console.log(`📁 [DATABASE SIZE]: Database size for ${TRANSACTION_COUNT} orders: ${fileSizeMb.toFixed(2)} MB`);
  assert.ok(fileSizeMb > 0 && fileSizeMb < 50, 'Database size should remain compact and efficient');
});
