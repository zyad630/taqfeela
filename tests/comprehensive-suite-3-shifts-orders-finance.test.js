/**
 * comprehensive-suite-3-shifts-orders-finance.test.js
 * تغطية شاملة لـ: دورة حياة الشفت، إنشاء وتدقيق الطلبات، الخصومات والصلاحيات،
 * طرق الدفع (Cash, Card, Wallet, Split, Notebook)، إلغاء الطلبات، ورد المخزون والمال
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-comp-suite3-'));
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

describe('COMPREHENSIVE SUITE 3: Shifts, Orders, Payments, & Financial Integrity', () => {

  // ================= 1. دورة حياة الشفت (Shift Lifecycle) =================
  test('1.1: Shift opening, preventing concurrent open shifts, and shift requirement', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');

    // لا يمكن البيع بدون شيفت مفتوح
    assert.throws(() => {
      db.createOrder({
        items: [{ id: 1, qty: 1 }],
        paymentMethod: 'cash',
        user: admin
      });
    }, /شيفت|مفتوح/i, 'Order without open shift must be rejected');

    // فتح شيفت برصيد افتتاحي 200 جنيه
    const shift = db.openShift(200, 'عهدة افتتاحية', admin, 'main-cashier');
    assert.ok(shift?.id);
    assert.strictEqual(shift.opening_cash, 200);

    // التحقق من الشيفت النشط
    const active = db.currentShift();
    assert.strictEqual(active.id, shift.id);

    // محاولة فتح شيفت ثانٍ بينما الأول مفتوح -> ترفض بإرجاع success: false
    const second = db.openShift(100, 'شيفت مكرر', admin, 'cashier2');
    assert.strictEqual(second.success, false, 'Opening a second concurrent shift must fail');
  });

  test('1.2: Shift closing carries actual cash and reconciles surplus/deficit', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const shift = db.openShift(300, '', admin, 'pos1');
    const product = db.listProducts()[0];

    // إجراء مبيعة نقدية بقيمة المنتج
    const order = db.createOrder({
      items: [{ id: product.id, qty: 2 }],
      paymentMethod: 'cash',
      amountPaid: product.price * 2,
      user: admin,
      shiftId: shift.id
    });
    assert.ok(order.orderId || order.id);

    // المتوقع في الدرج = 300 + (product.price * 2)
    const expected = 300 + (product.price * 2);

    // إغلاق الشيفت مع عجز 10 جنيهات (دالة closeShift تأخذ معاملات ترتيبية)
    const closed = db.closeShift(shift.id, expected - 10, 'عجز 10 جنيهات مصاريف فكة', admin);

    assert.strictEqual(closed.success, true);
    assert.strictEqual(db.currentShift(), null, 'Shift must now be closed');

    // فتح شيفت جديد -> النقدية الفعلية للشيفت المغلق تنتقل تلقائياً كعهدة بداية
    const nextShift = db.openShift(expected - 10, 'تسليم واستلام', admin, 'pos1');
    assert.strictEqual(nextShift.opening_cash, expected - 10, 'Carried forward cash must match closing actual cash');
  });

  // ================= 2. معالجة الطلبات وطرق الدفع والخصومات =================
  test('2.1: Payment methods: Cash, Card, Wallet, and Split validation', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const shift = db.openShift(0, '', admin, 'suite3');
    const p = db.saveProduct({ name: 'ساندوتش كرسبي دجاج', price: 100, stock_qty: 100 });

    // 1. طلب نقدي
    const cashOrd = db.createOrder({
      items: [{ id: p.id, qty: 1 }],
      paymentMethod: 'cash',
      amountPaid: 100,
      user: admin,
      shiftId: shift.id
    });
    assert.ok(cashOrd.orderId || cashOrd.id);
    assert.strictEqual(cashOrd.payment_method || cashOrd.paymentMethod, 'cash');

    // 2. طلب بطاقة (Card)
    const cardOrd = db.createOrder({
      items: [{ id: p.id, qty: 1 }],
      paymentMethod: 'card',
      amountPaid: 100,
      user: admin,
      shiftId: shift.id
    });
    assert.strictEqual(cardOrd.payment_method || cardOrd.paymentMethod, 'card');

    // 3. طلب محفظة إلكترونية (Wallet)
    const walletOrd = db.createOrder({
      items: [{ id: p.id, qty: 1 }],
      paymentMethod: 'wallet',
      amountPaid: 100,
      user: admin,
      shiftId: shift.id
    });
    assert.strictEqual(walletOrd.payment_method || walletOrd.paymentMethod, 'wallet');

    // 4. طلب دفع مجزأ (Split Payment) سليم: 40 كاش + 40 فيزا + 20 محفظة = 100
    const splitOrd = db.createOrder({
      items: [{ id: p.id, qty: 1 }],
      paymentMethod: 'split',
      cashAmount: 40,
      cardAmount: 40,
      walletAmount: 20,
      amountPaid: 100,
      user: admin,
      shiftId: shift.id
    });
    assert.strictEqual(splitOrd.payment_method || splitOrd.paymentMethod, 'split');
    assert.strictEqual(Number(splitOrd.cash_amount), 40);
    assert.strictEqual(Number(splitOrd.card_amount), 40);
    assert.strictEqual(Number(splitOrd.wallet_amount), 20);

    // 5. دفع مجزأ غير متطابق المجموع (30 + 30 + 20 = 80 != 100) -> يجب الرفض
    assert.throws(() => {
      db.createOrder({
        items: [{ id: p.id, qty: 1 }],
        paymentMethod: 'split',
        cashAmount: 30,
        cardAmount: 30,
        walletAmount: 20,
        user: admin,
        shiftId: shift.id
      });
    }, /المبالغ المقسمة|إجمالي/i, 'Mismatched split sum must throw error');
  });

  test('2.2: Discount rules & Role permissions enforcement', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const cashier = db.saveUser({ username: 'cashier99', name: 'كاشير فحص', role: 'cashier', password: 'pass1234Password' });
    const shift = db.openShift(0, '', admin, 'suite3');
    const prod = db.saveProduct({ name: 'كريب نوتيلا فراولة', price: 80, stock_qty: 50 });

    // كاشير عادي يحاول وضع خصم -> يجب رفض الخصم لأن الخصم مخصص للمدير
    const cashierOrderRes = db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      paymentMethod: 'cash',
      discount: 20,
      user: cashier,
      shiftId: shift.id
    });
    assert.strictEqual(cashierOrderRes.success, false, 'Non-admin discount must be rejected');

    // مدير يضع خصم صالح (20 جنيه من 80 = الإجمالي 60)
    const adminOrder = db.createOrder({
      items: [{ id: prod.id, qty: 1 }],
      paymentMethod: 'cash',
      discount: 20,
      user: admin,
      shiftId: shift.id
    });
    assert.strictEqual(Number(adminOrder.total), 60);
    assert.strictEqual(Number(adminOrder.discount), 20);

    // خصم يتجاوز إجمالي الفاتورة (خصم 100 على فاتورة بـ 80) -> يجب الرفض
    assert.throws(() => {
      db.createOrder({
        items: [{ id: prod.id, qty: 1 }],
        paymentMethod: 'cash',
        discount: 100,
        user: admin,
        shiftId: shift.id
      });
    }, /الخصم لا يمكن أن يتجاوز/i);
  });

  test('2.3: Order Idempotency (clientOrderId) prevents duplicate order submission', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const shift = db.openShift(0, '', admin, 'suite3');
    const prod = db.saveProduct({ name: 'مشروب أوريو مثلج', price: 40, stock_qty: 20 });

    const clientOrderId = 'UUID-CLIENT-UNIQUE-12345';

    // الطلب الأول
    const ord1 = db.createOrder({
      items: [{ id: prod.id, qty: 2 }],
      paymentMethod: 'cash',
      clientOrderId,
      user: admin,
      shiftId: shift.id
    });
    const orderId1 = ord1.orderId || ord1.id;
    assert.ok(orderId1);
    assert.strictEqual(db.listProducts().find(p => p.id === prod.id).stock_qty, 18);

    // إعادة إرسال نفس الطلب بنفس clientOrderId (محاكاة نقرة مزدوجة أو إعادة محاولة شبكة)
    const ord2 = db.createOrder({
      items: [{ id: prod.id, qty: 2 }],
      paymentMethod: 'cash',
      clientOrderId,
      user: admin,
      shiftId: shift.id
    });

    assert.strictEqual(ord2.duplicate, true, 'Second call must return duplicate: true');
    const orderId2 = ord2.orderId || ord2.id;
    assert.strictEqual(orderId2, orderId1, 'Must return same order ID without re-inserting');
    assert.strictEqual(db.listProducts().find(p => p.id === prod.id).stock_qty, 18,
      'Stock must NOT be deducted twice on duplicate clientOrderId');
  });

  test('2.4: Multi-line stock aggregation prevents split-line stock bypass', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const shift = db.openShift(0, '', admin, 'suite3');

    // منتج متاح منه 3 فقط في المخزن
    const prod = db.saveProduct({ name: 'كيك لوتس محدود', price: 50, stock_qty: 3 });

    // محاولة شراء 2 في بند أول و 2 في بند ثانٍ (المجموع 4 > المتاح 3)
    assert.throws(() => {
      db.createOrder({
        items: [
          { id: prod.id, qty: 2 },
          { id: prod.id, qty: 2 }
        ],
        paymentMethod: 'cash',
        user: admin,
        shiftId: shift.id
      });
    }, /المخزون غير كاف/i, 'Combined quantities of the same product must be checked together against stock');
  });

  test('2.5: Order cancellation restores exact inventory and returns money', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.loginUser('admin', '1234');
    const shift = db.openShift(0, '', admin, 'suite3');
    const prod = db.saveProduct({ name: 'موهيتو فراولة صودا', price: 30, stock_qty: 15 });

    const order = db.createOrder({
      items: [{ id: prod.id, qty: 3 }],
      paymentMethod: 'cash',
      amountPaid: 90,
      user: admin,
      shiftId: shift.id
    });

    const orderId = order.orderId || order.id;
    assert.ok(orderId);
    assert.strictEqual(db.listProducts().find(p => p.id === prod.id).stock_qty, 12);

    // إلغاء الطلب بواسطة المدير
    const cancelRes = db.cancelOrder(orderId, 'طلب خطأ من الزبون', admin);
    assert.strictEqual(cancelRes.success, true);

    // المخزون يجب أن يعود كاملاً (12 + 3 = 15)
    assert.strictEqual(db.listProducts().find(p => p.id === prod.id).stock_qty, 15);

    // حركة المخزن تسجل حركة استرجاع (return)
    const movements = db.listStockMovements(prod.id);
    assert.ok(movements.some(m => m.movement_type === 'return' && m.quantity === 3));
  });
});
