const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-audit-fixes-test-'));
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

test('F-06: Stock validation aggregates quantities across multiple lines of the same product', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(100, '', admin);

  const product = db.listProducts()[0];
  db.saveProduct({ ...product, stock_qty: 3 });
  db.saveSettings({ allow_negative_stock: '0' });

  // Two separate lines for the same product, each with qty 2 -> total 4 > stock 3
  assert.throws(() => {
    db.createOrder({
      items: [
        { id: product.id, qty: 2, notes: 'نصف سكر' },
        { id: product.id, qty: 2, notes: 'بدون ثلج' }
      ],
      paymentMethod: 'cash',
      user: admin,
      shiftId: shift.id
    });
  }, /المخزون غير كاف/);

  // Verify stock was not deducted
  const freshProd = db.listProducts().find(p => p.id === product.id);
  assert.equal(freshProd.stock_qty, 3);
});

test('F-06: Order items use authoritative product name and price from DB', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(100, '', admin);

  const product = db.listProducts()[0];
  db.saveProduct({ ...product, price: 45, name: 'قهوة تركي مخصوص', stock_qty: 10 });

  // Client attempts to send forged price 5 and forged name "مياه معدنية"
  const order = db.createOrder({
    items: [{ id: product.id, qty: 2, price: 5, name: 'مياه معدنية مزيفة' }],
    paymentMethod: 'cash',
    amountPaid: 90,
    user: admin,
    shiftId: shift.id
  });

  assert.equal(order.total, 90);
  assert.equal(order.items[0].name, 'قهوة تركي مخصوص');
  assert.equal(order.items[0].unit_price, 45);
  assert.equal(order.items[0].total_price, 90);
});

test('F-18: Order idempotency via clientOrderId prevents duplicate checkout and double stock deduction', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(100, '', admin);

  const product = db.listProducts()[0];
  db.saveProduct({ ...product, stock_qty: 10 });

  const clientOrderId = 'checkout_unique_req_12345';

  const order1 = db.createOrder({
    items: [{ id: product.id, qty: 2 }],
    paymentMethod: 'cash',
    amountPaid: product.price * 2,
    user: admin,
    shiftId: shift.id,
    clientOrderId
  });
  assert.equal(order1.success, true);
  assert.equal(order1.duplicate, undefined);

  // Immediate second checkout with the same clientOrderId (double-click simulation)
  const order2 = db.createOrder({
    items: [{ id: product.id, qty: 2 }],
    paymentMethod: 'cash',
    amountPaid: product.price * 2,
    user: admin,
    shiftId: shift.id,
    clientOrderId
  });
  assert.equal(order2.success, true);
  assert.equal(order2.duplicate, true);
  assert.equal(order2.id, order1.orderId || order1.id);

  // Stock must only be deducted once (10 - 2 = 8, not 6)
  const freshProd = db.listProducts().find(p => p.id === product.id);
  assert.equal(freshProd.stock_qty, 8);
});

test('F-05: Split order cancellation refunds cash, card, and wallet parts accurately', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(500, '', admin);

  const product = db.listProducts()[0];
  db.saveProduct({ ...product, price: 100, stock_qty: 10 });

  // Place a split order: 40 cash, 30 card, 30 wallet = 100
  const order = db.createOrder({
    items: [{ id: product.id, qty: 1 }],
    paymentMethod: 'split',
    cashAmount: 40,
    cardAmount: 30,
    walletAmount: 30,
    user: admin,
    shiftId: shift.id
  });

  const cancelRes = db.cancelOrder(order.orderId || order.id, 'إلغاء تجريبي', admin, null, true);
  assert.equal(cancelRes.success, true);

  const refunds = db.queryAll('SELECT * FROM order_refunds WHERE order_id = ?', [order.orderId || order.id]);
  assert.equal(refunds.length, 3);

  const cashRefund = refunds.find(r => r.payment_method === 'cash');
  const cardRefund = refunds.find(r => r.payment_method === 'card');
  const walletRefund = refunds.find(r => r.payment_method === 'wallet');

  assert.equal(cashRefund.refund_amount, 40);
  assert.equal(cardRefund.refund_amount, 30);
  assert.equal(walletRefund.refund_amount, 30);
});

test('F-05: Notebook debt cancellation only refunds actual cash received, not unpaid balance', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(500, '', admin);

  const product = db.listProducts()[0];
  db.saveProduct({ ...product, price: 200, stock_qty: 10 });

  // Place a notebook order of 200 EGP, with only 50 EGP upfront payment
  const order = db.createOrder({
    items: [{ id: product.id, qty: 1 }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'محمد أحمد',
    amountPaid: 50,
    user: admin,
    shiftId: shift.id
  });

  const cancelRes = db.cancelOrder(order.orderId || order.id, 'إلغاء نوتة', admin, null, true);
  assert.equal(cancelRes.success, true);

  const refunds = db.queryAll('SELECT * FROM order_refunds WHERE order_id = ?', [order.orderId || order.id]);
  assert.equal(refunds.length, 1);
  // Refund must ONLY be 50 EGP (the amount actually received), NEVER 200 EGP!
  assert.equal(refunds[0].refund_amount, 50);
});

test('F-10: CSV export sanitizes formulas and Excel export escapes HTML cells and titles', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(500, '', admin);

  const product = db.listProducts()[0];
  db.saveProduct({ ...product, price: 50, stock_qty: 10 });

  // Order with potentially malicious customer name containing Excel formula and HTML
  db.createOrder({
    items: [{ id: product.id, qty: 1, notes: '<script>alert("hack")</script>' }],
    paymentMethod: 'cash',
    customerName: '=cmd|"/C calc"!A0',
    amountPaid: 50,
    user: admin,
    shiftId: shift.id
  });

  const csv = db.exportOrdersCsv();
  // Formula injection prefix '=' must be neutralized with a leading single quote "'"
  assert.ok(csv.includes("'=cmd"), 'CSV did not escape leading formula character');

  const excelHtml = db.exportOrdersExcel();
  // HTML tags in notes must be sanitized and not rendered raw
  assert.ok(excelHtml.includes('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;'));
  assert.ok(!excelHtml.includes('<script>alert("hack")</script>'));
});

test('F-11: restoreBackup validates SQLite integrity and rejects foreign or corrupted databases', async () => {
  const { db } = loadDb();
  await db.init();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-restore-val-'));
  const fakeDbPath = path.join(tempDir, 'fake.db');

  // 1. Text file with fake header
  fs.writeFileSync(fakeDbPath, 'not a sqlite database at all');
  assert.throws(() => {
    db.restoreBackup(fakeDbPath);
  }, /ملف النسخة الاحتياطية غير صالح/);

  // 2. Foreign SQLite database lacking TaqfeelaPOS tables
  const SQLInstance = await require('sql.js')();
  const foreignDb = new SQLInstance.Database();
  foreignDb.run('CREATE TABLE chrome_cookies (id INT, value TEXT);');
  const foreignBuffer = Buffer.from(foreignDb.export());
  const foreignPath = path.join(tempDir, 'foreign.db');
  fs.writeFileSync(foreignPath, foreignBuffer);

  assert.throws(() => {
    db.restoreBackup(foreignPath);
  }, /لا يخص نظام تقفيلة POS/);
});

test('F-01: Hardcoded vendor master password is removed', async () => {
  const { db } = loadDb();
  await db.init();

  // The old plaintext password must be rejected
  assert.equal(db.verifyVendorPassword('Zyad@_#2006%caffe'), false);
  assert.equal(db.verifyVendorPassword('1234'), false);
  assert.equal(db.verifyVendorPassword(''), false);
});

test('F-29: deleteDebt verifies any valid admin password and logs audit record', async () => {
  const { db } = loadDb();
  await db.init();
  db.setupInitialAdmin('AdminAuditPass2026!#', 'المدير');
  const admin = db.loginUser('admin', 'AdminAuditPass2026!#');
  const shift = db.openShift(100, '', admin);

  const product = db.listProducts()[0];
  db.createOrder({
    items: [{ id: product.id, qty: 1 }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'عميل تجريبي',
    user: admin,
    shiftId: shift.id
  });

  const debt = db.queryGet('SELECT * FROM customer_debts LIMIT 1');
  assert.ok(debt);

  // Wrong password
  const failRes = db.deleteDebt({ debtId: debt.id, adminPassword: 'wrong' });
  assert.equal(failRes.success, false);

  // Valid admin password
  const okRes = db.deleteDebt({ debtId: debt.id, adminPassword: 'AdminAuditPass2026!#', actor: admin });
  assert.equal(okRes.success, true);

  // Debt must be deleted
  const deletedDebt = db.queryGet('SELECT * FROM customer_debts WHERE id = ?', [debt.id]);
  assert.equal(deletedDebt, null);

  // Audit record must be created
  const audit = db.listAuditLog(10);
  assert.ok(audit.some(a => a.action === 'delete' && a.entity_type === 'debt'));
});

test('F-14: resetClockGuard resynchronizes clock guard and writes audit log', async () => {
  const { db } = loadDb();
  await db.init();
  db.setupInitialAdmin('AdminAuditPass2026!#', 'المدير');
  const admin = db.loginUser('admin', 'AdminAuditPass2026!#');

  const res = db.resetClockGuard({ adminPassword: 'AdminAuditPass2026!#', actor: admin });
  assert.equal(res.success, true);

  const audit = db.listAuditLog(10);
  assert.ok(audit.some(a => a.action === 'clock_sync'));
});

test('F-26: toCairoDateString and getCairoTodayString compute Cairo calendar date accurately', async () => {
  const { db } = loadDb();
  await db.init();

  // 2026-06-15 22:30:00 UTC is 2026-06-16 01:30:00 AM Cairo Time (Summer DST +3)
  const summerUtc = '2026-06-15T22:30:00.000Z';
  const cairoDate = db.toCairoDateString(summerUtc);
  assert.equal(cairoDate, '2026-06-16');

  // getCairoTodayString returns a valid YYYY-MM-DD
  const todayCairo = db.getCairoTodayString();
  assert.match(todayCairo, /^\d{4}-\d{2}-\d{2}$/);
});

test('Scenario 1 (Power Cut / Corruption): Auto-recovery restores healthy backup and never crashes on corrupted DB', async () => {
  const { db, dir } = loadDb();
  await db.init();
  db.setupInitialAdmin('AdminAuditPass2026!#', 'المدير');
  const admin = db.loginUser('admin', 'AdminAuditPass2026!#');
  const shift = db.openShift(150, 'الصباحي', admin);

  // Create a backup file representing a healthy state
  const bRes = db.createBackup();
  assert.equal(bRes.success, true);
  assert.ok(bRes.filename);

  // Simulate violent power cut corruption: overwrite cafe-pos.db with corrupted/garbage bytes
  const dbFile = path.join(dir, 'cafe-pos.db');
  fs.writeFileSync(dbFile, 'GARBAGE NOT A DATABASE BYTES');

  // App re-launches after power cut
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../electron/db')];
  const freshDb = require('../electron/db');
  await freshDb.init();
  Module._load = original;

  // Verify recovery succeeded without throwing "file is not a database"
  const recInfo = freshDb.getRecoveryInfo();
  assert.equal(recInfo.recovered, true);
  assert.ok(recInfo.quarantinedPath && fs.existsSync(recInfo.quarantinedPath));

  // Verify database is completely operational
  const users = freshDb.listUsers();
  assert.ok(users.length > 0);
  const products = freshDb.listProducts();
  assert.ok(products.length > 0);
});

test('Scenario 2 (Financial Integrity): Daily summary accurately computes net cash with splits, expenses, and refunds', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(500, 'الصباحي', admin);
  const product = db.listProducts()[0];
  db.saveProduct({ ...product, price: 100, stock_qty: 50 });

  // 1. Cash sale: 100 EGP
  db.createOrder({
    items: [{ id: product.id, qty: 1 }],
    paymentMethod: 'cash',
    amountPaid: 100,
    user: admin,
    shiftId: shift.id
  });

  // 2. Split sale: 50 cash, 50 card
  const splitOrder = db.createOrder({
    items: [{ id: product.id, qty: 1 }],
    paymentMethod: 'split',
    cashAmount: 50,
    cardAmount: 50,
    amountPaid: 100,
    user: admin,
    shiftId: shift.id
  });

  // 3. Expense: 30 EGP cash expense
  db.addExpense({
    title: 'شراء بن إضافي',
    amount: 30,
    category: 'مشتريات',
    user: admin,
    adminPassword: '1234'
  });

  // 4. Cancel split order -> refunds 50 cash and 50 card
  db.cancelOrder(splitOrder.orderId, 'إلغاء تجربة', admin);

  const report = db.getDailySummaryReport();
  const shiftRep = report.shifts.find(s => s.shift.id === shift.id);
  assert.ok(shiftRep);

  // Active Cash sales: 100 (order 1 only, because cancelled split order 2 is excluded)
  assert.equal(shiftRep.shift.cash_sales, 100);
  // Expenses: 30
  assert.equal(shiftRep.shift.expenses_total, 30);

  // Net cash: 100 - 30 (expense) = 70 EGP net cash from operations
  assert.equal(shiftRep.netCash, 70);
});

test('Scenario 3 (Tables Integrity): Table transfer and checkout do not duplicate carts and correctly clear state', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const shift = db.openShift(200, 'الصباحي', admin);

  const tables = db.listTables();
  const t1 = tables[0];
  const t2 = tables[1];
  const prod = db.listProducts()[0];

  // Set items on Table 1
  db.saveTableCart(t1.id, {
    cart: [{ id: prod.id, name: prod.name, price: prod.price, qty: 2 }],
    customerName: 'طاولة أولى'
  });

  // Table 1 must be occupied
  let carts = db.getTableCarts();
  assert.ok(carts[t1.id]);
  assert.equal(carts[t1.id].cart[0].qty, 2);

  // Transfer Table 1 -> Table 2
  const transRes = db.transferTable({ fromTableId: t1.id, toTableId: t2.id });
  assert.equal(transRes.success, true);

  // Table 1 must be completely removed from carts
  carts = db.getTableCarts();
  assert.equal(carts[t1.id], undefined);
  // Table 2 must have the items
  assert.ok(carts[t2.id]);
  assert.equal(carts[t2.id].cart[0].qty, 2);

  const targetCartRow = db.queryGet('SELECT rev FROM table_carts WHERE table_id = ?', [t2.id]);

  // Pay/Checkout Table 2 with expectedCartRev concurrency guard
  const checkoutRes = db.createOrder({
    items: carts[t2.id].cart,
    orderType: 'dine_in', // the POS UI always sends orderType; createOrder defaults to 'takeaway'
    tableId: t2.id,
    expectedCartRev: targetCartRow?.rev || 1,
    paymentMethod: 'cash',
    amountPaid: prod.price * 2,
    user: admin,
    shiftId: shift.id
  });
  assert.equal(checkoutRes.success, true);

  // Table 2 cart must be deleted from table_carts
  carts = db.getTableCarts();
  assert.equal(carts[t2.id], undefined);

  // Table 2 status must be available
  const freshT2 = db.listTables().find(t => t.id === t2.id);
  assert.equal(freshT2.status, 'available');
});

test('F-38: allow_cashier_cancel_orders blocks cashier cancellation in backend without admin verification', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234');
  const cashier = db.loginUser('cashier1', '123456') || { id: 2, username: 'cashier', role: 'cashier', name: 'كاشير' };
  const shift = db.openShift(200, 'شيفت تجريبي', admin);

  const product = db.listProducts()[0];
  const order = db.createOrder({
    items: [{ id: product.id, qty: 1 }],
    paymentMethod: 'cash',
    amountPaid: product.price,
    user: cashier,
    shiftId: shift.id
  });

  // Ensure setting is false (default)
  db.saveSettings({ allow_cashier_cancel_orders: 'false' });

  // Cashier attempts to cancel without admin verification -> must be rejected
  const res1 = db.cancelOrder(order.orderId || order.id, 'إلغاء كاشير غير مصرح', cashier, 'cash', false);
  assert.equal(res1.success, false);
  assert.ok(res1.error.includes('غير مسموح للكاشير') || res1.requiresAdminPassword);

  // Cashier cancels WITH admin verification -> succeeds
  const res2 = db.cancelOrder(order.orderId || order.id, 'إلغاء كاشير بموافقة المدير', cashier, 'cash', true);
  assert.equal(res2.success, true);
});

test('F-14: enable_notebook_for_admin is vendor-locked and cannot be changed via saveSettings', async () => {
  const { db } = loadDb();
  await db.init();

  // The credit/notebook feature is a vendor-controlled commercial flag: only
  // saveVendorFeatures() (Ed25519-signed developer code) may change it.
  const before = db.getSettings().enable_notebook_for_admin;

  db.saveSettings({ enable_notebook_for_admin: before === 'true' ? 'false' : 'true' });
  assert.equal(db.getSettings().enable_notebook_for_admin, before, 'saveSettings must not toggle a vendor-locked flag');

  const rejected = db.saveVendorFeatures({ vendorPassword: 'not-a-signature', features: { enable_notebook_for_admin: before === 'true' ? 'false' : 'true' } });
  assert.equal(rejected.success, false);
  assert.equal(db.getSettings().enable_notebook_for_admin, before, 'an invalid developer code must not toggle the flag');
});

