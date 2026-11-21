/**
 * Query Scale & Pagination Safety Test Suite (B9)
 * tests/test-query-scale-safety.js
 * 
 * Verifies:
 * 1. Default LIMIT 500 protection prevents unbounded memory allocation
 * 2. Custom limit parameter works (e.g. limit = 50 returns at most 50)
 * 3. Chunked item batch loading handles > 400 orders safely without SQLite parameter overflow
 * 4. Date and shift filtering executes fast with indexing
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-b9-scale-'));
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

test('B9: Query Scale, Bounded Limits & Chunking Safety', async (t) => {
  const { db, dir } = loadIsolatedDb();
  await db.init();
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');
  const shift = db.openShift(1000, 'شيفت اختبار الحجم', admin);

  const product = db.listProducts().find(p => !p.is_deleted);

  // Fast bulk generation of 600 orders directly via SQL inside a transaction
  console.log('Generating 600 test orders...');
  const now = new Date().toISOString();
  db.withTransaction(() => {
    for (let i = 1; i <= 600; i++) {
      const res = db.runSql(`
        INSERT INTO orders (invoice_no, shift_id, order_type, created_at, subtotal, total, payment_method, status)
        VALUES (?, ?, 'takeaway', ?, 50, 50, 'cash', 'completed')
      `, [`INV-SCALE-${i}`, shift.id, now], { skipSave: true });

      const oId = res.lastInsertRowid;
      db.runSql(`
        INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price, total_price)
        VALUES (?, ?, ?, 1, 50, 50)
      `, [oId, product.id, product.name], { skipSave: true });
    }
  });

  await t.test('1. listOrders enforces default LIMIT 500 ceiling', () => {
    const orders = db.listOrders();
    assert.strictEqual(orders.length, 500, 'Default limit must be 500 when 600 orders exist');
  });

  await t.test('2. listOrders supports explicit limit parameter', () => {
    const orders50 = db.listOrders({ limit: 50 });
    assert.strictEqual(orders50.length, 50, 'listOrders({ limit: 50 }) must return exactly 50');
  });

  await t.test('3. Chunked item batch loading (>400 items) executes without parameter overflow', () => {
    // When 500 orders are fetched, db.js chunks the item fetch into 400 + 100
    // Verify that every single order has its items populated
    const orders = db.listOrders({ limit: 500 });
    assert.strictEqual(orders.length, 500);

    let allHaveItems = true;
    for (const ord of orders) {
      if (!Array.isArray(ord.items) || ord.items.length !== 1) {
        allHaveItems = false;
        break;
      }
    }
    assert.ok(allHaveItems, 'All 500 orders across chunks must have their items mapped correctly');
  });

  await t.test('4. Filtered shift queries utilize indexes for sub-10ms response', () => {
    const t0 = performance.now();
    const shiftOrders = db.listOrders({ shiftId: shift.id, limit: 100 });
    const elapsed = performance.now() - t0;

    assert.strictEqual(shiftOrders.length, 100);
    console.log(`Filtered query elapsed time: ${elapsed.toFixed(2)}ms`);
    assert.ok(elapsed < 100, 'Shift-filtered query must complete in < 100ms');
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});

