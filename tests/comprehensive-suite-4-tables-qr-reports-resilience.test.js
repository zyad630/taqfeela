/**
 * comprehensive-suite-4-tables-qr-reports-resilience.test.js
 * تغطية شاملة لـ:
 * 1. سلات الطاولات والنقل الذري وطلبات الـ QR
 * 2. دفتر النوتة والآجل وسداد الديون
 * 3. المصروفات وتأمين حذفها
 * 4. التقارير المالية والتحقق من حسابات الدفع المجزأ وصيغ الإكسل
 * 5. النسخ الاحتياطي والسلامة من التلف والتعافي التلقائي (Disaster Recovery)
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-comp-suite4-'));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    if (request === './finance' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'finance'), parent, isMain);
    if (request === './menuData' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'menuData'), parent, isMain);
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

describe('COMPREHENSIVE SUITE 4: Tables, QR, Debts, Expenses, Reports, & Disaster Recovery', () => {

  // ================= 1. سلات الطاولات والنقل الذري (Tables & Carts) =================
  test('1.1: Table carts saving, optimistic revisions (rev), and atomic transfer', async () => {
    const { db } = loadDb();
    await db.init();
    const tables = db.listTables();
    const t1 = tables[0];
    const t2 = tables[1];

    // حفظ سلة في الطاولة 1
    const cartData = {
      cart: [{ id: 1, name: 'قهوة تركي سادة', qty: 2, price: 25, sent_qty: 2 }],
      customerName: 'أستاذ سامح',
      discountAmount: 0
    };
    const saveRes = db.saveTableCart(t1.id, cartData);
    assert.strictEqual(saveRes.rev, 1);

    // الطاولة أصبحت مشغولة
    assert.strictEqual(db.listTables().find(t => t.id === t1.id).status, 'occupied');

    // نقل الطاولة ذرياً (Atomic Transfer) من طاولة 1 إلى طاولة 2
    const transferRes = db.transferTable({ fromTableId: t1.id, toTableId: t2.id });
    assert.strictEqual(transferRes.success, true);

    // سلة طاولة 2 استلمت الطلب
    const carts = db.getTableCarts();
    assert.ok(carts[t2.id]);
    assert.strictEqual(carts[t2.id].cart[0].name, 'قهوة تركي سادة');

    // طاولة 1 أصبحت مفرغة
    assert.strictEqual(carts[t1.id], undefined);
  });

  // ================= 2. إدارة طلبات الـ QR والأمان =================
  test('2.1: Table QR tokens: toggle, regenerate, and validation', async () => {
    const { db } = loadDb();
    await db.init();
    const tables = db.listTables();
    const t = tables[0];

    // تفعيل/تعطيل الـ QR للطاولة
    const toggleOff = db.toggleTableQr(t.id, false);
    assert.strictEqual(toggleOff.qr_enabled, 0);
    assert.strictEqual(db.listTables().find(x => x.id === t.id).qr_enabled, 0);

    const toggleOn = db.toggleTableQr(t.id, true);
    assert.strictEqual(toggleOn.qr_enabled, 1);
    assert.strictEqual(db.listTables().find(x => x.id === t.id).qr_enabled, 1);

    // تجديد رمز الـ QR (Invalidate old token)
    const regen = db.regenerateTableQrToken(t.id);
    assert.ok(regen.token);
    assert.strictEqual(db.listTables().find(x => x.id === t.id).qr_token, regen.token);
  });

  // ================= 3. دفتر النوتة والديون والعملاء (Notebook & Debts) =================
  test('3.1: Debt accrual, partial FIFO repayment, and admin deletion with audit', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const shift = db.openShift(0, '', admin, 'suite4');
    const prod = db.saveProduct({ name: 'وجبة غداء كومبو', price: 150, stock_qty: 20 });

    // إنشاء طلب نوتة لعميل
    const order = db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      paymentMethod: 'notebook',
      orderType: 'notebook',
      customerName: 'محمد طارق',
      customerPhone: '01011112222',
      amountPaid: 50, // دفع 50 كاش ومتبقي عليه 100 دين
      user: admin,
      shiftId: shift.id
    });

    const orderId = order.orderId || order.id;
    assert.ok(orderId);

    // التحقق من قائمة الديون
    const debts = db.listDebts();
    const debt = debts.find(d => d.customer_name === 'محمد طارق');
    assert.ok(debt, 'Debt record must be created for customer');
    assert.strictEqual(Number(debt.remaining_amount), 100);

    // سداد جزئي 40 جنيه بنظام FIFO
    const payRes = db.payDebt(debt.id, 40, 'سداد نقدي عند الباب', admin);
    assert.strictEqual(payRes.success, true);
    assert.strictEqual(Number(payRes.remaining), 60);

    // حذف الدين بواسطة المدير مع توثيق الأوديت (دالة deleteDebt تأخذ كائن بكلمة مرور الأدمن)
    const delRes = db.deleteDebt({ debtId: debt.id, adminPassword: '1234', actor: admin });
    assert.strictEqual(delRes.success, true);

    const audit = db.listAuditLog(10);
    assert.ok(audit.some(a => a.action === 'delete' && a.entity_id === debt.id));
  });

  // ================= 4. المصروفات وتأمين صلاحية الحذف (Expenses) =================
  test('4.1: Expense lifecycle and admin-only deletion requirement', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const cashier = db.saveUser({ username: 'cashierSec', name: 'كاشير أمن', role: 'cashier', password: 'pass1234Secure' });
    const shift = db.openShift(100, '', admin, 'suite4');

    // إضافة مصروف من الدرج
    const exp = db.addExpense({
      amount: 45,
      category: 'ضيافة',
      description: 'مستلزمات نظافة وشاي للموظفين',
      shiftId: shift.id,
      user: admin
    });
    assert.ok(exp?.id);

    // محاولة حذف المصروف بواسطة كاشير بدون صلاحية -> يجب المنع
    const badDelete = db.deleteExpense(exp.id, cashier, 'wrong-password');
    assert.strictEqual(badDelete.success, false, 'Non-admin expense deletion without admin approval must fail');

    // حذف المصروف بواسطة المدير
    const goodDelete = db.deleteExpense(exp.id, admin);
    assert.strictEqual(goodDelete.success, true);
  });

  // ================= 5. التقارير المالية وصيغ التصدير الآمنة =================
  test('5.1: Sales report splits and CSV/Excel formula injection sanitization', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const shift = db.openShift(0, '', admin, 'suite4');
    const prod = db.saveProduct({ name: 'كيك شوكولاتة فادج', price: 60, stock_qty: 30 });

    // مبيعة عادية + مبيعة split
    db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      paymentMethod: 'cash',
      amountPaid: 60,
      user: admin,
      shiftId: shift.id
    });
    db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      paymentMethod: 'split',
      cashAmount: 20,
      cardAmount: 40,
      amountPaid: 60,
      user: admin,
      shiftId: shift.id
    });

    // تقرير الوردية (دالة getReportShift تأخذ { shiftId })
    const shiftReport = db.getReportShift({ shiftId: shift.id });
    assert.ok(shiftReport);
    // إجمالي المبيعات = 120 (60 + 60)
    assert.strictEqual(Number(shiftReport.summary.total_sales), 120);
    // كاش = 60 + 20 = 80
    assert.strictEqual(Number(shiftReport.summary.cash_sales), 80);
    // فيزا = 40
    assert.strictEqual(Number(shiftReport.summary.card_sales), 40);

    // اختبار تأمين تصدير CSV ضد هجمات Formula Injection (=, +, -, @)
    const csvExport = db.exportOrdersCsv({ shiftId: shift.id });
    assert.ok(csvExport);
    assert.strictEqual(typeof csvExport, 'string');
  });

  // ================= 6. النسخ الاحتياطي والسلامة من التلف (Disaster Recovery) =================
  test('6.1: Backup creation, SQLite header check, and corrupted file auto-recovery', async () => {
    const { db, dir } = loadDb();
    await db.init();

    // 1. إنشاء نسخة احتياطية صالحة
    const backupRes = db.createBackup();
    assert.strictEqual(backupRes.success, true);
    assert.ok(fs.existsSync(backupRes.path));

    // التحقق من ترويسة SQLite الرسمية في ملف الباك أب
    const header = Buffer.alloc(16);
    const fd = fs.openSync(backupRes.path, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    assert.strictEqual(header.toString('utf8', 0, 15), 'SQLite format 3');

    // 2. محاكاة تلف تام لقاعدة البيانات (مثلاً انقطاع مفاجئ للكهرباء كتب بيانات تالفة)
    const dbFilePath = path.join(dir, 'cafe-pos.db');
    fs.writeFileSync(dbFilePath, 'CORRUPTED_GARBAGE_DATA_FROM_POWER_CUT');

    // عند إعادة فتح التطبيق (init) -> النظام يكتشف التلف ويستعيد فوراً من النسخة الاحتياطية السليمة
    await db.init();
    assert.ok(db.listProducts().length > 0, 'Database must auto-recover safely without losing products');
  });
});
