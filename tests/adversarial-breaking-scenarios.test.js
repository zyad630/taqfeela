const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function createIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-adversarial-'));
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

test('ADVERSARIAL BREAKING & CHAOS TESTING: 3 Ultimate Scenarios', async (t) => {
  const { db, dir } = createIsolatedDb();
  await db.init(path.join(dir, 'test.db'));

  // seedIfEmpty() in init() already creates manager/cashier1/cashier2/cashier3
  const admin    = db.listUsers().find(u => u.role === 'admin');
  const cashier1 = db.listUsers().find(u => u.username === 'cashier1');
  const cashier2 = db.listUsers().find(u => u.username === 'cashier2');

  // =========================================================================
  // SCENARIO 1: ADVERSARIAL SHIFTS, SPLIT CORRUPTION & BANKING ISOLATION
  // =========================================================================
  await t.test('ADVERSARIAL 1: Corrupted Split Totals, Surplus Cash & Strict Financial Ledger Isolation', () => {
    const prod = db.saveProduct({ name: 'مشروب فحص 1', price: 100, cost: 40, stock_qty: 100, category_id: 1 });
    const s1 = db.openShift(1000, 'شيفت كسر النظام 1', cashier1, 'الشيفت الصباحي');

    // 1. Attack Attempt: Split payment sum does NOT match total (100 != 40 + 30 + 40 = 110)
    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: 1 }], // 100 LE
        paymentMethod: 'split',
        cashAmount: 40,
        cardAmount: 30,
        walletAmount: 40, // Sum = 110 (Mismatch!)
        user: cashier1,
        shiftId: s1.id
      });
    }, /مجموع المبالغ المقسمة يجب أن يساوي إجمالي الفاتورة بالضبط/);

    // 2. Attack Attempt: Under-split (Sum = 90 instead of 100)
    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: 1 }], // 100 LE
        paymentMethod: 'split',
        cashAmount: 40,
        cardAmount: 30,
        walletAmount: 20, // Sum = 90
        user: cashier1,
        shiftId: s1.id
      });
    }, /مجموع المبالغ المقسمة يجب أن يساوي إجمالي الفاتورة بالضبط/);

    // 3. Valid Split Order: 100 LE = 40 Cash + 35 Card + 25 Wallet
    const ordValid = db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      paymentMethod: 'split',
      cashAmount: 40,
      cardAmount: 35,
      walletAmount: 25,
      amountPaid: 100,
      user: cashier1,
      shiftId: s1.id
    });
    assert.equal(ordValid.total, 100);

    // 4. Strict Financial Verification: Card vs Wallet isolation (No mixing!)
    const s1State = db.currentShift();
    assert.equal(s1State.card_sales, 35, 'Bank Card sales must strictly equal 35 LE');
    assert.equal(s1State.wallet_sales, 25, 'Mobile Wallet sales must strictly equal 25 LE');
    assert.equal(s1State.expected_cash, 1040, 'Drawer Cash must only include cash portion (1000 + 40 = 1040)');

    // 5. Cash Surplus / Overage Test: Cashier hands over 1060 LE instead of 1040 LE (+20 LE Surplus)
    const s1Close = db.closeShift(s1.id, 1060, 'تسليم مع وجود زيادة 20 جنيه في الدرج', cashier1);
    assert.equal(s1Close.success, true);
    assert.equal(s1Close.cashDifference, 20, 'System must record EXACT +20 LE cash difference surplus');
    assert.equal(s1Close.actualCash, 1060);

    // 6. Next Shift Handover: Mahmoud inherits the exact 1060 LE actual cash
    const s2 = db.openShift(null, '', cashier2, 'الشيفت المسائي');
    assert.equal(s2.opening_cash, 1060, 'Shift 2 MUST start with actual 1060 LE carried forward');

    db.closeShift(s2.id, 1060, 'إنهاء وردية', cashier2);
  });

  // =========================================================================
  // SCENARIO 2: CONCURRENT RACE CONDITION, DEBT OVER-ALLOCATION & RETURN
  // =========================================================================
  await t.test('ADVERSARIAL 2: Simulated Race Condition on Debt, Over-Settlement & Product Restitution', () => {
    const prod = db.saveProduct({ name: 'سلعة فحص 2', price: 50, cost: 20, stock_qty: 100, category_id: 2 });
    const s = db.openShift(1000, 'شيفت الديون والتزامن', cashier1, 'الشيفت الصباحي');
    const custRace = `عميل_تزامن_${Date.now()}`;

    // Create 1 debt of 100 LE
    const debtOrd = db.createOrder({
      items: [{ id: prod.id, qty: 2 }], // 100 LE
      orderType: 'notebook',
      customerName: custRace,
      user: cashier1,
      shiftId: s.id
    });
    const debtRecord = db.listDebts().find(d => d.order_id === debtOrd.orderId);

    // 1. Race Condition / Double-Spending Simulation:
    // Two cashier terminals simultaneously attempt to settle 80 LE each for a 100 LE debt.
    // Terminal 1 pays 80 LE (Remaining becomes 20 LE)
    const pay1 = db.payDebt({
      debtId: debtRecord.id,
      amount: 80,
      shiftId: s.id,
      cashierName: cashier1.name
    });
    assert.equal(pay1.success, true);
    assert.equal(pay1.newRemaining, 20);

    // Terminal 2 tries to pay 80 LE again immediately on the same debt -> MUST FAIL (Remaining is only 20!)
    const pay2 = db.payDebt({
      debtId: debtRecord.id,
      amount: 80,
      shiftId: s.id,
      cashierName: cashier2.name
    });
    assert.equal(pay2.success, false);
    assert.match(pay2.error, /المبلغ أكبر من المتبقي/);

    // Terminal 2 now pays the exact remaining 20 LE -> SUCCESS
    const pay3 = db.payDebt({
      debtId: debtRecord.id,
      amount: 20,
      shiftId: s.id,
      cashierName: cashier2.name
    });
    assert.equal(pay3.success, true);
    assert.equal(pay3.newRemaining, 0);
    assert.equal(pay3.newStatus, 'paid');

    // 2. Cancellation / Return of Order Restores Physical Inventory:
    const initialStock = db.listProducts().find(p => p.id === prod.id).stock_qty;
    const cancelRes = db.cancelOrder(debtOrd.orderId, 'إلغاء واسترجاع للمخزن', admin);
    assert.equal(cancelRes.success, true);

    const restoredStock = db.listProducts().find(p => p.id === prod.id).stock_qty;
    assert.equal(restoredStock, initialStock + 2, 'Stock must increment exactly by the 2 returned items');

    db.closeShift(s.id, s.expected_cash, 'إغلاق شيفت الديون', cashier1);
  });

  // =========================================================================
  // SCENARIO 3: MALICIOUS INJECTIONS, SEVERE DEDUCTIONS & BACKUP RESTORE
  // =========================================================================
  await t.test('ADVERSARIAL 3: SQL/XSS Injections, Negative Payroll Defense & Real Database Restore', () => {
    const injProd = db.saveProduct({ name: 'منتج أمان فحص 3', price: 25, stock_qty: 100, category_id: 1 });
    // 1. SQL Injection & XSS Attack Payloads in Customer Name, Notes, Reason
    const maliciousName = "'; DROP TABLE orders; -- <script>alert('XSS')</script>";
    const maliciousNotes = "<img src=x onerror=alert('Hacked')> ' OR '1'='1";
    const maliciousReason = "'; DELETE FROM users; -- <iframe src='malicious.site'></iframe>";

    const s = db.openShift(1000, 'شيفت اختبار الاختراق', cashier1, 'الشيفت الصباحي');

    // Create order with malicious payload
    const injectionOrder = db.createOrder({
      items: [{ id: injProd.id, qty: 1 }],
      customerName: maliciousName,
      notes: maliciousNotes,
      paymentMethod: 'cash',
      amountPaid: 25,
      user: cashier1,
      shiftId: s.id
    });
    assert.equal(injectionOrder.customerName, maliciousName);

    // Verify database tables are completely intact (DROP TABLE was neutralized as plain text!)
    const ordersList = db.listOrders({ limit: 10 });
    assert.equal(ordersList.some(o => o.id === injectionOrder.orderId), true, 'Orders table remained intact');

    // Cancel order with malicious reason
    const cancelInj = db.cancelOrder(injectionOrder.orderId, maliciousReason, admin);
    assert.equal(cancelInj.success, true);

    // Verify users table was NOT dropped
    const usersCount = db.listUsers().length;
    assert.ok(usersCount >= 2, 'Users table remained safe from SQL injection');

    // 2. Negative Payroll Floor Test:
    // Base salary = 3500 LE.
    // Penalty 1: 5,000 LE. Penalty 2: 30 days absence (3500 LE). Total Deductions = 8,500 LE!
    // Net Salary MUST NOT become negative (-5,000 LE), it MUST floor at 0.00 LE.
    const curMonth = '2026-09';
    db.addEmployeeAdjustment({
      userId: cashier1.id,
      type: 'penalty',
      amount: 5000,
      date: `${curMonth}-01`,
      reason: 'غرامة إتلاف جسيم',
      createdBy: 'المدير'
    });
    db.addEmployeeAdjustment({
      userId: cashier1.id,
      type: 'absence',
      daysCount: 30,
      date: `${curMonth}-02`,
      reason: 'غياب كامل الشهر',
      createdBy: 'المدير'
    });

    const payroll = db.getMonthlyPayroll(curMonth);
    const cashierRecord = payroll.records.find(r => r.userId === cashier1.id);
    assert.equal(cashierRecord.baseSalary, 3500);
    assert.ok(cashierRecord.totalDeductions > 3500, 'Deductions exceed base salary');
    assert.equal(cashierRecord.netSalary, 0, 'Net salary MUST be floored at 0.00 and NEVER be negative');

    // 3. Real Backup & Restore Verification:
    // Create backup
    const backup = db.createBackup();
    assert.equal(backup.success, true);
    assert.equal(fs.existsSync(backup.path), true);

    // Add a canary product that will be rolled back
    const canary = db.saveProduct({ name: 'منتج سيتم حذفه بالاستعادة', price: 999, category_id: 1 });
    assert.ok(db.listProducts().some(p => p.id === canary.id));

    // Restore the backup
    const restoreRes = db.restoreBackup(backup.path);
    assert.equal(restoreRes.success, true);
    assert.equal(restoreRes.requiresRestart, true);

    // Attempting to restore a non-existent or fake backup path must fail safely
    assert.throws(() => {
      db.restoreBackup('C:\\Windows\\System32\\calc.exe');
    }, /غير صالح/);

    db.closeShift(s.id, s.expected_cash, 'إغلاق شيفت الأمان', cashier1);
  });
});
