const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../electron/db');

test('MASTER SCENARIOS 1, 2, 3: Executable and Manually Verifiable Test Suite', async (t) => {
  await db.init();

  const admin = { id: 1, name: 'المدير العام (Admin)', role: 'admin' };
  const cashier1 = { id: 2, name: 'كاشير 1 (الصباحي)', role: 'cashier' };
  const cashier2 = { id: 3, name: 'كاشير 2 (المسائي)', role: 'cashier' };

  const curOpen = db.currentShift();
  if (curOpen) db.closeShift(curOpen.id, curOpen.expected_cash, 'إغلاق شيفت مسبق');

  await t.test('SCENARIO 1 AUTOMATION: Multi-Shift Handover, Split Payments & Cash Drawer Discrepancy', () => {
    // 1. Setup dedicated items
    const coffee = db.saveProduct({ name: 'قهوة اسبريسو سيناريو 1', price: 30, cost: 10, stock_qty: 50, category_id: 1 });
    const waffle = db.saveProduct({ name: 'وافل نوتيلا سيناريو 1', price: 50, cost: 20, stock_qty: 30, category_id: 4 });

    // Step 1: Cashier 1 opens shift with 500 LE
    const s1 = db.openShift(500, 'افتتاح الوردية الأولى', cashier1, 'الشيفت الصباحي (الأول)');
    assert.equal(s1.opening_cash, 500);

    // Step 2: Table Order (Table IN1) - 2 Coffees + 1 Waffle (Total = 110 LE) paid in Cash
    const ord1 = db.createOrder({
      tableId: 1,
      orderType: 'dine_in',
      items: [
        { id: coffee.id, qty: 2 }, // 60
        { id: waffle.id, qty: 1 }  // 50
      ],
      paymentMethod: 'cash',
      amountPaid: 110,
      user: cashier1,
      shiftId: s1.id
    });
    assert.equal(ord1.total, 110);

    // Step 3: Takeaway Order with Split Payment (Total 130 LE - 10 LE Discount = 120 LE)
    // 1 Coffee (30) + 2 Waffles (100) = 130 LE, discount 10 => 120 LE
    // Split: 40 Cash + 40 Card + 40 Wallet
    const ord2 = db.createOrder({
      orderType: 'takeaway',
      customerName: 'أستاذ طارق',
      discount: 10,
      items: [
        { id: coffee.id, qty: 1 },
        { id: waffle.id, qty: 2 }
      ],
      paymentMethod: 'split',
      cashAmount: 40,
      cardAmount: 40,
      walletAmount: 40,
      amountPaid: 120,
      user: admin,
      shiftId: s1.id
    });
    assert.equal(ord2.total, 120);

    // Step 4: Expense of 60 LE (Buying milk/coffee beans)
    const exp = db.addExpense({
      shiftId: s1.id,
      amount: 60,
      category: 'خامات ومشتريات',
      notes: 'شراء حليب ومستلزمات'
    });
    assert.equal(exp.success, true);

    // Expected Drawer Cash: 500 (opening) + 110 (ord1 cash) + 40 (ord2 split cash) - 60 (expense) = 590 LE
    const s1Check = db.currentShift();
    assert.equal(s1Check.expected_cash, 590);
    assert.equal(s1Check.card_sales, 40);
    assert.equal(s1Check.wallet_sales, 40);

    // Step 5: Cashier 1 counts physical cash and finds 580 LE (Deficit of 10 LE)
    const s1Close = db.closeShift(s1.id, 580, 'تسليم مع وجود عجز 10 جنيه', cashier1);
    assert.equal(s1Close.success, true);
    assert.equal(s1Close.cashDifference, -10);
    assert.equal(s1Close.closingCash, 580);

    // Step 6: Cashier 2 opens Shift 2 without typing opening cash (Auto-inherited 580 LE)
    const s2 = db.openShift(null, '', cashier2, 'الشيفت المسائي (الثاني)');
    assert.equal(s2.opening_cash, 580);
    assert.equal(s2.expected_cash, 580);

    db.closeShift(s2.id, 580, 'إغلاق وردية ثانية', cashier2);
  });

  await t.test('SCENARIO 2 AUTOMATION: Multi-Debt Notebook FIFO & Previous-Shift Refund Protection', () => {
    const freshProd = db.saveProduct({ name: 'مشروب طاقة سيناريو 2', price: 40, stock_qty: 100, category_id: 2 });
    const custUnique = `عميل_مميز_${Date.now()}`;
    const custPhone = `010${Date.now().toString().slice(-8)}`;

    // Shift 1: Ahmed opens shift
    const s1 = db.openShift(1000, 'شيفت الديون', cashier1, 'الشيفت الصباحي (الأول)');

    // 1. Customer buys 3 separate notebook orders (Debt 1: 80 LE, Debt 2: 120 LE, Debt 3: 160 LE -> Total 360 LE)
    const dOrd1 = db.createOrder({
      orderType: 'notebook',
      customerName: custUnique,
      customerPhone: custPhone,
      items: [{ id: freshProd.id, qty: 2 }], // 80 LE
      user: cashier1,
      shiftId: s1.id
    });
    const dOrd2 = db.createOrder({
      orderType: 'notebook',
      customerName: custUnique,
      customerPhone: custPhone,
      items: [{ id: freshProd.id, qty: 3 }], // 120 LE
      user: cashier1,
      shiftId: s1.id
    });
    const dOrd3 = db.createOrder({
      orderType: 'notebook',
      customerName: custUnique,
      customerPhone: custPhone,
      items: [{ id: freshProd.id, qty: 4 }], // 160 LE
      user: cashier1,
      shiftId: s1.id
    });

    // 2. A regular cash order in Shift 1 for 200 LE
    const cashOrderToCancelLater = db.createOrder({
      items: [{ id: freshProd.id, qty: 5 }], // 200 LE
      paymentMethod: 'cash',
      amountPaid: 200,
      user: cashier1,
      shiftId: s1.id
    });

    // Close Shift 1 with 1200 LE (1000 opening + 200 cash)
    db.closeShift(s1.id, 1200, 'إغلاق شيفت 1', cashier1);

    // Shift 2: Mahmoud opens with inherited 1200 LE
    const s2 = db.openShift(null, '', cashier2, 'الشيفت المسائي (الثاني)');
    assert.equal(s2.opening_cash, 1200);

    // 3. Customer comes to pay 150 LE via FIFO
    const fifoResult = db.payCustomerDebtsFIFO({
      customerName: custUnique,
      customerPhone: custPhone,
      amount: 150,
      shiftId: s2.id,
      cashierName: cashier2.name
    });
    assert.equal(fifoResult.success, true);
    assert.equal(fifoResult.totalPaid, 150);

    // Debt 1 (80) => PAID (0 left)
    // Debt 2 (120) => PARTIAL (120 - 70 = 50 left)
    // Debt 3 (160) => UNPAID (160 left)
    const debts = db.listDebts().filter(d => d.customer_name === custUnique);
    const d1 = debts.find(d => d.order_id === dOrd1.orderId);
    const d2 = debts.find(d => d.order_id === dOrd2.orderId);
    const d3 = debts.find(d => d.order_id === dOrd3.orderId);

    assert.equal(d1.status, 'paid');
    assert.equal(d1.remaining_amount, 0);
    assert.equal(d2.status, 'partial');
    assert.equal(d2.remaining_amount, 50);
    assert.equal(d3.status, 'unpaid');
    assert.equal(d3.remaining_amount, 160);

    // 4. In Shift 2, the customer from Shift 1 returns and asks for a cash refund for the 200 LE order.
    // Admin cancels the old shift order:
    const cancelRes = db.cancelOrder(cashOrderToCancelLater.orderId, 'طلب استرجاع من العميل مع إرجاع المنتج للمخزن', admin, 'cash');
    assert.equal(cancelRes.success, true);

    // Stock for the 5 refunded items must be restored
    const stockAfterCancel = db.listProducts().find(p => p.id === freshProd.id).stock_qty;
    // Initial 100 - (2+3+4+5=14 sold) + (5 refunded) = 91
    assert.equal(stockAfterCancel, 91);

    // Expected Drawer Cash in Shift 2:
    // 1200 (Opening) + 150 (Debt Collected) - 200 (Cash Refunded to customer) = 1150 LE
    const s2Cur = db.currentShift();
    assert.equal(s2Cur.expected_cash, 1150);

    db.closeShift(s2.id, 1150, 'إغلاق شيفت 2 بعد السداد والمرتجع', cashier2);
  });

  await t.test('SCENARIO 3 AUTOMATION: Security Barriers, Inventory Depletion & Exact Payroll Engine', () => {
    // 1. Low stock boundary & Out of stock prevention
    const scarceProd = db.saveProduct({ name: 'شوكولاتة نادرة سيناريو 3', price: 50, cost: 25, stock_qty: 2, low_stock_threshold: 3, category_id: 4 });
    const s = db.openShift(500, 'فحص المخزون والرواتب', cashier1, 'الشيفت الصباحي (الأول)');

    // Attempt to buy 5 items (only 2 available) -> MUST Throw Error
    assert.throws(() => {
      db.createOrder({
        items: [{ id: scarceProd.id, qty: 5 }],
        paymentMethod: 'cash',
        amountPaid: 250,
        user: cashier1,
        shiftId: s.id
      });
    }, /المخزون غير كاف/);

    // Buy exactly 2 items -> Stock becomes 0 (triggers low stock)
    db.createOrder({
      items: [{ id: scarceProd.id, qty: 2 }],
      paymentMethod: 'cash',
      amountPaid: 100,
      user: cashier1,
      shiftId: s.id
    });
    const depleted = db.listProducts().find(p => p.id === scarceProd.id);
    assert.equal(depleted.stock_qty, 0);

    const dashStats = db.getDashboardStats();
    assert.equal(dashStats.lowStockItems.some(item => item.id === scarceProd.id), true);

    // 2. Payroll & Employee Adjustments Calculation
    const payrollUser = db.saveUser({
      username: `cashier_pay_${Date.now()}`,
      name: 'كاشير فحص الرواتب',
      password: 'Cash123',
      role: 'cashier',
      salary: 3500
    });
    const curMonth = '2027-01';
    db.addEmployeeAdjustment({
      userId: payrollUser.id,
      type: 'absence',
      daysCount: 1,
      date: `${curMonth}-05`,
      reason: 'غياب بدون إذن',
      createdBy: 'المدير'
    });
    db.addEmployeeAdjustment({
      userId: payrollUser.id,
      type: 'penalty',
      amount: 100,
      date: `${curMonth}-10`,
      reason: 'تأخير متكرر',
      createdBy: 'المدير'
    });
    db.addEmployeeAdjustment({
      userId: payrollUser.id,
      type: 'bonus',
      amount: 250,
      date: `${curMonth}-20`,
      reason: 'مكافأة تميز في المبيعات',
      createdBy: 'المدير'
    });

    const payroll = db.getMonthlyPayroll(curMonth);
    const cashier1Payroll = payroll.records.find(r => r.userId === payrollUser.id);

    assert.equal(cashier1Payroll.baseSalary, 3500);
    assert.equal(cashier1Payroll.absenceDays, 1);
    assert.equal(cashier1Payroll.absenceDeduction, 116.67);
    assert.equal(cashier1Payroll.penaltiesTotal, 100);
    assert.equal(cashier1Payroll.bonusesTotal, 250);
    assert.equal(cashier1Payroll.netSalary, 3533.33);

    // 3. Backup creation and validation
    const backupRes = db.createBackup();
    assert.equal(backupRes.success, true);
    assert.equal(fs.existsSync(backupRes.path), true);

    db.closeShift(s.id, s.expected_cash, 'إغلاق شيفت الرواتب', cashier1);
  });
});
