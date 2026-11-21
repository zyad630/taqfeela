const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function createIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-e2e-scenario-'));
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

test('FULL E2E SCENARIO: Multi-Shift Isolation, Debt Carryover, Expense Tracking & Admin Centralized Audit', async () => {
  const { db } = createIsolatedDb();
  await db.init();

  // 1. Setup Users
  const bcrypt = require('bcryptjs');
  const nowIso = new Date().toISOString();
  db.runSql(`INSERT OR REPLACE INTO users (username, name, password, role, salary, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['admin', 'المدير العام', bcrypt.hashSync('123456', 10), 'admin', 7000, nowIso]);
  db.runSql(`INSERT OR REPLACE INTO users (username, name, password, role, salary, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['cashier1', 'كاشير صباحي', bcrypt.hashSync('123456', 10), 'cashier', 3500, nowIso]);
  db.runSql(`INSERT OR REPLACE INTO users (username, name, password, role, salary, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['cashier2', 'كاشير مسائي', bcrypt.hashSync('123456', 10), 'cashier', 3500, nowIso]);
  db.runSql(`INSERT OR REPLACE INTO users (username, name, password, role, salary, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['cashier3', 'كاشير ليلي', bcrypt.hashSync('123456', 10), 'cashier', 3500, nowIso]);

  const admin = db.loginUser('admin', '123456') || db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const cashier1 = db.loginUser('cashier1', '123456') || db.loginUser('cashier1', '1234'); // Morning cashier
  const cashier2 = db.loginUser('cashier2', '123456') || db.loginUser('cashier2', '1234'); // Evening cashier
  const cashier3 = db.loginUser('cashier3', '123456') || db.loginUser('cashier3', '1234'); // Night cashier
  assert.ok(admin && cashier1 && cashier2 && cashier3);

  const products = db.listProducts();
  const coffee = products.find(p => p.name.includes('تركية') || p.name.includes('تركي')) || products[0];
  const juice = products.find(p => p.name.includes('مانجو') || p.name.includes('عصير') || p.name.includes('سموزي')) || products[1];
  const psGame = products.find(p => p.name.includes('بلايستيشن') || p.name.includes('ساعة') || p.name.includes('شيشة') || p.name.includes('وافل')) || products[2];
  assert.ok(coffee && juice && psGame);

  const tables = db.listTables();
  const tableIN1 = tables.find(t => t.number === 'IN1') || tables[0];
  const tableOUT2 = tables.find(t => t.number === 'OUT2') || tables[1];

  // ==========================================
  // PHASE 1: MORNING SHIFT (Cashier 1)
  // ==========================================
  const s1OpeningCash = 500;
  const shift1 = db.openShift(s1OpeningCash, 'بداية الشيفت الصباحي', cashier1, 'الشيفت الصباحي (الأول)');
  assert.equal(shift1.opening_cash, 500);

  // Order 1: Cash sale on Table IN1 (3 coffees)
  const order1 = db.createOrder({
    items: [{ id: coffee.id, qty: 3, price: coffee.price }],
    paymentMethod: 'cash',
    orderType: 'hall',
    tableId: tableIN1.id,
    amountPaid: coffee.price * 3,
    user: cashier1,
    shiftId: shift1.id
  });
  assert.equal(order1.invoiceNo, '1');
  const s1CashSales = coffee.price * 3;

  // Order 2: Notebook (Debt) sale on Table OUT2 (2 juices = 70 EGP)
  const order2 = db.createOrder({
    items: [{ id: juice.id, qty: 2, price: juice.price }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    tableId: tableOUT2.id,
    customerName: 'أحمد علي',
    customerPhone: '01012345678',
    amountPaid: 0,
    user: cashier1,
    shiftId: shift1.id
  });
  assert.equal(order2.invoiceNo, '2');

  // Log Expense in Shift 1 (40 EGP for coffee beans)
  db.addExpense({ shiftId: shift1.id, amount: 40, category: 'مستلزمات', notes: 'بن تركي' });

  // Verify Shift 1 Expected Cash = 500 + s1CashSales (75) - 40 = 535 EGP
  const s1Current = db.currentShift();
  const s1ExpectedCash = 500 + s1CashSales - 40;
  assert.equal(s1Current.expected_cash, s1ExpectedCash);

  // Close Shift 1 with exact cash balance (535 EGP)
  const close1 = db.closeShift(shift1.id, s1ExpectedCash, 'إنهاء الشيفت الصباحي وتسليم العهدة');
  assert.equal(close1.success, true);
  assert.equal(close1.actualCash, s1ExpectedCash);
  assert.equal(close1.cashDifference, 0);

  // ==========================================
  // PHASE 2: EVENING SHIFT (Cashier 2)
  // ==========================================
  // Open Shift 2 without explicitly supplying cash -> MUST CARRY s1ExpectedCash (535 EGP)
  const shift2 = db.openShift(null, '', cashier2, 'الشيفت المسائي (الثاني)');
  assert.equal(shift2.opening_cash, s1ExpectedCash, 'Shift 2 opening cash must equal Shift 1 closing cash');

  // Customer 'أحمد علي' pays 50% of his debt (35 EGP) during Shift 2
  const debt = db.listDebts().find(d => d.order_id === order2.orderId);
  assert.ok(debt);
  const debtPay1 = db.payDebt({
    debtId: debt.id,
    amount: juice.price, // 35 EGP (half of 70)
    shiftId: shift2.id,
    cashierName: cashier2.name,
    notes: 'قسط أول من أحمد علي'
  });
  assert.equal(debtPay1.success, true);
  assert.equal(debtPay1.newStatus, 'partial');

  // Order 3: Card sale (150 EGP takeaway)
  const order3 = db.createOrder({
    items: [{ id: coffee.id, qty: 2, price: coffee.price }, { id: juice.id, qty: 2, price: juice.price }],
    paymentMethod: 'card',
    orderType: 'takeaway',
    amountPaid: coffee.price * 2 + juice.price * 2,
    user: cashier2,
    shiftId: shift2.id
  });
  assert.equal(order3.invoiceNo, '3');

  // Order 4: Wallet sale (80 EGP takeaway)
  const order4 = db.createOrder({
    items: [{ id: juice.id, qty: 2, price: juice.price }],
    paymentMethod: 'wallet',
    orderType: 'takeaway',
    amountPaid: juice.price * 2,
    user: cashier2,
    shiftId: shift2.id
  });
  assert.equal(order4.invoiceNo, '4');

  // Log Expense in Shift 2 (30 EGP for water)
  db.addExpense({ shiftId: shift2.id, amount: 30, category: 'مشتريات', notes: 'كرتونة مياه' });

  // Shift 2 Expected Cash = Shift 2 Opening (535) + Debt Collected (35) - Expenses (30) = 540 EGP (Card/Wallet sales do NOT add to physical cash)
  const s2Current = db.currentShift();
  const s2ExpectedCash = s1ExpectedCash + debtPay1.newPaid - 30;
  assert.equal(s2Current.expected_cash, s2ExpectedCash);
  assert.equal(s2Current.card_sales, order3.total);
  assert.equal(s2Current.wallet_sales, order4.total);

  // Close Shift 2 with exact cash (565 EGP)
  const close2 = db.closeShift(shift2.id, s2ExpectedCash, 'تسليم شيفت مسائي');
  assert.equal(close2.success, true);

  // ==========================================
  // PHASE 3: NIGHT SHIFT (Cashier 3)
  // ==========================================
  const shift3 = db.openShift(null, '', cashier3, 'الشيفت الليلي (الثالث)');
  assert.equal(shift3.opening_cash, s2ExpectedCash);

  // Customer 'أحمد علي' pays the remaining debt during Shift 3
  const debtPay2 = db.payDebt({
    debtId: debt.id,
    amount: debt.total_amount - debtPay1.newPaid,
    shiftId: shift3.id,
    cashierName: cashier3.name,
    notes: 'سداد نهائي من أحمد علي'
  });
  assert.equal(debtPay2.success, true);
  assert.equal(debtPay2.newStatus, 'paid');

  // Order 5: PlayStation game hour + drinks (Cash)
  const order5 = db.createOrder({
    items: [{ id: psGame.id, qty: 2, price: psGame.price }],
    paymentMethod: 'cash',
    orderType: 'takeaway',
    amountPaid: psGame.price * 2,
    user: cashier3,
    shiftId: shift3.id
  });
  assert.equal(order5.invoiceNo, '5');

  // Close Shift 3
  const s3ExpectedCash = s2ExpectedCash + debtPay2.newPaid + (psGame.price * 2);
  const close3 = db.closeShift(shift3.id, s3ExpectedCash, 'إنهاء الشيفت الليلي');
  assert.equal(close3.success, true);

  // ==========================================
  // PHASE 4: ADMIN CENTRALIZED AUDIT & OVERSIZED REPORT VERIFICATION
  // ==========================================
  // 1. Verify Attendance & Shift Reports
  const reports = db.getUserAttendanceReports();
  assert.equal(reports.shifts.length, 3);

  const repShift1 = reports.shifts.find((s) => s.id === shift1.id);
  assert.equal(repShift1.orders_count, 2); // 1 cash + 1 notebook order
  assert.equal(repShift1.cash_sales_total, s1CashSales);

  const repShift2 = reports.shifts.find((s) => s.id === shift2.id);
  assert.equal(repShift2.debt_collections, debtPay1.newPaid);
  assert.equal(repShift2.card_sales_total, order3.total);
  assert.equal(repShift2.wallet_sales_total, order4.total);

  const repShift3 = reports.shifts.find((s) => s.id === shift3.id);
  assert.equal(repShift3.debt_collections, debt.total_amount - debtPay1.newPaid);

  // 2. Verify User Sales Summaries
  const u1Sum = reports.userSummaries.find(u => u.userId === cashier1.id);
  assert.equal(u1Sum.totalShifts, 1);
  assert.equal(u1Sum.totalOrders, 2);

  // 3. Verify Monthly Payroll reflects the 3 shifts worked
  const currentMonth = new Date().toISOString().slice(0, 7);
  const payroll = db.getMonthlyPayroll(currentMonth);
  const c1Payroll = payroll.records.find(r => r.userId === cashier1.id);
  const c2Payroll = payroll.records.find(r => r.userId === cashier2.id);
  const c3Payroll = payroll.records.find(r => r.userId === cashier3.id);

  assert.equal(c1Payroll.shiftsAttended, 1);
  assert.equal(c2Payroll.shiftsAttended, 1);
  assert.equal(c3Payroll.shiftsAttended, 1);

  // 4. Verify Audit Log
  const auditLogs = db.listAuditLog(100);
  assert.ok(auditLogs.length >= 7);
  assert.ok(auditLogs.some(a => a.action === 'create' && a.entity_type === 'order'));
  assert.ok(auditLogs.some(a => a.action === 'payment' && a.entity_type === 'debt'));

  // 5. Verify Orders list preserves exact Cashier and Shift names
  const allOrders = db.listOrders({ limit: 10 });
  const o1 = allOrders.find(o => o.invoice_no === '1');
  const o3 = allOrders.find(o => o.invoice_no === '3');
  const o5 = allOrders.find(o => o.invoice_no === '5');

  assert.equal(o1.cashier_name, cashier1.name);
  assert.equal(o1.shift_name, 'الشيفت الصباحي (الأول)');
  assert.equal(o3.cashier_name, cashier2.name);
  assert.equal(o3.shift_name, 'الشيفت المسائي (الثاني)');
  assert.equal(o5.cashier_name, cashier3.name);
  assert.equal(o5.shift_name, 'الشيفت الليلي (الثالث)');
});
