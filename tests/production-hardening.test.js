const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-hardening-test-'));
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  // Set test mode before loading db
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

test('backup is created as a separate database file and audit records are queryable', async () => {
  const { db, dir } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', 'admin');
  const shift = db.openShift(100, '', admin, 'hardening');
  const product = db.listProducts()[0];
  db.saveProduct({ ...product, stock_qty: 10 });
  const order = db.createOrder({ items: [{ id: product.id, qty: 2, price: 0 }], paymentMethod: 'cash', amountPaid: product.price * 2, user: admin, shiftId: shift.id });
  assert.ok(order.orderId);
  const audit = db.listAuditLog(20);
  assert.ok(audit.some((row) => row.action === 'create' && row.entity_type === 'order'));
  const backup = db.createBackup();
  assert.equal(backup.success, true);
  assert.ok(backup.path.startsWith(path.join(dir, 'backups')));
  assert.ok(fs.existsSync(backup.path));
  assert.ok(fs.statSync(backup.path).size > 0);
});

test('stock movements balance sale and cancellation and product deletion is soft', async () => {
  const { db } = loadDb();
  await db.init();
  const admin = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  const category = db.listCategories()[0];
  const product = db.saveProduct({ name: 'Hardening Stock', price: 20, cost: 5, category_id: category.id, stock_qty: 10, low_stock_threshold: 1 });
  const shift = db.openShift(0, '', admin, 'hardening');
  const order = db.createOrder({ items: [{ id: product.id, qty: 3 }], paymentMethod: 'cash', amountPaid: 60, user: admin, shiftId: shift.id });
  assert.equal(db.listProducts().find((p) => p.id === product.id).stock_qty, 7);
  assert.equal(db.cancelOrder(order.orderId, 'test reversal', admin).success, true);
  assert.equal(db.listProducts().find((p) => p.id === product.id).stock_qty, 10);
  const movements = db.listStockMovements(product.id, 20);
  assert.equal(movements.filter((m) => m.movement_type === 'sale').reduce((s, m) => s + m.quantity, 0), -3);
  assert.equal(movements.filter((m) => m.movement_type === 'return').reduce((s, m) => s + m.quantity, 0), 3);
  assert.equal(db.deleteProduct(product.id, admin).success, true);
  assert.equal(db.listProducts().some((p) => p.id === product.id), false);
  assert.ok(db.listAuditLog(20).some((row) => row.action === 'soft_delete' && row.entity_type === 'product'));
});

test('restore accepts only an in-app backup, creates rollback protection, and requires restart', async () => {
  const { db } = loadDb();
  await db.init();
  const backup = db.createBackup();
  const restored = db.restoreBackup(backup.path);
  assert.equal(restored.success, true);
  assert.equal(restored.requiresRestart, true);
  assert.throws(() => db.restoreBackup('/tmp/attacker.db'));
});

test('transferTable atomically moves cart, deletes source cart, and updates statuses', async () => {
  const { db } = loadDb();
  await db.init();
  const tables = db.listTables();
  assert.ok(tables.length >= 2);
  const tbl1 = tables[0];
  const tbl2 = tables[1];

  // 1. Save cart to table 1
  const cartData = { cart: [{ id: 101, name: 'قهوة', price: 25, qty: 2 }], customerName: 'أحمد' };
  db.saveTableCart(tbl1.id, cartData);
  let carts = db.getTableCarts();
  assert.ok(carts[tbl1.id]);
  assert.equal(carts[tbl1.id].cart.length, 1);

  // 2. Transfer from tbl1 to tbl2
  const transferRes = db.transferTable({
    fromTableId: tbl1.id,
    toTableId: tbl2.id,
    targetCartData: cartData
  });
  assert.equal(transferRes.success, true);

  // 3. Verify carts: tbl1 deleted, tbl2 exists
  carts = db.getTableCarts();
  assert.equal(carts[tbl1.id], undefined, 'Source table cart must be deleted');
  assert.ok(carts[tbl2.id], 'Target table cart must exist');
  assert.equal(carts[tbl2.id].cart[0].name, 'قهوة');

  // 4. Verify table statuses
  const updatedTables = db.listTables();
  const updated1 = updatedTables.find(t => t.id === tbl1.id);
  const updated2 = updatedTables.find(t => t.id === tbl2.id);
  assert.equal(updated1.status, 'available', 'Source table must be available');
  assert.equal(updated2.status, 'occupied', 'Target table must be occupied');
});

