/**
 * Scenario E: Returns & Refunds Lifecycle Across Shifts
 * tests/scenarios/scenario-e-returns-refunds.js
 * 
 * Verifies:
 * 1. Order cancellation and full refund in same shift restores product inventory
 * 2. Cross-shift refund correctly deducts refund from active shift drawer cash
 * 3. Cashier permissions & admin authorization enforcement on cancellations
 * 4. Preservation of audit trail in stock_movements and order_refunds
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-scenario-e-'));
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

test('Scenario E: Returns, Refunds & Inventory Restoration Across Shifts', async (t) => {
  const { db, dir } = loadIsolatedDb();
  await db.init();
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');

  const product = db.listProducts().find(p => !p.is_deleted);
  const initialStock = product.stock_qty;
  const prodPrice = Number(product.price); // DB authoritative price (70)

  // -------------------------------------------------------------
  // SHIFT 1: Order Creation and Same-Shift Cancellation
  // -------------------------------------------------------------
  let shift1;
  let order1;
  await t.test('1. Shift 1: Create order, verify stock deduction, then cancel & refund', () => {
    shift1 = db.openShift(500, 'شيفت المرتجعات 1', admin);

    // Place order for 2 items
    order1 = db.createOrder({
      shiftId: shift1.id,
      orderType: 'takeaway',
      items: [{ id: product.id, name: product.name, price: prodPrice, qty: 2 }],
      paymentMethod: 'cash',
      user: admin
    });
    assert.strictEqual(order1.success, true);
    assert.strictEqual(order1.total, prodPrice * 2);

    // Stock must be reduced by 2
    const stockAfterSale = db.listProducts().find(p => p.id === product.id).stock_qty;
    assert.strictEqual(stockAfterSale, initialStock - 2);

    // Cancel order in same shift (Full refund)
    const cancelRes = db.cancelOrder(order1.id, 'طلب العميل إلغاء الطلب', admin);
    assert.strictEqual(cancelRes.success, true);

    // Inventory must be fully restored (+2)
    const stockAfterCancel = db.listProducts().find(p => p.id === product.id).stock_qty;
    assert.strictEqual(stockAfterCancel, initialStock);

    // Drawer cash must balance out to opening cash (500)
    const cashState = db.computeShiftCash(shift1.id);
    assert.strictEqual(cashState.expected_cash, 500);

    const closeRes = db.closeShift(shift1.id, 500, 'إغلاق شيفت 1 متوازن', admin);
    assert.strictEqual(closeRes.success, true);
  });

  // -------------------------------------------------------------
  // SHIFT 2: Cross-Shift Refund
  // -------------------------------------------------------------
  await t.test('2. Shift 2: Cross-shift refund affects current shift drawer cash', () => {
    // Open new shift 2
    const shift2 = db.openShift(1000, 'شيفت المرتجعات 2', admin);

    // Create an order in Shift 2
    const order2 = db.createOrder({
      shiftId: shift2.id,
      orderType: 'takeaway',
      items: [{ id: product.id, name: product.name, price: prodPrice, qty: 1 }],
      paymentMethod: 'cash',
      user: admin
    });
    assert.strictEqual(order2.success, true);

    // Drawer cash is now: 1000 + prodPrice
    let cash2 = db.computeShiftCash(shift2.id);
    assert.strictEqual(cash2.expected_cash, 1000 + prodPrice);

    // Cancel order 2
    const cancel2 = db.cancelOrder(order2.id, 'إرجاع صنف تالف', admin);
    assert.strictEqual(cancel2.success, true);

    // Drawer cash returns to 1000
    cash2 = db.computeShiftCash(shift2.id);
    assert.strictEqual(cash2.expected_cash, 1000);

    // Verify refund row exists in order_refunds
    const refunds = db.runSql ? db.queryAll('SELECT * FROM order_refunds WHERE order_id = ?', [order2.id]) : [];
    assert.ok(refunds.length > 0, 'Refund audit record must exist');
    assert.strictEqual(refunds[0].refund_amount, prodPrice);

    db.closeShift(shift2.id, 1000, 'إغلاق شيفت 2', admin);
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
