const assert = require('assert');
const db = require('../electron/db');

(async () => {
  console.log('Testing Debts Isolation & FIFO Payment...');
  await db.init();

  // Ensure an active shift exists
  let shift = db.currentShift();
  if (!shift) {
    db.openShift({ openingCash: 100, userName: 'مدير النظام', userId: 1 });
    shift = db.currentShift();
  }

  const testId = Date.now();
  const name1 = 'عميل تجربة أ ' + testId;
  const name2 = 'عميل تجربة ب ' + testId;

  // Create order for Customer 1 on notebook
  const order1 = db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', price: 25, qty: 2 }],
    orderType: 'notebook',
    paymentMethod: 'notebook',
    customerName: name1,
    customerPhone: '0101111' + (testId % 10000),
    total: 50,
    amountPaid: 0,
    user: { id: 1, name: 'مدير النظام' }
  });

  // Create order for Customer 2 on notebook
  const order2 = db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', price: 25, qty: 3 }],
    orderType: 'notebook',
    paymentMethod: 'notebook',
    customerName: name2,
    customerPhone: '0102222' + (testId % 10000),
    total: 75,
    amountPaid: 0,
    user: { id: 1, name: 'مدير النظام' }
  });

  console.log(`Created orders: Customer 1 (${order1.total} LE) and Customer 2 (${order2.total} LE)`);

  const allDebts = db.listDebts();
  const debt1 = allDebts.find(d => d.order_id === order1.id);
  const debt2 = allDebts.find(d => d.order_id === order2.id);
  assert(debt1, 'Customer 1 debt should exist');
  assert(debt2, 'Customer 2 debt should exist');
  assert.strictEqual(debt1.remaining_amount, order1.total);
  assert.strictEqual(debt2.remaining_amount, order2.total);

  // Pay Customer 1 debt via FIFO
  const payRes = db.payCustomerDebtsFIFO({
    customerId: debt1.customer_id,
    customerName: debt1.customer_name,
    customerPhone: debt1.customer_phone,
    amount: order1.total,
    shiftId: shift.id,
    cashierName: 'كاشير التجربة'
  });
  assert.strictEqual(payRes.success, true, 'Payment for Customer 1 should succeed');

  // Verify Customer 1 debt is PAID
  const debtsAfter = db.listDebts();
  const debt1After = debtsAfter.find(d => d.order_id === order1.id);
  const debt2After = debtsAfter.find(d => d.order_id === order2.id);

  assert.strictEqual(debt1After.status, 'paid', 'Customer 1 debt should be paid');
  assert.strictEqual(debt1After.remaining_amount, 0);

  // CRITICAL CHECK: Verify Customer 2 debt is STILL UNPAID and UNTOUCHED
  assert.strictEqual(debt2After.status, 'unpaid', 'Customer 2 debt MUST remain unpaid');
  assert.strictEqual(debt2After.remaining_amount, order2.total, `Customer 2 debt must remain ${order2.total} LE`);

  console.log('✅ Verified Customer 1 was paid and Customer 2 debt remained strictly untouched!');
  console.log('🎉 Debts Isolation test passed with flying colors!');
})();
