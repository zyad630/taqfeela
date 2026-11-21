/**
 * Scenario A: Full 24-Hour Cafe Operations Lifecycle
 * tests/scenarios/scenario-a-full-day.js
 * 
 * Simulates a full working day across 2 shifts with:
 * - Dine-in table orders and waiter item additions
 * - Optimistic concurrency protection (expectedCartRev)
 * - Multi-method payments (cash, card)
 * - Expenses and manager cash adjustments
 * - Shift closing & cash reconciliation
 * - Notebook credit orders & subsequent debt collection
 * - Invariant verification of drawer cash and daily report
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-scenario-a-'));
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../../electron/db')];
  const db = require('../../electron/db');
  Module._load = original;
  return { db, dir };
}

test('Scenario A: Complete 24h Cafe Operations Lifecycle', async (t) => {
  const { db, dir } = loadIsolatedDb();
  await db.init();
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');

  // Create staff users
  const cashierA = db.saveUser({
    username: 'cashier_mona',
    name: 'منى أحمد',
    password: 'Password123!',
    role: 'cashier',
    salary: 4000
  });

  const cashierB = db.saveUser({
    username: 'cashier_tarek',
    name: 'طارق علي',
    password: 'Password123!',
    role: 'cashier',
    salary: 4200
  });

  const products = db.listProducts().filter(p => !p.is_deleted);
  const tables = db.listTables();
  const pCoffee = products[0]; // price = 70
  const pTea = products[1];    // price = 80
  const coffeePrice = Number(pCoffee.price);
  const teaPrice = Number(pTea.price);

  // -------------------------------------------------------------------------
  // PHASE 1: Morning Shift (Cashier Mona)
  // -------------------------------------------------------------------------
  let shift1;
  await t.test('1. Morning shift opening & initial drawer state', () => {
    shift1 = db.openShift(200, 'شيفت الصباح', cashierA);
    assert.ok(shift1.id > 0);
    const cash = db.computeShiftCash(shift1.id);
    assert.strictEqual(cash.expected_cash, 200);
  });

  await t.test('2. Dine-in table orders and waiter appends', () => {
    // Customer sits at Table 1
    db.saveTableCart(tables[0].id, {
      cart: [{ id: pCoffee.id, name: pCoffee.name, price: coffeePrice, qty: 2 }]
    });

    // Waiter appends Tea to Table 1
    const appRes = db.appendItemsToTableCart(tables[0].id, [
      { id: pTea.id, name: pTea.name, price: teaPrice, qty: 1 }
    ]);
    assert.strictEqual(appRes.success, true);

    const tableCart = db.getTableCarts()[tables[0].id];
    assert.strictEqual(tableCart.cart.length, 2);

    // Checkout Table 1 with Cash passing expectedCartRev for OCC safety
    const expectedTotal = (coffeePrice * 2) + teaPrice;
    const order1 = db.createOrder({
      shiftId: shift1.id,
      tableId: tables[0].id,
      orderType: 'dine_in',
      items: tableCart.cart,
      paymentMethod: 'cash',
      user: cashierA,
      expectedCartRev: tableCart._rev
    });
    assert.strictEqual(order1.success, true);
    assert.strictEqual(order1.total, expectedTotal);

    // Clear table cart upon checkout
    db.saveTableCart(tables[0].id, { cart: [] });
    assert.strictEqual(db.getTableCarts()[tables[0].id], undefined);
  });

  await t.test('3. Shift expense and cash adjustment', () => {
    // Record petty cash expense: Milk supplies (30 EGP)
    const exp = db.addExpense({
      shiftId: shift1.id,
      amount: 30,
      category: 'توريدات',
      notes: 'شراء حليب طازج',
      userId: cashierA.id,
      userName: cashierA.name
    });
    assert.strictEqual(exp.success, true);

    // Manager injects 50 EGP change into drawer
    const adj = db.addShiftAdjustment({
      shiftId: shift1.id,
      type: 'in',
      amount: 50,
      reason: 'تزويد فكة صغرى',
      userId: admin.id
    });
    assert.strictEqual(adj.success, true);
  });

  await t.test('4. Morning shift reconciliation & closing', () => {
    const cashState = db.computeShiftCash(shift1.id);
    // Opening: 200, Sales: (coffeePrice*2 + teaPrice) = 220, Expense: -30, Adjustment: +50
    const salesTotal = (coffeePrice * 2) + teaPrice;
    const formulaExpected = 200 + salesTotal - 30 + 50;
    assert.strictEqual(cashState.expected_cash, formulaExpected);

    // Physical count matches expected exactly
    const closeRes = db.closeShift(shift1.id, formulaExpected, 'إغلاق شيفت الصباح سليم', cashierA);
    assert.strictEqual(closeRes.success, true);
    assert.strictEqual(closeRes.cashDifference, 0);
  });

  // -------------------------------------------------------------------------
  // PHASE 2: Evening Shift (Cashier Tarek)
  // -------------------------------------------------------------------------
  let shift2;
  await t.test('5. Evening shift opening & notebook credit orders', () => {
    shift2 = db.openShift(300, 'شيفت المساء', cashierB);
    assert.ok(shift2.id > 0);

    // Takeaway customer buys coffee via Card
    const orderCard = db.createOrder({
      shiftId: shift2.id,
      orderType: 'takeaway',
      items: [{ id: pCoffee.id, name: pCoffee.name, price: coffeePrice, qty: 1 }],
      paymentMethod: 'card',
      user: cashierB
    });
    assert.strictEqual(orderCard.success, true);

    // Regular customer creates notebook debt: Total 140 (2 x 70), pays 30 upfront
    const orderDebt = db.createOrder({
      shiftId: shift2.id,
      orderType: 'notebook',
      paymentMethod: 'notebook',
      customerName: 'الأستاذ وائل',
      customerPhone: '01222233344',
      items: [{ id: pCoffee.id, name: pCoffee.name, price: coffeePrice, qty: 2 }],
      amountPaid: 30,
      user: cashierB
    });
    assert.strictEqual(orderDebt.success, true);

    // Verify debt created in database
    const debts = db.listDebts();
    const waelDebt = debts.find(d => d.customer_name === 'الأستاذ وائل');
    assert.ok(waelDebt);
    assert.strictEqual(waelDebt.total_amount, 140);
    assert.strictEqual(waelDebt.paid_amount, 30);
    assert.strictEqual(waelDebt.remaining_amount, 110);
    assert.strictEqual(waelDebt.status, 'partial');

    // Customer pays 40 more towards debt in the same shift
    const payRes = db.payDebt({
      debtId: waelDebt.id,
      amount: 40,
      paymentMethod: 'cash',
      shiftId: shift2.id,
      user: cashierB
    });
    assert.strictEqual(payRes.success, true);

    const updatedDebt = db.listDebts().find(d => d.id === waelDebt.id);
    assert.strictEqual(updatedDebt.remaining_amount, 70);
    assert.strictEqual(updatedDebt.status, 'partial');
  });

  await t.test('6. Evening shift closing and daily aggregated sales report', () => {
    const cashState2 = db.computeShiftCash(shift2.id);
    // Opening: 300
    // Cash in from orders: 30 (upfront debt)
    // Cash in from debt payments: 40
    // Card sales (does not enter drawer cash): coffeePrice (70)
    const expectedDrawer2 = 300 + 30 + 40;
    assert.strictEqual(cashState2.expected_cash, expectedDrawer2);

    const closeRes2 = db.closeShift(shift2.id, expectedDrawer2, 'إغلاق شيفت المساء', cashierB);
    assert.strictEqual(closeRes2.success, true);
    assert.strictEqual(closeRes2.cashDifference, 0);

    // Daily Sales Report across both shifts
    const today = new Date().toISOString().slice(0, 10);
    const daySales = db.getReportSales({ dateFrom: today, dateTo: today });
    assert.ok(daySales.summary.total_sales > 0);
    assert.strictEqual(daySales.summary.order_count, 3);
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
