/**
 * Table Carts Concurrency and Lifecycle Behavioral Test Suite (B6)
 * tests/test-table-concurrency.js
 * 
 * Verifies:
 * 1. Optimistic Concurrency Control (OCC) with _rev rejection of stale saves
 * 2. Full Table Transfer (T1 -> T2) with atomic merge and source table clearing
 * 3. Prevention of Zombie Table Resurrections on stale delayed auto-saves
 * 4. Partial Item Transfer (transferTableItem) between tables
 * 5. Atomic Waiter/QR Item Appends (appendItemsToTableCart)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-b6-table-'));
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

test('B6: Table Carts Concurrency, Transfer, and Race Protection', async (t) => {
  const { db, dir } = loadIsolatedDb();
  await db.init();
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');
  db.openShift(500, 'شيفت فحص الطاولات والسباق', admin);

  const tables = db.listTables();
  assert.ok(tables.length >= 3, 'Must have at least 3 tables');
  const t1 = tables[0];
  const t2 = tables[1];
  const t3 = tables[2];

  // -------------------------------------------------------------
  // Test 1: OCC _rev tracking and stale save rejection
  // -------------------------------------------------------------
  await t.test('1. Optimistic Concurrency Control (OCC) rejects stale save', () => {
    // Initial save -> rev = 1
    const s1 = db.saveTableCart(t1.id, {
      cart: [{ id: 1, name: 'قهوة تركي', price: 25, qty: 1, sent_qty: 1 }],
      customerName: 'أحمد'
    });
    assert.strictEqual(s1.success, true);
    assert.strictEqual(s1.rev, 1);

    // Concurrent save with correct rev (1) -> updates to rev = 2
    const s2 = db.saveTableCart(t1.id, {
      cart: [
        { id: 1, name: 'قهوة تركي', price: 25, qty: 1, sent_qty: 1 },
        { id: 2, name: 'مياه معدنية', price: 10, qty: 2, sent_qty: 0 }
      ],
      _rev: 1,
      customerName: 'أحمد'
    });
    assert.strictEqual(s2.success, true);
    assert.strictEqual(s2.rev, 2);

    // Stale concurrent client tries to save with outdated _rev: 1 -> MUST FAIL
    const sStale = db.saveTableCart(t1.id, {
      cart: [{ id: 1, name: 'قهوة تركي', price: 25, qty: 5, sent_qty: 1 }],
      _rev: 1,
      customerName: 'أحمد المتأخر'
    });
    assert.strictEqual(sStale.success, false, 'Stale rev must be rejected');
    assert.strictEqual(sStale.conflict, true, 'Conflict flag must be true');

    // Verify DB still holds rev 2 data
    const carts = db.getTableCarts();
    assert.strictEqual(carts[t1.id]._rev, 2);
    assert.strictEqual(carts[t1.id].cart.length, 2);
  });

  // -------------------------------------------------------------
  // Test 2: Table transfer (T1 -> T2) and anti-zombie resurrection
  // -------------------------------------------------------------
  await t.test('2. Table Transfer and Zombie Table Immunity', () => {
    // Transfer T1 -> T2
    const xfer = db.transferTable({ fromTableId: t1.id, toTableId: t2.id });
    assert.strictEqual(xfer.success, true);

    const cartsAfter = db.getTableCarts();
    assert.strictEqual(cartsAfter[t1.id], undefined, 'T1 cart must be deleted after transfer');
    assert.ok(cartsAfter[t2.id], 'T2 cart must exist after transfer');
    assert.strictEqual(cartsAfter[t2.id].cart.length, 2);

    // Verify table statuses
    const freshTables = db.listTables();
    assert.strictEqual(freshTables.find(t => t.id === t1.id).status, 'available');
    assert.strictEqual(freshTables.find(t => t.id === t2.id).status, 'occupied');

    // Attempt zombie resurrection: delayed network packet arrives with stale rev for T1
    const zombieAttempt = db.saveTableCart(t1.id, {
      cart: [{ id: 1, name: 'قهوة تركي', price: 25, qty: 1, sent_qty: 1 }],
      _rev: 2
    });
    assert.strictEqual(zombieAttempt.success, false, 'Zombie resurrection attempt must be blocked');
    assert.strictEqual(zombieAttempt.conflict, true);

    const checkCarts = db.getTableCarts();
    assert.strictEqual(checkCarts[t1.id], undefined, 'T1 must NOT be resurrected');
  });

  // -------------------------------------------------------------
  // Test 3: Partial Item Transfer (transferTableItem)
  // -------------------------------------------------------------
  await t.test('3. Partial item transfer between tables', () => {
    // T2 has: item 1 (qty 1), item 2 (qty 2)
    // Transfer 1 qty of item 2 from T2 to T3
    const itemTransfer = db.transferTableItem({
      fromTableId: t2.id,
      toTableId: t3.id,
      itemId: 2,
      qty: 1
    });
    assert.strictEqual(itemTransfer.success, true);

    const carts = db.getTableCarts();
    assert.ok(carts[t2.id]);
    assert.ok(carts[t3.id]);

    // T2 should now have item 2 with qty 1
    const t2Item2 = carts[t2.id].cart.find(it => it.id === 2);
    assert.strictEqual(t2Item2.qty, 1, 'T2 must retain remaining 1 qty of item 2');

    // T3 should now have item 2 with qty 1
    const t3Item2 = carts[t3.id].cart.find(it => it.id === 2);
    assert.strictEqual(t3Item2.qty, 1, 'T3 must receive 1 qty of item 2');

    // Table 3 status should now be occupied
    const freshTables = db.listTables();
    assert.strictEqual(freshTables.find(t => t.id === t3.id).status, 'occupied');
  });

  // -------------------------------------------------------------
  // Test 4: Atomic Waiter/QR Item Appends
  // -------------------------------------------------------------
  await t.test('4. Atomic append items to table cart', () => {
    // Waiter sends new order items for T3
    const appendRes = db.appendItemsToTableCart(t3.id, [
      { id: 3, name: 'شاي أخضر بالنعناع', price: 20, qty: 2 }
    ], { customerName: 'عميل الصالة 3' });

    assert.strictEqual(appendRes.success, true);
    assert.ok(appendRes.rev > 0);

    const carts = db.getTableCarts();
    assert.strictEqual(carts[t3.id].cart.length, 2, 'T3 must now have 2 different items');
    assert.strictEqual(carts[t3.id].customerName, 'عميل الصالة 3');
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});

