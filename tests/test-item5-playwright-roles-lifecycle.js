const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

async function runRolesLifecycleTest() {
  console.log('================================================================');
  console.log(' ITEM 5: PLAYWRIGHT E2E LIFECYCLE & PROTECTED IPC VERIFICATION ');
  console.log('================================================================\n');

  const testDir = path.join(os.tmpdir(), `cafe-roles-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  const env = {
    ...process.env,
    CAFE_USER_DATA: testDir,
    CAFE_TEST_AUTOMATION: '1',
    NODE_ENV: 'test'
  };
  delete env.ELECTRON_RUN_AS_NODE;

  let electronApp;
  try {
    const electronBinary = require('electron');
    console.log('[Step 0] Launching Electron app (userData: ' + testDir + ')');
    electronApp = await electron.launch({
      executablePath: electronBinary,
      args: ['.'],
      env
    });

    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(() => typeof window.api !== 'undefined');
    console.log('   ✓ Electron window loaded successfully');

    // 1. Setup Admin
    const ADMIN_PW = 'AdminSuperPass123!';
    const setupRes = await win.evaluate((pw) => window.api.setupInitialAdmin(pw, 'المدير العام'), ADMIN_PW);
    assert.strictEqual(setupRes.success, true, 'Admin setup must succeed');

    const adminLogin = await win.evaluate((pw) => window.api.loginUser('admin', pw), ADMIN_PW);
    assert.strictEqual(adminLogin.role, 'admin', 'Admin login must have admin role');
    console.log('   ✓ Admin user created and verified');

    // Create Cashier
    const CASHIER_PW = 'CashierPass123!';
    const cashierUser = await win.evaluate((pw) => window.api.saveUser({
      username: 'cashier1',
      name: 'كاشير الورديات',
      password: pw,
      role: 'cashier',
      salary: 4000
    }), CASHIER_PW);
    assert(cashierUser && cashierUser.id, 'Cashier creation failed');
    console.log('   ✓ Cashier user created (ID: ' + cashierUser.id + ')');

    // Save a product for orders
    const product = await win.evaluate(() => window.api.saveProduct({
      name: 'كابتشينو دوبل',
      price: 45,
      category_id: 1,
      stock_qty: 100
    }));
    assert(product && product.id, 'Product creation failed');

    // Logout admin
    await win.evaluate(() => window.api.logoutUser());
    console.log('   ✓ Admin logged out');

    // ================================================================
    // PART 1: Cashier Full Lifecycle
    // ================================================================
    console.log('\n--- PART 1: Cashier Operational Lifecycle ---');

    // 1. Login as Cashier
    const cashierLogin = await win.evaluate((pw) => window.api.loginUser('cashier1', pw), CASHIER_PW);
    assert.strictEqual(cashierLogin.role, 'cashier', 'Cashier login role must be cashier');
    console.log('   1. Cashier logged in: ' + cashierLogin.name);

    // 2. Open Shift
    const shift = await win.evaluate((cUser) => window.api.openShift(300, 'وردية الكاشير الصباحية', cUser), cashierLogin);
    assert(shift && shift.id, 'Shift creation failed');
    assert.strictEqual(Number(shift.opening_cash), 300, 'Opening cash must be 300');
    console.log('   2. Shift opened (ID: ' + shift.id + ', Opening Cash: 300 LE)');

    // 3. Create Order
    const orderRes = await win.evaluate(({ sId, p, u }) => window.api.createOrder({
      shiftId: sId,
      items: [{ id: p.id, name: p.name, price: p.price, qty: 2 }],
      total: 90,
      subtotal: 90,
      paymentMethod: 'cash',
      orderType: 'takeaway',
      amountPaid: 90,
      user: u
    }), { sId: shift.id, p: product, u: cashierLogin });
    assert(orderRes && orderRes.id, 'Order creation failed');
    console.log('   3. Order created & paid in cash (Invoice #' + orderRes.invoice_no + ', Total: 90 LE)');

    // 4. Add Expense
    const expenseRes = await win.evaluate(({ sId, u }) => window.api.addExpense({
      amount: 40,
      notes: 'شراء كاسات ورقية',
      category: 'خامات',
      shiftId: sId,
      user: u
    }), { sId: shift.id, u: cashierLogin });
    assert(expenseRes && expenseRes.id, 'Expense creation failed');
    console.log('   4. Cashier added expense (ID: ' + expenseRes.id + ', Amount: 40 LE)');

    // 5. Cancel Order (Requires Admin Password)
    console.log('   5. Testing order cancellation authorization:');
    // Cashier attempts to cancel directly without admin approval
    const unauthorizedCancel = await win.evaluate((oId) => window.api.cancelOrder(oId, 'خطأ في الطلب', null), orderRes.id);
    assert.strictEqual(unauthorizedCancel.success, false, 'Direct cashier cancel without admin must fail');
    console.log('      ✓ Cashier direct cancel safely rejected (Admin approval required)');

    // Verify admin password
    const adminCheck = await win.evaluate((pw) => window.api.verifyAdminPassword(pw), ADMIN_PW);
    assert.strictEqual(adminCheck.success, true, 'Admin password verification must succeed');
    console.log('      ✓ Admin password overlay verified successfully');

    // Perform cancellation with verified admin password (6th parameter: adminPassword)
    const authorizedCancel = await win.evaluate(({ oId, aUser, pw }) => window.api.cancelOrder(oId, 'طلب العميل إلغاء', aUser, 'cash', pw), {
      oId: orderRes.id,
      aUser: adminLogin,
      pw: ADMIN_PW
    });
    assert.strictEqual(authorizedCancel.success, true, 'Cancellation with admin approval must succeed');
    console.log('      ✓ Order cancelled successfully with admin authorization');

    // 6. Close Shift & Handover
    const closeRes = await win.evaluate(({ sId }) => window.api.closeShift(sId, 260, 'تم تسليم الدرج سليم'), { sId: shift.id });
    assert.strictEqual(closeRes.success, true, 'Shift closing must succeed');
    console.log('   6. Shift closed & handed over (Actual Cash: 260 LE, Status: Closed)');

    // 7. Cashier Logout
    await win.evaluate(() => window.api.logoutUser());
    console.log('   7. Cashier logged out cleanly');

    // ================================================================
    // PART 2: Admin Full Privileges
    // ================================================================
    console.log('\n--- PART 2: Admin Operations & Privileged IPC ---');

    await win.evaluate((pw) => window.api.loginUser('admin', pw), ADMIN_PW);
    console.log('   1. Admin logged in');

    // 2. Backup
    const backupRes = await win.evaluate(() => window.api.createBackup());
    assert.strictEqual(backupRes.success, true, 'Admin createBackup must succeed');
    console.log('   2. Admin createBackup succeeded (File: ' + backupRes.filename + ')');

    // 3. Export Orders
    const exportRes = await win.evaluate(() => window.api.exportOrdersCsv());
    assert.strictEqual(exportRes && exportRes.success, true, 'Admin exportOrdersCsv must succeed');
    console.log('   3. Admin exportOrdersCsv succeeded (Saved to: ' + exportRes.filePath + ')');

    // 4. Update and Delete Expense
    const updateExpRes = await win.evaluate((eId) => window.api.updateExpense({
      id: eId,
      amount: 45,
      notes: 'شراء كاسات ورقية وسكر',
      category: 'خامات'
    }), expenseRes.id);
    assert.strictEqual(updateExpRes.success, true, 'Admin updateExpense must succeed');
    console.log('   4. Admin updateExpense succeeded (Amount updated to 45 LE)');

    const delExpRes = await win.evaluate((eId) => window.api.deleteExpense(eId, 'قيد بالخطأ'), expenseRes.id);
    assert.strictEqual(delExpRes.success, true, 'Admin deleteExpense must succeed');
    console.log('   5. Admin deleteExpense succeeded');

    // 5. Restore Order (requires admin password verification in backend)
    const restoreRes = await win.evaluate(({ oId, pw }) => window.api.restoreOrder(oId, pw), { oId: orderRes.id, pw: ADMIN_PW });
    assert.strictEqual(restoreRes.success, true, 'Admin restoreOrder must succeed');
    console.log('   6. Admin restoreOrder succeeded (Invoice #' + orderRes.invoice_no + ' restored)');

    // ================================================================
    // PART 3: Forbidden IPC Direct Comparison (Cashier vs Admin)
    // ================================================================
    console.log('\n--- PART 3: Forbidden IPC Direct Calls Comparison ---');

    // Re-login as Cashier to test IPC rejection on restricted channels
    await win.evaluate((pw) => window.api.loginUser('cashier1', pw), CASHIER_PW);

    const testRestricted = async (name, fn) => {
      const res = await win.evaluate(fn);
      const isBlocked = (res && res.success === false) || (typeof res === 'object' && res.error);
      assert.ok(isBlocked, `Cashier MUST be blocked from ${name}`);
      console.log(`   ✓ Cashier blocked from ${name}: ${res.error || 'Blocked'}`);
    };

    await testRestricted('backup:now', () => window.api.createBackup());
    await testRestricted('export:orders', () => window.api.exportOrdersCsv());
    await testRestricted('expenses:update', () => window.api.updateExpense({ id: 1, amount: 99 }));
    await testRestricted('expenses:delete', () => window.api.deleteExpense(1, 'حذف'));
    await testRestricted('orders:restore', () => window.api.restoreOrder(1));
    await testRestricted('system:reset', () => window.api.systemReset('Confirm123'));

    console.log('\n================================================================');
    console.log(' ✅ ALL PLAYWRIGHT E2E LIFECYCLE & SECURITY TESTS PASSED 100%   ');
    console.log('================================================================');

  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  }
}

runRolesLifecycleTest().catch((err) => {
  console.error('\n❌ PLAYWRIGHT LIFECYCLE AUDIT FAILED:', err);
  process.exit(1);
});

