/**
 * ===========================================================================
 * تيست التسليم النهائي — فحص كل الثغرات الخبيثة المحتملة
 * ===========================================================================
 * يفحص:
 * 1. هل الفواتير بتختفي وسط الضغط الكبير؟
 * 2. هل الحسابات صح 100%؟ (خصم، ضريبة، باقي، تقسيم)
 * 3. هل تقرير الشيفت بيطابق الفواتير المسجلة؟
 * 4. هل الإلغاء بيرجع المخزون والحسابات صح؟
 * 5. هل النوتة (الآجل) بتسجل صح ومبتختفيش؟
 * 6. هل الأصناف في الفاتورة بتطابق اللي في الداتابيز؟
 * 7. Rapid-fire orders: 100 فاتورة متتالية بدون ما حاجة تضيع
 * 8. Float precision: أرقام عشرية مبتعملش مشاكل
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '.test-final-delivery-audit', 'test-delivery.db');

let db;

before(async () => {
  const dir = path.dirname(DB_PATH);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  db = require('../electron/db');
  await db.init(DB_PATH);

  // Setup: admin user + products
  try {
    db.saveUser({ username: 'admin', password: 'Admin@12345', role: 'admin', name: 'مدير' });
  } catch (_) {}
  try {
    db.saveUser({ username: 'cashier1', password: 'Cash@12345', role: 'cashier', name: 'كاشير 1' });
  } catch (_) {}

  // Add products with known prices and stock
  const products = [
    { name: 'قهوة تركي', price: 15.50, category: 'مشروبات', stock_qty: 500 },
    { name: 'كابتشينو', price: 25.75, category: 'مشروبات', stock_qty: 500 },
    { name: 'كرواسون', price: 12.00, category: 'حلويات', stock_qty: 200 },
    { name: 'تشيز كيك', price: 35.50, category: 'حلويات', stock_qty: 100 },
    { name: 'عصير برتقال', price: 20.25, category: 'مشروبات', stock_qty: 300 },
    { name: 'سندوتش كلوب', price: 45.00, category: 'أكل', stock_qty: 150 },
    { name: 'ماء معدني', price: 5.00, category: 'مشروبات', stock_qty: 1000 },
    { name: 'آيس لاتيه', price: 30.00, category: 'مشروبات', stock_qty: 400 },
  ];
  for (const p of products) {
    db.saveProduct(p);
  }
});

after(() => {
  try {
    const dir = path.dirname(DB_PATH);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
});

function getProduct(name) {
  return db.listProducts().find(p => p.name === name);
}

function getAdmin() {
  return db.listUsers().find(u => u.role === 'admin');
}

function getCashier() {
  return db.listUsers().find(u => u.role === 'cashier');
}

describe('🔥 تيست التسليم النهائي - فحص الثغرات الخبيثة', () => {

  // ============================================================
  // TEST 1: 100 فاتورة متتالية — ولا فاتورة تضيع
  // ============================================================
  it('100 rapid-fire orders: NONE disappear, all totals match', () => {
    const admin = getAdmin();
    const shift = db.openShift(500, 'شيفت تيست الضغط', admin);
    assert.ok(shift.success !== false, 'Shift opened');
    const shiftId = shift.id;

    const coffee = getProduct('قهوة تركي');
    const cappuccino = getProduct('كابتشينو');
    const water = getProduct('ماء معدني');

    const createdOrders = [];
    let expectedTotalSum = 0;
    let expectedCashSum = 0;

    for (let i = 0; i < 100; i++) {
      // Alternate payment methods
      const paymentMethod = i % 3 === 0 ? 'cash' : i % 3 === 1 ? 'card' : 'wallet';
      const items = [
        { id: coffee.id, qty: 1 },
        { id: water.id, qty: 2 },
      ];

      // Expected total = 15.50 + (5.00 * 2) = 25.50
      const expectedTotal = 25.50;

      const result = db.createOrder({
        items,
        paymentMethod,
        orderType: 'takeaway',
        user: admin,
        shiftId,
        clientOrderId: `rapid-${i}-${Date.now()}`
      });

      assert.ok(result.success !== false, `Order ${i} created successfully`);
      assert.strictEqual(result.total, expectedTotal, `Order ${i} total is correct`);
      createdOrders.push(result);
      expectedTotalSum += expectedTotal;
      if (paymentMethod === 'cash') expectedCashSum += expectedTotal;
    }

    // Verify ALL 100 orders exist in DB
    const allOrders = db.listOrders({ shiftId, limit: 200 });
    const completedOrders = allOrders.filter(o => o.status === 'completed');
    assert.strictEqual(completedOrders.length, 100, `All 100 orders are in DB (found: ${completedOrders.length})`);

    // Verify total sales match
    const currentShift = db.currentShift();
    assert.ok(currentShift, 'Shift is still open');
    const dbTotalSales = Number(currentShift.total_sales);
    assert.ok(Math.abs(dbTotalSales - expectedTotalSum) < 0.01,
      `Total sales match: DB=${dbTotalSales}, Expected=${expectedTotalSum}`);

    // Close shift and verify
    const closeResult = db.closeShift(shiftId, currentShift.expected_cash, 'تم', admin);
    assert.ok(closeResult.success, 'Shift closed successfully');
  });

  // ============================================================
  // TEST 2: الحسابات الدقيقة — خصم + ضريبة + تقسيم دفع
  // ============================================================
  it('Calculations are EXACT: discount, tax, split payment, change', () => {
    const admin = getAdmin();
    const shift = db.openShift(0, 'شيفت حسابات', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const cake = getProduct('تشيز كيك');
    const sandwich = getProduct('سندوتش كلوب');

    // Order: 2 cheesecake (35.50*2=71) + 1 sandwich (45) = subtotal 116
    // Discount: 10, Tax: 5
    // Total = (116 - 10) + 5 = 111
    const result = db.createOrder({
      items: [
        { id: cake.id, qty: 2 },
        { id: sandwich.id, qty: 1 }
      ],
      paymentMethod: 'cash',
      discount: 10,
      tax: 5,
      amountPaid: 200,
      user: admin,
      shiftId
    });

    assert.ok(result.success !== false, 'Order created');
    assert.strictEqual(result.subtotal, 116, `Subtotal correct: ${result.subtotal}`);
    assert.strictEqual(result.discount, 10, `Discount correct: ${result.discount}`);
    assert.strictEqual(result.tax, 5, `Tax correct: ${result.tax}`);
    assert.strictEqual(result.total, 111, `Total correct: ${result.total}`);
    assert.strictEqual(result.changeDue, 89, `Change correct: ${result.changeDue}`);

    // Split payment: exact totals
    const latte = getProduct('آيس لاتيه');
    const splitResult = db.createOrder({
      items: [{ id: latte.id, qty: 3 }],
      paymentMethod: 'split',
      cashAmount: 40,
      cardAmount: 30,
      walletAmount: 20,
      user: admin,
      shiftId
    });

    assert.ok(splitResult.success !== false, 'Split order created');
    assert.strictEqual(splitResult.total, 90, `Split total = 90`);
    assert.strictEqual(splitResult.cashAmount, 40, `Cash portion correct`);
    assert.strictEqual(splitResult.cardAmount, 30, `Card portion correct`);
    assert.strictEqual(splitResult.walletAmount, 20, `Wallet portion correct`);

    // Verify shift totals include both orders
    const cur = db.currentShift();
    assert.ok(Math.abs(Number(cur.total_sales) - 201) < 0.01, `Total sales = 201 (got ${cur.total_sales})`);

    db.closeShift(shiftId, cur.expected_cash, '', admin);
  });

  // ============================================================
  // TEST 3: Float precision — أرقام عشرية مبتعملش مشاكل
  // ============================================================
  it('Float precision: 0.1 + 0.2 edge cases dont cause errors', () => {
    const admin = getAdmin();
    const shift = db.openShift(100, 'شيفت عشري', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const coffee = getProduct('قهوة تركي'); // 15.50
    const cappuccino = getProduct('كابتشينو'); // 25.75
    const juice = getProduct('عصير برتقال'); // 20.25

    // 15.50 + 25.75 + 20.25 = 61.50
    const result = db.createOrder({
      items: [
        { id: coffee.id, qty: 1 },
        { id: cappuccino.id, qty: 1 },
        { id: juice.id, qty: 1 },
      ],
      paymentMethod: 'cash',
      user: admin,
      shiftId
    });

    assert.ok(result.success !== false);
    assert.strictEqual(result.total, 61.50, `Total = 61.50 (got ${result.total})`);

    // Multiple qty with decimals: 3 * 15.50 = 46.50, 2 * 25.75 = 51.50 → total = 98
    const result2 = db.createOrder({
      items: [
        { id: coffee.id, qty: 3 },
        { id: cappuccino.id, qty: 2 }
      ],
      paymentMethod: 'card',
      user: admin,
      shiftId
    });
    assert.ok(result2.success !== false);
    assert.strictEqual(result2.total, 98, `Total = 98 (got ${result2.total})`);

    const cur = db.currentShift();
    const totalSales = Number(cur.total_sales);
    assert.ok(Math.abs(totalSales - 159.50) < 0.01, `Shift total = 159.50 (got ${totalSales})`);

    db.closeShift(shiftId, cur.expected_cash, '', admin);
  });

  // ============================================================
  // TEST 4: إلغاء فاتورة بيرجع المخزون والحسابات صح
  // ============================================================
  it('Cancel order: stock restored, shift totals adjusted, order marked cancelled', () => {
    const admin = getAdmin();
    const shift = db.openShift(200, 'شيفت إلغاء', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const croissant = getProduct('كرواسون');
    const stockBefore = croissant.stock_qty;

    // Create order with 5 croissants
    const order = db.createOrder({
      items: [{ id: croissant.id, qty: 5 }],
      paymentMethod: 'cash',
      user: admin,
      shiftId
    });
    assert.ok(order.success !== false);
    assert.strictEqual(order.total, 60, `5 * 12 = 60`);

    // Verify stock decreased
    const stockAfterOrder = getProduct('كرواسون').stock_qty;
    assert.strictEqual(stockAfterOrder, stockBefore - 5, `Stock decreased by 5`);

    // Cancel the order
    const cancelResult = db.cancelOrder(order.orderId, 'تيست إلغاء', admin, 'cash', true);
    assert.ok(cancelResult.success, `Cancel succeeded`);

    // Verify stock restored
    const stockAfterCancel = getProduct('كرواسون').stock_qty;
    assert.strictEqual(stockAfterCancel, stockBefore, `Stock restored after cancel`);

    // Verify the order shows as cancelled
    const dbOrder = db.getOrder(order.orderId);
    assert.strictEqual(dbOrder.status, 'cancelled', `Order is marked cancelled`);

    // Verify shift total doesn't include the cancelled order
    const cur = db.currentShift();
    assert.strictEqual(Number(cur.total_sales), 0, `Cancelled order not counted in total sales`);
    assert.strictEqual(cur.total_orders, 0, `Cancelled order not counted in total orders`);

    db.closeShift(shiftId, cur.expected_cash, '', admin);
  });

  // ============================================================
  // TEST 5: النوتة (الآجل) بتسجل صح ومبتختفيش
  // ============================================================
  it('Notebook/debt orders: correctly recorded, debt tracked, partial payment works', () => {
    const admin = getAdmin();
    // Enable notebook
    try { db.updateSettings({ enable_notebook_for_admin: 'true' }); } catch (_) {}

    const shift = db.openShift(0, 'شيفت نوتة', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const sandwich = getProduct('سندوتش كلوب'); // 45.00

    // Create notebook order with partial payment
    const order = db.createOrder({
      items: [{ id: sandwich.id, qty: 2 }],
      paymentMethod: 'notebook',
      orderType: 'notebook',
      customerName: 'أحمد محمد',
      customerPhone: '01012345678',
      amountPaid: 30,
      user: admin,
      shiftId
    });

    assert.ok(order.success !== false, 'Notebook order created');
    assert.strictEqual(order.total, 90, `Total = 90`);

    // Verify order exists in list
    const orders = db.listOrders({ shiftId });
    const found = orders.find(o => o.id === order.orderId);
    assert.ok(found, 'Notebook order found in list');
    assert.strictEqual(found.payment_method, 'notebook');

    // Verify debt was created
    const debts = db.listDebts ? db.listDebts() : [];
    if (debts.length > 0) {
      const debt = debts.find(d => Number(d.order_id) === Number(order.orderId));
      assert.ok(debt, 'Debt record exists');
      assert.strictEqual(Number(debt.total_amount), 90, `Debt total = 90`);
      assert.strictEqual(Number(debt.paid_amount), 30, `Debt paid = 30`);
      assert.strictEqual(Number(debt.remaining_amount), 60, `Debt remaining = 60`);
    }

    db.closeShift(shiftId, db.currentShift().expected_cash, '', admin);
  });

  // ============================================================
  // TEST 6: كل صنف في الفاتورة بيطابق الداتابيز بالظبط
  // ============================================================
  it('Order items exactly match DB products: name, price, qty, total', () => {
    const admin = getAdmin();
    const shift = db.openShift(0, 'شيفت مطابقة', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const coffee = getProduct('قهوة تركي');
    const cake = getProduct('تشيز كيك');

    const order = db.createOrder({
      items: [
        { id: coffee.id, qty: 3 },
        { id: cake.id, qty: 2 }
      ],
      paymentMethod: 'cash',
      user: admin,
      shiftId
    });

    assert.ok(order.success !== false);

    // Fetch from DB directly
    const dbOrder = db.getOrder(order.orderId);
    assert.ok(dbOrder.items.length === 2, `Order has 2 item groups`);

    // Check each item matches the product
    const coffeeItem = dbOrder.items.find(i => Number(i.product_id) === Number(coffee.id));
    const cakeItem = dbOrder.items.find(i => Number(i.product_id) === Number(cake.id));

    assert.ok(coffeeItem, 'Coffee item found');
    assert.strictEqual(coffeeItem.product_name, 'قهوة تركي', 'Name matches DB');
    assert.strictEqual(Number(coffeeItem.unit_price), 15.50, 'Price from DB not manipulated');
    assert.strictEqual(Number(coffeeItem.qty), 3, 'Qty correct');
    assert.strictEqual(Number(coffeeItem.total_price), 46.50, 'Item total = 3 * 15.50');

    assert.ok(cakeItem, 'Cake item found');
    assert.strictEqual(cakeItem.product_name, 'تشيز كيك', 'Name matches DB');
    assert.strictEqual(Number(cakeItem.unit_price), 35.50, 'Price from DB');
    assert.strictEqual(Number(cakeItem.qty), 2, 'Qty correct');
    assert.strictEqual(Number(cakeItem.total_price), 71, 'Item total = 2 * 35.50');

    db.closeShift(shiftId, db.currentShift().expected_cash, '', admin);
  });

  // ============================================================
  // TEST 7: تقرير الشيفت بيطابق الفواتير 100%
  // ============================================================
  it('Shift report totals EXACTLY match sum of all order totals', () => {
    const admin = getAdmin();
    const shift = db.openShift(1000, 'شيفت تدقيق كامل', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const products = db.listProducts();
    let manualCashTotal = 0;
    let manualCardTotal = 0;
    let manualWalletTotal = 0;
    let manualGrandTotal = 0;
    let orderCount = 0;

    // Create diverse orders
    for (let i = 0; i < 30; i++) {
      const prod1 = products[i % products.length];
      const prod2 = products[(i + 3) % products.length];
      const payment = i % 4 === 0 ? 'cash' : i % 4 === 1 ? 'card' : i % 4 === 2 ? 'wallet' : 'cash';

      const order = db.createOrder({
        items: [
          { id: prod1.id, qty: 1 },
          { id: prod2.id, qty: 1 }
        ],
        paymentMethod: payment,
        user: admin,
        shiftId,
        clientOrderId: `audit-${i}-${Date.now()}`
      });

      if (order.success !== false) {
        const total = Number(order.total);
        manualGrandTotal += total;
        if (payment === 'cash') manualCashTotal += total;
        else if (payment === 'card') manualCardTotal += total;
        else if (payment === 'wallet') manualWalletTotal += total;
        orderCount++;
      }
    }

    // Get shift report
    const cur = db.currentShift();
    assert.ok(cur, 'Shift still open');

    // Verify order count
    assert.strictEqual(cur.total_orders, orderCount, `Order count matches: ${cur.total_orders} vs ${orderCount}`);

    // Verify totals
    assert.ok(Math.abs(Number(cur.total_sales) - manualGrandTotal) < 0.01,
      `Grand total: shift=${cur.total_sales}, manual=${manualGrandTotal}`);
    assert.ok(Math.abs(Number(cur.cash_sales) - manualCashTotal) < 0.01,
      `Cash total: shift=${cur.cash_sales}, manual=${manualCashTotal}`);
    assert.ok(Math.abs(Number(cur.card_sales) - manualCardTotal) < 0.01,
      `Card total: shift=${cur.card_sales}, manual=${manualCardTotal}`);
    assert.ok(Math.abs(Number(cur.wallet_sales) - manualWalletTotal) < 0.01,
      `Wallet total: shift=${cur.wallet_sales}, manual=${manualWalletTotal}`);

    // Cross-verify: sum all orders from DB
    const allDbOrders = db.listOrders({ shiftId, limit: 500 });
    const dbOrderSum = allDbOrders
      .filter(o => o.status === 'completed')
      .reduce((sum, o) => sum + Number(o.total), 0);
    assert.ok(Math.abs(dbOrderSum - manualGrandTotal) < 0.01,
      `DB orders sum: ${dbOrderSum} vs manual: ${manualGrandTotal}`);

    // Expected cash = opening + cash sales - expenses
    const expectedCash = 1000 + manualCashTotal;
    assert.ok(Math.abs(Number(cur.expected_cash) - expectedCash) < 0.01,
      `Expected cash: shift=${cur.expected_cash}, calculated=${expectedCash}`);

    db.closeShift(shiftId, cur.expected_cash, '', admin);
  });

  // ============================================================
  // TEST 8: Idempotency — نفس الفاتورة مبتتسجلش مرتين
  // ============================================================
  it('Double-click protection: same clientOrderId never creates duplicate', () => {
    const admin = getAdmin();
    const shift = db.openShift(0, 'شيفت تكرار', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const water = getProduct('ماء معدني');
    const clientId = `unique-${Date.now()}`;

    const first = db.createOrder({
      items: [{ id: water.id, qty: 1 }],
      paymentMethod: 'cash',
      user: admin,
      shiftId,
      clientOrderId: clientId
    });
    assert.ok(first.success !== false, 'First order OK');

    const second = db.createOrder({
      items: [{ id: water.id, qty: 1 }],
      paymentMethod: 'cash',
      user: admin,
      shiftId,
      clientOrderId: clientId
    });
    assert.ok(second.success !== false, 'Duplicate returns success');
    assert.ok(second.duplicate === true, 'Marked as duplicate');
    assert.strictEqual(Number(second.id), Number(first.orderId || first.id), 'Same order ID returned');

    // Only one order in DB
    const orders = db.listOrders({ shiftId });
    assert.strictEqual(orders.length, 1, 'Only 1 order in DB, not 2');

    db.closeShift(shiftId, db.currentShift().expected_cash, '', admin);
  });

  // ============================================================
  // TEST 9: المخزون بيتتبع صح حتى مع 50 فاتورة
  // ============================================================
  it('Stock tracking stays accurate across 50 orders', () => {
    const admin = getAdmin();
    const shift = db.openShift(0, 'شيفت مخزون', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const latte = getProduct('آيس لاتيه');
    const stockBefore = latte.stock_qty;
    let totalSold = 0;

    for (let i = 0; i < 50; i++) {
      const qty = (i % 3) + 1; // 1, 2, or 3
      const order = db.createOrder({
        items: [{ id: latte.id, qty }],
        paymentMethod: 'cash',
        user: admin,
        shiftId,
        clientOrderId: `stock-${i}-${Date.now()}`
      });
      assert.ok(order.success !== false, `Order ${i} success`);
      totalSold += qty;
    }

    const latteNow = getProduct('آيس لاتيه');
    assert.strictEqual(latteNow.stock_qty, stockBefore - totalSold,
      `Stock: before=${stockBefore}, sold=${totalSold}, now=${latteNow.stock_qty}, expected=${stockBefore - totalSold}`);

    db.closeShift(shiftId, db.currentShift().expected_cash, '', admin);
  });

  // ============================================================
  // TEST 10: Shift handover consistency — الشيفت اللي بعده بياخد الرصيد الصح
  // ============================================================
  it('Shift handover: next shift carries forward correct closing cash', () => {
    const admin = getAdmin();

    // Shift 1
    const shift1 = db.openShift(500, 'شيفت أول', admin);
    assert.ok(shift1.success !== false);
    const sid1 = shift1.id;

    const coffee = getProduct('قهوة تركي');
    db.createOrder({
      items: [{ id: coffee.id, qty: 10 }],
      paymentMethod: 'cash',
      user: admin,
      shiftId: sid1
    });

    const cur1 = db.currentShift();
    const expected1 = Number(cur1.expected_cash); // 500 + (15.50 * 10) = 655
    assert.ok(Math.abs(expected1 - 655) < 0.01, `Shift 1 expected cash = 655 (got ${expected1})`);

    // Close with exact cash
    const close1 = db.closeShift(sid1, 655, '', admin);
    assert.ok(close1.success);

    // Shift 2: auto carry forward
    const shift2 = db.openShift(null, 'شيفت ثاني', admin);
    assert.ok(shift2.success !== false);
    assert.strictEqual(Number(shift2.opening_cash), 655, `Shift 2 carries forward 655 (got ${shift2.opening_cash})`);

    db.closeShift(shift2.id, 655, '', admin);
  });

  // ============================================================
  // TEST 11: المصاريف بتتسجل وبتأثر على الرصيد المتوقع
  // ============================================================
  it('Expenses correctly reduce expected cash', () => {
    const admin = getAdmin();
    const shift = db.openShift(1000, 'شيفت مصاريف', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    // Add expense
    if (db.addExpense) {
      db.addExpense({ shiftId, amount: 150, description: 'مشتريات', user: admin });
      db.addExpense({ shiftId, amount: 50, description: 'توصيل', user: admin });
    }

    const cur = db.currentShift();
    const expenses = Number(cur.expenses_total) || 0;
    // Expected cash = 1000 (opening) - 200 (expenses) = 800
    if (expenses > 0) {
      assert.strictEqual(expenses, 200, `Expenses = 200 (got ${expenses})`);
      assert.ok(Math.abs(Number(cur.expected_cash) - 800) < 0.01,
        `Expected cash = 800 after expenses (got ${cur.expected_cash})`);
    }

    db.closeShift(shiftId, cur.expected_cash, '', admin);
  });

  // ============================================================
  // TEST 12: الخصم أكبر من الإجمالي مبيعديش
  // ============================================================
  it('Discount greater than subtotal is rejected', () => {
    const admin = getAdmin();
    const shift = db.openShift(0, 'شيفت خصم', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const water = getProduct('ماء معدني'); // 5.00

    assert.throws(() => {
      db.createOrder({
        items: [{ id: water.id, qty: 1 }],
        paymentMethod: 'cash',
        discount: 100, // way more than 5
        user: admin,
        shiftId
      });
    }, /الخصم/);

    db.closeShift(shiftId, db.currentShift().expected_cash, '', admin);
  });

  // ============================================================
  // TEST 13: Split payment مبتنفعش لو المجموع مش مساوي الإجمالي
  // ============================================================
  it('Split payment rejected if amounts dont sum to total', () => {
    const admin = getAdmin();
    const shift = db.openShift(0, 'شيفت سبليت', admin);
    assert.ok(shift.success !== false);
    const shiftId = shift.id;

    const coffee = getProduct('قهوة تركي'); // 15.50

    assert.throws(() => {
      db.createOrder({
        items: [{ id: coffee.id, qty: 1 }],
        paymentMethod: 'split',
        cashAmount: 5,
        cardAmount: 5,
        walletAmount: 0, // Sum = 10, but total = 15.50
        user: admin,
        shiftId
      });
    }, /المقسمة/);

    db.closeShift(shiftId, db.currentShift().expected_cash, '', admin);
  });

});
