const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function createIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-stress-test-'));
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

test('STRESS TEST 1: 1,000+ High Volume Orders across Multi-Shift Cycle with Exact Cash Balance', async () => {
  const { db } = createIsolatedDb();
  await db.init();

  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const cashier2 = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234');
  const cashier3 = db.loginUser('cashier3', '123456') || db.loginUser('cashier3', '1234');
  const cashiers = [cashier1, cashier2, cashier3];

  // Restock products with ample inventory for stress test
  const products = db.listProducts();
  for (const p of products) {
    db.saveProduct({ ...p, stock_qty: 50000 });
  }

  let totalExpectedInvoices = 0;
  let previousClosingCash = 1000;
  let runningShiftId = 0;

  // Run 5 consecutive shift cycles
  for (let shiftIdx = 0; shiftIdx < 5; shiftIdx++) {
    const activeCashier = cashiers[shiftIdx % cashiers.length];
    const shiftType = `الشيفت رقم ${shiftIdx + 1}`;
    
    // Open shift with carried cash or opening cash
    const shift = db.openShift(shiftIdx === 0 ? 1000 : null, `ملاحظات فتح ${shiftIdx + 1}`, activeCashier, shiftType);
    assert.ok(shift && shift.id);
    runningShiftId = shift.id;

    if (shiftIdx > 0) {
      assert.equal(shift.opening_cash, previousClosingCash, `Shift ${shiftIdx + 1} must carry closing cash`);
    }

    let shiftExpectedCashSales = 0;
    let shiftExpectedCardSales = 0;
    let shiftExpectedWalletSales = 0;

    // Generate 200 orders per shift (1,000 total across shifts)
    for (let oIdx = 0; oIdx < 200; oIdx++) {
      totalExpectedInvoices++;
      const prod = products[oIdx % products.length];
      const qty = (oIdx % 3) + 1;
      const subtotal = prod.price * qty;
      const discount = (oIdx % 10 === 0) ? Math.min(10, Math.floor(subtotal * 0.1)) : 0;
      const expectedTotal = subtotal - discount;
      
      const paymentMethods = ['cash', 'card', 'wallet'];
      const paymentMethod = paymentMethods[oIdx % 3];

      if (paymentMethod === 'cash') shiftExpectedCashSales += expectedTotal;
      else if (paymentMethod === 'card') shiftExpectedCardSales += expectedTotal;
      else if (paymentMethod === 'wallet') shiftExpectedWalletSales += expectedTotal;

      const orderResult = db.createOrder({
        items: [{ id: prod.id, qty, price: prod.price }],
        paymentMethod,
        orderType: oIdx % 2 === 0 ? 'takeaway' : 'hall',
        customerName: `عميل ${shiftIdx}-${oIdx}`,
        discount,
        tax: 0,
        amountPaid: expectedTotal + (paymentMethod === 'cash' ? 10 : 0), // Cashier overpaid by 10
        user: discount > 0 ? admin : activeCashier,
        shiftId: shift.id
      });

      assert.equal(orderResult.invoiceNo, String(totalExpectedInvoices), 'Invoices must be strictly sequential');
      assert.equal(orderResult.total, expectedTotal);
      if (paymentMethod === 'cash') {
        assert.equal(orderResult.changeDue, 10);
      }
    }

    // Add some expenses during this shift
    const exp1 = 50.50;
    const exp2 = 25.25;
    db.addExpense({ shiftId: shift.id, amount: exp1, category: 'نظافة', notes: 'منظفات' });
    db.addExpense({ shiftId: shift.id, amount: exp2, category: 'ضيافة', notes: 'شاي عمال' });
    const shiftExpenses = exp1 + exp2;

    // Check shift calculations
    const state = db.currentShift();
    assert.equal(state.total_orders, 200);
    assert.equal(Math.round(state.cash_sales * 100) / 100, Math.round(shiftExpectedCashSales * 100) / 100);
    assert.equal(Math.round(state.card_sales * 100) / 100, Math.round(shiftExpectedCardSales * 100) / 100);
    assert.equal(Math.round(state.wallet_sales * 100) / 100, Math.round(shiftExpectedWalletSales * 100) / 100);
    assert.equal(Math.round(state.expenses_total * 100) / 100, Math.round(shiftExpenses * 100) / 100);

    const expectedCashCalculated = Math.round((shift.opening_cash + shiftExpectedCashSales - shiftExpenses) * 100) / 100;
    assert.equal(Math.round(state.expected_cash * 100) / 100, expectedCashCalculated);

    // Close shift with exact expected cash
    const closeRes = db.closeShift(shift.id, expectedCashCalculated, `تسليم شيفت ${shiftIdx + 1}`);
    assert.equal(closeRes.success, true);
    assert.equal(closeRes.cashDifference, 0);
    previousClosingCash = expectedCashCalculated;
  }

  assert.equal(totalExpectedInvoices, 1000);
  const allShifts = db.listShifts(10);
  assert.equal(allShifts.length, 5);
  assert.equal(db.currentShift(), null);
});

test('STRESS TEST 2: Inventory Race, Boundary Depletion, Low Stock Alert, and Reversal', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');

  // Create a limited stock item (exact 15 units)
  const cat = db.listCategories()[0];
  const item = db.saveProduct({
    name: 'حلوى خاصة محدودة',
    price: 45,
    cost: 20,
    category_id: cat.id,
    stock_qty: 15,
    low_stock_threshold: 5
  });

  const shift = db.openShift(500, '', admin, 'شيفت فحص المخزون');

  // Sell 10 units in batches
  db.createOrder({
    items: [{ id: item.id, qty: 5, price: 45 }],
    paymentMethod: 'cash',
    amountPaid: 225,
    user: admin,
    shiftId: shift.id
  });

  let currentStock = db.listProducts().find(p => p.id === item.id).stock_qty;
  assert.equal(currentStock, 10);

  // Check low stock not triggered yet
  let dashboard = db.getDashboardStats();
  assert.equal(dashboard.lowStockItems.some(p => p.id === item.id), false);

  // Sell 6 more units (Stock goes to 4 <= threshold 5)
  const order2 = db.createOrder({
    items: [{ id: item.id, qty: 6, price: 45 }],
    paymentMethod: 'cash',
    amountPaid: 270,
    user: admin,
    shiftId: shift.id
  });

  currentStock = db.listProducts().find(p => p.id === item.id).stock_qty;
  assert.equal(currentStock, 4);

  // Now low stock should be triggered
  dashboard = db.getDashboardStats();
  assert.equal(dashboard.lowStockItems.some(p => p.id === item.id), true);

  // Attempt to sell 5 units when only 4 are left -> MUST FAIL
  assert.throws(() => {
    db.createOrder({
      items: [{ id: item.id, qty: 5, price: 45 }],
      paymentMethod: 'cash',
      amountPaid: 225,
      user: admin,
      shiftId: shift.id
    });
  }, /المخزون غير كاف/);

  // Stock must still be 4 after failed transaction (atomic rollback)
  currentStock = db.listProducts().find(p => p.id === item.id).stock_qty;
  assert.equal(currentStock, 4);

  // Sell remaining 4 units down to exactly 0
  db.createOrder({
    items: [{ id: item.id, qty: 4, price: 45 }],
    paymentMethod: 'cash',
    amountPaid: 180,
    user: admin,
    shiftId: shift.id
  });
  currentStock = db.listProducts().find(p => p.id === item.id).stock_qty;
  assert.equal(currentStock, 0);

  // Attempt to sell 1 unit from 0 stock -> MUST FAIL
  assert.throws(() => {
    db.createOrder({
      items: [{ id: item.id, qty: 1, price: 45 }],
      paymentMethod: 'cash',
      amountPaid: 45,
      user: admin,
      shiftId: shift.id
    });
  }, /المخزون غير كاف/);

  // Cancel order2 (which had 6 units) and verify stock restores to exactly 6
  const cancelRes = db.cancelOrder(order2.orderId, 'إلغاء لطلب العميل', admin);
  assert.equal(cancelRes.success, true);
  currentStock = db.listProducts().find(p => p.id === item.id).stock_qty;
  assert.equal(currentStock, 6);

  // Verify stock movements log exists and is accurate
  const movements = db.listStockMovements(item.id);
  assert.ok(movements.length >= 4);
  const returnMovement = movements.find(m => m.movement_type === 'return');
  assert.equal(returnMovement.quantity, 6);
});

test('STRESS TEST 3: 50 Customer Debts / Notebook Accounts with Multi-Stage Installments & Cross-Shift Collection', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const product = db.listProducts()[0];
  db.saveProduct({ ...product, stock_qty: 1000 });

  // Shift 1: Create 50 debts
  const shift1 = db.openShift(1000, '', cashier1, 'شيفت إنشاء الديون');
  const createdDebtIds = [];

  for (let i = 1; i <= 50; i++) {
    const order = db.createOrder({
      items: [{ id: product.id, qty: 2, price: product.price }],
      paymentMethod: 'notebook',
      orderType: 'notebook',
      customerName: `عميل نوتة ${i}`,
      customerPhone: `010000000${i.toString().padStart(2, '0')}`,
      amountPaid: 0,
      user: cashier1,
      shiftId: shift1.id
    });
    const debts = db.listDebts();
    const d = debts.find(x => x.order_id === order.orderId);
    assert.ok(d);
    assert.equal(d.status, 'unpaid');
    assert.equal(d.total_amount, product.price * 2);
    assert.equal(d.remaining_amount, product.price * 2);
    createdDebtIds.push(d.id);
  }

  // Close shift 1 (no cash was collected for debts)
  const close1 = db.closeShift(shift1.id, 1000, 'إغلاق شيفت 1');
  assert.equal(close1.success, true);

  // Shift 2: Admin collects 50% from each debt
  const shift2 = db.openShift(1000, '', admin, 'شيفت تحصيل أقساط');
  let expectedCollectedInShift2 = 0;

  for (const debtId of createdDebtIds) {
    const half = product.price; // since total was 2 * price
    const payRes = db.payDebt({
      debtId,
      amount: half,
      shiftId: shift2.id,
      cashierName: admin.name,
      notes: 'دفعة أولى 50%'
    });
    assert.equal(payRes.success, true);
    assert.equal(payRes.newStatus, 'partial');
    assert.equal(payRes.newRemaining, half);
    expectedCollectedInShift2 += half;
  }

  // Verify shift 2 expected cash has received exactly the debt collections
  const currentS2 = db.currentShift();
  assert.equal(currentS2.debt_collections, expectedCollectedInShift2);
  assert.equal(currentS2.expected_cash, 1000 + expectedCollectedInShift2);

  // Close shift 2
  const close2 = db.closeShift(shift2.id, 1000 + expectedCollectedInShift2, 'إغلاق شيفت 2');
  assert.equal(close2.success, true);

  // Shift 3: Collect the remaining 50% for all debts -> all become 'paid'
  const shift3 = db.openShift(close2.actualCash, '', cashier1, 'شيفت السداد النهائي');
  for (const debtId of createdDebtIds) {
    const half = product.price;
    const payRes = db.payDebt({
      debtId,
      amount: half,
      shiftId: shift3.id,
      cashierName: cashier1.name,
      notes: 'سداد نهائي'
    });
    assert.equal(payRes.success, true);
    assert.equal(payRes.newStatus, 'paid');
    assert.equal(payRes.newRemaining, 0);
  }

  // Verify all 50 debts in DB are now 'paid' with 0 remaining
  const allDebts = db.listDebts();
  for (const debtId of createdDebtIds) {
    const d = allDebts.find(x => x.id === debtId);
    assert.equal(d.status, 'paid');
    assert.equal(d.remaining_amount, 0);
    assert.equal(d.payments.length, 2);
  }
});

test('STRESS TEST 4: Payroll & Employee Adjustments Engine Edge Cases and Decimal Robustness', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');

  // Add 10 test employees with diverse salaries
  const createdUsers = [];
  for (let i = 1; i <= 10; i++) {
    const user = db.saveUser({
      username: `emp_${i}`,
      name: `موظف تجربة ${i}`,
      password: 'password',
      role: 'cashier',
      phone: `011111111${i.toString().padStart(2, '0')}`,
      salary: 3000 + i * 500
    });
    createdUsers.push(user);
  }

  const currentMonth = new Date().toISOString().slice(0, 7);

  // Add mixed adjustments: bonuses, penalties, absence days
  for (let i = 0; i < createdUsers.length; i++) {
    const u = createdUsers[i];
    // Add bonus
    db.addEmployeeAdjustment({
      userId: u.id,
      type: 'bonus',
      amount: 250.75,
      date: `${currentMonth}-10`,
      reason: 'مكافأة تميز',
      createdBy: admin.name
    });

    // Add penalty
    db.addEmployeeAdjustment({
      userId: u.id,
      type: 'penalty',
      amount: 100.25,
      date: `${currentMonth}-15`,
      reason: 'خصم تأخير',
      createdBy: admin.name
    });

    // Add 2 days of absence
    db.addEmployeeAdjustment({
      userId: u.id,
      type: 'absence',
      daysCount: 2,
      date: `${currentMonth}-20`,
      reason: 'غياب بدون إذن',
      createdBy: admin.name
    });
  }

  const payroll = db.getMonthlyPayroll(currentMonth);
  assert.ok(payroll.records.length >= 14); // 4 defaults + 10 created

  for (const u of createdUsers) {
    const rec = payroll.records.find(r => r.userId === u.id);
    assert.ok(rec);
    const dailyRate = Math.round((u.salary / 30) * 100) / 100;
    const expectedAbsenceDeduction = Math.round(2 * dailyRate * 100) / 100;
    const expectedDeductions = expectedAbsenceDeduction + 100.25;
    const expectedNet = Math.max(0, Math.round((u.salary - expectedDeductions + 250.75) * 100) / 100);

    assert.equal(rec.dailyRate, dailyRate);
    assert.equal(rec.absenceDeduction, expectedAbsenceDeduction);
    assert.equal(rec.penaltiesTotal, 100.25);
    assert.equal(rec.bonusesTotal, 250.75);
    assert.equal(rec.netSalary, expectedNet);
  }

  // Extreme test: Penalty higher than salary -> net salary must never be negative (clamped to 0)
  const brokeUser = createdUsers[0];
  db.addEmployeeAdjustment({
    userId: brokeUser.id,
    type: 'penalty',
    amount: 999999,
    date: `${currentMonth}-28`,
    reason: 'غرامة إتلاف جسيم',
    createdBy: admin.name
  });

  const payrollAfterPenalty = db.getMonthlyPayroll(currentMonth);
  const brokeRec = payrollAfterPenalty.records.find(r => r.userId === brokeUser.id);
  assert.equal(brokeRec.netSalary, 0, 'Net salary cannot fall below 0');
});

test('STRESS TEST 5: Backup Creation, Restore Validation, and Corrupt File Rejection', async () => {
  const { db, dir } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');

  // Insert identifiable data
  const cat = db.saveCategory({ name: 'قسم ما قبل النسخ الاحتياطي', icon: '💾' });
  const prod = db.saveProduct({ name: 'صنف قبل النسخ الاحتياطي', price: 99, category_id: cat.id, stock_qty: 100 });
  const shift = db.openShift(2000, 'شيفت النسخ', admin, 'شيفت النسخ');
  db.createOrder({
    items: [{ id: prod.id, qty: 2, price: 99 }],
    paymentMethod: 'cash',
    amountPaid: 198,
    user: admin,
    shiftId: shift.id
  });

  // Create valid backup
  const backupRes = db.createBackup();
  assert.equal(backupRes.success, true);
  assert.ok(fs.existsSync(backupRes.path));

  // Add more data after backup
  db.saveCategory({ name: 'قسم بعد النسخ', icon: '🚀' });

  // Test 1: Reject path traversal / invalid location restore
  assert.throws(() => {
    db.restoreBackup('C:\\Windows\\System32\\calc.exe');
  }, /ملف النسخة الاحتياطية غير صالح/);

  // Test 2: Reject non-existent file
  assert.throws(() => {
    db.restoreBackup(path.join(path.dirname(backupRes.path), 'fake-backup.db'));
  }, /ملف النسخة الاحتياطية غير صالح/);

  // Test 3: Restore valid backup
  const restoreRes = db.restoreBackup(backupRes.path);
  assert.equal(restoreRes.success, true);
  assert.equal(restoreRes.requiresRestart, true);
});

test('STRESS TEST 6: Financial Safety, Input Sanitization, and Unauthorized Action Prevention', async () => {
  const { db } = createIsolatedDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234');
  const cashier2 = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234');
  const product = db.listProducts()[0];

  const shift1 = db.openShift(500, '', cashier1, 'شيفت 1');

  // 1. Rejection of NaN / Infinity / Negative prices or discounts
  assert.throws(() => {
    db.createOrder({
      items: [{ id: product.id, qty: 1, price: product.price }],
      paymentMethod: 'cash',
      discount: -50,
      user: cashier1,
      shiftId: shift1.id
    });
  }, /discount/);

  assert.throws(() => {
    db.createOrder({
      items: [{ id: product.id, qty: 1, price: product.price }],
      paymentMethod: 'cash',
      discount: NaN,
      user: cashier1,
      shiftId: shift1.id
    });
  }, /discount/);

  // 2. Rejection of discount > subtotal
  assert.throws(() => {
    db.createOrder({
      items: [{ id: product.id, qty: 1, price: product.price }],
      paymentMethod: 'cash',
      discount: product.price + 100,
      user: cashier1,
      shiftId: shift1.id
    });
  }, /الخصم لا يمكن أن يتجاوز إجمالي الطلب/);

  // 3. Rejection of underpayment for normal orders
  assert.throws(() => {
    db.createOrder({
      items: [{ id: product.id, qty: 1, price: product.price }],
      paymentMethod: 'cash',
      amountPaid: product.price - 5,
      user: cashier1,
      shiftId: shift1.id
    });
  }, /invalid payment amount|المبلغ المدفوع أقل من إجمالي الفاتورة/);

  // 4. Create valid order in shift 1 by cashier 1
  const validOrder = db.createOrder({
    items: [{ id: product.id, qty: 1, price: product.price }],
    paymentMethod: 'cash',
    amountPaid: product.price,
    user: cashier1,
    shiftId: shift1.id
  });

  // Close shift 1
  db.closeShift(shift1.id, 500 + product.price, 'إغلاق');

  // Shift 2 by cashier 2
  const shift2 = db.openShift(null, '', cashier2, 'شيفت 2');

  // Cashier 2 attempts to cancel Cashier 1's closed shift order -> MUST BE REJECTED
  const cancelAttempt = db.cancelOrder(validOrder.orderId, 'إلغاء غير مصرح به', cashier2);
  assert.equal(cancelAttempt.success, false);
  assert.ok(cancelAttempt.error && (cancelAttempt.error.includes('غير مسموح للكاشير') || cancelAttempt.error.includes('لا تملك صلاحية') || cancelAttempt.error.includes('المدير')));

  // Admin cancels Cashier 1's closed shift order -> MUST SUCCEED
  const adminCancel = db.cancelOrder(validOrder.orderId, 'إلغاء مصرح به بواسطة المدير', admin);
  assert.equal(adminCancel.success, true);

  // 5. Test debt deletion with hashed admin password
  const debtOrder = db.createOrder({
    items: [{ id: product.id, qty: 1, price: product.price }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'عميل حذف النوتة',
    user: admin,
    shiftId: shift2.id
  });
  const debt = db.listDebts().find((d) => d.order_id === debtOrder.orderId);
  assert.ok(debt);

  // Wrong password rejection
  const wrongPassRes = db.deleteDebt({ debtId: debt.id, adminPassword: 'wrong_password' });
  assert.equal(wrongPassRes.success, false);

  // Correct admin password (hashed in DB) must succeed
  let correctPassRes = db.deleteDebt({ debtId: debt.id, adminPassword: '1234' });
  if (!correctPassRes.success) correctPassRes = db.deleteDebt({ debtId: debt.id, adminPassword: 'admin' });
  assert.equal(correctPassRes.success, true);
  assert.equal(db.listDebts().some((d) => d.id === debt.id), false);
});
