const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function createIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-critical-test-'));
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

test('SCENARIOS 1 & 2: Cash Discrepancy (Deficit/Surplus) & Carried Forward Actual Cash', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const cashier2 = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234');
  const prod = db.listProducts()[0];

  // Shift 1 opening: 500 EGP
  const s1 = db.openShift(500, '', cashier1, 'شيفت 1');
  db.createOrder({
    items: [{ id: prod.id, qty: 2, price: prod.price }],
    paymentMethod: 'cash',
    amountPaid: prod.price * 2,
    user: cashier1,
    shiftId: s1.id
  });

  const expectedS1 = 500 + prod.price * 2; // e.g. 550 EGP
  const actualS1 = expectedS1 - 15; // Cashier submits 15 EGP short (535 EGP)

  // 1. Deficit recording (-15)
  const close1 = db.closeShift(s1.id, actualS1, 'تسليم بعجز 15 ج.م', cashier1);
  assert.equal(close1.success, true);
  assert.equal(close1.cashDifference, -15, 'cashDifference must be -15 and NOT rejected');

  // Verify Shift 1 recorded cash_difference in DB for admin reports
  const shifts = db.listShifts();
  const s1Db = shifts.find(s => s.id === s1.id);
  assert.equal(s1Db.cash_difference, -15);
  assert.equal(s1Db.actual_cash, actualS1);

  // 2. Scenario 2: Shift 2 carries ACTUAL cash (535), NOT expected (550)
  const s2 = db.openShift(null, '', cashier2, 'شيفت 2');
  assert.equal(s2.opening_cash, actualS1, 'Shift 2 MUST start with actual cash handed over in drawer (535)');
});

test('SCENARIO 3: Overpayment on Debt Rejection', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const prod = db.listProducts()[0];
  const shift = db.openShift(1000, '', admin, 'شيفت تجربة');

  const order = db.createOrder({
    items: [{ id: prod.id, qty: 2, price: prod.price }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'عميل النوتة',
    amountPaid: 0,
    user: admin,
    shiftId: shift.id
  });

  const debt = db.listDebts().find(d => d.order_id === order.orderId);
  assert.ok(debt);
  const remaining = debt.remaining_amount;

  // Pay more than remaining (remaining + 50 EGP) -> MUST BE REJECTED
  const payRes = db.payDebt({
    debtId: debt.id,
    amount: remaining + 50,
    shiftId: shift.id,
    cashierName: admin.name
  });

  assert.equal(payRes.success, false);
  assert.equal(payRes.error, 'المبلغ أكبر من المتبقي');

  // Verify debt remaining amount did not change
  const debtCheck = db.listDebts().find(d => d.id === debt.id);
  assert.equal(debtCheck.remaining_amount, remaining);
});

test('SCENARIOS 5 & 6: Cancel Closed-Shift Cash Invoice Payout & Refund Tracking', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const prod = db.listProducts()[0];

  // Shift 1: Cashier 1 sells cash order
  const s1 = db.openShift(1000, '', cashier1, 'شيفت 1');
  const order = db.createOrder({
    items: [{ id: prod.id, qty: 2, price: prod.price }],
    paymentMethod: 'cash',
    amountPaid: prod.price * 2,
    user: cashier1,
    shiftId: s1.id
  });
  db.closeShift(s1.id, 1000 + order.total, 'إغلاق شيفت 1', cashier1);

  // Shift 2: Admin opens Shift 2
  const s2 = db.openShift(null, '', admin, 'شيفت 2');

  // Admin cancels Shift 1 cash order during Shift 2 -> Refunds order.total cash from Shift 2 register
  const cancelRes = db.cancelOrder(order.orderId, 'مرتجع فاتورة شيفت سابق مغلق', admin, 'cash');
  assert.equal(cancelRes.success, true);
  assert.equal(cancelRes.refundAmount, order.total);

  // Shift 2 expected cash must now reflect the cash refund payout
  const s2State = db.currentShift();
  assert.equal(s2State.refunds_total, order.total);
  assert.equal(s2State.expected_cash, (1000 + order.total) - order.total, 'Shift 2 expected cash must deduct cash refund payout');
});

test('SCENARIO 7: Split Payment Exact Register Split', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const prod = db.listProducts()[0];

  const shift = db.openShift(500, '', admin, 'شيفت تقسيم الدفع');

  const total = prod.price * 4;
  const half = total / 2;

  // Create order with 50% Cash + 50% Card
  const order = db.createOrder({
    items: [{ id: prod.id, qty: 4, price: prod.price }],
    paymentMethod: 'split',
    cashAmount: half,
    cardAmount: half,
    walletAmount: 0,
    amountPaid: total,
    user: admin,
    shiftId: shift.id
  });

  assert.equal(order.total, total);
  assert.equal(order.cashAmount, half);
  assert.equal(order.cardAmount, half);

  // Verify shift sales breakdown
  const state = db.currentShift();
  assert.equal(state.cash_sales, half);
  assert.equal(state.card_sales, half);
  assert.equal(state.expected_cash, 500 + half, 'Only cash portion enters physical cash drawer');

  // Reject split payment where sums do not equal total
  assert.throws(() => {
    db.createOrder({
      items: [{ id: prod.id, qty: 4, price: prod.price }],
      paymentMethod: 'split',
      cashAmount: 10,
      cardAmount: 10,
      walletAmount: 0,
      amountPaid: total,
      user: admin,
      shiftId: shift.id
    });
  }, /مجموع المبالغ المقسمة يجب أن يساوي إجمالي الفاتورة بالضبط/);
});

test('SCENARIO 8: Expense Exceeding Register Available Cash Warning Safeguard', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');

  // Register cash: 40 EGP
  const shift = db.openShift(40, '', admin, 'شيفت الخزينة');

  // Attempt expense of 100 EGP when register has only 40 EGP -> Warning safeguard
  const expRes = db.addExpense({
    shiftId: shift.id,
    amount: 100,
    category: 'مصروفات كبيرة',
    notes: 'مصروف أكبر من الكاش'
  });

  assert.equal(expRes.success, false);
  assert.equal(expRes.warning, true);
  assert.match(expRes.error, /أكبر من الكاش المتوفر حاليًا/);
});

test('SCENARIO 9: FIFO Multi-Debt Allocation for Same Customer', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const prod = db.listProducts()[0];
  const shift = db.openShift(1000, '', admin, 'شيفت FIFO');

  // Debt 1 for "محمد سالم": 1 item
  const o1 = db.createOrder({
    items: [{ id: prod.id, qty: 1, price: prod.price }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'محمد سالم',
    amountPaid: 0,
    user: admin,
    shiftId: shift.id
  });

  // Debt 2 for "محمد سالم": 2 items
  const o2 = db.createOrder({
    items: [{ id: prod.id, qty: 2, price: prod.price }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'محمد سالم',
    amountPaid: 0,
    user: admin,
    shiftId: shift.id
  });

  const totalDebts = o1.total + o2.total;
  const payAmt = o1.total + (o2.total / 2); // Pays all of Debt 1 + 50% of Debt 2

  // Customer pays payAmt -> FIFO should pay Debt 1 (cleared) and 50% of Debt 2
  const fifoRes = db.payCustomerDebtsFIFO({
    customerName: 'محمد سالم',
    amount: payAmt,
    shiftId: shift.id,
    cashierName: admin.name
  });

  assert.equal(fifoRes.success, true);
  assert.equal(fifoRes.totalPaid, payAmt);

  const debts = db.listDebts().filter((d) => d.customer_name === 'محمد سالم').sort((a, b) => a.id - b.id);
  assert.equal(debts[0].status, 'paid');
  assert.equal(debts[0].remaining_amount, 0);

  assert.equal(debts[1].status, 'partial');
  assert.equal(debts[1].remaining_amount, o2.total / 2);
});

test('SCENARIOS 11, 13 & 14: Shift Open Warnings, Non-Owner Close Block & Close Idempotency', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const cashier2 = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234');

  // Open shift 1 by cashier 1
  const s1 = db.openShift(500, '', cashier1, 'شيفت 1');

  // Scenario 11: Attempt opening second shift while s1 open -> Warning with shift info
  const open2Res = db.openShift(200, '', cashier1, 'شيفت 2');
  assert.match(open2Res.error, /لديك شيفت مفتوح بالفعل برقم/);

  // Scenario 13: Cashier 2 attempts to close Cashier 1's shift -> Blocked
  const closeByC2 = db.closeShift(s1.id, 500, 'محاولة إغلاق شيفت زميل', cashier2);
  assert.equal(closeByC2.success, false);
  assert.equal(closeByC2.error, 'لا يمكن إغلاق شيفت خاص بمستخدم آخر');

  // Owner closes shift 1 successfully
  const closeByC1 = db.closeShift(s1.id, 500, 'إغلاق بواسطة صاحب الشيفت', cashier1);
  assert.equal(closeByC1.success, true);

  // Scenario 14: Re-closing an already closed shift -> Returns alreadyClosed: true idempotently
  const reClose = db.closeShift(s1.id, 500, 'إعادة إغلاق', cashier1);
  assert.equal(reClose.success, true);
  assert.equal(reClose.alreadyClosed, true);
});

test('SCENARIO 15: Exact Decimal Rounding (33.33 Split Precision)', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const shift = db.openShift(100, '', admin, 'شيفت الكسور');

  const prod = db.saveProduct({ name: 'صنف كسور', price: 33.33, category_id: 1, stock_qty: 100 });

  const order = db.createOrder({
    items: [{ id: prod.id, qty: 1, price: 33.33 }],
    paymentMethod: 'split',
    cashAmount: 11.11,
    cardAmount: 11.11,
    walletAmount: 11.11,
    amountPaid: 33.33,
    user: admin,
    shiftId: shift.id
  });

  assert.equal(order.total, 33.33);
  const state = db.currentShift();
  assert.equal(state.cash_sales, 11.11);
  assert.equal(state.card_sales, 11.11);
  assert.equal(state.wallet_sales, 11.11);
  assert.equal(state.expected_cash, 111.11);
});
