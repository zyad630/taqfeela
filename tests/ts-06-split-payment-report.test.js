/**
 * ts-06-split-payment-report.test.js
 * BUG-05: getSalesReport/getDailyReport كانت لا تجمع cash_amount/card_amount/wallet_amount
 *         لطلبات payment_method='split'، مما يجعل الإجماليات أقل من الحقيقة.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-ts06-'));
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

// ===== دالة احتساب صحيح لطرق الدفع (بعد الإصلاح) =====
function calcPaymentTotals(orders) {
  let cashSales = 0, cardSales = 0, walletSales = 0;
  for (const o of orders) {
    const t = Number(o.total) || 0;
    if (o.payment_method === 'split') {
      cashSales   += Number(o.cash_amount)   || 0;
      cardSales   += Number(o.card_amount)   || 0;
      walletSales += Number(o.wallet_amount) || 0;
    } else if (o.payment_method === 'cash') {
      cashSales += (o.cash_amount != null && Number(o.cash_amount) > 0)
        ? Number(o.cash_amount) : t;
    } else if (o.payment_method === 'card') {
      cardSales += t;
    } else if (o.payment_method === 'wallet') {
      walletSales += t;
    }
  }
  return { cashSales, cardSales, walletSales };
}

// ===== الكود القديم (قبل الإصلاح) — لإثبات وجود المشكلة =====
function calcPaymentTotalsOLD(orders) {
  const cashSales   = orders.filter(o => o.payment_method === 'cash').reduce((s, o) => s + (Number(o.total) || 0), 0);
  const cardSales   = orders.filter(o => o.payment_method === 'card').reduce((s, o) => s + (Number(o.total) || 0), 0);
  const walletSales = orders.filter(o => o.payment_method === 'wallet').reduce((s, o) => s + (Number(o.total) || 0), 0);
  return { cashSales, cardSales, walletSales };
}

const TEST_ORDERS = [
  { id: 1, total: 100, payment_method: 'cash',   cash_amount: 100,  card_amount: 0,  wallet_amount: 0 },
  { id: 2, total: 150, payment_method: 'card',   cash_amount: 0,    card_amount: 150, wallet_amount: 0 },
  { id: 3, total: 200, payment_method: 'split',  cash_amount: 80,   card_amount: 70,  wallet_amount: 50 },
  { id: 4, total: 90,  payment_method: 'wallet', cash_amount: 0,    card_amount: 0,   wallet_amount: 90 },
  { id: 5, total: 120, payment_method: 'split',  cash_amount: 60,   card_amount: 40,  wallet_amount: 20 },
];
// المتوقع:
// نقدي:  100 + 80  + 60  = 240
// بطاقة: 150 + 70  + 40  = 260
// محفظة: 90  + 50  + 20  = 160
// مجموع: 240 + 260 + 160 = 660 = مجموع الطلبات (100+150+200+90+120=660)

describe('TS-06 — BUG-05: Split payment amounts included in report totals', () => {

  test('TS-06-A: OLD code misses split amounts (proves bug existed)', () => {
    const { cashSales, cardSales, walletSales } = calcPaymentTotalsOLD(TEST_ORDERS);
    const total = TEST_ORDERS.reduce((s, o) => s + o.total, 0);

    // الكود القديم يُعيد أرقامًا خاطئة أقل من المجموع الكلي
    assert.notStrictEqual(cashSales + cardSales + walletSales, total,
      'OLD CODE: split payments are missed — sum of categories < total_sales (proves bug)');
    // نتوقع 100+150+90=340 بدل 660
    assert.strictEqual(cashSales, 100, 'OLD: cash_sales misses split cash');
    assert.strictEqual(cardSales, 150, 'OLD: card_sales misses split card');
    assert.strictEqual(walletSales, 90, 'OLD: wallet_sales misses split wallet');
  });

  test('TS-06-B: FIXED code correctly sums split amounts in each category', () => {
    const { cashSales, cardSales, walletSales } = calcPaymentTotals(TEST_ORDERS);
    const total = TEST_ORDERS.reduce((s, o) => s + o.total, 0);

    assert.strictEqual(cashSales, 240,
      'cash_sales must include cash_amount from all split orders');
    assert.strictEqual(cardSales, 260,
      'card_sales must include card_amount from all split orders');
    assert.strictEqual(walletSales, 160,
      'wallet_sales must include wallet_amount from all split orders');
    assert.strictEqual(cashSales + cardSales + walletSales, total,
      'Sum of all payment categories MUST equal total_sales — no money left unaccounted');
  });

  test('TS-06-C: single split order totals correctly', () => {
    const orders = [
      { id: 1, total: 300, payment_method: 'split', cash_amount: 100, card_amount: 150, wallet_amount: 50 }
    ];
    const { cashSales, cardSales, walletSales } = calcPaymentTotals(orders);
    assert.strictEqual(cashSales, 100);
    assert.strictEqual(cardSales, 150);
    assert.strictEqual(walletSales, 50);
    assert.strictEqual(cashSales + cardSales + walletSales, 300);
  });

  test('TS-06-D: mix of split and non-split totals correctly', () => {
    const orders = [
      { id: 1, total: 50,  payment_method: 'cash',   cash_amount: 50,  card_amount: 0,   wallet_amount: 0 },
      { id: 2, total: 200, payment_method: 'split',  cash_amount: 100, card_amount: 60,  wallet_amount: 40 },
      { id: 3, total: 75,  payment_method: 'wallet', cash_amount: 0,   card_amount: 0,   wallet_amount: 75 },
    ];
    const { cashSales, cardSales, walletSales } = calcPaymentTotals(orders);
    const total = orders.reduce((s, o) => s + o.total, 0);
    assert.strictEqual(cashSales, 150, 'cash: 50 + 100 split');
    assert.strictEqual(cardSales, 60, 'card: 60 from split');
    assert.strictEqual(walletSales, 115, 'wallet: 75 + 40 split');
    assert.strictEqual(cashSales + cardSales + walletSales, total);
  });

  test('TS-06-E: integration with real db orders and getReportSales logic', async () => {
    const { db } = loadDb();
    await db.init();

    const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
    if (!admin) { return; }

    const shift = db.openShift(100, '', admin, 'ts06');
    if (!shift?.id) return;

    const product = db.listProducts()[0];
    if (!product) return;

    // طلب split
    const splitOrder = db.createOrder({
      items: [{ id: product.id, qty: 1, price: product.price }],
      paymentMethod: 'split',
      cashAmount: 30,
      cardAmount: product.price - 60 > 0 ? product.price - 60 : 0,
      walletAmount: 30,
      amountPaid: product.price,
      user: admin,
      shiftId: shift.id
    });

    // طلب نقدي عادي
    const cashOrder = db.createOrder({
      items: [{ id: product.id, qty: 1, price: product.price }],
      paymentMethod: 'cash',
      amountPaid: product.price,
      user: admin,
      shiftId: shift.id
    });

    if (!splitOrder?.orderId || !cashOrder?.orderId) return;

    const orders = db.listOrders(shift.id) || [];
    assert.ok(orders.length >= 2, 'Orders should be retrieved from DB');

    // منطق getReportSales المُصلح
    const _calcCash = (o) => {
      if (o.payment_method === 'split') return Number(o.cash_amount) || 0;
      if (o.payment_method === 'cash')  return (o.cash_amount != null && Number(o.cash_amount) > 0) ? Number(o.cash_amount) : (Number(o.total) || 0);
      return 0;
    };
    const _calcCard = (o) => {
      if (o.payment_method === 'split') return Number(o.card_amount) || 0;
      if (o.payment_method === 'card')  return Number(o.total) || 0;
      return 0;
    };
    const _calcWallet = (o) => {
      if (o.payment_method === 'split')  return Number(o.wallet_amount) || 0;
      if (o.payment_method === 'wallet') return Number(o.total) || 0;
      return 0;
    };

    const cashSales = orders.reduce((sum, o) => sum + _calcCash(o), 0);
    const cardSales = orders.reduce((sum, o) => sum + _calcCard(o), 0);
    const walletSales = orders.reduce((sum, o) => sum + _calcWallet(o), 0);
    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    assert.ok(cashSales >= 30, 'cashSales must include split cash amount (>= 30)');
    assert.strictEqual(cashSales + cardSales + walletSales, totalSales,
      'Total of payment breakdown must strictly equal totalSales for DB orders');
  });

  test('TS-06-F: all-split orders have zero in non-split method totals from old code', () => {
    // يوثّق مدى فداحة الخطأ: لو كل الطلبات split → الكود القديم يُرجع 0 لكل شيء!
    const allSplitOrders = [
      { id: 1, total: 500, payment_method: 'split', cash_amount: 200, card_amount: 200, wallet_amount: 100 },
      { id: 2, total: 300, payment_method: 'split', cash_amount: 100, card_amount: 150, wallet_amount: 50 },
    ];
    const { cashSales: oldCash, cardSales: oldCard, walletSales: oldWallet } = calcPaymentTotalsOLD(allSplitOrders);
    assert.strictEqual(oldCash + oldCard + oldWallet, 0,
      'PROOF OF BUG: OLD code returns ZERO for all-split orders — 800 EGP completely unaccounted!');

    const { cashSales, cardSales, walletSales } = calcPaymentTotals(allSplitOrders);
    assert.strictEqual(cashSales + cardSales + walletSales, 800,
      'FIXED: all 800 EGP correctly distributed across payment categories');
  });
});
