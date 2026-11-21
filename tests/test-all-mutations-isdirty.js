'use strict';

process.env.CAFE_TEST_AUTOMATION = '1';
process.env.CAFE_QUICK_INIT = '1';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const baseTemp = fs.existsSync('D:/') ? 'D:/cafe-temp' : os.tmpdir();
const tempDir = fs.mkdtempSync(path.join(baseTemp, 'cafe-test-isdirty-'));
const testDbPath = path.join(tempDir, 'cafe-pos.db');

async function testAllMutationsPersist() {
  console.log('=== TEST ITEM 4: Comprehensive isDirty & Crash Persistence Audit for ALL Mutating Functions ===\n');

  let db = require('../electron/db');
  await db.init(testDbPath);

  // Setup Initial Admin
  db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
  db.flushDb();

  const admin = db.queryGet('SELECT id, name, role FROM users WHERE role = "admin" LIMIT 1');
  assert.ok(admin, 'Admin must exist');

  let testsPassed = 0;
  let testsFailed = 0;

  async function reopenAndVerify(label, verifyFn) {
    // 1. Flush memory changes to disk
    db.flushDb();
    assert.strictEqual(db.isDbDirty(), false, `[${label}] DB must not be dirty after flushDb()`);

    // 2. Simulate process crash / reload: re-read database from physical disk
    await db.init(testDbPath);

    // 3. Verify that the change survived on physical disk
    try {
      verifyFn(db);
      console.log(`✅ PASS: [${label}] persisted to disk across reload`);
      testsPassed++;
    } catch (err) {
      console.error(`❌ FAIL: [${label}] did NOT persist to disk across reload!`, err.message);
      testsFailed++;
    }
  }

  // 1. Product Create & Update & Delete
  let p1Id;
  const p1 = db.saveProduct({ name: 'كيمكس قهوة مختصة', price: 55, category_id: 1, stock_qty: 200 });
  p1Id = p1.id;
  await reopenAndVerify('saveProduct (create)', (d) => {
    const row = d.queryGet('SELECT * FROM products WHERE id = ?', [p1Id]);
    assert.strictEqual(row?.name, 'كيمكس قهوة مختصة');
    assert.strictEqual(row?.price, 55);
  });

  db.saveProduct({ id: p1Id, name: 'كيمكس قهوة مختصة معدلة', price: 65, category_id: 1, stock_qty: 180 });
  await reopenAndVerify('saveProduct (update)', (d) => {
    const row = d.queryGet('SELECT * FROM products WHERE id = ?', [p1Id]);
    assert.strictEqual(row?.name, 'كيمكس قهوة مختصة معدلة');
    assert.strictEqual(row?.price, 65);
  });

  db.deleteProduct(p1Id);
  await reopenAndVerify('deleteProduct (soft delete)', (d) => {
    const row = d.queryGet('SELECT * FROM products WHERE id = ?', [p1Id]);
    assert.strictEqual(row?.is_deleted, 1);
  });

  // 2. Category Create & Delete
  const cat = db.saveCategory({ name: 'مشروبات ساخنة مميزة', display_order: 99 });
  const catId = cat.id;
  await reopenAndVerify('saveCategory', (d) => {
    const row = d.queryGet('SELECT * FROM categories WHERE id = ?', [catId]);
    assert.strictEqual(row?.name, 'مشروبات ساخنة مميزة');
  });

  db.deleteCategory(catId);
  await reopenAndVerify('deleteCategory', (d) => {
    const row = d.queryGet('SELECT * FROM categories WHERE id = ?', [catId]);
    assert.strictEqual(row, null);
  });

  // 3. Section & Table CRUD
  const sec = db.saveSection({ name: 'الروف الخارجي' });
  const secId = sec.id;
  await reopenAndVerify('saveSection', (d) => {
    const row = d.queryGet('SELECT * FROM sections WHERE id = ?', [secId]);
    assert.strictEqual(row?.name, 'الروف الخارجي');
  });

  const tbl = db.saveTable({ name: 'طاولة روف 1', number: '101', hall: 'روف', section_id: secId });
  const tblId = tbl.id;
  await reopenAndVerify('saveTable', (d) => {
    const row = d.queryGet('SELECT * FROM tables WHERE id = ?', [tblId]);
    assert.strictEqual(row?.name, 'طاولة روف 1');
  });

  db.updateTableStatus(tblId, 'occupied');
  await reopenAndVerify('updateTableStatus', (d) => {
    const row = d.queryGet('SELECT status FROM tables WHERE id = ?', [tblId]);
    assert.strictEqual(row?.status, 'occupied');
  });

  // 4. Shift Lifecycle
  const shift = db.openShift(1000, 'افتتاح وردية التدقيق', admin, 'الوردية الصباحية');
  const shiftId = shift.id;
  await reopenAndVerify('openShift', (d) => {
    const row = d.queryGet('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    assert.strictEqual(row?.opening_cash, 1000);
    assert.strictEqual(row?.closed_at, null);
  });

  // 5. Shift Adjustments
  const adj = db.addShiftAdjustment({ shiftId, amount: 250, type: 'in', reason: 'تدعيم عهدة', adminUser: admin });
  await reopenAndVerify('addShiftAdjustment', (d) => {
    const row = d.queryGet('SELECT * FROM shift_adjustments WHERE id = ?', [adj.id]);
    assert.strictEqual(row?.amount, 250);
    assert.strictEqual(row?.type, 'in');
  });

  // 6. Expenses Add & Update & Delete
  const exp = db.addExpense({ shiftId, amount: 120, category: 'ضيافة', notes: 'شاي عمال', userId: admin.id, userName: admin.name });
  const expId = exp.id;
  await reopenAndVerify('addExpense', (d) => {
    const row = d.queryGet('SELECT * FROM expenses WHERE id = ?', [expId]);
    assert.strictEqual(row?.amount, 120);
    assert.strictEqual(row?.category, 'ضيافة');
  });

  db.updateExpense({ id: expId, amount: 150, category: 'صيانة', notes: 'إصلاح سباكة', actor: admin });
  await reopenAndVerify('updateExpense', (d) => {
    const row = d.queryGet('SELECT * FROM expenses WHERE id = ?', [expId]);
    assert.strictEqual(row?.amount, 150);
    assert.strictEqual(row?.category, 'صيانة');
  });

  db.deleteExpense(expId, admin);
  await reopenAndVerify('deleteExpense', (d) => {
    const row = d.queryGet('SELECT * FROM expenses WHERE id = ?', [expId]);
    assert.strictEqual(row, null);
  });

  // 7. Order Lifecycle: createOrder, cancelOrder, restoreOrder
  const testProd = db.saveProduct({ name: 'كوكيز شوكولاتة', price: 25, category_id: 1, stock_qty: 50 });
  const ord = db.createOrder({
    shiftId,
    items: [{ id: testProd.id, name: testProd.name, price: 25, qty: 2 }],
    total: 50,
    subtotal: 50,
    paymentMethod: 'cash',
    amountPaid: 50,
    user: admin
  });
  const ordId = ord.id;
  await reopenAndVerify('createOrder', (d) => {
    const row = d.queryGet('SELECT * FROM orders WHERE id = ?', [ordId]);
    assert.strictEqual(row?.total, 50);
    assert.strictEqual(row?.status, 'completed');
  });

  db.cancelOrder(ordId, 'إلغاء تجريبي', admin);
  await reopenAndVerify('cancelOrder', (d) => {
    const row = d.queryGet('SELECT status FROM orders WHERE id = ?', [ordId]);
    assert.strictEqual(row?.status, 'cancelled');
  });

  db.restoreOrder(ordId, admin);
  await reopenAndVerify('restoreOrder', (d) => {
    const row = d.queryGet('SELECT status FROM orders WHERE id = ?', [ordId]);
    assert.strictEqual(row?.status, 'completed');
  });

  // 8. Table Cart Lifecycle & appendItems
  const cartRes = db.saveTableCart(tblId, { cart: [{ id: testProd.id, name: testProd.name, price: 25, qty: 1 }] });
  await reopenAndVerify('saveTableCart', (d) => {
    const row = d.queryGet('SELECT * FROM table_carts WHERE table_id = ?', [tblId]);
    assert.ok(row, 'Table cart must exist');
    const data = JSON.parse(row.cart_data);
    assert.strictEqual(data.cart.length, 1);
  });

  db.appendItemsToTableCart(tblId, [{ id: testProd.id, name: testProd.name, price: 25, qty: 2 }]);
  await reopenAndVerify('appendItemsToTableCart', (d) => {
    const row = d.queryGet('SELECT * FROM table_carts WHERE table_id = ?', [tblId]);
    const data = JSON.parse(row.cart_data);
    assert.strictEqual(data.cart[0].qty, 3);
  });

  // 9. Customer CRM & Customer Debts
  db.saveCustomerDetails({ phone: '01099887766', name: 'عميل تدقيق آجل', address: 'شارع التحرير' });
  await reopenAndVerify('saveCustomerDetails', (d) => {
    const row = d.queryGet('SELECT * FROM customers WHERE phone = ?', ['01099887766']);
    assert.strictEqual(row?.name, 'عميل تدقيق آجل');
  });

  // Notebook order with debt
  const debtOrd = db.createOrder({
    shiftId,
    items: [{ id: testProd.id, name: testProd.name, price: 25, qty: 2 }],
    total: 50,
    subtotal: 50,
    paymentMethod: 'notebook',
    amountPaid: 0,
    customerName: 'عميل تدقيق آجل',
    customerPhone: '01099887766',
    user: admin
  });
  const debtId = db.queryGet('SELECT id FROM customer_debts WHERE order_id = ?', [debtOrd.id])?.id;
  assert.ok(debtId, 'Customer debt record must exist');

  db.payDebt({ debtId, amount: 25, notes: 'تسديد جزء نقدي', shiftId, cashierName: admin.name, paymentMethod: 'cash' });
  await reopenAndVerify('payDebt', (d) => {
    const debtRow = d.queryGet('SELECT * FROM customer_debts WHERE id = ?', [debtId]);
    assert.strictEqual(debtRow?.paid_amount, 25);
    assert.strictEqual(debtRow?.remaining_amount, 25);
  });

  // 10. User Management (Cashier CRUD & Password)
  const newUser = db.saveUser({ username: 'cashier_audit', name: 'كاشير التجربة', role: 'cashier', password: 'CashierPass123!@#' });
  const newUserId = newUser.id;
  await reopenAndVerify('saveUser', (d) => {
    const row = d.queryGet('SELECT * FROM users WHERE id = ?', [newUserId]);
    assert.strictEqual(row?.username, 'cashier_audit');
  });

  db.changePassword({ userId: newUserId, newPassword: 'NewSecurePass456!@#' });
  await reopenAndVerify('changePassword', (d) => {
    const bcrypt = require('bcryptjs');
    const row = d.queryGet('SELECT password FROM users WHERE id = ?', [newUserId]);
    assert.ok(bcrypt.compareSync('NewSecurePass456!@#', row.password));
  });

  // 11. Employee Payroll Adjustments
  const empAdj = db.addEmployeeAdjustment({ userId: newUserId, type: 'bonus', amount: 150, reason: 'مكافأة تميز', createdBy: admin.name });
  await reopenAndVerify('addEmployeeAdjustment', (d) => {
    const row = d.queryGet('SELECT * FROM employee_adjustments WHERE id = ?', [empAdj.id]);
    assert.strictEqual(row?.amount, 150);
    assert.strictEqual(row?.type, 'bonus');
  });

  // 12. Settings
  db.saveSettings({ tax_rate: '14' });
  await reopenAndVerify('saveSettings', (d) => {
    const row = d.queryGet('SELECT value FROM settings WHERE key = "tax_rate"');
    assert.strictEqual(row?.value, '14');
  });

  // 13. Close Shift
  db.closeShift(shiftId, 1200, 'إغلاق وردية التدقيق', admin);
  await reopenAndVerify('closeShift', (d) => {
    const row = d.queryGet('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    assert.ok(row?.closed_at, 'Shift must be closed');
    assert.strictEqual(row?.actual_cash, 1200);
  });

  console.log(`\n=======================================================`);
  console.log(`RESULTS: Passed: ${testsPassed}, Failed: ${testsFailed}`);
  console.log(`=======================================================`);

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  if (testsFailed > 0) {
    process.exit(1);
  }
}

testAllMutationsPersist().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
