const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function createIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-chaos-stress-'));
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

test('CHAOS 1: Partial Notebook Order + Void Reversal (100 in drawer, 60 bill, 20 paid, 40 debt -> Cancel -> 100 in drawer & stock back)', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  
  // Create test product with exact stock = 5
  const prod = db.saveProduct({ name: 'كوكاكولا كانز', price: 30, cost: 15, category_id: 1, stock_qty: 5, low_stock_threshold: 2 });
  assert.equal(prod.stock_qty, 5);

  // Open Shift with exactly 100 EGP
  const shift = db.openShift(100, 'بداية الشيفت بـ 100 ج', admin, 'الشيفت الصباحي');
  assert.equal(shift.opening_cash, 100);

  // Step 1: Create Notebook order: 2 pieces @ 30 = 60 EGP. Customer pays 20 EGP cash downpayment, 40 EGP debt.
  const order = db.createOrder({
    items: [{ id: prod.id, qty: 2, price: 30 }],
    orderType: 'notebook',
    paymentMethod: 'notebook',
    customerName: 'عميل تجربة النوتة',
    amountPaid: 20,
    user: admin,
    shiftId: shift.id
  });

  // Verify stock was decremented from 5 to 3
  const prodAfterOrder = db.listProducts().find(p => p.id === prod.id);
  assert.equal(prodAfterOrder.stock_qty, 3, 'Stock must drop from 5 to 3 after buying 2');

  // Verify drawer cash: Opening (100) + Downpayment (20) = 120 EGP (NOT 160!)
  const curShift = db.currentShift();
  assert.equal(curShift.expected_cash, 120, 'Expected cash must be 100 + 20 = 120 EGP');
  assert.equal(curShift.cash_sales, 20, 'Cash sales must be 20 EGP only');

  // Verify debt created with remaining = 40
  const debt = db.listDebts().find(d => d.order_id === order.orderId);
  assert.ok(debt, 'Debt record must exist');
  assert.equal(debt.total_amount, 60);
  assert.equal(debt.paid_amount, 20);
  assert.equal(debt.remaining_amount, 40);
  assert.equal(debt.status, 'partial');

  // Step 2: Void / Cancel the Order as Admin
  const cancelRes = db.cancelOrder(order.orderId, 'إلغاء بناء على طلب العميل', admin);
  assert.equal(cancelRes.success, true);

  // Verify inventory is RESTORED from 3 back to 5!
  const prodAfterVoid = db.listProducts().find(p => p.id === prod.id);
  assert.equal(prodAfterVoid.stock_qty, 5, 'Stock MUST return from 3 back to 5');

  // Verify drawer cash is DEDUCTED by the 20 EGP downpayment and returns to 100!
  const shiftAfterVoid = db.currentShift();
  assert.equal(shiftAfterVoid.expected_cash, 100, 'Expected cash must return to 100 EGP');
  assert.equal(shiftAfterVoid.cash_sales, 0, 'Cash sales must return to 0');

  // Verify debt is cancelled with remaining = 0
  const debtAfterVoid = db.listDebts().find(d => d.order_id === order.orderId);
  assert.equal(debtAfterVoid.status, 'cancelled');
  assert.equal(debtAfterVoid.remaining_amount, 0);
});

test('CHAOS 2: Vodafone Cash Separation vs Cash Drawer & Expenses', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const prod = db.saveProduct({ name: 'مشروب تجربة', price: 50, cost: 25, category_id: 1, stock_qty: 100, low_stock_threshold: 5 });

  // Shift opens with 200 EGP in physical drawer
  const s1 = db.openShift(200, '', admin, 'شيفت تجربة');

  // Order 1: 150 EGP Cash (3 pieces * 50 = 150)
  db.createOrder({
    items: [{ id: prod.id, qty: 3, price: 50 }],
    paymentMethod: 'cash',
    amountPaid: 150,
    user: admin,
    shiftId: s1.id
  });

  // Order 2: 300 EGP Vodafone Cash (6 pieces * 50 = 300)
  db.createOrder({
    items: [{ id: prod.id, qty: 6, price: 50 }],
    paymentMethod: 'wallet',
    amountPaid: 300,
    user: admin,
    shiftId: s1.id
  });

  // Expense: 50 EGP cash expense paid out of drawer
  db.addExpense({
    amount: 50,
    category: 'خامات',
    notes: 'شراء بن',
    userId: admin.id,
    userName: admin.name
  });

  const shiftStatus = db.currentShift();
  // Cash in drawer = 200 (open) + 150 (cash) - 50 (exp) = 300 EGP
  assert.equal(shiftStatus.expected_cash, 300, 'Expected physical cash must be 300 EGP');
  assert.equal(shiftStatus.wallet_sales, 300, 'Vodafone Cash sales must be 300 EGP');
  assert.equal(shiftStatus.total_sales, 450, 'Total sales must be 450 EGP (150 + 300)');
  assert.equal(shiftStatus.expenses_total, 50, 'Expenses must be 50 EGP');

  // Cashier closes shift submitting exact 300 EGP physical cash
  const closeRes = db.closeShift(s1.id, 300, 'مطابق تماما', admin);
  assert.equal(closeRes.success, true);
  assert.equal(closeRes.cashDifference, 0);

  // Shift 2 opens carrying forward 300 EGP
  const s2 = db.openShift(null, '', admin, 'الشيفت المسائي');
  assert.equal(s2.opening_cash, 300, 'Shift 2 must carry forward 300 EGP');
});

test('CHAOS 3: Multi-Shift Notebook Debt Installments and Cross-Shift Drawer Inflow', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const cashier2 = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234');
  const prod = db.saveProduct({ name: 'مشروب نوتة', price: 50, cost: 25, category_id: 1, stock_qty: 100, low_stock_threshold: 5 });

  // Shift 1: Open with 500 EGP
  const s1 = db.openShift(500, '', cashier1, 'شيفت 1');
  
  // Customer takes 200 EGP order (4 * 50 = 200) with 0 downpayment (all on Notebook)
  const order = db.createOrder({
    items: [{ id: prod.id, qty: 4, price: 50 }],
    orderType: 'notebook',
    paymentMethod: 'notebook',
    customerName: 'محمد أحمد',
    amountPaid: 0,
    user: cashier1,
    shiftId: s1.id
  });

  // Drawer remains 500 EGP in Shift 1
  assert.equal(db.currentShift().expected_cash, 500);
  db.closeShift(s1.id, 500, 'تسليم تمام', cashier1);

  // Shift 2: Opens carrying forward 500 EGP
  const s2 = db.openShift(null, '', cashier2, 'شيفت 2');
  assert.equal(s2.opening_cash, 500);

  // Customer comes during Shift 2 and pays 80 EGP installment of his debt!
  const debt = db.listDebts().find(d => d.order_id === order.orderId);
  const payRes1 = db.payDebt({
    debtId: debt.id,
    amount: 80,
    shiftId: s2.id,
    cashierName: cashier2.name,
    notes: 'دفعة أولى'
  });
  assert.equal(payRes1.success, true);
  assert.equal(payRes1.newRemaining, 120);

  // Shift 2 Drawer gets the 80 EGP: 500 + 80 = 580 EGP!
  const s2Status = db.currentShift();
  assert.equal(s2Status.expected_cash, 580, 'Shift 2 drawer MUST reflect the 80 EGP collected');
  assert.equal(s2Status.debt_collections, 80);
  db.closeShift(s2.id, 580, 'تسليم مع تحصيل نوتة', cashier2);

  // Shift 3: Opens carrying forward 580 EGP
  const s3 = db.openShift(null, '', cashier1, 'شيفت 3');
  assert.equal(s3.opening_cash, 580);

  // Customer pays remaining 120 EGP in Shift 3
  const payRes2 = db.payDebt({
    debtId: debt.id,
    amount: 120,
    shiftId: s3.id,
    cashierName: cashier1.name,
    notes: 'خلوصي الحساب'
  });
  assert.equal(payRes2.success, true);
  assert.equal(payRes2.newRemaining, 0);
  assert.equal(payRes2.newStatus, 'paid');

  // Shift 3 Drawer gets the 120 EGP: 580 + 120 = 700 EGP!
  assert.equal(db.currentShift().expected_cash, 700, 'Shift 3 drawer must be 700 EGP');
});

test('CHAOS 4: Depletion boundary, Insufficient Stock Rejection, and Post-Void Re-Purchase', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const shift = db.openShift(100, '', admin, 'شيفت');

  // Create limited stock item: 2 pieces only
  const limitedProd = db.saveProduct({ name: 'كيك شوكولاتة فاخر', price: 45, cost: 20, category_id: 1, stock_qty: 2, low_stock_threshold: 1 });

  // Buy all 2 pieces
  const order = db.createOrder({
    items: [{ id: limitedProd.id, qty: 2, price: 45 }],
    paymentMethod: 'cash',
    amountPaid: 90,
    user: admin,
    shiftId: shift.id
  });

  // Verify stock is now 0
  const afterBuy = db.listProducts().find(p => p.id === limitedProd.id);
  assert.equal(afterBuy.stock_qty, 0);

  // Attempt to buy 1 more -> MUST THROW Insufficient Stock error!
  assert.throws(() => {
    db.createOrder({
      items: [{ id: limitedProd.id, qty: 1, price: 45 }],
      paymentMethod: 'cash',
      amountPaid: 45,
      user: admin,
      shiftId: shift.id
    });
  }, /المخزون غير كاف/);

  // Void the order -> Stock returns to 2
  db.cancelOrder(order.orderId, 'إلغاء', admin);
  const afterVoid = db.listProducts().find(p => p.id === limitedProd.id);
  assert.equal(afterVoid.stock_qty, 2, 'Stock must return to 2');

  // Now buying 1 piece succeeds!
  const order2 = db.createOrder({
    items: [{ id: limitedProd.id, qty: 1, price: 45 }],
    paymentMethod: 'cash',
    amountPaid: 45,
    user: admin,
    shiftId: shift.id
  });
  assert.ok(order2.orderId);
  const finalStock = db.listProducts().find(p => p.id === limitedProd.id);
  assert.equal(finalStock.stock_qty, 1);
});

test('CHAOS 5: Cancel Previous Closed-Shift Cash Order Refund Isolated in Current Shift', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const prod = db.saveProduct({ name: 'مشروب استرجاع', price: 50, cost: 25, category_id: 1, stock_qty: 100, low_stock_threshold: 5 });

  // Shift 1: Sells 100 EGP cash invoice (2 * 50) and closes with 600 EGP (500 open + 100 sale)
  const s1 = db.openShift(500, '', cashier1, 'شيفت 1');
  const o1 = db.createOrder({
    items: [{ id: prod.id, qty: 2, price: 50 }],
    paymentMethod: 'cash',
    amountPaid: 100,
    user: cashier1,
    shiftId: s1.id
  });
  db.closeShift(s1.id, 600, 'تسليم تمام', cashier1);

  // Shift 2: Opens with 600 EGP
  const s2 = db.openShift(null, '', cashier1, 'شيفت 2');
  assert.equal(s2.opening_cash, 600);

  // Customer returns goods from Shift 1 during Shift 2. Admin voids invoice o1.
  const refundRes = db.cancelOrder(o1.orderId, 'استرجاع عميل من شيفت الأمس', admin, 'cash');
  assert.equal(refundRes.success, true);
  assert.equal(refundRes.refundAmount, 100);

  // Current Shift 2 drawer pays out the 100 EGP refund: Expected cash = 600 - 100 = 500 EGP!
  const s2Status = db.currentShift();
  assert.equal(s2Status.expected_cash, 500, 'Shift 2 drawer must drop by 100 EGP due to the cash refund paid out');
  assert.equal(s2Status.refunds_total, 100);
});

test('CHAOS 6: Security, Negative Input, Double Close & Over-Discount Protection', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const prod = db.listProducts()[0];

  const shift = db.openShift(200, '', cashier, 'شيفت اختبار أمان');

  // 1. Discount exceeding total is rejected
  assert.throws(() => {
    db.createOrder({
      items: [{ id: prod.id, qty: 1, price: 50 }],
      discount: 100, // 100 > 50
      paymentMethod: 'cash',
      user: cashier,
      shiftId: shift.id
    });
  }, /الخصم لا يمكن أن يتجاوز/);

  // 2. Negative quantity is rejected
  assert.throws(() => {
    db.createOrder({
      items: [{ id: prod.id, qty: -2, price: 50 }],
      paymentMethod: 'cash',
      user: cashier,
      shiftId: shift.id
    });
  }, /غير صحيح/);

  // 3. Negative actual cash on shift close is rejected
  const negClose = db.closeShift(shift.id, -50, 'خطأ', cashier);
  assert.equal(negClose.success, false);

  // 4. Proper close works
  const goodClose = db.closeShift(shift.id, 200, 'سليم', cashier);
  assert.equal(goodClose.success, true);

  // 5. Double close is handled idempotently without re-modifying records
  const doubleClose = db.closeShift(shift.id, 200, 'تكرار', cashier);
  assert.equal(doubleClose.alreadyClosed, true, 'Double close must return alreadyClosed flag');
});
