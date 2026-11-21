const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-shift-test-'));
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
  return db;
}

test('carries the actual cash from a closed shift into the next shift', async () => {
  const db = loadDb();
  await db.init();
  const user = db.loginUser('admin', 'admin');
  const first = db.openShift(500, 'first', user, 'morning');
  assert.equal(first.opening_cash, 500);
  const product = db.listProducts()[0];
  db.createOrder({ items: [{ id: product.id, qty: 1, price: 0 }], paymentMethod: 'cash', amountPaid: product.price, user, shiftId: first.id });
  const expected = db.currentShift().expected_cash;
  const closed = db.closeShift(first.id, expected + 10, 'handover');
  assert.equal(closed.success, true);
  assert.equal(closed.cashDifference, 10);
  const second = db.openShift(null, '', user, 'evening');
  assert.equal(second.opening_cash, expected + 10);
  assert.match(second.handover_notes, /الشيفت/);
});

test('does not allow opening a second shift while one is open', async () => {
  const db = loadDb();
  await db.init();
  const user = db.loginUser('admin', 'admin');
  const first = db.openShift(100, '', user, 'morning');
  const duplicate = db.openShift(200, '', user, 'evening');
  assert.match(duplicate.error, /شيفت مفتوح/);
  assert.equal(db.currentShift().id, first.id);
});

test('requires actual cash to close and rejects wrong shift id', async () => {
  const db = loadDb();
  await db.init();
  const user = db.loginUser('admin', 'admin');
  const shift = db.openShift(100, '', user, 'morning');
  assert.equal(db.closeShift(999999, 100, '').success, false);
  assert.equal(db.closeShift(shift.id, null, '').success, false);
  assert.equal(db.currentShift().id, shift.id);
});

test('invoice numbering is global and continues from 5 to 6 across shifts', async () => {
  const db = loadDb();
  await db.init();
  const admin = db.loginUser('admin', 'admin');
  const cashier = db.loginUser('cashier1', '1234');
  const first = db.openShift(500, '', cashier, 'زياد - morning');
  const product = db.listProducts()[0];
  const firstInvoices = [];
  for (let i = 0; i < 5; i++) {
    firstInvoices.push(db.createOrder({ items: [{ id: product.id, qty: 1, price: 0 }], paymentMethod: 'cash', amountPaid: product.price, user: cashier, shiftId: first.id }).invoiceNo);
  }
  assert.deepEqual(firstInvoices, ['1', '2', '3', '4', '5']);
  const close = db.closeShift(first.id, db.currentShift().expected_cash, 'تسليم زياد');
  assert.equal(close.success, true);
  const second = db.openShift(null, '', admin, 'next shift');
  const next = db.createOrder({ items: [{ id: product.id, qty: 1, price: 0 }], paymentMethod: 'cash', amountPaid: product.price, user: admin, shiftId: second.id });
  assert.equal(next.invoiceNo, '6');
});

test('cashier cannot cancel a different user closed-shift invoice while admin can', async () => {
  const db = loadDb();
  await db.init();
  db.setupInitialAdmin('AdminPassword2026!#', 'المدير');
  const admin = db.loginUser('admin', 'AdminPassword2026!#');
  db.saveUser({ username: 'cashier1', password: 'CashierPass123!', role: 'cashier', name: 'كاشير 1' });
  db.saveUser({ username: 'cashier2', password: 'CashierPass123!', role: 'cashier', name: 'كاشير 2' });
  const cashier1 = db.loginUser('cashier1', 'CashierPass123!');
  const cashier2 = db.loginUser('cashier2', 'CashierPass123!');
  const shift = db.openShift(100, '', cashier1, 'morning');
  const product = db.listProducts()[0];
  const order = db.createOrder({ items: [{ id: product.id, qty: 1, price: 0 }], paymentMethod: 'cash', amountPaid: product.price, user: cashier1, shiftId: shift.id });
  db.closeShift(shift.id, db.currentShift().expected_cash, 'close');
  const denied = db.cancelOrder(order.orderId, 'unauthorized', cashier2);
  assert.equal(denied.success, false);
  const allowed = db.cancelOrder(order.orderId, 'admin correction', admin);
  assert.equal(allowed.success, true);
});
