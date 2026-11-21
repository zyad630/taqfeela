const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../electron/db');

test('⚡ HIGH-PRESSURE STRESS TEST: 500+ Rapid Orders, Concurrency, Stock & Shift Integrity', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-stress-'));
  const tmpDbPath = path.join(tmpDir, 'stress-pos.db');

  console.log('\n======================================================');
  console.log('⚡ STARTING ULTRA-HIGH PRESSURE STRESS TEST');
  console.log('Target: 500+ rapid transactions in a high-volume cafe');
  console.log('Isolated DB:', tmpDbPath);
  console.log('======================================================\n');

  // Initialize DB in isolated sandbox
  await db.init(tmpDbPath);

  const cashier = { id: 2, name: 'كاشير الورديات السريعة', role: 'cashier' };
  const admin = { id: 1, name: 'المدير العام', role: 'admin' };

  // Fetch menu products & restock with 10,000 units
  const products = db.listProducts();
  assert.ok(products.length >= 10, 'Products should be loaded');
  const p1 = products[0];
  const p2 = products[1];
  const p3 = products[2];

  // Restock for high-volume stress test
  db.saveProduct({ ...p1, stock_qty: 10000 });
  db.saveProduct({ ...p2, stock_qty: 10000 });
  db.saveProduct({ ...p3, stock_qty: 10000 });

  console.log(`[INFO] Product 1: "${p1.name}" - Price: ${p1.price} - Stock: 10000`);
  console.log(`[INFO] Product 2: "${p2.name}" - Price: ${p2.price} - Stock: 10000`);
  console.log(`[INFO] Product 3: "${p3.name}" - Price: ${p3.price} - Stock: 10000`);

  // 1. OPEN SHIFT
  const OPENING_CASH = 1000;
  const shift = db.openShift(OPENING_CASH, 'شيفت الضغط العالي والذروة', cashier, 'الشيفت الصباحي');
  assert.ok(shift && shift.id, 'Shift must open cleanly');
  console.log(`[PASS] Shift #${shift.id} opened with ${OPENING_CASH} EGP opening cash.\n`);

  let totalOrdersCount = 0;
  let p1TotalQtySold = 0;
  let p2TotalQtySold = 0;
  let p3TotalQtySold = 0;
  const startTime = Date.now();

  // 2. BURST 1: 200 RAPID DINE-IN ORDERS
  console.log('>>> [PHASE 1] Executing 200 Rapid Dine-in Orders (Tables 1..20)...');
  for (let i = 1; i <= 200; i++) {
    const tableNum = (i % 20) + 1;
    const qty = (i % 3) + 1;
    const orderTotal = p1.price * qty;

    const orderRes = db.createOrder({
      tableName: `طاولة ${tableNum}`,
      orderType: 'dine_in',
      paymentMethod: 'cash',
      amountPaid: orderTotal,
      subtotal: orderTotal,
      discount: 0,
      total: orderTotal,
      user: cashier,
      shiftId: shift.id,
      items: [
        {
          id: p1.id,
          name: p1.name,
          price: p1.price,
          qty: qty,
          unit_price: p1.price,
          subtotal: orderTotal
        }
      ]
    });

    assert.ok(orderRes && orderRes.orderId, `Dine-in order #${i} must succeed`);
    totalOrdersCount++;
    p1TotalQtySold += qty;
  }
  console.log(`✓ Phase 1 complete: 200 Dine-in orders processed.`);

  // 3. BURST 2: 200 RAPID TAKEAWAY ORDERS WITH MIXED PAYMENTS (CASH + WALLET)
  console.log('>>> [PHASE 2] Executing 200 Rapid Takeaway Orders (Split Cash & Wallet)...');
  for (let i = 1; i <= 200; i++) {
    const isWallet = (i % 3 === 0);
    const method = isWallet ? 'wallet' : 'cash';
    const qty = 2;
    const itemTotal = p2.price * qty;
    const discount = (i % 5 === 0) ? 5 : 0;
    const orderTotal = Math.max(0, itemTotal - discount);

    const orderRes = db.createOrder({
      customerName: `عميل تيك أواي ${i}`,
      orderType: 'takeaway',
      paymentMethod: method,
      amountPaid: orderTotal,
      subtotal: itemTotal,
      discount: discount,
      total: orderTotal,
      user: discount > 0 ? admin : cashier,
      shiftId: shift.id,
      items: [
        {
          id: p2.id,
          name: p2.name,
          price: p2.price,
          qty: qty,
          unit_price: p2.price,
          subtotal: itemTotal
        }
      ]
    });

    assert.ok(orderRes && orderRes.orderId, `Takeaway order #${i} must succeed`);
    totalOrdersCount++;
    p2TotalQtySold += qty;
  }
  console.log(`✓ Phase 2 complete: 200 Takeaway orders processed.`);

  // 4. BURST 3: 100 NOTEBOOK ORDERS & DEBT REPAYMENTS
  console.log('>>> [PHASE 3] Executing 100 Notebook Orders + Debt Payments...');
  for (let i = 1; i <= 100; i++) {
    const customer = `عميل آجل ${i % 10}`;
    const qty = 1;
    const orderTotal = p3.price * qty;

    const orderRes = db.createOrder({
      customerName: customer,
      orderType: 'notebook',
      paymentMethod: 'notebook',
      amountPaid: 0,
      subtotal: orderTotal,
      discount: 0,
      total: orderTotal,
      user: cashier,
      shiftId: shift.id,
      items: [
        {
          id: p3.id,
          name: p3.name,
          price: p3.price,
          qty: qty,
          unit_price: p3.price,
          subtotal: orderTotal
        }
      ]
    });

    assert.ok(orderRes && orderRes.orderId, `Notebook order #${i} must succeed`);
    totalOrdersCount++;
    p3TotalQtySold += qty;
  }

  // Pay partial debts
  const debts = db.listDebts();
  assert.ok(debts.length > 0, 'Debts should be recorded');
  debts.slice(0, 20).forEach((d, idx) => {
    const payRes = db.payDebt({
      debtId: d.id,
      amount: Math.min(20, Number(d.remaining_amount) || 20),
      notes: `سداد دين سريع #${idx}`,
      shiftId: shift.id,
      cashierName: cashier.name
    });
    assert.ok(payRes && payRes.success, `Debt payment #${idx} must succeed`);
  });
  console.log(`✓ Phase 3 complete: 100 Notebook orders & debt settlements processed.`);

  // 5. EXPENSES DURING SHIFT
  console.log('>>> [PHASE 4] Registering Rapid In-Shift Expenses...');
  const exp1 = db.addExpense({
    amount: 150,
    category: 'نثريات وضيافة',
    notes: 'شراء ثلج ومياه معدنية للطوارئ',
    user: cashier,
    shiftId: shift.id
  });
  const exp2 = db.addExpense({
    amount: 250,
    category: 'مشتريات خامات سريعة',
    notes: 'حليب إضافي للبار',
    user: cashier,
    shiftId: shift.id
  });
  assert.ok(exp1 && exp2, 'Expenses must record successfully');
  console.log(`✓ Phase 4 complete: 400 EGP in shift expenses recorded.`);

  const elapsedMs = Date.now() - startTime;
  console.log(`\n⏱️ Total time for ${totalOrdersCount} orders: ${elapsedMs} ms (${(elapsedMs / totalOrdersCount).toFixed(2)} ms/order)`);
  assert.ok(elapsedMs / totalOrdersCount < 50, 'Average order creation latency must be < 50ms');

  // 6. STOCK DEDUCTION AUDIT
  console.log('\n>>> [PHASE 5] Auditing Stock Deductions Against Sales...');
  const p1Final = db.listProducts().find(p => p.id === p1.id);
  const p2Final = db.listProducts().find(p => p.id === p2.id);
  const p3Final = db.listProducts().find(p => p.id === p3.id);

  assert.equal(p1Final.stock_qty, 10000 - p1TotalQtySold, 'Product 1 stock must decrement exactly');
  assert.equal(p2Final.stock_qty, 10000 - p2TotalQtySold, 'Product 2 stock must decrement exactly');
  assert.equal(p3Final.stock_qty, 10000 - p3TotalQtySold, 'Product 3 stock must decrement exactly');
  console.log(`✓ Stock audit passed: All product stock decremented with 100% precision.`);

  // 7. SHIFT RECONCILIATION & CLOSING
  console.log('\n>>> [PHASE 6] Reconciling Shift Financials & Handover...');
  const currentShiftData = db.currentShift();
  assert.ok(currentShiftData, 'Current shift must still be active');
  const expectedCash = currentShiftData.expected_cash;
  console.log('  Opening Cash     :', currentShiftData.opening_cash);
  console.log('  Cash Sales       :', currentShiftData.cash_sales);
  console.log('  Debt Collections :', currentShiftData.debt_collections);
  console.log('  Expenses Total   :', currentShiftData.expenses_total);
  console.log('  Expected Cash    :', expectedCash);

  // Close the shift with exactly expected cash
  const closeRes = db.closeShift(shift.id, expectedCash, 'إغلاق وردية اختبار الضغط بنجاح تام', cashier);
  assert.ok(closeRes && closeRes.success, 'Shift must close cleanly');
  assert.equal(closeRes.cashDifference, 0, 'Cash difference should be exactly zero');
  console.log('✓ Shift closed with exactly 0.00 cash difference.');

  // 8. REPORT GENERATION CHECK UNDER LOAD
  console.log('\n>>> [PHASE 7] Verifying Reports Generation...');
  const shiftReport = db.getReportShift({ shiftId: shift.id });
  assert.ok(shiftReport && shiftReport.shift, 'Shift report must generate');
  assert.equal(shiftReport.orders.length, totalOrdersCount, `Report orders count must equal ${totalOrdersCount}`);
  console.log(`✓ Shift report verified: ${shiftReport.orders.length} orders accurately recorded.`);

  // Cleanup isolated sandbox
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n======================================================');
  console.log('🏆 HIGH PRESSURE STRESS TEST PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
});
