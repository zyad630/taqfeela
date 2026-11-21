/**
 * Acceptance Test for FIX-15 (ARCH-06 / A2): PRAGMA foreign_keys Resilience,
 * 1.0.1 Database Upgrade Migration, and Full Delete/Reset Operations Safety
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');
const db = require('../electron/db.js');

async function testRawSqlJsExportBehavior() {
  console.log('--- TEST 0: Raw sql.js PRAGMA foreign_keys Before & After db.export() ---');
  const SQL = await initSqlJs();
  const rawDb = new SQL.Database();
  rawDb.run('PRAGMA foreign_keys = ON;');
  const before = rawDb.exec('PRAGMA foreign_keys;')[0].values[0][0];
  rawDb.export();
  const after = rawDb.exec('PRAGMA foreign_keys;')[0].values[0][0];
  rawDb.close();
  console.log(`Raw sql.js PRAGMA foreign_keys: before export() = ${before}, after export() = ${after}`);
  assert.strictEqual(before, 1);
  assert.strictEqual(after, 0, 'Confirmed: raw sql.js resets PRAGMA foreign_keys to 0 after export()');
}

async function testLegacy101DatabaseUpgradeMigration() {
  console.log('--- TEST 1: Upgrade Migration from v1.0.1 DB with Orphaned FK Records ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-fix15-mig-'));
  const legacyDbPath = path.join(tmpDir, 'legacy-101.db');

  // Create a v1.0.1 database with foreign_keys = OFF that contains the exact orphan patterns
  // found in production client DBs (orders -> deleted table, order_items -> deleted product,
  // employee_adjustments -> deleted user, products -> deleted category)
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  raw.run('PRAGMA foreign_keys = OFF;');
  raw.run(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT DEFAULT '☕', sort_order INTEGER DEFAULT 0);
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL, cost REAL DEFAULT 0, category_id INTEGER, stock_qty INTEGER DEFAULT 0, low_stock_threshold INTEGER DEFAULT 10, barcode TEXT, is_deleted INTEGER DEFAULT 0, FOREIGN KEY(category_id) REFERENCES categories(id));
    CREATE TABLE tables (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER DEFAULT 4, status TEXT DEFAULT 'available', current_order_id INTEGER, hall TEXT DEFAULT 'أرضي');
    CREATE TABLE shifts (id INTEGER PRIMARY KEY AUTOINCREMENT, opened_at TEXT NOT NULL, closed_at TEXT, opening_cash REAL DEFAULT 0, closing_cash REAL, actual_cash REAL, cash_difference REAL DEFAULT 0);
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT, shift_id INTEGER, table_id INTEGER, order_type TEXT DEFAULT 'dine_in', created_at TEXT NOT NULL, subtotal REAL NOT NULL, total REAL NOT NULL, status TEXT DEFAULT 'completed', FOREIGN KEY(shift_id) REFERENCES shifts(id), FOREIGN KEY(table_id) REFERENCES tables(id));
    CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, product_name TEXT DEFAULT '', qty INTEGER NOT NULL, unit_price REAL NOT NULL, total_price REAL NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(product_id) REFERENCES products(id));
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'cashier', created_at TEXT NOT NULL);
    CREATE TABLE employee_adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, amount REAL DEFAULT 0, days_count REAL DEFAULT 0, date TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT UNIQUE, created_at TEXT NOT NULL);
    CREATE TABLE customer_debts (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, customer_id INTEGER, customer_name TEXT NOT NULL, total_amount REAL NOT NULL, paid_amount REAL DEFAULT 0, remaining_amount REAL NOT NULL, status TEXT DEFAULT 'unpaid', created_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id));
    CREATE TABLE debt_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, debt_id INTEGER NOT NULL, shift_id INTEGER, amount REAL NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(debt_id) REFERENCES customer_debts(id));
  `);

  // Insert valid shift and order, but referencing non-existent table_id=999, product_id=888, user_id=777, category_id=666
  const now = new Date().toISOString();
  raw.run(`INSERT INTO categories (id, name) VALUES (1, 'مشروبات')`);
  raw.run(`INSERT INTO products (id, name, price, category_id) VALUES (1, 'قهوة', 25, 666)`); // orphaned category_id=666
  raw.run(`INSERT INTO shifts (id, opened_at) VALUES (1, '${now}')`);
  raw.run(`INSERT INTO orders (id, invoice_no, shift_id, table_id, created_at, subtotal, total) VALUES (10, '10', 1, 999, '${now}', 50, 50)`); // orphaned table_id=999
  raw.run(`INSERT INTO order_items (id, order_id, product_id, product_name, qty, unit_price, total_price) VALUES (100, 10, 888, 'صنف قديم ممسوح', 2, 25, 50)`); // orphaned product_id=888
  raw.run(`INSERT INTO employee_adjustments (id, user_id, type, amount, date, reason, created_at) VALUES (50, 777, 'bonus', 100, '2026-10-01', 'مكافأة', '${now}')`); // orphaned user_id=777

  const preCheck = raw.exec('PRAGMA foreign_key_check;');
  console.log('Pre-upgrade FK violations in simulated 1.0.1 DB:', preCheck[0]?.values?.length || 0);
  assert.ok((preCheck[0]?.values?.length || 0) >= 4, 'Legacy DB must have >= 4 FK violations before upgrade');

  fs.writeFileSync(legacyDbPath, Buffer.from(raw.export()));
  raw.close();

  // Now initialize via db.init() which must heal all orphaned FKs and enable PRAGMA foreign_keys = ON
  await db.init(legacyDbPath);

  const fkStatus = db.queryAll('PRAGMA foreign_keys;')[0];
  assert.strictEqual(Number(Object.values(fkStatus)[0]), 1, 'PRAGMA foreign_keys must be 1 after init');

  const postCheck = db.queryAll('PRAGMA foreign_key_check;');
  console.log('Post-upgrade PRAGMA foreign_key_check violations:', postCheck.length);
  assert.strictEqual(postCheck.length, 0, `Expected 0 FK violations after 1.0.1 upgrade migration, got: ${JSON.stringify(postCheck)}`);

  // Verify historical order & item were preserved (not deleted!)
  const preservedOrder = db.getOrder(10);
  assert.ok(preservedOrder, 'Historical order #10 must be preserved after FK healing');
  assert.strictEqual(preservedOrder.total, 50, 'Historical order total must remain intact');
  assert.strictEqual(preservedOrder.items.length, 1, 'Historical order items must remain intact');
  console.log('✅ TEST 1 PASSED: 1.0.1 database upgraded with 0 FK violations and 100% financial data preservation.\n');

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

async function testAllDeletesAndResetsWithFkOn() {
  console.log('--- TEST 2: All Delete, Archive & Reset Operations with PRAGMA foreign_keys = ON ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-fix15-ops-'));
  const testDbPath = path.join(tmpDir, 'ops.db');

  await db.init(testDbPath);

  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');
  const cashier = db.saveUser({
    username: 'cashier_fk',
    name: 'كاشير للتجربة',
    password: 'CashierPass123',
    role: 'cashier'
  });

  // Employee adjustment for cashier
  db.addEmployeeAdjustment({
    userId: cashier.id,
    type: 'bonus',
    amount: 100,
    reason: 'مكافأة التزام'
  });

  // Open shift
  const shiftRes = db.openShift(200, 'وردية صباحية', admin);
  const shiftId = shiftRes.id;

  // Create category & product
  const cat = db.saveCategory({ name: 'قسم تجريبي للحذف', icon: '🍵', sort_order: 99 });
  const prod = db.saveProduct({
    name: 'مشروب تجريبي للحذف',
    price: 40,
    cost: 15,
    category_id: cat.id,
    stock_qty: 50
  });

  // Create section & table
  const sec = db.saveSection({ name: 'صالة تجريبية' });
  const tbl = db.saveTable({ number: 'T99', name: 'طاولة 99', capacity: 4, hall: 'صالة تجريبية' });
  const tbl2 = db.saveTable({ number: 'T98', name: 'طاولة 98', capacity: 4, hall: 'صالة تجريبية' });

  // Create dine-in order on tbl using prod
  const ord1 = db.createOrder({
    items: [{ id: prod.id, name: prod.name, qty: 2, price: prod.price }],
    paymentMethod: 'cash',
    orderType: 'dine_in',
    tableId: tbl.id,
    shiftId,
    user: cashier
  });
  assert.ok(ord1.success);

  // Create dine-in order on tbl2 as well (to test deleteSection / resetSectionTables)
  const ord1b = db.createOrder({
    items: [{ id: prod.id, name: prod.name, qty: 1, price: prod.price }],
    paymentMethod: 'cash',
    orderType: 'dine_in',
    tableId: tbl2.id,
    shiftId,
    user: cashier
  });
  assert.ok(ord1b.success);

  // Create another order and cancel it (creates order_refunds row)
  const ord2 = db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', qty: 1, price: 25 }],
    paymentMethod: 'cash',
    orderType: 'takeaway',
    shiftId,
    user: admin
  });
  db.cancelOrder(ord2.orderId, 'تراجع العميل', admin, 'cash', true);

  // Create notebook order + partial debt payment
  const ord3 = db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', qty: 2, price: 25 }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'عميل آجل تجريبي',
    customerPhone: '01099887766',
    amountPaid: 10,
    shiftId,
    user: admin
  });
  assert.ok(ord3.success);
  const debts = db.listDebts();
  assert.ok(debts.length > 0);
  const payRes = db.payDebt({ debtId: debts[0].id, amount: 15, shiftId, cashierName: admin.name, paymentMethod: 'cash' });
  assert.ok(payRes.success);

  // Add expense & shift adjustment
  const exp = db.addExpense({ amount: 30, category: 'نثريات', notes: 'مناديل', shiftId, userId: admin.id, userName: admin.name });
  assert.ok(exp.success);
  const adj = db.addShiftAdjustment({ shiftId, type: 'in', amount: 50, reason: 'فكة', actor: admin });
  assert.ok(adj.success);

  // 1. deleteProduct (soft-deletes product used in old orders)
  const delProd = db.deleteProduct(prod.id, admin);
  assert.strictEqual(delProd.success, true, 'deleteProduct must succeed');
  console.log('  ✓ 1. deleteProduct succeeded');

  // 2. deleteCategory (category whose only product is soft-deleted)
  const delCat = db.deleteCategory(cat.id);
  assert.strictEqual(delCat.success, true, 'deleteCategory must succeed when all its products are soft-deleted');
  console.log('  ✓ 2. deleteCategory succeeded');

  // 3. deleteTable (available table with historical completed order)
  const delTbl = db.deleteTable(tbl.id);
  assert.strictEqual(delTbl.success, true, 'deleteTable must succeed for available table with historical orders');
  // Verify historical order still has table_name snapshot!
  const checkOrd1 = db.getOrder(ord1.orderId);
  assert.strictEqual(checkOrd1.table_name, 'طاولة 99', 'Historical order must retain table_name snapshot after table deletion');
  console.log('  ✓ 3. deleteTable succeeded and preserved order table_name snapshot');

  // 4. resetSectionTables & deleteSection (section containing table with historical completed order)
  const resetSec = db.resetSectionTables({ sectionId: sec.id, sectionName: 'صالة تجريبية', tableCount: 2 });
  assert.ok(Array.isArray(resetSec), 'resetSectionTables must succeed');
  const delSec = db.deleteSection(sec.id);
  assert.strictEqual(delSec.success, true, 'deleteSection must succeed');
  console.log('  ✓ 4. resetSectionTables & deleteSection succeeded');

  // 5. deleteUser (user with employee_adjustments, shifts, orders)
  const delUser = db.deleteUser(cashier.id);
  assert.strictEqual(delUser.success, true, 'deleteUser must succeed even when user has adjustments/orders');
  console.log('  ✓ 5. deleteUser succeeded');

  // 6. deleteExpense
  const delExp = db.deleteExpense(exp.id, admin, 'AdminPass123!');
  assert.strictEqual(delExp.success, true, 'deleteExpense must succeed');
  console.log('  ✓ 6. deleteExpense succeeded');

  // 7. deleteDebt (with payments)
  const delDebt = db.deleteDebt({ debtId: debts[0].id, adminPassword: 'AdminPass123!', actor: admin });
  assert.strictEqual(delDebt.success, true, 'deleteDebt must succeed');
  console.log('  ✓ 7. deleteDebt succeeded');

  // Re-create a notebook debt + payment + cancelled order refund to test clearAllOrders & systemReset
  const ord4 = db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', qty: 2, price: 25 }],
    paymentMethod: 'notebook',
    orderType: 'notebook',
    customerName: 'عميل آجل 2',
    customerPhone: '01011223344',
    amountPaid: 5,
    shiftId,
    user: admin
  });
  const debts2 = db.listDebts();
  db.payDebt({ debtId: debts2[0].id, amount: 10, shiftId, cashierName: admin.name, paymentMethod: 'cash' });

  // 8. clearAllOrders (must delete child tables order_refunds & debt_payments before orders & customer_debts)
  const clearRes = db.clearAllOrders('AdminPass123!');
  assert.strictEqual(clearRes.success, true, 'clearAllOrders must succeed with FK=ON');
  console.log('  ✓ 8. clearAllOrders succeeded');

  // 9. systemReset (must delete shift_adjustments, expenses, refunds, debt_payments before shifts/orders/products/categories)
  const resetSys = db.systemReset({ keepMenu: false, adminPassword: 'AdminPass123!' });
  assert.strictEqual(resetSys.success, true, 'systemReset(keepMenu: false) must succeed with FK=ON');
  console.log('  ✓ 9. systemReset succeeded');

  // Final check: PRAGMA foreign_keys is still 1 and PRAGMA foreign_key_check is 0 violations
  const fkStatus = db.queryAll('PRAGMA foreign_keys;')[0];
  assert.strictEqual(Number(Object.values(fkStatus)[0]), 1, 'PRAGMA foreign_keys must still be 1');
  const fkCheck = db.queryAll('PRAGMA foreign_key_check;');
  assert.strictEqual(fkCheck.length, 0, 'Zero FK violations after all operations');

  console.log('✅ TEST 2 PASSED: All 9 delete/reset operations succeeded with PRAGMA foreign_keys = ON.\n');

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
}

async function run() {
  console.log('====================================================');
  console.log('       RUNNING ACCEPTANCE TEST FIX-15 (ARCH-06)     ');
  console.log('====================================================\n');
  await testRawSqlJsExportBehavior();
  await testLegacy101DatabaseUpgradeMigration();
  await testAllDeletesAndResetsWithFkOn();
  console.log('====================================================');
  console.log('       ALL ACCEPTANCE TESTS FOR FIX-15 PASSED!      ');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
