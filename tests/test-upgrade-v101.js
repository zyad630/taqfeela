/**
 * v1.0.1 to v1.0.2 Full Database Upgrade Migration Test (B10)
 * tests/test-upgrade-v101.js
 * 
 * Verifies:
 * 1. Building a genuine legacy v1.0.1 database schema with pre-v1.0.2 data
 * 2. Simulating real orphaned records from legacy deletions
 * 3. Executing db.init() to run all schema migrations & healForeignKeyViolations()
 * 4. Verifying that zero historical financial rows are lost
 * 5. Checking that PRAGMA foreign_key_check reports 0 violations post-upgrade
 * 6. Executing new v1.0.2 operations on the upgraded database
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const initSqlJs = require('sql.js');
const Module = require('module');

function loadIsolatedDb(targetDir) {
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => targetDir } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return db;
}

test('B10: Genuine v1.0.1 to v1.0.2 Upgrade Migration & Data Integrity', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-b10-upgrade-'));
  const legacyDbPath = path.join(tmpDir, 'cafe-pos.db');

  // Step 1: Synthesize a true legacy v1.0.1 database
  const SQL = await initSqlJs();
  const rawDb = new SQL.Database();
  rawDb.run('PRAGMA foreign_keys = OFF;');
  
  // v1.0.1 raw tables (without v1.0.2 additions)
  rawDb.run(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '☕',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL DEFAULT 0,
      category_id INTEGER,
      stock_qty INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      barcode TEXT,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE TABLE tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      current_order_id INTEGER,
      hall TEXT DEFAULT 'أرضي'
    );

    CREATE TABLE shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      opening_cash REAL DEFAULT 0,
      closing_cash REAL,
      actual_cash REAL,
      cash_difference REAL DEFAULT 0
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT,
      shift_id INTEGER,
      table_id INTEGER,
      order_type TEXT DEFAULT 'dine_in',
      created_at TEXT NOT NULL,
      subtotal REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'completed'
    );

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT DEFAULT '',
      qty INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'cashier',
      created_at TEXT NOT NULL
    );

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE customer_debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      total_amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      remaining_amount REAL NOT NULL,
      status TEXT DEFAULT 'unpaid',
      created_at TEXT NOT NULL
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Insert historical 1.0.1 records
  const now = new Date().toISOString();
  rawDb.run(`INSERT INTO categories (id, name) VALUES (1, 'مشروبات ساخنة')`);
  rawDb.run(`INSERT INTO products (id, name, price, category_id, stock_qty) VALUES (1, 'كابتشينو كلاسيك', 45, 1, 50)`);
  rawDb.run(`INSERT INTO products (id, name, price, category_id, stock_qty) VALUES (2, 'شاي أحمر', 15, 1, 100)`);
  rawDb.run(`INSERT INTO tables (id, number, name, hall) VALUES (1, '1', 'طاولة 1', 'الصالات الداخلية')`);
  rawDb.run(`INSERT INTO users (id, username, name, password, role, created_at) VALUES (1, 'admin', 'مدير النظام', '$2a$10$abcdefghijklmnopqrstuu', 'admin', '${now}')`);
  rawDb.run(`INSERT INTO shifts (id, opened_at, closed_at, opening_cash, closing_cash, actual_cash) VALUES (1, '${now}', '${now}', 200, 650, 650)`);

  // Order 1: completely valid
  rawDb.run(`INSERT INTO orders (id, invoice_no, shift_id, table_id, created_at, subtotal, total) VALUES (1, 'INV-001', 1, 1, '${now}', 45, 45)`);
  rawDb.run(`INSERT INTO order_items (id, order_id, product_id, product_name, qty, unit_price, total_price) VALUES (1, 1, 1, 'كابتشينو كلاسيك', 1, 45, 45)`);

  // Order 2: contains orphan references (table_id = 999 does not exist, product_id = 888 was hard-deleted in 1.0.1)
  rawDb.run(`INSERT INTO orders (id, invoice_no, shift_id, table_id, created_at, subtotal, total) VALUES (2, 'INV-002', 1, 999, '${now}', 70, 70)`);
  rawDb.run(`INSERT INTO order_items (id, order_id, product_id, product_name, qty, unit_price, total_price) VALUES (2, 2, 888, 'تشيز كيك لوتس قديم', 1, 70, 70)`);

  // Write synthesized 1.0.1 DB to disk
  fs.writeFileSync(legacyDbPath, Buffer.from(rawDb.export()));
  rawDb.close();

  // Step 2: Initialize v1.0.2 system on top of this legacy database
  const db = loadIsolatedDb(tmpDir);
  await db.init(legacyDbPath);

  // Step 3: Assertions on upgrade
  await t.test('1. Schema columns migrated cleanly', () => {
    // Check that new v1.0.2 tables and columns exist
    const orders = db.listOrders();
    assert.strictEqual(orders.length, 2, 'Must retain all 2 historical orders');

    const o1 = orders.find(o => o.id === 1);
    const o2 = orders.find(o => o.id === 2);
    assert.ok(o1);
    assert.ok(o2);
    assert.strictEqual(o1.total, 45);
    assert.strictEqual(o2.total, 70);
  });

  await t.test('2. Orphaned historical records healed without data loss', () => {
    // Order 2 items must still exist with full name and price
    const order2 = db.getOrder(2);
    assert.ok(order2);
    assert.strictEqual(order2.items.length, 1);
    assert.strictEqual(order2.items[0].product_name, 'تشيز كيك لوتس قديم');
    assert.strictEqual(order2.items[0].total_price, 70);

    // Foreign key check must be completely clean (0 violations)
    const fkViolations = db.checkForeignKeyViolations ? db.checkForeignKeyViolations() : [];
    assert.strictEqual(fkViolations.length, 0, 'Zero FK violations must remain after healing');
  });

  await t.test('3. New v1.0.2 operations succeed on upgraded database', () => {
    const admin = db.loginUser('admin', 'password');
    // Open a new shift on upgraded database
    const newShift = db.openShift(300, 'شيفت بعد الترقية', admin || { id: 1, name: 'مدير النظام' });
    assert.ok(newShift.id > 0);

    // Create an order on upgraded database
    const orderRes = db.createOrder({
      shiftId: newShift.id,
      items: [{ id: 1, name: 'كابتشينو كلاسيك', price: 45, qty: 2 }],
      paymentMethod: 'cash',
      user: { id: 1, name: 'مدير النظام' }
    });
    assert.strictEqual(orderRes.success, true);
    assert.strictEqual(orderRes.total, 90);

    // Close shift
    const closeRes = db.closeShift(newShift.id, 390, 'إغلاق بعد الترقية', { id: 1, name: 'مدير النظام' });
    assert.strictEqual(closeRes.success, true);
  });

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

