const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-transfer-test-'));
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

test('Comprehensive Table Transfer & Anti-Duplication Flow', async (t) => {
  const { db, dir } = loadDb();
  await db.init();

  let tables = db.listTables();
  assert.ok(tables.length >= 2, 'Must have at least 2 tables');
  const t1 = tables[0];
  const t2 = tables[1];

  // 1. Initial State: Tables are empty
  assert.equal(t1.status, 'available');
  assert.equal(t2.status, 'available');
  assert.equal(db.getTableCarts()[t1.id], undefined);
  assert.equal(db.getTableCarts()[t2.id], undefined);

  // 2. Place order on Table 1
  const t1Cart = {
    cart: [
      { id: 1, name: 'قهوة اسبريسو', price: 35, qty: 2, sent_qty: 2 },
      { id: 2, name: 'شاي كرك', price: 20, qty: 1, sent_qty: 1 }
    ],
    customerName: 'عميل الصالة',
    discountAmount: 5,
    orderNotes: 'بدون سكر'
  };
  db.saveTableCart(t1.id, t1Cart);

  // Verify Table 1 in DB
  let carts = db.getTableCarts();
  assert.ok(carts[t1.id], 'Table 1 cart must exist in DB');
  assert.equal(carts[t1.id].cart.length, 2);
  assert.equal(carts[t1.id].customerName, 'عميل الصالة');
  let updatedTables = db.listTables();
  assert.equal(updatedTables.find(t => t.id === t1.id).status, 'occupied');
  assert.equal(updatedTables.find(t => t.id === t2.id).status, 'available');

  // 3. TRANSFER Table 1 -> Table 2
  const transferRes = db.transferTable({ fromTableId: t1.id, toTableId: t2.id });
  assert.equal(transferRes.success, true, 'Transfer must succeed');

  // 4. VERIFY DB STATE IMMEDIATELY AFTER TRANSFER
  carts = db.getTableCarts();
  assert.equal(carts[t1.id], undefined, 'CRITICAL: Table 1 cart MUST BE COMPLETELY DELETED from DB');
  assert.ok(carts[t2.id], 'Table 2 cart MUST exist in DB');
  assert.equal(carts[t2.id].cart.length, 2, 'Table 2 must have both items');
  assert.equal(carts[t2.id].customerName, 'عميل الصالة');

  updatedTables = db.listTables();
  assert.equal(updatedTables.find(t => t.id === t1.id).status, 'available', 'Table 1 status MUST BE available');
  assert.equal(updatedTables.find(t => t.id === t2.id).status, 'occupied', 'Table 2 status MUST BE occupied');

  // 5. SIMULATE POLLING LOGIC WITH NEW REPAIRED ALGORITHM
  let clientMap = {
    [t2.id]: carts[t2.id]
  };
  let missCount = {};

  // If clientMap erroneously had t1 leftover:
  clientMap[t1.id] = { cart: [{ id: 1, name: 'ghost' }] };

  // Poller poll 1:
  const dbCarts = db.getTableCarts();
  for (const tid of Object.keys(clientMap)) {
    if (!dbCarts[tid]) {
      missCount[tid] = (missCount[tid] || 0) + 1;
      if (missCount[tid] >= 2) {
        delete clientMap[tid];
      }
    }
  }
  // Poller poll 2:
  for (const tid of Object.keys(clientMap)) {
    if (!dbCarts[tid]) {
      missCount[tid] = (missCount[tid] || 0) + 1;
      if (missCount[tid] >= 2) {
        delete clientMap[tid];
      }
    }
  }
  assert.equal(clientMap[t1.id], undefined, 'Poller must cleanly purge Table 1 from clientMap after 2 misses');
  assert.ok(clientMap[t2.id], 'Poller must keep Table 2');

  // 6. SIMULATE REFRESHDATA WITH DB AS SOURCE OF TRUTH
  const refreshResult = { ...db.getTableCarts() };
  assert.equal(refreshResult[t1.id], undefined, 'refreshData MUST NOT have Table 1');
  assert.ok(refreshResult[t2.id], 'refreshData MUST have Table 2');

  // 7. TRANSFER SINGLE ITEM TEST (Table 2 -> Table 1)
  const itemToMove = refreshResult[t2.id].cart[0];
  const itemTransferRes = db.transferTableItem({
    fromTableId: t2.id,
    toTableId: t1.id,
    itemId: itemToMove.id,
    qty: 1
  });
  assert.equal(itemTransferRes.success, true);

  // Verify both tables have items now
  carts = db.getTableCarts();
  assert.ok(carts[t1.id], 'Table 1 now has 1 moved item');
  assert.ok(carts[t2.id], 'Table 2 still has remaining items');
  assert.equal(carts[t1.id].cart[0].qty, 1);
  assert.equal(carts[t2.id].cart.find(it => it.id === itemToMove.id).qty, 1);

  // 8. MOVE ALL REMAINING ITEMS FROM TABLE 1 -> TABLE 2
  const moveBack = db.transferTable({ fromTableId: t1.id, toTableId: t2.id });
  assert.equal(moveBack.success, true);

  carts = db.getTableCarts();
  assert.equal(carts[t1.id], undefined, 'Table 1 MUST BE empty again after move back');
  assert.ok(carts[t2.id], 'Table 2 has all items again');

  // Clean up
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
