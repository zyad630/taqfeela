const assert = require('assert');
const db = require('../electron/db');

(async () => {
  console.log('Testing Vendor Features & Password Verification...');
  await db.init();

  // 1. Test wrong password
  const failRes = db.saveVendorFeatures({
    vendorPassword: 'wrong_password',
    features: { show_notebook_to_cashier: true }
  });
  assert.strictEqual(failRes.success, false, 'Should fail with wrong vendor password');
  console.log('✅ Wrong vendor password correctly rejected');

  // 2. Test correct password
  const passRes = db.saveVendorFeatures({
    vendorPassword: 'Zyad@_#2006%caffe',
    features: {
      show_notebook_to_cashier: true,
      require_password_transfer_tables: true,
      allow_cashier_cancel_orders: true
    }
  });
  assert.strictEqual(passRes.success, true, 'Should succeed with correct vendor password');
  const settings = db.getSettings();
  assert.strictEqual(settings.show_notebook_to_cashier, 'true');
  assert.strictEqual(settings.require_password_transfer_tables, 'true');
  assert.strictEqual(settings.allow_cashier_cancel_orders, 'true');
  console.log('✅ Correct vendor password accepted and settings updated successfully');

  // 3. Test toggling off
  const offRes = db.saveVendorFeatures({
    vendorPassword: 'Zyad@_#2006%caffe',
    features: {
      show_notebook_to_cashier: false,
      require_password_transfer_tables: false,
      allow_cashier_cancel_orders: false
    }
  });
  assert.strictEqual(offRes.success, true);
  const updated = db.getSettings();
  assert.strictEqual(updated.show_notebook_to_cashier, 'false');
  assert.strictEqual(updated.require_password_transfer_tables, 'false');
  assert.strictEqual(updated.allow_cashier_cancel_orders, 'false');
  console.log('✅ Toggling off vendor features works perfectly');

  console.log('🎉 All Vendor Features tests passed!');
})();
