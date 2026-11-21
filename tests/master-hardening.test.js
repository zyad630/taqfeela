/**
 * master-hardening.test.js
 * اختبارات تغطي الاصلاحات الامنية المنجزة
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// loadDb: بيئة معزولة تماما لكل اختبار
function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-mh-'));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

async function setupBasic(db) {
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  assert.ok(admin, 'admin login must succeed');
  const shift = db.openShift(100, '', admin, 'mh');
  assert.ok(shift.id, 'shift must open');
  const product = db.listProducts()[0];
  assert.ok(product, 'at least one product must exist');
  return { admin, shift, product };
}

// ------------------------------------------------------------------
// Fix-1: cashier لا يستطيع انشاء فاتورة بخصم
// ------------------------------------------------------------------
test('Fix-1: cashier cannot create order with discount > 0', async () => {
  const { db } = loadDb();
  const { admin, shift, product } = await setupBasic(db);
  // username فريد لهذا الاختبار
  db.saveUser({ username: 'cashier_f1', name: 'Cashier F1', password: 'pass01', role: 'cashier' });
  const cashier = db.loginUser('cashier_f1', 'pass01');
  assert.ok(cashier, 'cashier login must succeed');

  const res = db.createOrder({
    items: [{ id: product.id, qty: 1, price: product.price }],
    paymentMethod: 'cash', amountPaid: product.price,
    discount: 10, user: cashier, shiftId: shift.id
  });
  assert.equal(res.success, false, 'cashier discount must be rejected');
  assert.ok(res.error && res.error.includes('الخصم'), 'error must mention discount');

  const adminRes = db.createOrder({
    items: [{ id: product.id, qty: 1, price: product.price }],
    paymentMethod: 'cash', amountPaid: Math.max(0, product.price - 5),
    discount: 5, user: admin, shiftId: shift.id
  });
  assert.ok(adminRes.orderId, 'admin must apply discount');
});

// ------------------------------------------------------------------
// Fix-2: deleteTable يرفض طاولة مشغولة
// ------------------------------------------------------------------
test('Fix-2: deleteTable rejects occupied table', async () => {
  const { db } = loadDb();
  const { admin, shift } = await setupBasic(db);
  const tables = db.listTables();
  assert.ok(tables.length > 0, 'tables must exist');
  db.updateTableStatus(tables[0].id, 'occupied', null, true);
  assert.equal(db.deleteTable(tables[0].id).success, false, 'occupied table must not be deletable');
  const avail = db.listTables().find(t => t.status === 'available');
  if (avail) assert.equal(db.deleteTable(avail.id).success, true, 'available table is deletable');
});

// ------------------------------------------------------------------
// Fix-3: resetTables يرفض عند وجود طاولة مشغولة
// ------------------------------------------------------------------
test('Fix-3: resetTables rejects with occupied table (no force)', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  db.openShift(0, '', admin, 'f3');
  const tables = db.listTables();
  assert.ok(tables.length > 0);
  db.updateTableStatus(tables[0].id, 'occupied', null, true);
  const res = db.resetTables({ indoorCount: 4, outdoorCount: 0, force: false });
  assert.equal(res.success, false, 'resetTables must fail with occupied table');
  assert.ok(res.blockedTables && res.blockedTables.length > 0, 'must report blocked tables');
});

// ------------------------------------------------------------------
// Fix-4: updateOrder يرفض رفع الخصم من cashier
// ------------------------------------------------------------------
test('Fix-4: updateOrder rejects discount increase by cashier', async () => {
  const { db } = loadDb();
  const { admin, shift, product } = await setupBasic(db);
  db.saveUser({ username: 'cashier_f4', name: 'Cashier F4', password: 'pass04', role: 'cashier' });
  const cashier = db.loginUser('cashier_f4', 'pass04');
  const order = db.createOrder({
    items: [{ id: product.id, qty: 1, price: product.price }],
    paymentMethod: 'cash', amountPaid: product.price, discount: 0,
    user: admin, shiftId: shift.id
  });
  assert.ok(order.orderId, 'order must be created');
  const res = db.updateOrder(order.orderId, { discount: 20 }, cashier);
  assert.equal(res.success, false, 'cashier must not increase discount');
  assert.ok(res.error && res.error.includes('الخصم'), 'error must mention discount');
  assert.equal(db.updateOrder(order.orderId, { discount: 10 }, admin).success, true, 'admin can increase discount');
});

// ------------------------------------------------------------------
// Fix-5: updateOrder يرفض تعديل فاتورة من شيفت مغلق من cashier
// ------------------------------------------------------------------
test('Fix-5: updateOrder rejects edit of closed-shift order by cashier', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  db.saveUser({ username: 'cashier_f5', name: 'Cashier F5', password: 'pass05', role: 'cashier' });
  const cashier = db.loginUser('cashier_f5', 'pass05');
  const shift1 = db.openShift(0, '', admin, 'f5-s1');
  const product = db.listProducts()[0];
  const order = db.createOrder({
    items: [{ id: product.id, qty: 1, price: product.price }],
    paymentMethod: 'cash', amountPaid: product.price,
    user: admin, shiftId: shift1.id
  });
  assert.ok(order.orderId, 'order must be created');
  db.closeShift(shift1.id, 100, 'test', admin);
  const res = db.updateOrder(order.orderId, { notes: 'edit' }, cashier);
  assert.equal(res.success, false, 'cashier must not edit order from closed shift');
  assert.ok(res.error && (res.error.includes('مغلقة') || res.error.includes('وردية')), 'error must mention closed shift');
  assert.equal(db.updateOrder(order.orderId, { notes: 'admin edit' }, admin).success, true, 'admin can always edit');
});

// ------------------------------------------------------------------
// Fix-6: cancelOrder — الـ cashier يحتاج adminPasswordVerified لإلغاء فاتورة مدفوعة
//         (admin بيعمل bypass مباشرة — نختبر من cashier)
// ------------------------------------------------------------------
test('Fix-6: cancelOrder rejects cashier cancelling paid order without adminPasswordVerified', async () => {
  const { db } = loadDb();
  const { admin, shift, product } = await setupBasic(db);
  db.saveUser({ username: 'cashier_f6', name: 'Cashier F6', password: 'pass06', role: 'cashier' });
  const cashier = db.loginUser('cashier_f6', 'pass06');

  const order = db.createOrder({
    items: [{ id: product.id, qty: 1, price: product.price }],
    paymentMethod: 'cash', amountPaid: product.price,
    user: admin, shiftId: shift.id
  });
  assert.ok(order.orderId, 'paid order must be created');

  // cashier بدون adminPasswordVerified → يُرفض
  const res = db.cancelOrder(order.orderId, 'test', cashier, 'cash', false);
  assert.equal(res.success, false, 'cashier without adminPasswordVerified must fail to cancel paid order');
  assert.ok(res.requiresAdminPassword, 'must set requiresAdminPassword flag');

  // cashier مع adminPasswordVerified = true → يُقبل
  const ok = db.cancelOrder(order.orderId, 'test', cashier, 'cash', true);
  assert.equal(ok.success, true, 'cashier with adminPasswordVerified=true must cancel successfully');
});

// ------------------------------------------------------------------
// Fix-7: deleteExpense — يتطلب admin دائما (password 6+ chars)
// ------------------------------------------------------------------
test('Fix-7: deleteExpense requires admin regardless of shift state', async () => {
  const { db } = loadDb();
  const { admin, shift } = await setupBasic(db);
  db.saveUser({ username: 'cashier_f7', name: 'Cashier F7', password: 'pass07', role: 'cashier' });
  const cashier = db.loginUser('cashier_f7', 'pass07');
  const exp = db.addExpense({ category: 'test', notes: 'test exp', amount: 50, shiftId: shift.id, actor: admin });
  assert.ok(exp.id, 'expense must be created');
  // cashier بدون adminPassword → يُرفض
  assert.equal(db.deleteExpense(exp.id, cashier, null).success, false, 'cashier without admin password must fail');
  // cashier مع كلمة مرور الادمن → يُقبل
  assert.equal(db.deleteExpense(exp.id, cashier, '1234').success, true, 'cashier with correct adminPassword must succeed');
});

// ------------------------------------------------------------------
// Fix-8: getPendingShiftBlockers يعود بإحصاء صحيح
// ------------------------------------------------------------------
test('Fix-8: getPendingShiftBlockers returns correct counts', async () => {
  const { db } = loadDb();
  const { admin, shift, product } = await setupBasic(db);
  const clean = db.getPendingShiftBlockers(shift.id);
  assert.equal(clean.openTablesCount, 0, 'no occupied tables initially');
  assert.equal(clean.pendingOrdersCount, 0, 'no pending orders initially');
  // فاتورة مكتملة لا تُعدّ كمعلّقة
  db.createOrder({ items: [{ id: product.id, qty: 1, price: product.price }], paymentMethod: 'cash', amountPaid: product.price, user: admin, shiftId: shift.id });
  assert.equal(db.getPendingShiftBlockers(shift.id).pendingOrdersCount, 0, 'completed order not pending');
  // طاولة مشغولة تُحسب
  const tables = db.listTables();
  if (tables.length > 0) {
    db.updateTableStatus(tables[0].id, 'occupied', null, true);
    assert.ok(db.getPendingShiftBlockers(shift.id).openTablesCount >= 1, 'occupied table must be counted');
  }
});

// ------------------------------------------------------------------
// Fix-9: createOrder يُحفظ فورا على القرص
// ------------------------------------------------------------------
test('Fix-9: createOrder triggers immediate disk save', async () => {
  const { db, dir } = loadDb();
  const { admin, shift, product } = await setupBasic(db);
  const dbFile = path.join(dir, 'cafe-pos.db');
  const statBefore = fs.statSync(dbFile);
  await new Promise(r => setTimeout(r, 10));
  db.createOrder({ items: [{ id: product.id, qty: 1, price: product.price }], paymentMethod: 'cash', amountPaid: product.price, user: admin, shiftId: shift.id });
  const statAfter = fs.statSync(dbFile);
  assert.ok(
    statAfter.mtimeMs > statBefore.mtimeMs || statAfter.size !== statBefore.size,
    `DB file must update immediately after createOrder (before: ${statBefore.mtimeMs}, after: ${statAfter.mtimeMs})`
  );
});

// ------------------------------------------------------------------
// Fix-10: updateTableStatus يرفض تحرير طاولة عليها سلة
// ------------------------------------------------------------------
test('Fix-10: updateTableStatus rejects freeing table with non-empty cart', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  db.openShift(0, '', admin, 'f10');
  const tables = db.listTables();
  assert.ok(tables.length > 0);
  const tbl = tables[0];
  db.saveTableCart(tbl.id, { cart: [{ id: 1, name: 'coffee', qty: 2 }] });
  assert.equal(db.updateTableStatus(tbl.id, 'available', null, false).success, false, 'must fail without force');
  assert.equal(db.updateTableStatus(tbl.id, 'available', null, true).success, true, 'must succeed with force=true');
});
