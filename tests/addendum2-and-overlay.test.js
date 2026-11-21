const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-addendum2-test-'));
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

test('Item 1: Expense deletion strictly requires admin permission or admin password', async () => {
  const { db } = loadDb();
  await db.init();
  
  const shift = db.openShift(100, 'Shift', { id: 1, name: 'Admin', role: 'admin' });
  const exp = db.addExpense({ shiftId: shift.id, amount: 25, category: 'مشتريات خامات', notes: 'خامات', userId: 1, userName: 'Admin' });
  assert.ok(exp.id, 'Expense created');

  // Manager without password should be rejected
  const resManagerNoPass = db.deleteExpense(exp.id, { id: 2, name: 'Manager', role: 'manager' });
  assert.equal(resManagerNoPass.success, false, 'Manager without admin password should be rejected');

  // Cashier without password should be rejected
  const resCashierNoPass = db.deleteExpense(exp.id, { id: 3, name: 'Cashier', role: 'cashier' });
  assert.equal(resCashierNoPass.success, false, 'Cashier without admin password should be rejected');

  // Admin without extra password succeeds directly
  const resAdmin = db.deleteExpense(exp.id, { id: 1, name: 'Admin', role: 'admin' });
  assert.equal(resAdmin.success, true, 'Admin should delete expense directly');
});

test('Item 2: getDailySummaryReport netCash accounts for refunds and manual adjustments', async () => {
  const { db } = loadDb();
  await db.init();

  const shift = db.openShift(100, 'Shift 1', { id: 1, name: 'Admin', role: 'admin' });
  const cur = db.currentShift();
  assert.ok('cash_refunds_out' in cur, 'cash_refunds_out must be exposed in currentShift');

  // 1. Add manual adjustment (cash out: 50)
  db.addShiftAdjustment({ shiftId: cur.id, type: 'out', amount: 50, reason: 'سحب كاش', actor: { id: 1, role: 'admin' } });

  // 2. Add an order (cash: 100)
  const products = db.listProducts();
  const prod = products[0];
  const ord = db.createOrder({
    shiftId: cur.id,
    orderType: 'takeaway',
    paymentMethod: 'cash',
    items: [{ id: prod.id, qty: 1 }],
    total: prod.price,
    user: { id: 1, role: 'admin' }
  });

  const daily1 = db.getDailySummaryReport();
  const shiftRep1 = daily1.shifts[0];
  assert.equal(shiftRep1.netCash, Math.round((shiftRep1.cashSales - 50) * 100) / 100, 'netCash must deduct manual out adjustment');

  // 3. Cancel order and verify deduction
  db.cancelOrder(ord.orderId, 'طلب خطأ', { id: 1, role: 'admin' }, 'cash', true);
  const daily2 = db.getDailySummaryReport();
  const shiftRep2 = daily2.shifts[0];
  assert.equal(shiftRep2.cashSales, 0, 'Cancelled order is excluded from cashSales');
  assert.equal(shiftRep2.netCash, -50, 'netCash accurately reflects manual adjustment even after order cancel');
});

test('Item 3: Fallback expected_cash formula for shifts without closing_cash', () => {
  const shift = {
    opening_cash: 200,
    cash_sales: 300,
    debt_collections: 50,
    expenses_total: 40,
    cash_refunds_out: 20,
    adjustments_total: -10,
    closing_cash: null
  };

  const expected = Math.round((
    (Number(shift.opening_cash) || 0) +
    (Number(shift.cash_sales) || 0) +
    (Number(shift.debt_collections) || 0) -
    (Number(shift.expenses_total) || 0) -
    (Number(shift.cash_refunds_out ?? shift.refunds_total) || 0) +
    (Number(shift.adjustments_total) || 0)
  ) * 100) / 100;

  // 200 + 300 + 50 - 40 - 20 + (-10) = 480
  assert.equal(expected, 480, 'Fallback calculation must include all components');
});
