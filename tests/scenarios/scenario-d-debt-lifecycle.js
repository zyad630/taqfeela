/**
 * Scenario D: Notebook Customer Credit & Multi-Shift Payments Lifecycle
 * tests/scenarios/scenario-d-debt-lifecycle.js
 * 
 * Verifies:
 * 1. Initial credit order creates debt with partial upfront cash payment
 * 2. Intermediate debt payments recorded across subsequent shifts
 * 3. Final debt settlement updates status to 'paid' and remaining_amount to 0
 * 4. Shift cash reconciliation accounts accurately for debt payments per shift
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-scenario-d-'));
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

test('Scenario D: Notebook Credit Orders & Multi-Shift Debt Lifecycle', async (t) => {
  const { db, dir } = loadIsolatedDb();
  await db.init();
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');

  const product = db.listProducts().find(p => !p.is_deleted);
  const prodPrice = Number(product.price); // 70
  let debtId;

  // -------------------------------------------------------------
  // SHIFT 1: Order Creation (3 items @ 70 = 210, Upfront Paid 30)
  // -------------------------------------------------------------
  await t.test('1. Shift 1: Notebook order with partial upfront cash', () => {
    const s1 = db.openShift(100, 'شيفت 1 - فتح الحساب', admin);

    const order = db.createOrder({
      shiftId: s1.id,
      orderType: 'notebook',
      paymentMethod: 'notebook',
      customerName: 'الأستاذ عماد',
      customerPhone: '01099998888',
      items: [{ id: product.id, name: product.name, price: prodPrice, qty: 3 }], // total = 210
      amountPaid: 30,
      user: admin
    });
    assert.strictEqual(order.success, true);
    assert.strictEqual(order.total, prodPrice * 3);

    // Verify debt record
    const debts = db.listDebts();
    const emadDebt = debts.find(d => d.customer_name === 'الأستاذ عماد');
    assert.ok(emadDebt);
    debtId = emadDebt.id;
    assert.strictEqual(emadDebt.total_amount, 210);
    assert.strictEqual(emadDebt.paid_amount, 30);
    assert.strictEqual(emadDebt.remaining_amount, 180);
    assert.strictEqual(emadDebt.status, 'partial');

    // Drawer cash in Shift 1: Opening 100 + 30 upfront cash = 130
    const cash1 = db.computeShiftCash(s1.id);
    assert.strictEqual(cash1.expected_cash, 130);

    const close1 = db.closeShift(s1.id, 130, 'إغلاق شيفت 1', admin);
    assert.strictEqual(close1.success, true);
  });

  // -------------------------------------------------------------
  // SHIFT 2: Partial Repayment (Customer pays 80 EGP)
  // -------------------------------------------------------------
  await t.test('2. Shift 2: Partial debt repayment of 80 EGP', () => {
    const s2 = db.openShift(200, 'شيفت 2 - سداد جزئي', admin);

    const payRes = db.payDebt({
      debtId,
      amount: 80,
      paymentMethod: 'cash',
      shiftId: s2.id,
      user: admin
    });
    assert.strictEqual(payRes.success, true);

    const debtAfter = db.listDebts().find(d => d.id === debtId);
    assert.strictEqual(debtAfter.paid_amount, 110);
    assert.strictEqual(debtAfter.remaining_amount, 100);
    assert.strictEqual(debtAfter.status, 'partial');

    // Drawer cash in Shift 2: Opening 200 + 80 debt collection = 280
    const cash2 = db.computeShiftCash(s2.id);
    assert.strictEqual(cash2.expected_cash, 280);

    const close2 = db.closeShift(s2.id, 280, 'إغلاق شيفت 2', admin);
    assert.strictEqual(close2.success, true);
  });

  // -------------------------------------------------------------
  // SHIFT 3: Final Settlement (Customer pays remaining 100 EGP)
  // -------------------------------------------------------------
  await t.test('3. Shift 3: Full settlement of remaining 100 EGP', () => {
    const s3 = db.openShift(300, 'شيفت 3 - سداد كامل', admin);

    const payRes = db.payDebt({
      debtId,
      amount: 100,
      paymentMethod: 'cash',
      shiftId: s3.id,
      user: admin
    });
    assert.strictEqual(payRes.success, true);

    const finalDebt = db.listDebts().find(d => d.id === debtId);
    assert.strictEqual(finalDebt.paid_amount, 210);
    assert.strictEqual(finalDebt.remaining_amount, 0);
    assert.strictEqual(finalDebt.status, 'paid', 'Status must transition to paid');

    // Drawer cash in Shift 3: Opening 300 + 100 debt collection = 400
    const cash3 = db.computeShiftCash(s3.id);
    assert.strictEqual(cash3.expected_cash, 400);

    const close3 = db.closeShift(s3.id, 400, 'إغلاق شيفت 3', admin);
    assert.strictEqual(close3.success, true);
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
