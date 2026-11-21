const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-power-recovery-test-'));
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

test('Admin custom password is NEVER overwritten on subsequent app restarts', async () => {
  const { db, dir } = loadDb();
  await db.init();

  // 1. Setup initial admin password
  const setupRes = db.setupInitialAdmin('InitialPass2026!', 'المدير');
  assert.ok(setupRes.success, 'Initial admin setup should succeed');

  const admin = db.loginUser('admin', 'InitialPass2026!');
  assert.ok(admin, 'Admin login should work after setup');

  // 2. Admin changes password to a custom strong password
  const changeRes = db.changePassword({ userId: admin.id, currentPassword: 'InitialPass2026!', newPassword: 'ClientSpecialPassword2026' });
  assert.equal(changeRes.success, true, 'Password change should succeed');

  // Verify login with new custom password
  const loginNew = db.loginUser('admin', 'ClientSpecialPassword2026');
  assert.ok(loginNew, 'Login with new custom password should succeed');

  // 3. Simulate app restart (re-running init on the same db file)
  db.saveDb();
  await db.init();

  // 4. Verify that custom password is STILL intact and NOT reset!
  const loginAfterRestart = db.loginUser('admin', 'ClientSpecialPassword2026');
  assert.ok(loginAfterRestart, 'Custom password must remain valid after app restart!');

  const loginOld = db.loginUser('admin', 'InitialPass2026!');
  assert.equal(loginOld, null, 'Old password must NOT work after custom password set');
});

test('Notebook debt auto-syncs and groups properly', async () => {
  const { db } = loadDb();
  await db.init();
  db.setupInitialAdmin('InitialPass2026!', 'المدير');
  const admin = db.loginUser('admin', 'InitialPass2026!');
  const shift = db.openShift(200, 'Morning', admin);

  const prod = db.listProducts()[0];

  // Create notebook order
  const orderRes = db.createOrder({
    items: [{ id: prod.id, qty: 2, price: prod.price }],
    orderType: 'notebook',
    paymentMethod: 'notebook',
    customerName: 'الحاج عثمان',
    customerPhone: '01099998888',
    amountPaid: 0,
    user: admin,
    shiftId: shift.id
  });

  assert.ok(orderRes.orderId, 'Notebook order should be created');

  // Check listDebts
  const debts = db.listDebts();
  assert.ok(debts.length > 0, 'Debts list should contain the created notebook order');
  const d = debts.find(x => x.customer_name === 'الحاج عثمان');
  assert.ok(d, 'Debt must have customer name');
  assert.equal(d.status, 'unpaid');
  assert.equal(d.remaining_amount, orderRes.total);

  // Check listDebtsGroupedByCustomer
  const grouped = db.listDebtsGroupedByCustomer();
  assert.ok(grouped.length > 0, 'Grouped debts should contain customer');
  const g = grouped.find(x => x.customer_name === 'الحاج عثمان');
  assert.ok(g, 'Grouped customer must be found');
  assert.equal(g.total_amount, orderRes.total);

  // Edit order and verify debt updates automatically
  const updateRes = db.updateOrder(orderRes.orderId, {
    customerName: 'الحاج عثمان المعدل',
    discount: 10
  }, admin);
  assert.equal(updateRes.success, true);

  const updatedDebts = db.listDebts();
  const updatedD = updatedDebts.find(x => x.order_id === orderRes.orderId);
  assert.equal(updatedD.customer_name, 'الحاج عثمان المعدل');
  assert.equal(updatedD.total_amount, orderRes.total - 10);
});

test('Table carts: saveAllTableCarts is disabled (App.jsx uses per-table APIs)', async () => {
  // Round 6: saveAllTableCarts was restored to return { success: false, error: 'disabled' }
  // because App.jsx never calls it — it uses setTableCart / appendItemsToTableCart per table.
  // Bulk-writing without rev-check or table-existence guard was removed intentionally.
  const { db } = loadDb();
  await db.init();

  const mockCarts = {
    1: {
      cart: [{ id: 101, name: 'قهوة تركي', price: 25, qty: 2 }],
      customerName: 'طاولة 1',
      discountAmount: 0,
      orderNotes: 'بدون سكر'
    },
    2: {
      cart: [{ id: 102, name: 'شاي أحمر', price: 15, qty: 1 }],
      customerName: 'طاولة 2',
      discountAmount: 0,
      orderNotes: 'نعناع'
    }
  };

  const result = db.saveAllTableCarts(mockCarts);
  assert.equal(result.success, false, 'saveAllTableCarts must return success:false');
  assert.equal(result.error, 'disabled', 'saveAllTableCarts must return error:disabled');

  // Confirm nothing was written to table_carts
  const saved = db.getTableCarts();
  assert.ok(!saved['1'], 'Table 1 cart must NOT be saved when function is disabled');
  assert.ok(!saved['2'], 'Table 2 cart must NOT be saved when function is disabled');
});
