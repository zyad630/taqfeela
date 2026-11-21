const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-full-test-'));
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

async function setup() {
  const db = loadDb();
  await db.init();
  const admin = db.loginUser('manager', 'manager123') || db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const cashier2 = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234');
  assert.ok(admin && cashier1 && cashier2);
  return { db, admin, cashier1, cashier2 };
}

test('employee name is stored and returned separately from shift name', async () => {
  const { db, cashier1 } = await setup();
  assert.match(cashier1.name, /كاشير/);
  const shift = db.openShift(100, '', cashier1, 'الشيفت المسائي');
  const product = db.listProducts()[0];
  const order = db.createOrder({ items: [{ id: product.id, qty: 1, price: 999 }], paymentMethod: 'cash', amountPaid: product.price, user: cashier1, shiftId: shift.id });
  const saved = db.getOrder(order.orderId);
  assert.equal(saved.cashier_name, cashier1.name);
  assert.equal(saved.shift_name, 'الشيفت المسائي');
  assert.notEqual(saved.cashier_name, saved.shift_name);
});

test('full multi-shift invoice and handover sequence remains auditable', async () => {
  const { db, admin, cashier1, cashier2 } = await setup();
  const p = db.listProducts()[0];
  db.saveProduct({ ...p, stock_qty: 100 });
  const s1 = db.openShift(500, '', cashier1, 'morning');
  const a = db.createOrder({ items: [{ id: p.id, qty: 2, price: 0 }], paymentMethod: 'cash', amountPaid: p.price * 2, user: cashier1, shiftId: s1.id });
  const b = db.createOrder({ items: [{ id: p.id, qty: 1, price: 0 }], paymentMethod: 'card', amountPaid: p.price, user: cashier1, shiftId: s1.id });
  assert.deepEqual([a.invoiceNo, b.invoiceNo], ['1', '2']);
  const close1 = db.closeShift(s1.id, db.currentShift().expected_cash, 'handover 1');
  assert.equal(close1.success, true);
  const s2 = db.openShift(null, '', cashier2, 'evening');
  assert.equal(s2.opening_cash, close1.actualCash);
  const c = db.createOrder({ items: [{ id: p.id, qty: 1, price: 0 }], paymentMethod: 'wallet', amountPaid: p.price, user: cashier2, shiftId: s2.id });
  assert.equal(c.invoiceNo, '3');
  const close2 = db.closeShift(s2.id, db.currentShift().expected_cash + 5, 'handover 2');
  assert.equal(close2.cashDifference, 5);
  const shifts = db.listShifts();
  assert.equal(shifts.length, 2);
  assert.equal(shifts[0].actual_cash, close2.actualCash);
  assert.equal(shifts[1].actual_cash, close1.actualCash);
  const allOrders = db.listOrders({ limit: 20 });
  assert.equal(allOrders.find((o) => o.invoice_no === '1').cashier_name, cashier1.name);
  assert.equal(allOrders.find((o) => o.invoice_no === '3').cashier_name, cashier2.name);
  assert.equal(db.currentShift(), null);
  assert.equal(admin.role, 'admin');
});

test('inventory add, update, insufficient stock rejection, and deletion behave safely', async () => {
  const { db, admin } = await setup();
  const category = db.listCategories()[0];
  const created = db.saveProduct({ name: 'اختبار مخزون', price: 30, cost: 10, category_id: category.id, stock_qty: 2, low_stock_threshold: 1 });
  assert.ok(created.id);
  const shift = db.openShift(0, '', admin, 'inventory');
  assert.throws(() => db.createOrder({ items: [{ id: created.id, qty: 3, price: 1 }], paymentMethod: 'cash', amountPaid: 1, user: admin, shiftId: shift.id }));
  const updated = db.saveProduct({ ...created, price: 35, stock_qty: 5 });
  assert.equal(db.listProducts().find((p) => p.id === created.id).price, 35);
  const order = db.createOrder({ items: [{ id: created.id, qty: 2, price: 1 }], paymentMethod: 'cash', amountPaid: 70, user: admin, shiftId: shift.id });
  assert.equal(db.listProducts().find((p) => p.id === created.id).stock_qty, 3);
  assert.equal(db.deleteProduct(created.id).success, true);
  assert.equal(db.listProducts().some((p) => p.id === created.id), false);
  assert.ok(db.getOrder(order.orderId));
});

test('notebook progresses unpaid to partial to paid and remains visible in history', async () => {
  const { db, admin } = await setup();
  const product = db.listProducts()[0];
  db.saveProduct({ ...product, stock_qty: 100 });
  const shift = db.openShift(100, '', admin, 'debt');
  const order = db.createOrder({ items: [{ id: product.id, qty: 2, price: 0 }], paymentMethod: 'notebook', orderType: 'notebook', customerName: 'عميل اختبار', amountPaid: 0, user: admin, shiftId: shift.id });
  let debt = db.listDebts().find((d) => d.order_id === order.orderId);
  assert.equal(debt.status, 'unpaid');
  const half = debt.total_amount / 2;
  assert.equal(db.payDebt({ debtId: debt.id, amount: half, shiftId: shift.id, cashierName: admin.name }).newStatus, 'partial');
  debt = db.listDebts().find((d) => d.id === debt.id);
  assert.equal(debt.status, 'partial');
  assert.equal(debt.payments.length, 1);
  const final = db.payDebt({ debtId: debt.id, amount: debt.remaining_amount, shiftId: shift.id, cashierName: admin.name });
  assert.equal(final.newStatus, 'paid');
  debt = db.listDebts().find((d) => d.id === debt.id);
  assert.equal(debt.status, 'paid');
  assert.equal(debt.remaining_amount, 0);
  assert.equal(debt.payments.length, 2);
  assert.equal(db.payDebt({ debtId: debt.id, amount: 1, shiftId: shift.id }).success, false);
  const history = db.listOrders({ shiftId: shift.id, limit: 20 }).find((o) => o.id === order.orderId);
  assert.equal(history.debt_status, 'paid');
  assert.equal(history.debt_remaining_amount, 0);
});

test('cancelling a notebook reverses stock and marks debt cancelled without deleting history', async () => {
  const { db, admin } = await setup();
  const product = db.listProducts()[0];
  db.saveProduct({ ...product, stock_qty: 10 });
  const shift = db.openShift(0, '', admin, 'cancel');
  const order = db.createOrder({ items: [{ id: product.id, qty: 2, price: 0 }], paymentMethod: 'notebook', orderType: 'notebook', customerName: 'إلغاء اختبار', amountPaid: 0, user: admin, shiftId: shift.id });
  assert.equal(db.listProducts().find((p) => p.id === product.id).stock_qty, 8);
  const debt = db.listDebts().find((d) => d.order_id === order.orderId);
  assert.equal(db.cancelOrder(order.orderId, 'اختبار إلغاء', admin).success, true);
  assert.equal(db.listProducts().find((p) => p.id === product.id).stock_qty, 10);
  assert.equal(db.listDebts().find((d) => d.id === debt.id).status, 'cancelled');
  assert.equal(db.getOrder(order.orderId).status, 'cancelled');
});

test('dashboard, settings, users, expenses, and reports remain internally consistent', async () => {
  const { db, admin } = await setup();
  const shift = db.openShift(1000, '', admin, 'reports');
  db.addExpense({ shiftId: shift.id, amount: 50, category: 'اختبار', notes: 'expense' });
  const stats = db.currentShift();
  assert.equal(stats.expected_cash, 950);
  assert.equal(db.saveSettings({ cafe_name: 'Cafe Stress' }).cafe_name, 'Cafe Stress');
  assert.ok(db.getDashboardStats().today);
  assert.ok(db.getUserAttendanceReports(null).users.length >= 4);
  assert.ok(db.getMonthlyPayroll(new Date().toISOString().slice(0, 7)).records.length >= 4);
});
