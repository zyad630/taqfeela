const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

describe('📊 Reports User Filter & Expenses Management Verification', () => {
  const testDbPath = path.join(__dirname, 'test-reports-expenses.db');
  let db;

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../electron/db');
    await db.init(testDbPath);
  });

  after(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('1. Expense creation, modification (category & amount) and deletion', () => {
    // Open a shift first
    const shift = db.openShift(500, 'Morning shift', { id: 1, username: 'admin', name: 'المدير' }, 'الشيفت الصباحي');
    assert(shift.success);

    // Add an expense
    const exp = db.addExpense({
      amount: 150,
      category: 'مشتريات خامات (بن/حليب/سكر/مستلزمات)',
      notes: 'شراء بن اسبريسو',
      shiftId: shift.id,
      userId: 1,
      userName: 'المدير'
    });
    assert(exp.success);
    assert.strictEqual(exp.amount, 150);
    assert.strictEqual(exp.category, 'مشتريات خامات (بن/حليب/سكر/مستلزمات)');

    // Verify shift expenses_total is updated
    let curShift = db.currentShift();
    assert.strictEqual(curShift.expenses_total, 150);

    // Update the expense: change category and amount
    const updated = db.updateExpense({
      id: exp.id,
      amount: 200,
      category: 'شراء حليب وألبان',
      notes: 'شراء 5 كرتونة حليب جهينة'
    });
    assert(updated.success);
    assert.strictEqual(updated.amount, 200);
    assert.strictEqual(updated.category, 'شراء حليب وألبان');
    assert.strictEqual(updated.notes, 'شراء 5 كرتونة حليب جهينة');

    // Verify shift expenses_total reflects the change
    curShift = db.currentShift();
    assert.strictEqual(curShift.expenses_total, 200);

    // Delete the expense
    const delRes = db.deleteExpense(exp.id, { role: 'admin' });
    assert(delRes.success);

    // Verify shift expenses_total is back to 0
    curShift = db.currentShift();
    assert.strictEqual(curShift.expenses_total, 0);
  });

  test('2. Sales report with User filter, userBreakdown, and ordersList', () => {
    // Create orders by two different users
    const user1 = { id: 15, name: 'أحمد', username: 'ahmed' };
    const user2 = { id: 16, name: 'زياد', username: 'zyad' };

    const products = db.listProducts();
    const prod1 = products[0];

    db.createOrder({
      items: [{ id: prod1.id, name: prod1.name, price: prod1.price, qty: 2 }],
      paymentMethod: 'cash',
      user: user1
    });

    db.createOrder({
      items: [{ id: prod1.id, name: prod1.name, price: prod1.price, qty: 3 }],
      paymentMethod: 'card',
      user: user2
    });

    // Query sales report for all users
    const allReport = db.getReportSales();
    assert(allReport.summary.order_count >= 2);
    assert(Array.isArray(allReport.userBreakdown));
    assert(allReport.userBreakdown.length >= 2);
    assert(Array.isArray(allReport.ordersList));

    // Verify users appear in breakdown
    const names = allReport.userBreakdown.map(u => u.user_name);
    assert(names.includes('أحمد') || names.some(n => n.includes('أحمد')));
    assert(names.includes('زياد') || names.some(n => n.includes('زياد')));

    // Filter by user 16 (زياد)
    const zyadReport = db.getReportSales({ userId: 16 });
    assert.strictEqual(zyadReport.summary.order_count, 1);
    assert.strictEqual(zyadReport.summary.card_sales, prod1.price * 3);
    assert.strictEqual(zyadReport.ordersList.length, 1);
    assert(zyadReport.ordersList[0].cashier_name.includes('زياد'));

    // Test dashboard stats include todayUserBreakdown
    const stats = db.getDashboardStats();
    assert(Array.isArray(stats.todayUserBreakdown));
    assert(stats.todayUserBreakdown.length >= 2);
  });
});
