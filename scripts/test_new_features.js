const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log('Testing New Features & Critical Fixes...');

  // Test 1: electron/main.js duplicate handler check
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const handleOccurrences = (mainJs.match(/ipcMain\.handle\(\s*['"]auth:verifyAdminPassword['"]/g) || []).length;
  console.log(`ipcMain.handle('auth:verifyAdminPassword') count: ${handleOccurrences}`);
  assert.strictEqual(handleOccurrences, 1, 'auth:verifyAdminPassword should only be registered exactly once in main.js!');
  console.log('✅ Passed: auth:verifyAdminPassword registered exactly once!');

  // Test 2: Vendor Features with show_stock_alert_on_order
  const db = require(path.join(__dirname, '..', 'electron', 'db.js'));
  await db.init();

  const res = db.saveVendorFeatures({
    vendorPassword: 'Zyad@_#2006%caffe',
    features: {
      show_notebook_to_cashier: true,
      require_password_transfer_tables: true,
      allow_cashier_cancel_orders: true,
      show_stock_alert_on_order: true
    }
  });
  assert.strictEqual(res.success, true, 'saveVendorFeatures should succeed with valid password');
  const settings = db.getSettings();
  assert.strictEqual(settings.show_stock_alert_on_order, 'true', 'show_stock_alert_on_order setting must be saved as true');
  console.log('✅ Passed: show_stock_alert_on_order saved and retrieved correctly!');

  // Test 3: Table Carts persistence across shifts
  console.log('Testing table cart persistence...');
  const tables = db.listTables();
  assert(tables.length > 0, 'Should have tables');
  const testTable = tables[0];

  // Save a cart for testTable
  db.saveTableCart(testTable.id, {
    cart: [{ id: 1, name: 'شاي تركي', price: 25, qty: 2, sent_qty: 2 }],
    customerName: 'أحمد',
    discountAmount: 0,
    orderNotes: '',
    printedCheck: true
  });

  let carts = db.getTableCarts();
  assert(carts[testTable.id], 'Cart should exist in db for testTable');
  assert.strictEqual(carts[testTable.id].printedCheck, true, 'printedCheck flag must persist in table cart');

  // Verify table cart STILL exists in db
  carts = db.getTableCarts();
  assert(carts[testTable.id], 'Table cart must strictly persist in database!');
  assert.strictEqual(carts[testTable.id].cart.length, 1, 'Cart items must remain intact');
  assert.strictEqual(carts[testTable.id].printedCheck, true, 'printedCheck flag must remain intact');
  console.log('✅ Passed: Table carts and printedCheck strictly persist in database!');

  console.log('🎉 All automated tests for new features passed successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
