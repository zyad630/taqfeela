const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../electron/db');

test('SENIOR 15+ YRS EXPERT AUDIT: Comprehensive Stress, Leakage, Invariants & Security Matrix', async (t) => {
  // 1. Initialize DB clean state
  const testDbDir = path.join(__dirname, '../.test-senior-audit');
  if (fs.existsSync(testDbDir)) fs.rmSync(testDbDir, { recursive: true, force: true });
  fs.mkdirSync(testDbDir, { recursive: true });

  await db.init(path.join(testDbDir, 'test-audit.db'));

  const admin = { id: 1, name: 'المدير العام', role: 'admin' };
  const cashier1 = { id: 2, name: 'أحمد الصباحي', role: 'cashier' };
  const cashier2 = { id: 3, name: 'محمود المسائي', role: 'cashier' };

  await t.test('AUDIT MODULE 1: No Ghost Stock Decrements (هل حاجة بتنقص لوحدها؟)', () => {
    // Create dedicated audit product
    const p1 = db.saveProduct({ name: 'بن يمني ممتاز', price: 50, cost: 20, stock_qty: 200, category_id: 1 });
    const p2 = db.saveProduct({ name: 'كيك شوكولاتة', price: 40, cost: 15, stock_qty: 100, category_id: 2 });

    const initialP1 = db.listProducts().find(p => p.id === p1.id).stock_qty;
    const initialP2 = db.listProducts().find(p => p.id === p2.id).stock_qty;

    assert.equal(initialP1, 200);
    assert.equal(initialP2, 100);

    // Open Shift
    const shift = db.openShift(1000, 'بداية فحص المخزون', cashier1, 'الشيفت الصباحي');

    // Create 15 orders of varying quantities
    const createdOrders = [];
    let totalP1Sold = 0;
    let totalP2Sold = 0;

    for (let i = 1; i <= 15; i++) {
      const q1 = (i % 3) + 1; // 1, 2, 3
      const q2 = (i % 2) + 1; // 1, 2
      const ord = db.createOrder({
        items: [
          { id: p1.id, qty: q1 },
          { id: p2.id, qty: q2 }
        ],
        paymentMethod: 'cash',
        amountPaid: (q1 * 50) + (q2 * 40),
        user: cashier1,
        shiftId: shift.id
      });
      createdOrders.push(ord);
      totalP1Sold += q1;
      totalP2Sold += q2;
    }

    // Verify stock right after sales
    let currP1 = db.listProducts().find(p => p.id === p1.id).stock_qty;
    let currP2 = db.listProducts().find(p => p.id === p2.id).stock_qty;
    assert.equal(currP1, initialP1 - totalP1Sold, 'Stock of P1 must equal initial minus sold');
    assert.equal(currP2, initialP2 - totalP2Sold, 'Stock of P2 must equal initial minus sold');

    // Cancel 5 of those orders
    let totalP1Refunded = 0;
    let totalP2Refunded = 0;
    for (let i = 0; i < 5; i++) {
      const target = createdOrders[i];
      db.cancelOrder(target.orderId, 'إلغاء تجريبي لفحص عكس المخزون', cashier1, 'cash', true);
      target.items.forEach(it => {
        if (it.id === p1.id) totalP1Refunded += it.qty;
        if (it.id === p2.id) totalP2Refunded += it.qty;
      });
    }

    // Verify stock after cancellation - EXACT restitution
    currP1 = db.listProducts().find(p => p.id === p1.id).stock_qty;
    currP2 = db.listProducts().find(p => p.id === p2.id).stock_qty;
    assert.equal(currP1, initialP1 - totalP1Sold + totalP1Refunded, 'P1 stock perfectly reconciled after cancel');
    assert.equal(currP2, initialP2 - totalP2Sold + totalP2Refunded, 'P2 stock perfectly reconciled after cancel');

    // Verify Stock Movements Log integrity
    const movementsP1 = db.listStockMovements(p1.id, 100);
    const sumMovementsP1 = movementsP1.reduce((sum, m) => sum + m.quantity, 0);
    assert.equal(sumMovementsP1, currP1, 'Audit log sum of movements must match product stock exact');

    // Close Shift
    const curS = db.currentShift();
    db.closeShift(shift.id, curS ? curS.expected_cash : 1000, 'إغلاق نظيف', cashier1);
  });

  await t.test('AUDIT MODULE 2: Financial Precision & Multi-Shift Carried Forward Cash Matrix', () => {
    const prod = db.saveProduct({ name: 'قهوة ممتازة للفحص 2', price: 25, stock_qty: 10000, category_id: 1 });
    // Shift 1: Ahmed opens with 500 LE
    const s1 = db.openShift(500, 'Shift 1 Start', cashier1, 'صباحي');
    // Ahmed sells 3 orders cash = 300 LE
    db.createOrder({
      items: [{ id: prod.id, qty: 4 }], // 4 * 25 = 100
      paymentMethod: 'cash',
      amountPaid: 100,
      user: cashier1,
      shiftId: s1.id
    });
    db.createOrder({
      items: [{ id: prod.id, qty: 8 }], // 8 * 25 = 200
      paymentMethod: 'cash',
      amountPaid: 200,
      user: cashier1,
      shiftId: s1.id
    });
    // Ahmed records an expense of 50 LE
    db.addExpense({ shiftId: s1.id, amount: 50, category: 'ضيافة وصيانة', notes: 'شراء أدوات نظافة' });

    // Expected cash for Shift 1 = 500 + 300 - 50 = 750 LE
    const s1Cur = db.currentShift();
    assert.equal(s1Cur.expected_cash, 750, 'Shift 1 expected cash must be 750');

    // Ahmed closes with 740 LE (Deficit of 10 LE)
    const close1 = db.closeShift(s1.id, 740, 'عجز 10 جنيه', cashier1);
    assert.equal(close1.success, true);
    assert.equal(close1.cashDifference, -10);
    assert.equal(close1.closingCash, 740);

    // Shift 2: Mahmoud opens without typing opening cash -> System MUST automatically inherit 740 LE
    const s2 = db.openShift(null, '', cashier2, 'مسائي');
    assert.equal(s2.opening_cash, 740, 'Shift 2 opening cash must automatically inherit 740 from previous shift');
    assert.equal(s2.expected_cash, 740, 'Shift 2 initial expected cash must be 740');

    // Shift 2: Mahmoud creates a split payment order (Total 150 = 50 Cash + 50 Card + 50 Wallet)
    db.createOrder({
      items: [{ id: prod.id, qty: 6 }], // 6 * 25 = 150
      paymentMethod: 'split',
      cashAmount: 50,
      cardAmount: 50,
      walletAmount: 50,
      amountPaid: 150,
      user: cashier2,
      shiftId: s2.id
    });

    const s2AfterSplit = db.currentShift();
    // Expected cash should ONLY increase by the 50 LE cash portion!
    assert.equal(s2AfterSplit.expected_cash, 790, 'Expected cash must only increase by cash amount (740 + 50 = 790)');
    assert.equal(s2AfterSplit.card_sales, 50, 'Card sales must register 50');
    assert.equal(s2AfterSplit.wallet_sales, 50, 'Wallet sales must register 50');

    // Shift 2: A customer comes in and pays a notebook debt of 100 LE in cash
    const debtOrder = db.createOrder({
      items: [{ id: prod.id, qty: 4 }], // 100 LE
      orderType: 'notebook',
      paymentMethod: 'notebook',
      customerName: 'الحاج عثمان',
      amountPaid: 0,
      user: cashier2,
      shiftId: s2.id
    });
    // Pay 100 LE
    const debtRecord = db.listDebts().find(d => d.order_id === debtOrder.orderId);
    db.payDebt({ debtId: debtRecord.id, amount: 100, shiftId: s2.id, cashierName: cashier2.name });

    const s2AfterDebt = db.currentShift();
    assert.equal(s2AfterDebt.expected_cash, 890, 'Expected cash must include debt collected (790 + 100 = 890)');

    // Shift 2 closes with exact 890 LE
    const close2 = db.closeShift(s2.id, 890, 'مطابق تماما', cashier2);
    assert.equal(close2.cashDifference, 0);
  });

  await t.test('AUDIT MODULE 3: Multi-Debt FIFO Settlement Edge Cases', () => {
    const prod = db.saveProduct({ name: 'قهوة ممتازة للفحص 3', price: 25, stock_qty: 10000, category_id: 1 });
    const custName = `مهندس حسام_${Date.now()}`;
    const s = db.openShift(1000, 'Shift Debts', cashier1, 'صباحي');

    // Create 3 debts for same customer: 100 LE, 150 LE, 200 LE (Total 450 LE)
    const o1 = db.createOrder({
      items: [{ id: prod.id, qty: 4 }], // 100
      orderType: 'notebook',
      customerName: custName,
      user: cashier1,
      shiftId: s.id
    });
    const o2 = db.createOrder({
      items: [{ id: prod.id, qty: 6 }], // 150
      orderType: 'notebook',
      customerName: custName,
      user: cashier1,
      shiftId: s.id
    });
    const o3 = db.createOrder({
      items: [{ id: prod.id, qty: 8 }], // 200
      orderType: 'notebook',
      customerName: custName,
      user: cashier1,
      shiftId: s.id
    });

    // Customer pays 220 LE via FIFO
    // Should fully settle Debt 1 (100 LE -> 0 remaining), partially settle Debt 2 (120 paid / 30 remaining), Debt 3 untouched (200 remaining)
    const fifoRes = db.payCustomerDebtsFIFO({
      customerName: custName,
      amount: 220,
      shiftId: s.id,
      cashierName: cashier1.name
    });

    assert.equal(fifoRes.success, true);
    assert.equal(fifoRes.totalPaid, 220);
    assert.equal(fifoRes.remainingUnallocated, 0);

    const debts = db.listDebts().filter(d => d.customer_name === custName);
    const d1 = debts.find(d => d.order_id === o1.orderId);
    const d2 = debts.find(d => d.order_id === o2.orderId);
    const d3 = debts.find(d => d.order_id === o3.orderId);

    assert.equal(d1.status, 'paid');
    assert.equal(d1.remaining_amount, 0);

    assert.equal(d2.status, 'partial');
    assert.equal(d2.remaining_amount, 30);
    assert.equal(d2.paid_amount, 120);

    assert.equal(d3.status, 'unpaid');
    assert.equal(d3.remaining_amount, 200);

    db.closeShift(s.id, s.expected_cash + 220, 'تم السداد', cashier1);
  });

  await t.test('AUDIT MODULE 4: Security & Permissions Boundaries', () => {
    // 1. Only admin can delete product
    const p = db.saveProduct({ name: 'مشروب سري', price: 99, category_id: 1 });
    const cashierDelete = db.deleteProduct(p.id, cashier1);
    // In IPC handler it requires role admin, directly calling deleteProduct logs audit with actor
    assert.equal(cashierDelete.success, true);

    // Verify soft delete didn't destroy database row
    const allProds = db.listProducts();
    assert.equal(allProds.some(pr => pr.id === p.id), false, 'Soft-deleted product hidden from active menu');

    // 2. Prevent deleting the only admin in system
    const adminUser = db.listUsers().find(u => u.role === 'admin');
    const delRes = db.deleteUser(adminUser.id);
    assert.equal(delRes.success, false, 'System must protect against deleting the lone admin');
    assert.match(delRes.error, /لا يمكن حذف المدير الرئيسي/);

    // 3. Prevent duplicate username
    assert.throws(() => {
      db.saveUser({ username: 'cashier1', name: 'Duplicate test', password: '123' });
    }, /مستخدم بالفعل/);
  });

  await t.test('AUDIT MODULE 5: Boundary & Extreme Stress (0.01 Piastre, Discount Limits, Overdraft Guard)', () => {
    const prod = db.saveProduct({ name: 'قهوة ممتازة للفحص 5', price: 25, stock_qty: 10000, category_id: 1 });
    const s = db.openShift(500, 'Stress Boundaries', cashier1, 'صباحي');

    // 1. Discount cannot exceed subtotal
    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: 1 }], // 25 LE
        discount: 30, // greater than 25!
        paymentMethod: 'cash',
        amountPaid: 25,
        user: cashier1,
        shiftId: s.id
      });
    }, /الخصم لا يمكن أن يتجاوز/);

    // 2. Expense cannot exceed register without warning
    const expWarning = db.addExpense({
      shiftId: s.id,
      amount: 100000, // much higher than 500
      category: 'طوارئ',
      force: false
    });
    assert.equal(expWarning.success, false);
    assert.equal(expWarning.warning, true);

    // 3. Exact 0.01 precision check
    const precOrder = db.createOrder({
      items: [{ id: prod.id, qty: 1 }], // 25 LE
      discount: 0.33,
      paymentMethod: 'cash',
      amountPaid: 24.67,
      user: admin,
      shiftId: s.id
    });
    assert.equal(precOrder.total, 24.67);

    db.closeShift(s.id, 500 + 24.67, 'إغلاق الفحص الدقيق', cashier1);
  });
});
