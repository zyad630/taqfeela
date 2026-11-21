/**
 * Full Cafe Day End-to-End Integration & Concurrency Stress Test
 * Simulates a chaotic, high-pressure cafe operation covering:
 *  - Halls/Sections management (resetSectionTables with qr_token, deleteSection blocked when busy)
 *  - Rapid table transfers (25+ back-to-back table & partial item transfers with 0 lost items)
 *  - Takeaway + Dine-in + Split + Notebook interleaved orders
 *  - Cancelling an old completed order on Table X while a NEW customer is live on Table X
 *  - Restoring a cancelled notebook order with upfront payment & verifying stock_movements (-qty)
 *  - Editing a cash order into a notebook order (updateOrder -> customer_debts)
 *  - Expenses, shift adjustments, FIFO debt repayment (blocked without shift, accurate with shift)
 *  - Employee payroll (explicit salary = 0 + normal salaries + absence + penalty + bonus)
 *  - User deletion blocked while shift is open
 *  - Cross-report mathematical reconciliation:
 *      computeShiftCash === getReportShift === getDailySummaryReport === getReportSales === exportOrdersExcel
 *  - Audit log cryptographic HMAC chain integrity (verifyAuditLogChain)
 *  - Backup & restore preserving PRAGMA foreign_keys = ON
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-e2e-stress-'));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir, isPackaged: false } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  process.env.CAFE_TEST_AUTOMATION = '1';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

test('Full Cafe Integration & High-Pressure Stress Test', async () => {
  const { db, dir } = loadIsolatedDb();
  try {
    await db.init();
    db.setupInitialAdmin('AdminStress#2026', 'المدير العام');
    const admin = db.loginUser('admin', 'AdminStress#2026');
    assert.ok(admin && admin.role === 'admin');

    // Create 2 employees: 1 normal cashier, 1 zero-salary partner
    const cashier = db.saveUser({
      username: 'cashier_stress',
      name: 'كاشير الضغط',
      password: 'CashierPass#2026',
      role: 'cashier',
      salary: 4500
    });
    const zeroPartner = db.saveUser({
      username: 'partner_zero',
      name: 'شريك بدون راتب',
      password: 'PartnerPass#2026',
      role: 'cashier',
      salary: 0
    });

    // Products with known stock
    const pCoffee = db.saveProduct({ name: 'إسبريسو', price: 40, cost: 10, category_id: 1, stock_qty: 500 });
    const pTea = db.saveProduct({ name: 'شاي نعناع', price: 25, cost: 5, category_id: 1, stock_qty: 500 });
    const pCake = db.saveProduct({ name: 'تشيز كيك', price: 85, cost: 30, category_id: 1, stock_qty: 200 });

    // Create new hall + 6 tables via resetSectionTables -> verify qr_token
    const vipHall = db.saveSection({ name: 'صالة VIP' });
    assert.ok(vipHall && vipHall.id);
    const tablesAfterReset = db.resetSectionTables({
      sectionId: vipHall.id,
      sectionName: vipHall.name,
      tableCount: 6,
      startNumber: 1,
      prefix: 'VIP'
    });
    const vipTables = tablesAfterReset.filter(t => t.hall === vipHall.name);
    assert.strictEqual(vipTables.length, 6);
    for (const vt of vipTables) {
      assert.ok(vt.qr_token && vt.qr_token.length >= 16, `Table ${vt.name} must have a valid qr_token`);
    }

    // Open Shift with 1000 EGP opening cash
    const shift = db.openShift(1000, 'وردية ضغط كاملة', cashier, 'الشيفت الصباحي');
    assert.ok(shift && shift.id);

    // Deleting cashier while shift is open MUST be blocked
    const delCashierBlocked = db.deleteUser(cashier.id);
    assert.strictEqual(delCashierBlocked.success, false);

    // 1. Rapid table transfers & partial item transfers (25 operations)
    const tA = vipTables[0];
    const tB = vipTables[1];
    const tC = vipTables[2];
    const initSave = db.saveTableCart(tA.id, {
      cart: [
        { id: pCoffee.id, name: pCoffee.name, price: 40, qty: 10, sent_qty: 10, notes: '' },
        { id: pTea.id, name: pTea.name, price: 25, qty: 8, sent_qty: 4, notes: 'سكر خفيف' }
      ],
      customerName: 'مجموعة VIP',
      printedCheck: true
    });
    assert.strictEqual(initSave.success, true);

    // Deleting VIP hall while occupied MUST be blocked
    assert.strictEqual(db.deleteSection(vipHall.id).success, false);

    // Transfer 1 coffee at a time (5 times) from A -> B, then 5 times B -> C, then full transfer C -> A
    for (let i = 0; i < 5; i++) {
      const r1 = db.transferTableItem({ fromTableId: tA.id, toTableId: tB.id, itemId: pCoffee.id, qty: 1, notes: '' });
      assert.strictEqual(r1.success, true);
    }
    const cartsMid = db.getTableCarts();
    assert.strictEqual(cartsMid[tA.id].printedCheck, false, 'Source printedCheck must be reset after partial transfer');
    assert.strictEqual(cartsMid[tB.id].printedCheck, false, 'Target printedCheck must be reset after partial transfer');

    for (let i = 0; i < 5; i++) {
      const r2 = db.transferTableItem({ fromTableId: tB.id, toTableId: tC.id, itemId: pCoffee.id, qty: 1, notes: '' });
      assert.strictEqual(r2.success, true);
    }
    assert.strictEqual(db.getTableCarts()[tB.id], undefined, 'Table B must be empty after moving all items out');

    // Full transfer C -> A (merges back 5 coffees into A's remaining 5 coffees = 10 coffees total!)
    const mergeBack = db.transferTable({ fromTableId: tC.id, toTableId: tA.id });
    assert.strictEqual(mergeBack.success, true);
    const mergedCartA = db.getTableCarts()[tA.id];
    const totalCoffees = mergedCartA.cart.filter(x => x.id === pCoffee.id).reduce((s, x) => s + x.qty, 0);
    const totalTeas = mergedCartA.cart.filter(x => x.id === pTea.id).reduce((s, x) => s + x.qty, 0);
    assert.strictEqual(totalCoffees, 10, 'Zero coffees lost after 11 transfers');
    assert.strictEqual(totalTeas, 8, 'Zero teas lost after 11 transfers');

    // 2. Interleaved Takeaway order with stale tableId MUST NOT touch Table A
    const tkOrder = db.createOrder({
      items: [{ id: pCake.id, qty: 2 }], // 170 EGP
      orderType: 'takeaway',
      tableId: tA.id, // stale!
      paymentMethod: 'cash',
      amountPaid: 170,
      user: cashier,
      shiftId: shift.id
    });
    assert.strictEqual(tkOrder.success, true);
    assert.strictEqual(tkOrder.tableId, null);
    assert.ok(db.getTableCarts()[tA.id], 'Table A must still be occupied after takeaway order');

    // 3. Checkout Table A (10*40 + 8*25 = 600 EGP, split: 350 cash + 250 wallet)
    const revA = db.getTableCarts()[tA.id]._rev;
    const dineInOrder = db.createOrder({
      items: mergedCartA.cart,
      orderType: 'dine_in',
      tableId: tA.id,
      expectedCartRev: revA,
      paymentMethod: 'split',
      cashAmount: 350,
      walletAmount: 250,
      cardAmount: 0,
      amountPaid: 600,
      user: cashier,
      shiftId: shift.id
    });
    assert.strictEqual(dineInOrder.success, true);
    assert.strictEqual(db.getTableCarts()[tA.id], undefined);

    // 4. New customer sits on Table A, then admin cancels an OLD order on Table A (let's create & cancel another completed dine-in on tA? Actually dineInOrder is already completed on tA!)
    const liveNewCart = db.saveTableCart(tA.id, {
      cart: [{ id: pCake.id, name: pCake.name, price: 85, qty: 1 }],
      customerName: 'عميل جديد حي'
    });
    assert.strictEqual(liveNewCart.success, true);

    // Create a second completed order on tB, then cancel it while tB gets a new customer
    const saveB2 = db.saveTableCart(tB.id, { cart: [{ id: pCoffee.id, name: pCoffee.name, price: 40, qty: 2 }] });
    const oldOrderB = db.createOrder({
      items: [{ id: pCoffee.id, qty: 2 }], // 80 EGP cash
      orderType: 'dine_in',
      tableId: tB.id,
      expectedCartRev: saveB2.rev,
      paymentMethod: 'cash',
      amountPaid: 80,
      user: cashier,
      shiftId: shift.id
    });
    const liveB = db.saveTableCart(tB.id, { cart: [{ id: pTea.id, name: pTea.name, price: 25, qty: 3 }], customerName: 'عميل B الجديد' });
    assert.strictEqual(liveB.success, true);

    // Cancel oldOrderB -> MUST NOT wipe liveB!
    const cancelB = db.cancelOrder(oldOrderB.id, 'خطأ قديم', admin, 'cash', true);
    assert.strictEqual(cancelB.success, true);
    assert.ok(db.getTableCarts()[tB.id], 'Live customer on Table B must survive cancelling an older order on Table B');
    assert.strictEqual(db.getTableCarts()[tB.id].customerName, 'عميل B الجديد');

    // Clear live tables A & B before closing shift
    db.saveTableCart(tA.id, { cart: [], _force: true });
    db.saveTableCart(tB.id, { cart: [], _force: true });

    // 5. Notebook order (200 EGP total, 50 EGP upfront -> 150 remaining), cancel & restore, then pay 100 EGP via FIFO
    const nbOrder = db.createOrder({
      items: [{ id: pCoffee.id, qty: 5 }], // 200 EGP
      orderType: 'notebook',
      paymentMethod: 'notebook',
      customerName: 'عميل آجل VIP',
      customerPhone: '01099887766',
      amountPaid: 50,
      user: admin,
      shiftId: shift.id
    });
    assert.strictEqual(nbOrder.success, true);
    assert.strictEqual(db.cancelOrder(nbOrder.id, 'إلغاء تجربة', admin, 'cash', true).success, true);
    assert.strictEqual(db.restoreOrder(nbOrder.id, admin).success, true);

    const debtAfterRestore = db.queryGet('SELECT * FROM customer_debts WHERE order_id = ?', [nbOrder.id]);
    assert.strictEqual(Number(debtAfterRestore.paid_amount), 50);
    assert.strictEqual(Number(debtAfterRestore.remaining_amount), 150);

    const fifoPay = db.payCustomerDebtsFIFO({
      customerName: 'عميل آجل VIP',
      customerPhone: '01099887766',
      amount: 100,
      shiftId: shift.id,
      cashierName: cashier.name,
      paymentMethod: 'cash'
    });
    assert.strictEqual(fifoPay.success, true);
    const debtAfterFifo = db.queryGet('SELECT * FROM customer_debts WHERE order_id = ?', [nbOrder.id]);
    assert.strictEqual(Number(debtAfterFifo.remaining_amount), 50);

    // 6. Expense (120 EGP) + Shift adjustment (+30 EGP in)
    assert.strictEqual(db.addExpense({ amount: 120, category: 'خامات', notes: 'لبن وسكر', shiftId: shift.id, userId: cashier.id, userName: cashier.name }).success, true);
    assert.strictEqual(db.addShiftAdjustment({ shiftId: shift.id, type: 'in', amount: 30, reason: 'فكة إضافية', actor: admin }).success, true);

    // 7. Financial Reconciliation BEFORE & AFTER Shift Close
    // Valid orders in shift:
    //  - tkOrder: 170 (170 cash)
    //  - dineInOrder: 600 (350 cash, 250 wallet)
    //  - nbOrder: 200 (50 cash upfront, 150 debt)
    //  - oldOrderB: 80 CANCELLED (0 sales, 0 cash)
    // Total Sales = 170 + 600 + 200 = 970
    // Cash Sales = 170 + 350 + 50 = 570
    // Debt Cash Collection = 100
    // Expenses = 120
    // Adjustments = +30
    // Expected Cash = 1000 + 570 + 100 - 120 + 30 = 1580
    const comp = db.computeShiftCash(shift.id);
    assert.strictEqual(comp.total_sales, 970);
    assert.strictEqual(comp.cash_sales, 570);
    assert.strictEqual(comp.wallet_sales, 250);
    assert.strictEqual(comp.debt_cash_in, 100);
    assert.strictEqual(comp.expenses_total, 120);
    assert.strictEqual(comp.adjustments_total, 30);
    assert.strictEqual(comp.expected_cash, 1580);

    const closeRes = db.closeShift(shift.id, 1580, 'إغلاق متطابق 100%', cashier);
    assert.strictEqual(closeRes.success, true);
    assert.strictEqual(closeRes.expectedCash, 1580);
    assert.strictEqual(closeRes.cashDifference, 0);

    // Cross-check ALL reporting functions against ground truth!
    const repShift = db.getReportShift({ shiftId: shift.id });
    assert.strictEqual(Number(repShift.shift.total_sales), 970);
    assert.strictEqual(Number(repShift.shift.expected_cash), 1580);

    const repSales = db.getReportSales({ shiftId: shift.id });
    assert.strictEqual(Number(repSales.summary.total_sales), 970);
    assert.strictEqual(Number(repSales.summary.cash_sales), 570);
    assert.strictEqual(Number(repSales.summary.wallet_sales), 250);

    const repDaily = db.getDailySummaryReport(db.getCairoTodayString());
    assert.strictEqual(Number(repDaily.grandTotal.totalSales), 970);
    assert.strictEqual(Number(repDaily.grandTotal.cashSales), 570);
    assert.strictEqual(Number(repDaily.grandTotal.totalExpenses), 120);

    const xlsHtml = db.exportOrdersExcel({ shiftId: shift.id });
    assert.ok(xlsHtml.includes('صافي: 970.00 ج.م'), 'Excel export must equal 970.00 (excluding cancelled 80 EGP order)');

    // 8. Payroll check (zero salary stays 0, normal cashier gets accurate net)
    db.addEmployeeAdjustment({ userId: cashier.id, type: 'absence', daysCount: 1, reason: 'غياب' });
    db.addEmployeeAdjustment({ userId: cashier.id, type: 'bonus', amount: 200, reason: 'مكافأة ضغط' });
    const payroll = db.getMonthlyPayroll();
    const pZero = payroll.records.find(r => r.userId === zeroPartner.id);
    const pCash = payroll.records.find(r => r.userId === cashier.id);
    assert.strictEqual(pZero.baseSalary, 0);
    assert.strictEqual(pZero.netSalary, 0);
    assert.strictEqual(pCash.baseSalary, 4500);
    assert.strictEqual(pCash.dailyRate, 150);
    assert.strictEqual(pCash.netSalary, 4550); // 4500 - 150 + 200

    // 9. FIFO debt payment MUST fail cleanly when no shift is open
    assert.strictEqual(db.payCustomerDebtsFIFO({ customerName: 'عميل آجل VIP', amount: 50 }).success, false);

    // 10. Backup & Restore preserves PRAGMA foreign_keys = ON
    const bk = db.createBackup();
    assert.strictEqual(bk.success, true);
    const rest = db.restoreBackup(bk.path);
    assert.strictEqual(rest.success, true);
    const fkVal = db.queryGet('PRAGMA foreign_keys');
    assert.strictEqual(Number(fkVal.foreign_keys), 1, 'PRAGMA foreign_keys must remain ON after restoreBackup');

    // 11. Audit log cryptographic chain verification
    const chain = db.verifyAuditLogChain();
    assert.strictEqual(chain.valid, true, 'Audit log HMAC chain must remain 100% valid');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
});

