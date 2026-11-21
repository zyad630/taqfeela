const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function createIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-nightmare-scenario-'));
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

test('🔥 NIGHTMARE SCENARIO: 1 Full Working Day across 4 Shifts with Fraud, Faults & Complete Audit Reconciliation', async () => {
  const { db } = createIsolatedDb();
  await db.init();

  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashierA = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234'); // Morning
  const cashierB = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234'); // Afternoon
  const cashierC = db.loginUser('cashier3', '123456') || db.loginUser('cashier3', '1234'); // Evening
  const cashierD = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');   // Night

  const prods = db.listProducts();
  const prodCoffee = prods[0];
  const prodJuice = prods.find(p => p.price >= 30) || prods[1];

  const tables = db.listTables();
  const tableT1 = tables[0];

  // =========================================================================
  // 🌅 SHIFT 1 — MORNING (Cashier A)
  // =========================================================================

  // 1. Open shift with ZERO cash (0 EGP)
  const shift1 = db.openShift(0, 'افتتاح الشيفت الصباحي بعهدة صفر', cashierA, 'الشيفت الصباحي (الأول)');
  assert.equal(shift1.opening_cash, 0, 'System must allow 0 EGP opening cash');

  // 2. Normal order: Table T1 = 4 coffees * prodCoffee.price
  const orderT1Amt = prodCoffee.price * 4;
  const orderT1 = db.createOrder({
    items: [{ id: prodCoffee.id, qty: 4, price: prodCoffee.price }],
    paymentMethod: 'cash',
    orderType: 'hall',
    tableId: tableT1.id,
    amountPaid: orderT1Amt,
    user: cashierA,
    shiftId: shift1.id
  });
  assert.equal(orderT1.total, orderT1Amt);

  // 3. Notebook order for new customer "محمود سعيد": 8 coffees, 0 paid
  const orderMahmoud1Amt = prodCoffee.price * 8;
  const orderMahmoud1 = db.createOrder({
    items: [{ id: prodCoffee.id, qty: 8, price: prodCoffee.price }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'محمود سعيد',
    customerPhone: '01099998888',
    amountPaid: 0,
    user: cashierA,
    shiftId: shift1.id
  });
  assert.equal(orderMahmoud1.total, orderMahmoud1Amt);

  // 4. Fraud Attempt: Original order T1 must remain unchanged
  assert.equal(db.getOrder(orderT1.orderId).total, orderT1Amt, 'Original order T1 total must remain intact');

  // 5. Complex decimal expense: 33.333 EGP -> Must round to 33.33 EGP
  const expDecimal = db.addExpense({
    shiftId: shift1.id,
    amount: 33.333,
    category: 'نثريات',
    notes: 'مصروف بكسور معقدة'
  });
  assert.equal(expDecimal.amount, 33.33, 'Decimal amount 33.333 must round safely to 33.33');

  // 6. Excessive withdrawal attempt: Current cash is orderT1Amt, attempt 500 EGP expense -> Warning block
  const expExcess = db.addExpense({
    shiftId: shift1.id,
    amount: orderT1Amt + 500,
    category: 'مشتريات كبيرة',
    notes: 'سحب مبالغ كبيرة أكبر من الكاش'
  });
  assert.equal(expExcess.success, false);
  assert.equal(expExcess.warning, true);
  assert.match(expExcess.error, /أكبر من الكاش المتوفر/);

  // 7. Intentional Deficit Shift Closing: Expected cash = orderT1Amt - 33.33 EGP. Cashier submits 50 EGP.
  const s1Expected = Math.round((orderT1Amt - 33.33) * 100) / 100;
  const s1Actual = 50;
  const close1 = db.closeShift(shift1.id, s1Actual, 'عجز تسليم الشيفت الصباحي', cashierA);
  assert.equal(close1.success, true);
  assert.equal(close1.cashDifference, Math.round((s1Actual - s1Expected) * 100) / 100);

  // =========================================================================
  // ☀️ SHIFT 2 — AFTERNOON (Cashier B) — Carryover & Conflict Handling
  // =========================================================================

  // 8. Carryover with deficit: Shift 2 opening cash MUST be 50 EGP (actual handed over), NOT s1Expected
  const shift2 = db.openShift(null, '', cashierB, 'الشيفت الظهرية (الثاني)');
  assert.equal(shift2.opening_cash, s1Actual, 'Shift 2 MUST start with actual cash handed over (50 EGP)');

  // 9. Overpayment attempt on "محمود سعيد" debt (attempt debt.remaining_amount + 50 EGP) -> Rejected
  const debtMahmoud1 = db.listDebts().find(d => d.order_id === orderMahmoud1.orderId);
  assert.ok(debtMahmoud1);
  const payOverRes = db.payDebt({
    debtId: debtMahmoud1.id,
    amount: debtMahmoud1.remaining_amount + 50,
    shiftId: shift2.id,
    cashierName: cashierB.name
  });
  assert.equal(payOverRes.success, false);
  assert.equal(payOverRes.error, 'المبلغ أكبر من المتبقي');

  // Pay valid 50% installment on Debt 1
  const payAmtHalf = Math.round((debtMahmoud1.remaining_amount / 2) * 100) / 100;
  const payVal1 = db.payDebt({
    debtId: debtMahmoud1.id,
    amount: payAmtHalf,
    shiftId: shift2.id,
    cashierName: cashierB.name,
    notes: 'دفعة 1 من محمود سعيد'
  });
  assert.equal(payVal1.success, true);
  assert.equal(payVal1.newRemaining, Math.round((debtMahmoud1.remaining_amount - payAmtHalf) * 100) / 100);

  // 10. Open second notebook order for "محمود سعيد"
  const orderMahmoud2 = db.createOrder({
    items: [{ id: prodJuice.id, qty: 2, price: prodJuice.price }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'محمود سعيد',
    customerPhone: '01099998888',
    amountPaid: 0,
    user: cashierB,
    shiftId: shift2.id
  });
  const debtsMahmoud = db.listDebts().filter(d => d.customer_name === 'محمود سعيد' && d.status !== 'paid');
  assert.equal(debtsMahmoud.length, 2, 'Customer "محمود سعيد" must have 2 distinct open debt accounts');

  // 11. Unbalanced split payment attempt: Invoice total = prodCoffee.price * 6. Cashier inputs un-matching amounts -> REJECTED
  const splitTotal = prodCoffee.price * 6;
  assert.throws(() => {
    db.createOrder({
      items: [{ id: prodCoffee.id, qty: 6, price: prodCoffee.price }],
      paymentMethod: 'split',
      cashAmount: 70,
      cardAmount: 90,
      walletAmount: 0,
      amountPaid: splitTotal,
      user: cashierB,
      shiftId: shift2.id
    });
  }, /مجموع المبالغ المقسمة يجب أن يساوي إجمالي الفاتورة بالضبط/);

  // Valid split payment: 50% cash + 50% card
  const halfSplit = splitTotal / 2;
  const orderSplitVal = db.createOrder({
    items: [{ id: prodCoffee.id, qty: 6, price: prodCoffee.price }],
    paymentMethod: 'split',
    cashAmount: halfSplit,
    cardAmount: halfSplit,
    walletAmount: 0,
    amountPaid: splitTotal,
    user: cashierB,
    shiftId: shift2.id
  });
  assert.equal(orderSplitVal.cashAmount, halfSplit);
  assert.equal(orderSplitVal.cardAmount, halfSplit);

  // 12. Atomic Race Condition check on debt payment: Sequential payments clear remaining debt without overflow
  const debtMahmoud2 = db.listDebts().find(d => d.order_id === orderMahmoud2.orderId);
  const payVal2 = db.payDebt({
    debtId: debtMahmoud2.id,
    amount: debtMahmoud2.total_amount,
    shiftId: shift2.id,
    cashierName: cashierB.name
  });
  assert.equal(payVal2.success, true);
  assert.equal(payVal2.newStatus, 'paid');

  // 13. Refund on Card Order vs Cash Order
  // (A) Card refund -> Does NOT deduct physical cash drawer
  const orderCardProd = db.createOrder({
    items: [{ id: prodCoffee.id, qty: 2, price: prodCoffee.price }],
    paymentMethod: 'card',
    amountPaid: prodCoffee.price * 2,
    user: cashierB,
    shiftId: shift2.id
  });
  const cancelCardRes = db.cancelOrder(orderCardProd.orderId, 'مرتجع فيزا بنفس الوسيلة', admin, 'card');
  assert.equal(cancelCardRes.success, true);

  // Shift 2 Expected Cash: Opening (50) + Debt Coll (payAmtHalf + debtMahmoud2.total_amount) + Split Cash (halfSplit)
  const s2ExpectedCash = 50 + payAmtHalf + debtMahmoud2.total_amount + halfSplit;
  const s2State = db.currentShift();
  assert.equal(s2State.expected_cash, s2ExpectedCash);

  // Close Shift 2 with exact cash
  const close2 = db.closeShift(shift2.id, s2ExpectedCash, 'تسليم شيفت الظهر', cashierB);
  assert.equal(close2.success, true);

  // =========================================================================
  // 🌆 SHIFT 3 — EVENING (Cashier C) — Technical Faults & Admin Overrides
  // =========================================================================

  const shift3 = db.openShift(null, '', cashierC, 'الشيفت المسائي (الثالث)');
  assert.equal(shift3.opening_cash, s2ExpectedCash);

  // 15. Double Close / Network Fault Simulation (Idempotency)
  const close3First = db.closeShift(shift3.id, s2ExpectedCash, 'تأكيد إغلاق الشيفت المسائي', cashierC);
  assert.equal(close3First.success, true);

  const close3Second = db.closeShift(shift3.id, s2ExpectedCash, 'إعادة ضغط إغلاق', cashierC);
  assert.equal(close3Second.success, true);
  assert.equal(close3Second.alreadyClosed, true, 'Re-submitting close shift must be idempotent');

  // Open shift 3B for remaining operations
  const shift3B = db.openShift(null, '', cashierC, 'شيفت مسائي ملحق');

  // 16. Non-owner shift close attempt: Cashier A tries to close Cashier C's shift -> Blocked
  const blockCloseByA = db.closeShift(shift3B.id, s2ExpectedCash, 'محاولة قفل شيفت زميل', cashierA);
  assert.equal(blockCloseByA.success, false);
  assert.equal(blockCloseByA.error, 'لا يمكن إغلاق شيفت خاص بمستخدم آخر');

  // 17. Admin Retroactive Adjustment on Closed Shift 1 order (orderT1)
  const cancelT1Res = db.cancelOrder(orderT1.orderId, 'مرتجع فاتورة صالة من الشيفت الأول', admin, 'cash');
  assert.equal(cancelT1Res.success, true);
  assert.equal(cancelT1Res.refundAmount, orderT1.total);

  // 18. Complete debt payment for "محمود سعيد" Debt 1 (remaining debt) during Shift 3B
  const remainingDebt1 = db.listDebts().find(d => d.id === debtMahmoud1.id).remaining_amount;
  const payVal3 = db.payDebt({
    debtId: debtMahmoud1.id,
    amount: remainingDebt1,
    shiftId: shift3B.id,
    cashierName: cashierC.name,
    notes: 'سداد نهائي لنوتة 1'
  });
  assert.equal(payVal3.success, true);
  assert.equal(payVal3.newStatus, 'paid');

  // Normal cash sale in Shift 3B: 200 EGP
  db.createOrder({
    items: [{ id: prodCoffee.id, qty: 8, price: prodCoffee.price }],
    paymentMethod: 'cash',
    amountPaid: prodCoffee.price * 8,
    user: cashierC,
    shiftId: shift3B.id
  });

  // Expected cash in Shift 3B: Opening (s2ExpectedCash) - Refund (orderT1.total) + Debt Coll (remainingDebt1) + Cash Sale (prodCoffee.price * 8)
  const s3BExpected = s2ExpectedCash - orderT1.total + remainingDebt1 + (prodCoffee.price * 8);
  const s3BState = db.currentShift();
  assert.equal(s3BState.expected_cash, s3BExpected);

  // Close Shift 3B with exact cash
  const close3B = db.closeShift(shift3B.id, s3BExpected, 'إغلاق شيفت مسائي ملحق', cashierC);
  assert.equal(close3B.success, true);

  // =========================================================================
  // 🌙 SHIFT 4 — NIGHT (Cashier D) — Heavy Load & EOD Reconciliation
  // =========================================================================

  const shift4 = db.openShift(null, '', cashierD, 'الشيفت الليلي (الرابع)');
  assert.equal(shift4.opening_cash, s3BExpected);

  // 19. Heavy Load Test: Execute 100 rapid mixed orders in Shift 4
  db.saveProduct({ ...prodCoffee, stock_qty: 500 });
  const startLoad = Date.now();
  for (let i = 0; i < 100; i++) {
    db.createOrder({
      items: [{ id: prodCoffee.id, qty: 1, price: prodCoffee.price }],
      paymentMethod: i % 2 === 0 ? 'cash' : 'card',
      amountPaid: prodCoffee.price,
      user: cashierD,
      shiftId: shift4.id
    });
  }
  const loadDuration = Date.now() - startLoad;
  assert.ok(loadDuration < 5000, `100 orders executed in ${loadDuration}ms (under 5 seconds)`);

  // 50 cash orders * prodCoffee.price
  const s4CashSales = 50 * prodCoffee.price;
  const s4Expected = s3BExpected + s4CashSales;
  const s4State = db.currentShift();
  assert.equal(s4State.expected_cash, s4Expected);

  // Close Shift 4 with exact cash
  const close4 = db.closeShift(shift4.id, s4Expected, 'إغلاق اليوم بالكامل', cashierD);
  assert.equal(close4.success, true);

  // =========================================================================
  // 📊 20. END OF DAY RECONCILIATION & AUDIT COMPLIANCE
  // =========================================================================

  // A. Verify Debt Status for "محمود سعيد"
  const finalDebtsMahmoud = db.listDebts().filter(d => d.customer_name === 'محمود سعيد');
  assert.equal(finalDebtsMahmoud.length, 2);
  assert.ok(finalDebtsMahmoud.every(d => d.status === 'paid'), 'All debts for "محمود سعيد" must be 100% PAID');
  assert.ok(finalDebtsMahmoud.every(d => d.remaining_amount === 0));

  // B. Verify Audit Log counts
  const auditEntries = db.listAuditLog(500);
  assert.ok(auditEntries.length >= 10, 'Audit log must contain complete trace of all critical actions');
  assert.ok(auditEntries.some(a => a.action === 'close_shift'));
  assert.ok(auditEntries.some(a => a.action === 'cancel' && a.entity_type === 'order'));
  assert.ok(auditEntries.some(a => a.action === 'payment' && a.entity_type === 'debt'));

  // C. Verify Total Shifts Audit Count
  const allShifts = db.listShifts(50);
  assert.ok(allShifts.length >= 4, 'Must record all continuous shifts');
});
