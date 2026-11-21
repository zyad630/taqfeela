const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function runTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-fix03-test-'));
  const dbPath = path.join(tmpDir, 'test.db');

  const db = require('../electron/db');
  await db.init(dbPath);

  console.log('--- Acceptance Test FIX-03 (A3: actual_cash & Closing Snapshot Immutability) ---');

  // 1. Setup admin user
  const adminRes = db.setupInitialAdmin('AdminSecurePass123!');
  assert.ok(adminRes.success, 'Initial admin setup must succeed');
  const admin = db.loginUser('admin', 'AdminSecurePass123!');
  assert.ok(admin && admin.role === 'admin', 'Admin login must succeed');

  // 2. Open shift with opening cash = 100
  const openRes = db.openShift(100, 'وردية تجريبية', admin);
  assert.ok(openRes.success, 'Shift must open');
  const shiftId = openRes.id || (db.currentShift() && db.currentShift().id);

  // 3. Set product 1 price to 50 and add cash sales of 500 LE (10 x 50 LE)
  db.runSql('UPDATE products SET price = 50, stock_qty = 100 WHERE id = 1');
  const orderRes = db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', qty: 10, price: 50 }],
    paymentMethod: 'cash',
    orderType: 'takeaway',
    shiftId,
    user: admin
  });
  assert.ok(orderRes.success, 'Order must succeed');

  // 4. Add expense of 50 LE
  const expRes = db.addExpense({
    amount: 50,
    category: 'مشتريات',
    notes: 'بن',
    shiftId,
    user: admin
  });
  assert.ok(expRes.success, 'Expense must succeed');

  // 5. Add adjustment +20 LE during shift
  const adj1 = db.addShiftAdjustment({
    shiftId,
    type: 'in',
    amount: 20,
    reason: 'إيداع إضافي أثناء الوردية',
    actor: admin
  });
  assert.ok(adj1.success, 'Adjustment +20 must succeed');

  // 6. Check expected cash before closing (100 + 500 - 50 + 20 = 570)
  const cur = db.currentShift();
  console.log('Before closing - Expected cash:', cur.expected_cash, '(Expected: 570)');
  assert.strictEqual(cur.expected_cash, 570, 'Expected cash before closing must be 570');

  // 7. Close shift with actual cash = 570
  const closeRes = db.closeShift(shiftId, 570, 'إغلاق نظامي', admin);
  assert.ok(closeRes.success, 'Close shift must succeed');
  console.log('At closing - Expected:', closeRes.expectedCash, 'Actual:', closeRes.actualCash, 'Difference:', closeRes.cashDifference);
  assert.strictEqual(closeRes.expectedCash, 570, 'Closing expected cash must be 570');
  assert.strictEqual(closeRes.actualCash, 570, 'Actual cash must be 570');
  assert.strictEqual(closeRes.cashDifference, 0, 'Cash difference at close must be 0');

  // 8. Verify cashier cannot adjust closed shift
  const cashier = { id: 99, name: 'كاشير', role: 'cashier' };
  let cashierBlocked = false;
  try {
    db.addShiftAdjustment({
      shiftId,
      type: 'out',
      amount: 30,
      reason: 'سحب كاشير',
      actor: cashier
    });
  } catch (err) {
    cashierBlocked = true;
    console.log('Cashier adjustment on closed shift correctly rejected:', err.message);
  }
  assert.ok(cashierBlocked, 'Non-admin must be rejected from adjusting a closed shift');

  // Ensure post-close adjustment timestamp is strictly after closed_at
  await new Promise((r) => setTimeout(r, 15));

  // 9. Admin adds retroactive adjustment of -30 LE (out) after shift close
  const adj2 = db.addShiftAdjustment({
    shiftId,
    type: 'out',
    amount: 30,
    reason: 'تسوية لاحقة بعد الإغلاق',
    actor: admin
  });
  assert.ok(adj2.success, 'Admin adjustment -30 on closed shift must succeed');

  // 10. Check Shift in DB table: closing snapshot MUST remain immutable (570 / 570 / 0)
  const shiftDb = db.queryGet('SELECT closing_cash, actual_cash, cash_difference FROM shifts WHERE id = ?', [shiftId]);
  console.log('After retroactive -30 LE in DB (Closing Snapshot):', shiftDb);
  assert.strictEqual(Number(shiftDb.closing_cash), 570, 'Immutable closing snapshot closing_cash MUST remain 570');
  assert.strictEqual(Number(shiftDb.actual_cash), 570, 'Immutable closing snapshot actual_cash MUST remain 570 (never overwritten!)');
  assert.strictEqual(Number(shiftDb.cash_difference), 0, 'Immutable closing snapshot cash_difference MUST remain 0');

  // 11. Check audit_log recorded the retroactive adjustment
  const auditRow = db.queryGet(
    "SELECT * FROM audit_log WHERE action = 'shift_adjustment' AND entity_id = ? ORDER BY id DESC LIMIT 1",
    [shiftId]
  );
  assert.ok(auditRow, 'Retroactive adjustment must be logged in audit_log');
  assert.ok(auditRow.details.includes('30'), 'audit_log details must include adjustment amount 30');

  // 12. Check getReportShift report output:
  // - Closing snapshot: closing_cash = 570, actual_cash = 570, cash_difference = 0
  // - Post-close adjustments: post_close_adjustments has 1 entry (-30), post_close_adjustments_total = -30
  // - Updated expected cash: updated_expected_cash = 540
  // - Final cash difference: final_cash_difference = 570 - 540 = +30 (surplus)
  const rep = db.getReportShift({ shiftId });
  console.log('Report output after retroactive adjustment:', {
    closing_cash: rep.shift.closing_cash,
    actual_cash: rep.shift.actual_cash,
    cash_difference: rep.shift.cash_difference,
    post_close_adjustments_total: rep.shift.post_close_adjustments_total,
    updated_expected_cash: rep.shift.updated_expected_cash,
    final_cash_difference: rep.shift.final_cash_difference,
    postCloseAdjustmentsCount: Array.isArray(rep.postCloseAdjustments) ? rep.postCloseAdjustments.length : 0
  });

  assert.strictEqual(Number(rep.shift.closing_cash), 570, 'Report closing_cash snapshot must be 570');
  assert.strictEqual(Number(rep.shift.actual_cash), 570, 'Report actual_cash must be 570');
  assert.strictEqual(Number(rep.shift.cash_difference), 0, 'Report closing cash_difference snapshot must be 0');
  assert.strictEqual(Number(rep.shift.post_close_adjustments_total), -30, 'Report post_close_adjustments_total must be -30');
  assert.strictEqual(Number(rep.shift.updated_expected_cash), 540, 'Report updated_expected_cash must be 540');
  assert.strictEqual(Number(rep.shift.final_cash_difference), 30, 'Report final_cash_difference must be +30 (570 - 540)');
  assert.ok(Array.isArray(rep.postCloseAdjustments) && rep.postCloseAdjustments.length === 1, 'Report must separate postCloseAdjustments (1 entry)');
  assert.strictEqual(rep.postCloseAdjustments[0].is_post_close, true, 'Post-close adjustment must be flagged is_post_close = true');

  console.log('✅ TEST PASSED: Closing snapshot is 100% immutable and post-close adjustments are tracked separately!');

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
