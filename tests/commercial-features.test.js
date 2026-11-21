const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../electron/db');
const finance = require('../electron/finance');
const { generateLicenseForMachine } = require('../scripts/generate-license');

test.before(async () => {
  await db.init();
});

test('1. Password Hashing, min length 6, and Authentication with bcrypt', async () => {
  const users = db.listUsers();
  let admin = users.find(u => u.role === 'admin');
  if (!admin) {
    admin = db.saveUser({
      username: 'admin',
      name: 'المدير العام',
      password: 'adminPassword123',
      role: 'admin',
      salary: 6000
    });
  } else {
    db.changePassword({ userId: admin.id, newPassword: 'adminPassword123' });
  }

  // Login with correct password
  const loginRes = db.loginUser(admin.username, 'adminPassword123');
  assert.ok(loginRes, 'Admin should be able to login');
  assert.equal(loginRes.role, 'admin');

  // Short password (< 6 chars) should be rejected
  const shortPassRes = db.changePassword({ userId: admin.id, newPassword: '123' });
  assert.equal(shortPassRes.success, false, 'Password < 6 chars should be rejected');

  // Change password for user to a valid 6+ char password
  const changeRes = db.changePassword({ userId: admin.id, newPassword: 'NewSecretAdmin2026' });
  assert.equal(changeRes.success, true);

  // Old password should fail
  const oldLogin = db.loginUser(admin.username, 'adminPassword123');
  assert.equal(oldLogin, null, 'Old password should fail');

  // New password should succeed
  const newLogin = db.loginUser(admin.username, 'NewSecretAdmin2026');
  assert.ok(newLogin, 'New password should succeed');
  assert.equal(newLogin.must_change_password, 0);

  // New user without password should be rejected
  assert.throws(() => {
    db.saveUser({
      username: 'new_cashier_no_pass',
      name: 'كاشير بدون باسوورد',
      role: 'cashier'
    });
  }, /كلمة المرور مطلوبة/);

  // New user with < 6 char password should be rejected
  assert.throws(() => {
    db.saveUser({
      username: 'new_cashier_short_pass',
      name: 'كاشير باسوورد قصير',
      password: '123',
      role: 'cashier'
    });
  }, /6 أحرف على الأقل/);

  // Restore admin password
  db.changePassword({ userId: admin.id, newPassword: 'adminPassword123' });
});

test('2. Asymmetric Ed25519 Offline Licensing & Signature Verification', async () => {
  const machineId = db.getMachineId();
  assert.ok(machineId && machineId.length > 5, 'Machine ID should be a non-empty string');

  // Generate valid signed license key using the vendor private key
  const validKey = generateLicenseForMachine(machineId);
  assert.ok(validKey && validKey.length > 20, 'Vendor-signed license key should be valid');

  // Invalid fake signature must fail
  const invalidRes = db.activateLicense('INVALID_FAKE_SIGNATURE_KEY_123');
  assert.equal(invalidRes.success, false, 'Fake license key must be rejected');

  // Random base64 that is not signed with private key must fail
  const fakeBase64 = Buffer.from('FAKE_RANDOM_SIGNATURE_DATA_STRING_12345678901234567890123456789012').toString('base64');
  const fakeSigRes = db.activateLicense(fakeBase64);
  assert.equal(fakeSigRes.success, false, 'Tampered signature must be rejected');

  // Valid vendor signature must succeed
  const validRes = db.activateLicense(validKey);
  assert.equal(validRes.success, true, 'Vendor signature must be verified successfully');

  const status = db.getLicenseStatus();
  assert.equal(status.isActivated, true);
  assert.equal(status.machineId, machineId);
});

test('3. clearAllOrders strictly requires valid admin password', async () => {
  // Call with no password -> Must be rejected
  const noPassRes = db.clearAllOrders();
  assert.equal(noPassRes.success, false);
  assert.ok(noPassRes.error.includes('كلمة مرور الأدمن مطلوبة'));

  // Call with empty string -> Must be rejected
  const emptyPassRes = db.clearAllOrders('');
  assert.equal(emptyPassRes.success, false);

  // Call with wrong password -> Must be rejected
  const wrongPassRes = db.clearAllOrders('wrong_password_999');
  assert.equal(wrongPassRes.success, false);
  assert.ok(wrongPassRes.error.includes('غير صحيحة'));

  // Call with correct admin password -> Must succeed
  const correctPassRes = db.clearAllOrders('adminPassword123');
  assert.equal(correctPassRes.success, true);
});

test('4. finance.js integration, calculations & validations', async () => {
  // calculateTotals with valid items
  const res = finance.calculateTotals([
    { price: 50, qty: 2 },
    { price: 20, qty: 1 }
  ], 10, 5);
  assert.equal(res.subtotal, 120);
  assert.equal(res.discount, 10);
  assert.equal(res.tax, 5);
  assert.equal(res.total, 115);

  // Negative tax or discount must throw
  assert.throws(() => finance.calculateTotals([{ price: 10, qty: 1 }], -5, 0));
  assert.throws(() => finance.calculateTotals([{ price: 10, qty: 1 }], 0, -2));

  // Discount exceeding subtotal must throw
  assert.throws(() => finance.calculateTotals([{ price: 10, qty: 1 }], 20, 0), /discount exceeds subtotal/);
});

test('5. Shift requirement and stock deduction inside transaction', async () => {
  // Ensure an open shift
  let curShift = db.currentShift();
  if (!curShift) {
    const admin = db.listUsers().find(u => u.role === 'admin') || { id: 1, name: 'Admin', role: 'admin' };
    curShift = db.openShift(200, 'Test Shift', admin, 'الشيفت الصباحي');
  }

  const products = db.listProducts();
  assert.ok(products.length > 0);
  const testProd = products[0];

  // Replenish stock for the test
  db.saveProduct({ ...testProd, stock_qty: 50 });
  const initialStock = 50;

  // Create order
  const order = db.createOrder({
    items: [{ id: testProd.id, name: testProd.name, price: testProd.price, qty: 2 }],
    orderType: 'takeaway',
    paymentMethod: 'cash',
    discount: 0,
    amountPaid: testProd.price * 2,
    shiftId: curShift.id,
    user: { id: 1, name: 'Admin', role: 'admin' }
  });

  assert.ok(order && (order.orderId || order.id));
  const updatedProd = db.listProducts().find(p => p.id === testProd.id);
  assert.equal(updatedProd.stock_qty, initialStock - 2, 'Stock should be deducted properly');
});
