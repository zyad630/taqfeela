const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

async function runIpcEscalationAudit() {
  console.log('====================================================');
  console.log('   ITEM 1: IPC PLAYWRIGHT BEHAVIORAL SECURITY AUDIT  ');
  console.log('====================================================\n');

  // 1. Create clean isolated temporary userData directory
  const testDir = path.join(os.tmpdir(), `cafe-ipc-test-${Date.now()}`);
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
    console.log('[1/11] Launching Electron app with isolated userData:', testDir);
    console.log('       Electron binary:', electronBinary);
    electronApp = await electron.launch({
      executablePath: electronBinary,
      args: ['.'],
      env
    });

    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    // Wait for window.api to be ready
    await win.waitForFunction(() => typeof window.api !== 'undefined');
    console.log('   ✓ Electron window loaded and window.api exposed via contextBridge');

    // 2. Setup initial admin if not present
    const hasAdmin = await win.evaluate(() => window.api.hasAdminUser());
    const ADMIN_PW = 'AdminPass123456!';
    if (!hasAdmin) {
      const setupRes = await win.evaluate((pw) => window.api.setupInitialAdmin(pw, 'المدير العام'), ADMIN_PW);
      assert.strictEqual(setupRes.success, true, 'Initial admin setup must succeed');
      console.log('   ✓ Initial admin created');
    }

    // 3. Login as admin to seed a cashier, an expense, an order, and open a shift
    const adminLoginRes = await win.evaluate((pw) => window.api.loginUser('admin', pw), ADMIN_PW);
    assert(adminLoginRes && !adminLoginRes.error, 'Admin login failed');

    // Create cashier user
    const saveUserRes = await win.evaluate(() => window.api.saveUser({
      username: 'cashier_test',
      name: 'كاشير تجريبي',
      password: 'CashierPass123!',
      role: 'cashier',
      salary: 3500
    }));
    assert(saveUserRes && saveUserRes.id, 'Cashier creation failed');
    const cashierId = saveUserRes.id;
    console.log('   ✓ Test cashier created with id:', cashierId);

    // Ensure open shift
    let curShift = await win.evaluate(() => window.api.currentShift());
    if (!curShift) {
      const openShiftRes = await win.evaluate(() => window.api.openShift(500, 'افتتاح للاختبار', {}, 'الشيفت الصباحي'));
      assert(openShiftRes && openShiftRes.success, 'Shift opening failed');
      curShift = await win.evaluate(() => window.api.currentShift());
    }
    console.log('   ✓ Active shift confirmed:', curShift.id);

    // Create a product if none exists
    const products = await win.evaluate(() => window.api.listProducts());
    let prod = products[0];
    if (!prod) {
      const saveProd = await win.evaluate(() => window.api.saveProduct({
        name: 'قهوة اسبريسو تجريبية',
        price: 30,
        cost: 10,
        stock_qty: 100
      }));
      prod = saveProd;
    }
    const prodId = prod.id;
    const prodPrice = prod.price || 30;

    // Create an order
    const orderRes = await win.evaluate(({ pid, price }) => window.api.createOrder({
      items: [{ id: pid, name: 'اسبريسو', price: price, qty: 1 }],
      paymentMethod: 'cash',
      amountPaid: price
    }), { pid: prodId, price: prodPrice });
    assert(orderRes && orderRes.success, 'Order creation failed');
    const orderId = orderRes.orderId || orderRes.id;
    console.log('   ✓ Test paid order created with id:', orderId);

    // Add an expense
    const expenseRes = await win.evaluate(() => window.api.addExpense({
      amount: 150,
      category: 'خامات ومستلزمات',
      notes: 'شراء بن للاختبار'
    }));
    assert(expenseRes && expenseRes.success, 'Expense creation failed');
    const expenseId = expenseRes.id;
    console.log('   ✓ Test expense created with id:', expenseId);

    // Logout admin
    await win.evaluate(() => window.api.logoutUser());
    console.log('   ✓ Admin logged out');

    // 4. Log in as CASHIER
    const cashierLogin = await win.evaluate(() => window.api.loginUser('cashier_test', 'CashierPass123!'));
    assert(cashierLogin && cashierLogin.role === 'cashier', 'Cashier login failed');
    console.log('   ✓ Logged in as cashier (role=cashier)');

    // =========================================================================
    // SUB-TEST 1: Admin Handler Rejections for Cashier
    // =========================================================================
    console.log('\n[2/11] Testing administrative IPC handlers invoked directly by cashier:');

    // (a) orders:cancel on paid order without admin password
    const cancelRes = await win.evaluate((oid) => window.api.cancelOrder(oid, 'محاولة إلغاء بدون صلاحية', { role: 'admin' }, 'cash', null), orderId);
    console.log('   - cancelOrder (no admin pw):', cancelRes);
    assert.strictEqual(cancelRes.success, false, 'Cashier must NOT cancel paid order without admin password');
    assert(cancelRes.requiresAdminPassword || cancelRes.error.includes('كلمة مرور'), 'Must indicate admin password requirement');

    // (b) orders:restore without admin password
    const restoreRes = await win.evaluate((oid) => window.api.restoreOrder(oid, null), orderId);
    console.log('   - restoreOrder (no admin pw):', restoreRes);
    assert.strictEqual(restoreRes.success, false, 'Cashier must NOT restore order without admin password');

    // (c) expenses:delete without admin password
    const deleteExpRes = await win.evaluate((eid) => window.api.deleteExpense(eid, null), expenseId);
    console.log('   - deleteExpense (no admin pw):', deleteExpRes);
    assert.strictEqual(deleteExpRes.success, false, 'Cashier must NOT delete expense without admin password');

    // (d) expenses:update without admin password
    const updateExpRes = await win.evaluate((eid) => window.api.updateExpense({
      id: eid,
      amount: 9999,
      category: 'اختراق مالي',
      notes: 'تعديل بدون إذن مدير'
    }), expenseId);
    console.log('   - updateExpense (no admin pw):', updateExpRes);
    assert.strictEqual(updateExpRes.success, false, 'Cashier must NOT update expense without admin password or admin role');

    // (e) shift:close targeting another user's shift
    const closeOtherShiftRes = await win.evaluate((sid) => window.api.closeShift(sid, 1000, 'إغلاق غير مصرح', { role: 'admin' }, null), 99999);
    console.log('   - closeShift (invalid/other shift):', closeOtherShiftRes);
    assert.strictEqual(closeOtherShiftRes.success, false, 'Cashier must NOT close invalid or other user shift');

    // (f) backup handlers
    const backupCreateRes = await win.evaluate(() => window.api.createBackup());
    console.log('   - createBackup:', backupCreateRes);
    assert.strictEqual(backupCreateRes.success, false, 'Cashier must NOT create backup');
    assert(backupCreateRes.error.includes('غير مصرح') || backupCreateRes.error.includes('المدير'), 'Must return unauthorized error');

    const backupRestoreRes = await win.evaluate(() => window.api.restoreBackup('dummy.db'));
    console.log('   - restoreBackup:', backupRestoreRes);
    assert.strictEqual(backupRestoreRes.success, false, 'Cashier must NOT restore backup');

    // (g) export handlers
    const expOrdersRes = await win.evaluate(() => window.api.exportOrdersCsv({}));
    console.log('   - exportOrdersCsv:', expOrdersRes);
    assert.strictEqual(expOrdersRes.success, false, 'Cashier must NOT export orders CSV');

    const expPayrollRes = await win.evaluate(() => window.api.exportPayrollCsv('2026-11'));
    console.log('   - exportPayrollCsv:', expPayrollRes);
    assert.strictEqual(expPayrollRes.success, false, 'Cashier must NOT export payroll CSV');

    const expDailyRes = await win.evaluate(() => window.api.exportDailySalesCsv('2026-11-08'));
    console.log('   - exportDailySalesCsv:', expDailyRes);
    assert.strictEqual(expDailyRes.success, false, 'Cashier must NOT export daily sales CSV');

    // (h) system:reset
    const sysResetRes = await win.evaluate(() => window.api.systemReset({ fullReset: true }));
    console.log('   - systemReset:', sysResetRes);
    assert.strictEqual(sysResetRes.success, false, 'Cashier must NOT reset system');

    console.log('   ✅ All administrative handlers properly reject unauthorized cashier invocation.');

    // =========================================================================
    // SUB-TEST 2: Payload userId / role Spoofing Verification
    // =========================================================================
    console.log('\n[3/11] Testing payload spoofing (passing malicious userId/role in payload):');
    const spoofOrderRes = await win.evaluate(({ pid, price }) => window.api.createOrder({
      items: [{ id: pid, name: 'اسبريسو', price: price, qty: 1 }],
      paymentMethod: 'cash',
      amountPaid: price,
      userId: 1, // Spoofed admin userId
      user: { id: 1, role: 'admin', name: 'المدير المزيف' } // Spoofed admin user object
    }), { pid: prodId, price: prodPrice });
    assert(spoofOrderRes && spoofOrderRes.success, 'Spoofed order creation call failed');
    console.log('   - createOrder with spoofed payload returned userId:', spoofOrderRes.userId, 'cashierName:', spoofOrderRes.cashierName);
    assert.strictEqual(spoofOrderRes.userId, cashierId, 'Order MUST be recorded with authenticated session userId, NOT spoofed userId');
    assert.strictEqual(spoofOrderRes.cashierName, 'كاشير تجريبي', 'Order MUST be recorded with session user name');
    console.log('   ✅ Backend ignores spoofed userId/role in payload and strictly enforces session identity.');

    // Change password spoofing check
    const spoofPwRes = await win.evaluate(() => window.api.changePassword({
      userId: 1, // Attempt to change admin password as cashier
      currentPassword: 'any',
      newPassword: 'hackedPassword123!'
    }));
    console.log('   - changePassword for admin while logged in as cashier:', spoofPwRes);
    assert.strictEqual(spoofPwRes.success, false, 'Cashier must NOT change another user password');
    console.log('   ✅ Cannot change other users passwords via payload userId spoofing.');

    // =========================================================================
    // SUB-TEST 3: adminOverlay Architecture Verification
    // =========================================================================
    console.log('\n[4/11] Testing adminOverlay lifecycle and main process session elevation:');

    // (a) Failed overlay login
    const badOverlay = await win.evaluate(() => window.api.adminOverlayLogin('wrongPassword!'));
    assert.strictEqual(badOverlay.success, false, 'Invalid admin overlay password must fail');

    // (b) Successful overlay login
    const goodOverlay = await win.evaluate((pw) => window.api.adminOverlayLogin(pw), ADMIN_PW);
    assert.strictEqual(goodOverlay.success, true, 'Valid admin overlay password must succeed');
    assert.strictEqual(goodOverlay.user.role, 'admin', 'Elevated session role must be admin');
    assert.strictEqual(goodOverlay.user.isOverlay, true, 'Session must mark isOverlay');

    // Verify session elevated in main process: call requireAdmin handler
    const elevatedBackup = await win.evaluate(() => window.api.createBackup());
    console.log('   - createBackup under admin overlay:', elevatedBackup);
    assert.strictEqual(elevatedBackup.success, true, 'createBackup must succeed when elevated under admin overlay');

    // (c) Return from overlay
    const returnOverlay = await win.evaluate(() => window.api.adminOverlayReturn());
    assert.strictEqual(returnOverlay.success, true, 'adminOverlayReturn must succeed');
    assert.strictEqual(returnOverlay.user.role, 'cashier', 'Session must revert back to cashier role');

    // Verify session demoted back to cashier in main process: requireAdmin must reject
    const revertedBackup = await win.evaluate(() => window.api.createBackup());
    console.log('   - createBackup after returning from overlay:', revertedBackup);
    assert.strictEqual(revertedBackup.success, false, 'createBackup must be blocked again after returning from overlay');
    console.log('   ✅ adminOverlay terminates in main process and reversibly elevates session credentials.');

    // =========================================================================
    // SUB-TEST 4: users:list returned fields & password hash safety
    // =========================================================================
    console.log('\n[5/11] Testing users:list payload safety for cashier:');
    const userList = await win.evaluate(() => window.api.listUsers());
    console.log('   - users:list count:', userList.length, 'first user keys:', Object.keys(userList[0]));
    for (const u of userList) {
      assert.strictEqual(u.password, undefined, `User ${u.username} MUST NOT leak password field`);
      assert.strictEqual(u.password_hash, undefined, `User ${u.username} MUST NOT leak password_hash field`);
      assert.deepStrictEqual(Object.keys(u).sort(), ['id', 'name', 'role', 'username'].sort(), `Non-admin users:list must only expose safe identity fields`);
    }
    console.log('   ✅ users:list strictly excludes passwords and password hashes.');

    // =========================================================================
    // SUB-TEST 5: setupInitialAdmin when admin already exists
    // =========================================================================
    console.log('\n[6/11] Testing setupInitialAdmin duplicate invocation:');
    const dupAdminRes = await win.evaluate(() => window.api.setupInitialAdmin('HackedPass123456!', 'مخترق'));
    console.log('   - setupInitialAdmin response:', dupAdminRes);
    assert.strictEqual(dupAdminRes.success, false, 'setupInitialAdmin must reject when admin already exists');
    assert(dupAdminRes.error.includes('بالفعل'), 'Error message must state admin already exists');
    console.log('   ✅ setupInitialAdmin rejected when admin already registered.');

    // =========================================================================
    // SUB-TEST 6: unlockTamper key verification
    // =========================================================================
    console.log('\n[7/11] Testing unlockTamper with invalid cryptographic key:');
    const fakeUnlockRes = await win.evaluate(() => window.api.unlockTamper('fake-forged-signature-key-123456'));
    console.log('   - unlockTamper response:', fakeUnlockRes);
    assert.strictEqual(fakeUnlockRes.success, false, 'unlockTamper must reject forged signature');
    console.log('   ✅ unlockTamper fails closed on invalid key.');

    // =========================================================================
    // SUB-TEST 7: verifyAdminPassword rate limiting and attempt lockout
    // =========================================================================
    console.log('\n[8/11] Testing verifyAdminPassword rate limiting (5 attempts lockout):');
    let lockoutTriggered = false;
    let lockoutMsg = '';
    for (let i = 1; i <= 6; i++) {
      const pwRes = await win.evaluate((idx) => window.api.verifyAdminPassword(`wrong_pw_${idx}`), i);
      console.log(`   - Attempt ${i}:`, pwRes);
      if (i <= 5) {
        assert.strictEqual(pwRes.success, false, `Attempt ${i} should fail authentication`);
      } else {
        // 6th attempt MUST trigger rate limit lockout
        assert.strictEqual(pwRes.success, false, '6th attempt must fail');
        if (pwRes.error && pwRes.error.includes('تم تجاوز الحد المسموح')) {
          lockoutTriggered = true;
          lockoutMsg = pwRes.error;
        }
      }
    }
    assert(lockoutTriggered, 'Lockout MUST be triggered after 5 failed attempts');
    console.log('   ✓ Lockout confirmed on 6th attempt:', lockoutMsg);
    console.log('   ✅ verifyAdminPassword lockout and brute-force protection active.');

    console.log('\n====================================================');
    console.log('   ITEM 1 AUDIT COMPLETE: ALL ASSERTIONS PASSED!    ');
    console.log('====================================================');
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runIpcEscalationAudit().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ AUDIT FAILED WITH ERROR:');
  console.error(err);
  process.exit(1);
});
