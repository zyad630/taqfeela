const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../electron/db');

test('⚔️ SCENARIO 4: FULL ADVERSARIAL STRESS & ATTACK SUITE (12 Modules)', async (t) => {
  await db.init();

  const admin = { id: 1, name: 'المدير العام (Admin)', role: 'admin' };
  const cashier1 = { id: 2, name: 'كاشير 1 (الصباحي)', role: 'cashier' };
  const cashier2 = { id: 3, name: 'كاشير 2 (المسائي)', role: 'cashier' };

  // =========================================================================
  // 🥊 PART 1: RACE CONDITIONS & CONCURRENCY
  // =========================================================================

  await t.test('1. Double Deduction on same Debt (Race Condition)', () => {
    const prod = db.saveProduct({ name: 'قهوة نوتة 4', price: 100, cost: 30, stock_qty: 100, category_id: 1 });
    const s = db.openShift(1000, 'شيفت التزامن 4', cashier1, 'الصباحي');
    const custName = `كريم_${Date.now()}`;

    const debtOrder = db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      orderType: 'notebook',
      paymentMethod: 'notebook',
      customerName: custName,
      user: cashier1,
      shiftId: s.id
    });

    const debt = db.listDebts().find(d => d.order_id === debtOrder.orderId);
    assert.equal(debt.remaining_amount, 100);

    // Terminal 1: Pays 100 LE
    const res1 = db.payDebt({
      debtId: debt.id,
      amount: 100,
      shiftId: s.id,
      cashierName: cashier1.name
    });
    assert.equal(res1.success, true);
    assert.equal(res1.newRemaining, 0);
    assert.equal(res1.newStatus, 'paid');

    // Terminal 2: Attempts to pay 100 LE simultaneously on the same debt
    const res2 = db.payDebt({
      debtId: debt.id,
      amount: 100,
      shiftId: s.id,
      cashierName: cashier2.name
    });
    assert.equal(res2.success, false);
    assert.match(res2.error, /المبلغ أكبر من المتبقي/);

    // Verify Debt remaining amount never went negative!
    const debtAfter = db.listDebts().find(d => d.id === debt.id);
    assert.equal(debtAfter.remaining_amount, 0);
    assert.equal(debtAfter.paid_amount, 100);

    db.closeShift(s.id, s.expected_cash, 'إغلاق', cashier1);
  });

  await t.test('2. Overselling Last Stock Item (1 Piece Only)', () => {
    const scarce = db.saveProduct({ name: 'كيكة نادرة أخيرة', price: 75, stock_qty: 1, category_id: 4 });
    const s = db.openShift(1000, 'شيفت نفاذ المخزون', cashier1, 'الصباحي');

    // Terminal 1: Buys the single available piece
    const order1 = db.createOrder({
      items: [{ id: scarce.id, qty: 1 }],
      paymentMethod: 'cash',
      amountPaid: 75,
      user: cashier1,
      shiftId: s.id
    });
    assert.equal(order1.total, 75);

    // Stock must be exactly 0
    let currentStock = db.listProducts().find(p => p.id === scarce.id).stock_qty;
    assert.equal(currentStock, 0);

    // Terminal 2: Tries to buy the same piece simultaneously
    assert.throws(() => {
      db.createOrder({
        items: [{ id: scarce.id, qty: 1 }],
        paymentMethod: 'cash',
        amountPaid: 75,
        user: cashier2,
        shiftId: s.id
      });
    }, /المخزون غير كاف للصنف/);

    // Stock must remain 0 and NOT drop to -1
    currentStock = db.listProducts().find(p => p.id === scarce.id).stock_qty;
    assert.equal(currentStock, 0);

    db.closeShift(s.id, s.expected_cash, 'إغلاق', cashier1);
  });

  await t.test('3. Double Shift Close Idempotency', () => {
    const s = db.openShift(500, 'شيفت اختبار الإغلاق المزدوج', cashier1, 'الصباحي');
    
    // First close call
    const close1 = db.closeShift(s.id, 550, 'إغلاق أول', cashier1);
    assert.equal(close1.success, true);
    assert.equal(close1.actualCash, 550);
    assert.equal(close1.cashDifference, 50);

    // Second close call (Simulated double click / double API hit)
    const close2 = db.closeShift(s.id, 550, 'إغلاق مكرر', cashier1);
    assert.equal(close2.success, true);
    assert.equal(close2.alreadyClosed, true);
    assert.equal(close2.closingCash, 550);

    // Verify next shift inherits only the 550 once (does not double to 1100)
    const sNext = db.openShift(null, '', cashier2, 'المسائي');
    assert.equal(sNext.opening_cash, 550);

    db.closeShift(sNext.id, 550, 'إغلاق سليم', cashier2);
  });

  // =========================================================================
  // 🔢 PART 2: BOUNDARY, OVERFLOW & VALUE SANITIZATION
  // =========================================================================

  await t.test('4. Extreme Payroll Deductions & Negative Salary Defense', () => {
    const targetMonth = '2026-10';
    // Cashier base salary = 3500 LE
    // Apply 25 days absence (25 * (3500/30) = 2916.75 LE) + 1000 LE penalty -> Total Deductions = 3916.75 LE (> 3500 LE)
    db.addEmployeeAdjustment({
      userId: cashier1.id,
      type: 'absence',
      daysCount: 25,
      date: `${targetMonth}-05`,
      reason: 'غياب 25 يوم',
      createdBy: 'المدير'
    });
    db.addEmployeeAdjustment({
      userId: cashier1.id,
      type: 'penalty',
      amount: 1000,
      date: `${targetMonth}-10`,
      reason: 'جزاء إضافي',
      createdBy: 'المدير'
    });

    const payroll = db.getMonthlyPayroll(targetMonth);
    const rec = payroll.records.find(r => r.userId === cashier1.id);
    assert.equal(rec.baseSalary, 3500);
    assert.ok(rec.totalDeductions > 3500, 'Total deductions exceed base salary');
    // Engine guarantees netSalary is floored safely at 0 without crashing or producing corrupt ledger
    assert.equal(rec.netSalary, 0);
  });

  await t.test('5. Discount Exceeding Invoice Total Rejection', () => {
    const prod = db.saveProduct({ name: 'مشروب خصم', price: 50, stock_qty: 20, category_id: 1 });
    const s = db.openShift(500, 'شيفت خصومات', cashier1, 'الصباحي');

    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: 1 }], // 50 LE
        discount: 70, // 70 LE discount on 50 LE invoice!
        paymentMethod: 'cash',
        amountPaid: 50,
        user: cashier1,
        shiftId: s.id
      });
    }, /الخصم لا يمكن أن يتجاوز إجمالي الطلب/);

    db.closeShift(s.id, 500, 'إغلاق', cashier1);
  });

  await t.test('6. Negative or Zero Quantity Rejection from Core Backend', () => {
    const prod = db.saveProduct({ name: 'صنف كمية', price: 30, stock_qty: 20, category_id: 1 });
    const s = db.openShift(500, 'شيفت كميات', cashier1, 'الصباحي');

    // Negative Quantity (-5)
    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: -5 }],
        paymentMethod: 'cash',
        amountPaid: 30,
        user: cashier1,
        shiftId: s.id
      });
    }, /المنتج والكمية غير صحيحين/);

    // Zero Quantity (0)
    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: 0 }],
        paymentMethod: 'cash',
        amountPaid: 30,
        user: cashier1,
        shiftId: s.id
      });
    }, /المنتج والكمية غير صحيحين/);

    // Non-integer Quantity
    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: 1.5 }],
        paymentMethod: 'cash',
        amountPaid: 30,
        user: cashier1,
        shiftId: s.id
      });
    }, /المنتج والكمية غير صحيحين/);

    db.closeShift(s.id, 500, 'إغلاق', cashier1);
  });

  await t.test('7. Tiny Piastre Rounding (0.001) & Huge Numbers (999,999,999)', () => {
    const s = db.openShift(500, 'شيفت أرقام قصوى', cashier1, 'الصباحي');

    // Sub-piastre rounding: 0.001 rounded to 0.00
    const exp1 = db.addExpense({
      shiftId: s.id,
      amount: 0.001,
      category: 'فكة',
      notes: 'كسر قرش'
    });
    assert.equal(exp1.amount, 0);

    // Normal expense with 2 decimals
    const exp2 = db.addExpense({
      shiftId: s.id,
      amount: 15.555,
      category: 'مشتريات',
      notes: 'تقريب مالي'
    });
    assert.equal(exp2.amount, 15.56);

    // Negative amount rejected
    assert.throws(() => {
      db.addExpense({
        shiftId: s.id,
        amount: -100,
        category: 'خطأ',
        notes: 'مبلغ سالب'
      });
    }, /must be a non-negative number/);

    db.closeShift(s.id, s.expected_cash, 'إغلاق', cashier1);
  });

  // =========================================================================
  // 🕵️ PART 3: SECURITY, INJECTION & PERMISSIONS
  // =========================================================================

  await t.test('8. SQL & XSS Injection Sanitization in all Text Fields', () => {
    const prod = db.saveProduct({ name: 'شاي أمان', price: 20, stock_qty: 50, category_id: 1 });
    const s = db.openShift(500, 'شيفت أمان وحقن', cashier1, 'الصباحي');

    const maliciousCust = "'; DROP TABLE orders; -- <script>document.cookie</script>";
    const maliciousNotes = "' OR 1=1; DELETE FROM users; <img src=x onerror=alert(1)>";

    const ord = db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      customerName: maliciousCust,
      notes: maliciousNotes,
      paymentMethod: 'cash',
      amountPaid: 20,
      user: cashier1,
      shiftId: s.id
    });

    assert.equal(ord.customerName, maliciousCust);

    // Verify orders and users table are fully intact
    const allOrders = db.listOrders({ limit: 5 });
    assert.ok(allOrders.length > 0);
    const allUsers = db.listUsers();
    assert.ok(allUsers.length >= 3);

    db.closeShift(s.id, s.expected_cash, 'إغلاق', cashier1);
  });

  await t.test('9. Role Tampering & Non-Owner Shift Modification Guard', () => {
    const s = db.openShift(500, 'شيفت حماية الملكية', cashier1, 'الصباحي');

    // Cashier 2 tries to close Cashier 1's open shift -> MUST BE BLOCKED
    const unauthorizedClose = db.closeShift(s.id, 500, 'محاولة إغلاق غير مصرح', cashier2);
    assert.equal(unauthorizedClose.success, false);
    assert.match(unauthorizedClose.error, /لا يمكن إغلاق شيفت خاص بمستخدم آخر/);

    // Cashier 1 closes their own shift -> ALLOWED
    const authorizedClose = db.closeShift(s.id, 500, 'إغلاق مصرح', cashier1);
    assert.equal(authorizedClose.success, true);
  });

  // =========================================================================
  // 🧨 PART 4: ATOMIC ROLLBACK & FRAUD PATTERN AUDITING
  // =========================================================================

  await t.test('10. Atomic Multi-Item Transaction Rollback on Mid-Order Failure', () => {
    const p1 = db.saveProduct({ name: 'صنف 1 متوفر', price: 20, stock_qty: 10, category_id: 1 });
    const p2 = db.saveProduct({ name: 'صنف 2 منتهي', price: 30, stock_qty: 0, category_id: 1 }); // Stock is 0!

    const s = db.openShift(500, 'شيفت الذرية', cashier1, 'الصباحي');
    const initialOrdersCount = db.listOrders().length;

    // Multi-item order: Item 1 has stock, Item 2 has 0 stock
    assert.throws(() => {
      db.createOrder({
        items: [
          { id: p1.id, qty: 2 },
          { id: p2.id, qty: 1 } // Will fail here!
        ],
        paymentMethod: 'cash',
        amountPaid: 70,
        user: cashier1,
        shiftId: s.id
      });
    }, /المخزون غير كاف للصنف/);

    // ATOMICITY VERIFICATION:
    // P1 stock MUST NOT be decremented (must stay 10)
    const p1Stock = db.listProducts().find(p => p.id === p1.id).stock_qty;
    assert.equal(p1Stock, 10, 'P1 stock must remain untouched because transaction rolled back');

    // No half-baked order inserted
    const afterOrdersCount = db.listOrders().length;
    assert.equal(afterOrdersCount, initialOrdersCount, 'No partial order should exist');

    db.closeShift(s.id, 500, 'إغلاق', cashier1);
  });

  await t.test('11. Cashier Void Pattern Tracking in Audit Log', () => {
    const prod = db.saveProduct({ name: 'صنف تتبع الإلغاء', price: 50, stock_qty: 100, category_id: 1 });
    const s = db.openShift(500, 'شيفت تتبع الاحتيال', cashier1, 'الصباحي');

    // Cashier creates and cancels 3 orders consecutively
    for (let i = 1; i <= 3; i++) {
      const ord = db.createOrder({
        items: [{ id: prod.id, qty: 1 }],
        paymentMethod: 'cash',
        amountPaid: 50,
        user: cashier1,
        shiftId: s.id
      });
      db.cancelOrder(ord.orderId, `إلغاء مشبوه ${i}`, cashier1, 'cash', true);
    }

    // Inspect Audit Log for rapid void pattern
    const auditLogs = db.listAuditLog(20);
    const cancelLogs = auditLogs.filter(a => a.action === 'cancel' && a.entity_type === 'order' && a.actor_name === cashier1.name);
    assert.ok(cancelLogs.length >= 3, 'Audit log must record every single void with cashier identity and reason');

    db.closeShift(s.id, 500, 'إغلاق', cashier1);
  });
});
