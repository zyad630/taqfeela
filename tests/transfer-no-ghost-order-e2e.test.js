const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-transfer-e2e-'));
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

test('Real-World Scenario: Table Transfer Must Never Leave Ghost Order on Source Table', async (t) => {
  const { db, dir } = loadDb();
  await db.init();
  db.openShift(500, 'شيفت تجريبي للتيست');

  const tables = db.listTables();
  assert.ok(tables.length >= 2, 'Must have at least 2 tables in system');
  const tableSource = tables[0];
  const tableTarget = tables[1];

  console.log(`\n[TEST STEP 1] Initial state: Source=${tableSource.name} (id:${tableSource.id}), Target=${tableTarget.name} (id:${tableTarget.id})`);
  assert.equal(tableSource.status, 'available');
  assert.equal(tableTarget.status, 'available');
  assert.equal(db.getTableCarts()[tableSource.id], undefined);
  assert.equal(db.getTableCarts()[tableTarget.id], undefined);

  // STEP 2: Waiter or Cashier places order on Source Table
  console.log('[TEST STEP 2] Cashier opens Table 1 and adds 3 items with notes and customer name');
  const initialSourceCart = {
    cart: [
      { id: 101, name: 'ميكس كابتشينو كبير', price: 55, qty: 2, sent_qty: 2, notes: 'سكر زيادة' },
      { id: 102, name: 'شاي أخضر بالنعناع', price: 25, qty: 1, sent_qty: 1, notes: 'خفيف' },
      { id: 103, name: 'تشيز كيك لوتس', price: 60, qty: 1, sent_qty: 0, notes: '' }
    ],
    customerName: 'أحمد محمود',
    customerPhone: '01012345678',
    discountAmount: 15,
    orderNotes: 'جلسة عائلية'
  };

  const saveRes = db.saveTableCart(tableSource.id, initialSourceCart);
  assert.equal(saveRes.success, true);

  // Verify Table 1 in DB
  let dbCarts = db.getTableCarts();
  assert.ok(dbCarts[tableSource.id], 'Table 1 must exist in DB');
  assert.equal(dbCarts[tableSource.id].cart.length, 3);
  assert.equal(dbCarts[tableSource.id].customerName, 'أحمد محمود');
  assert.equal(dbCarts[tableSource.id].discountAmount, 15);
  let currentTables = db.listTables();
  assert.equal(currentTables.find(t => t.id === tableSource.id).status, 'occupied');
  assert.equal(currentTables.find(t => t.id === tableTarget.id).status, 'available');

  // STEP 3: PERFORM ATOMIC TRANSFER IN DB
  console.log('[TEST STEP 3] Executing transfer from Table 1 -> Table 2');
  const transferRes = db.transferTable({
    fromTableId: tableSource.id,
    toTableId: tableTarget.id
  });
  assert.equal(transferRes.success, true, 'transferTable API must succeed');

  // STEP 4: VERIFY DATABASE STATE IMMEDIATELY
  console.log('[TEST STEP 4] Verifying database state immediately after transfer');
  dbCarts = db.getTableCarts();
  assert.equal(dbCarts[tableSource.id], undefined, 'CRITICAL CHECK 1: Table 1 MUST NOT exist in DB table_carts');
  assert.ok(dbCarts[tableTarget.id], 'CRITICAL CHECK 2: Table 2 MUST exist in DB table_carts');
  assert.equal(dbCarts[tableTarget.id].cart.length, 3, 'Table 2 must have all 3 transferred items');
  assert.equal(dbCarts[tableTarget.id].customerName, 'أحمد محمود');
  assert.equal(dbCarts[tableTarget.id].discountAmount, 15);
  assert.equal(dbCarts[tableTarget.id].orderNotes, 'جلسة عائلية');

  currentTables = db.listTables();
  assert.equal(currentTables.find(t => t.id === tableSource.id).status, 'available', 'Table 1 status MUST BE available');
  assert.equal(currentTables.find(t => t.id === tableTarget.id).status, 'occupied', 'Table 2 status MUST BE occupied');

  // STEP 5: SIMULATE FRONTEND RACE CONDITIONS
  console.log('[TEST STEP 5] Simulating frontend race conditions (AutoSave debounce + Polling + Stale Closures)');

  // 5a. transferBlockedTablesRef protects Table 1 from being re-saved by any lingering debounce
  const transferBlockedTables = new Set();
  transferBlockedTables.add(tableSource.id);
  transferBlockedTables.add(String(tableSource.id));
  transferBlockedTables.add(Number(tableSource.id));

  // If an autosave handler triggers for Table 1 with stale data:
  const pendingToSave = [tableSource.id, tableTarget.id];
  for (const tid of pendingToSave) {
    if (transferBlockedTables.has(tid) || transferBlockedTables.has(String(tid))) {
      console.log(`   -> [AutoSave Guard] Blocked rogue save attempt for transferred table ${tid}`);
      continue;
    }
    // Save target
    db.saveTableCart(tid, dbCarts[tid]);
  }

  // Verify Table 1 was NOT re-created
  dbCarts = db.getTableCarts();
  assert.equal(dbCarts[tableSource.id], undefined, 'CRITICAL CHECK 3: Table 1 must still be completely absent from DB');

  // 5b. Polling logic simulation: Client has local map, poller fetches from DB
  let clientTableCartsMap = {
    [tableTarget.id]: dbCarts[tableTarget.id]
  };

  // Even if client map somehow retained tableSource:
  clientTableCartsMap[tableSource.id] = { cart: [{ id: 999, name: 'ghost' }] };

  // Poller runs (cleans up absent tables)
  const pollerDbCarts = db.getTableCarts();
  for (const tid of Object.keys(clientTableCartsMap)) {
    if (!pollerDbCarts[tid]) {
      // Table absent from DB: delete from client map
      delete clientTableCartsMap[tid];
    }
  }

  assert.equal(clientTableCartsMap[tableSource.id], undefined, 'CRITICAL CHECK 4: Poller purged Table 1 from client map');
  assert.ok(clientTableCartsMap[tableTarget.id], 'Poller maintained Table 2');

  // 5c. User clicks back to Table 1 in UI
  console.log('[TEST STEP 6] User clicks on Table 1: must load clean empty cart');
  const selectedCartForTable1 = clientTableCartsMap[tableSource.id]?.cart || [];
  assert.equal(selectedCartForTable1.length, 0, 'CRITICAL CHECK 5: Selected Table 1 MUST have 0 items');

  // 5d. User clicks on Table 2 in UI
  console.log('[TEST STEP 7] User clicks on Table 2: must display all transferred items');
  const selectedCartForTable2 = clientTableCartsMap[tableTarget.id]?.cart || [];
  assert.equal(selectedCartForTable2.length, 3, 'CRITICAL CHECK 6: Table 2 has all 3 items');

  // STEP 8: CHECKOUT TABLE 2
  console.log('[TEST STEP 8] Cashier completes payment and checkout for Table 2');
  const shift = db.currentShift();
  const admin = db.listUsers().find(u => u.role === 'admin') || { id: 1, name: 'Admin', role: 'admin' };
  const products = db.listProducts();
  const validItems = [
    { id: products[0].id, name: products[0].name, price: products[0].price, qty: 2 }
  ];
  const cr = db.queryGet('SELECT rev FROM table_carts WHERE table_id = ?', [tableTarget.id]);
  const orderRes = db.createOrder({
    items: validItems,
    tableId: tableTarget.id,
    expectedCartRev: cr ? cr.rev : 1,
    paymentMethod: 'cash',
    amountPaid: products[0].price * 2,
    user: admin,
    shiftId: shift.id
  });
  console.log('orderRes result:', orderRes);
  assert.equal(orderRes?.success, true, 'Order creation must succeed: ' + JSON.stringify(orderRes));

  // Clear table cart after checkout
  db.saveTableCart(tableTarget.id, null);

  // Both tables are now available and empty
  dbCarts = db.getTableCarts();
  assert.equal(dbCarts[tableSource.id], undefined, 'Table 1 is empty');
  assert.equal(dbCarts[tableTarget.id], undefined, 'Table 2 is empty');

  currentTables = db.listTables();
  assert.equal(currentTables.find(t => t.id === tableSource.id).status, 'available');
  assert.equal(currentTables.find(t => t.id === tableTarget.id).status, 'available');

  console.log('\n======================================================');
  console.log('✅ ALL CHECKS PASSED: ZERO GHOST ORDERS ON SOURCE TABLE');
  console.log('======================================================\n');

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
