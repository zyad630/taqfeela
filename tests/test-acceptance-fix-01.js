const assert = require('assert');

// Logic extracted directly from OrdersTab.jsx after FIX-01
const splitAmount = (o, field, method) => {
  const v = o[field];
  if (v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return o.payment_method === method ? Number(o.total || 0) : 0;
};

// 3 test orders per FIX_PLAN:
// (أ) كاش 100
// (ب) مقسم 50 كاش + 50 محفظة
// (ج) نوتة 200 بمقدم كاش 30
const orders = [
  {
    id: 1,
    total: 100,
    payment_method: 'cash',
    cash_amount: 100,
    card_amount: 0,
    wallet_amount: 0,
    order_type: 'takeaway',
    status: 'completed'
  },
  {
    id: 2,
    total: 100,
    payment_method: 'split',
    cash_amount: 50,
    card_amount: 0,
    wallet_amount: 50,
    order_type: 'takeaway',
    status: 'completed'
  },
  {
    id: 3,
    total: 200,
    payment_method: 'notebook',
    order_type: 'notebook',
    amount_paid: 30,
    cash_amount: 30,
    card_amount: 0,
    wallet_amount: 0,
    status: 'completed'
  }
];

const validOrders = orders.filter((o) => o.status !== 'cancelled');
const totalSales = validOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

const cashSales = validOrders.reduce((s, o) => s + splitAmount(o, 'cash_amount', 'cash'), 0);
const walletSales = validOrders.reduce((s, o) => s + splitAmount(o, 'wallet_amount', 'wallet'), 0);
const cardSales = validOrders.reduce((s, o) => s + splitAmount(o, 'card_amount', 'card'), 0);

const notebookOrders = validOrders.filter((o) => o.order_type === 'notebook' || o.payment_method === 'notebook');
const notebookTotal = notebookOrders.reduce((s, o) => {
  const tot = Number(o.total || 0);
  const paidCash = (o.cash_amount !== null && o.cash_amount !== undefined && o.cash_amount !== '' && !Number.isNaN(Number(o.cash_amount)))
    ? Number(o.cash_amount)
    : (Number(o.amount_paid) || 0);
  return s + Math.max(0, tot - paidCash);
}, 0);

console.log('--- Acceptance Test Results (FIX-01) ---');
console.log('كاش (cashSales):', cashSales, '(Expected: 180)');
console.log('محفظة (walletSales):', walletSales, '(Expected: 50)');
console.log('فيزا (cardSales):', cardSales, '(Expected: 0)');
console.log('آجل (notebookTotal):', notebookTotal, '(Expected: 170)');
console.log('إجمالي المبيعات (totalSales):', totalSales, '(Expected: 400)');
console.log('مجموع الخانات (كاش + محفظة + فيزا + آجل):', cashSales + walletSales + cardSales + notebookTotal, '(Expected: 400)');

assert.strictEqual(cashSales, 180, 'cashSales must be 180');
assert.strictEqual(walletSales, 50, 'walletSales must be 50');
assert.strictEqual(cardSales, 0, 'cardSales must be 0');
assert.strictEqual(notebookTotal, 170, 'notebookTotal must be 170');
assert.strictEqual(totalSales, 400, 'totalSales must be 400');
assert.strictEqual(cashSales + walletSales + cardSales + notebookTotal, totalSales, 'Sum of all categories must exactly match total sales');

console.log('TEST PASSED: 100% Match with acceptance criteria!');
