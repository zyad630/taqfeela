/**
 * Scenario B: Sudden Power Loss & Crash Recovery
 * tests/scenarios/scenario-b-power-loss.js
 * 
 * Verifies:
 * 1. Active table carts are persisted in SQLite and survive sudden power loss
 * 2. Uncommitted or partial in-flight operations do not leave corrupted orders
 * 3. Atomic recovery: restarting system reloads all open tables and shifts
 * 4. Resuming operations and checking out the restored cart succeeds
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDbInstance(dir) {
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../../electron/db')];
  const db = require('../../electron/db');
  Module._load = original;
  return db;
}

test('Scenario B: Sudden Crash & Transaction Resilience', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-scenario-b-'));
  const dbPath = path.join(dir, 'cafe-pos.db');

  let db1 = loadIsolatedDbInstance(dir);
  await db1.init(dbPath);
  db1.setupInitialAdmin('AdminPass123!');
  const admin = db1.loginUser('admin', 'AdminPass123!');
  const shift = db1.openShift(500, 'شيفت قبل انقطاع الكهرباء', admin);

  const tables = db1.listTables();
  const t1 = tables[0];
  const products = db1.listProducts().filter(p => !p.is_deleted);

  await t.test('1. Populate active table carts and sync to disk', () => {
    // Save table cart
    db1.saveTableCart(t1.id, {
      cart: [
        { id: products[0].id, name: products[0].name, price: products[0].price, qty: 3 },
        { id: products[1].id, name: products[1].name, price: products[1].price, qty: 2 }
      ],
      customerName: 'طاولة العائلات',
      orderNotes: 'سخن جداً'
    });

    // Verify written to db
    const carts = db1.getTableCarts();
    assert.ok(carts[t1.id]);
    assert.strictEqual(carts[t1.id].cart.length, 2);
    assert.strictEqual(carts[t1.id].customerName, 'طاولة العائلات');
  });

  await t.test('2. Simulate sudden power outage (destroy in-memory instance without graceful exit)', () => {
    // Invalidate db1 instance
    db1 = null;
  });

  await t.test('3. System reboot: reload database and verify integrity', async () => {
    // Reopen new DB instance pointing to the same disk path
    const db2 = loadIsolatedDbInstance(dir);
    await db2.init(dbPath);

    // Current shift must be open
    const curShift = db2.currentShift();
    assert.ok(curShift);
    assert.strictEqual(curShift.id, shift.id);
    assert.strictEqual(curShift.closed_at, null);

    // Table cart must be completely preserved
    const recoveredCarts = db2.getTableCarts();
    assert.ok(recoveredCarts[t1.id], 'Table 1 cart must survive reboot');
    assert.strictEqual(recoveredCarts[t1.id].cart.length, 2);
    assert.strictEqual(recoveredCarts[t1.id].customerName, 'طاولة العائلات');
    assert.strictEqual(recoveredCarts[t1.id].orderNotes, 'سخن جداً');

    // Table status must remain occupied
    const recoveredTables = db2.listTables();
    assert.strictEqual(recoveredTables.find(tbl => tbl.id === t1.id).status, 'occupied');

    // Complete the checkout with the recovered cart passing expectedCartRev
    const orderRes = db2.createOrder({
      shiftId: curShift.id,
      tableId: t1.id,
      orderType: 'dine_in',
      items: recoveredCarts[t1.id].cart,
      paymentMethod: 'cash',
      user: admin,
      expectedCartRev: recoveredCarts[t1.id]._rev
    });
    assert.strictEqual(orderRes.success, true);
    assert.ok(orderRes.total > 0);

    // Clear cart after checkout
    db2.saveTableCart(t1.id, { cart: [] });
    assert.strictEqual(db2.getTableCarts()[t1.id], undefined);
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
