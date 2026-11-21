/**
 * Test Item 2: Global isDirty Hash Audit for ALL Exported Functions in electron/db.js
 * Compares SHA-256 hash of safeDbExport() before and after calling on a seeded DB.
 * Verifies:
 * - Mutating functions change hash, set isDirty=true, persist to disk after flushDb and reload.
 * - Read-only functions leave hash unchanged, keep isDirty=false.
 * Generates an exhaustive markdown table.
 */
process.env.CAFE_TEST_AUTOMATION = '1';
process.env.CAFE_QUICK_INIT = '1';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert');

function getDbHash(db) {
  const bytes = db.safeDbExport();
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function run() {
  console.log('=== TEST ITEM 2: Global isDirty Hash Audit for ALL Exported db.js Functions ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-hash-audit-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');
  process.env.TEST_DB_PATH = testDbPath;
  process.env.CAFE_DATA_DIR = tempDir;

  const db = require('../electron/db');
  await db.init(testDbPath);

  // Seed baseline data
  db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
  const admin = db.queryGet('SELECT id, name, username, role FROM users WHERE role = "admin" LIMIT 1');
  const shift = db.openShift(1000, 'افتتاح وردية', admin, 'الشيفت الصباحي');
  const cat = db.saveCategory({ name: 'مشروبات ساخنة', sort_order: 1 });
  const sec = db.saveSection({ name: 'الصالة الرئيسية', sort_order: 1 });
  const tbl = db.saveTable({ name: 'طاولة 1', number: 1, capacity: 4, section_id: sec.id });
  const prod = db.saveProduct({ name: 'شاي كشري', price: 15, category_id: cat.id, stock_qty: 100 });
  db.flushDb();

  const auditResults = [];

  async function auditEntry(name, type, runner, options = {}) {
    db.flushDb(); // start clean
    assert.strictEqual(db.isDbDirty(), false, `Precondition: ${name} must start with isDirty=false`);
    const hashBefore = getDbHash(db);

    let error = null;
    try {
      runner(db);
    } catch (err) {
      error = err.message;
    }

    const hashAfter = getDbHash(db);
    const hashChanged = hashBefore !== hashAfter;
    const dirtyAfter = db.isDbDirty();

    let status = 'PASS';
    let notes = '';

    if (error) {
      status = 'ERROR';
      notes = `Exception: ${error}`;
    } else if (type === 'MUTATING') {
      if (!hashChanged) {
        status = 'FAIL';
        notes = 'Hash unchanged on mutating operation';
      } else if (options.immediateSync) {
        // Immediate sync: function guarantees instant disk persistence (Prompt 5 Item 3)
        const diskBytes = fs.readFileSync(testDbPath);
        const diskHash = crypto.createHash('sha256').update(diskBytes).digest('hex');
        if (diskHash !== hashAfter) {
          status = 'FAIL';
          notes = 'Immediate sync function failed to write directly to physical disk';
        } else {
          notes = 'Instant persistence: written directly to disk, hash verified';
        }
      } else if (!dirtyAfter) {
        status = 'FAIL';
        notes = 'isDirty was false after mutation';
      } else {
        // Test flushDb and disk persistence across reload
        db.flushDb();
        if (db.isDbDirty()) {
          status = 'FAIL';
          notes = 'isDirty remained true after flushDb';
        } else {
          // Verify physical disk file reload has matching state
          const diskBytes = fs.readFileSync(testDbPath);
          const diskHash = crypto.createHash('sha256').update(diskBytes).digest('hex');
          if (diskHash !== hashAfter) {
            status = 'FAIL';
            notes = 'Disk hash did not match in-memory hash after flushDb';
          } else {
            notes = 'Hash changed, isDirty=true, disk flushed and verified';
          }
        }
      }
    } else if (type === 'READ_ONLY') {
      if (hashChanged) {
        status = 'FAIL';
        notes = 'Hash unexpectedly changed on read-only call';
      } else if (dirtyAfter) {
        status = 'FAIL';
        notes = 'isDirty unexpectedly true on read-only call';
      } else {
        notes = 'Read-only: hash unchanged, isDirty=false';
      }
    }

    auditResults.push({ name, type, status, hashChanged, isDirty: dirtyAfter, notes });
  }

  // --- MUTATING FUNCTIONS ---
  await auditEntry('saveProduct', 'MUTATING', (d) => d.saveProduct({ name: 'قهوة تركي', price: 25, category_id: cat.id, stock_qty: 50 }));
  await auditEntry('saveCategory', 'MUTATING', (d) => d.saveCategory({ name: 'عصائر طازجة', sort_order: 2 }));
  await auditEntry('saveSection', 'MUTATING', (d) => d.saveSection({ name: 'الرووف', sort_order: 2 }));
  await auditEntry('saveTable', 'MUTATING', (d) => d.saveTable({ name: 'طاولة 2', number: 2, capacity: 6, section_id: sec.id }));
  await auditEntry('updateTableStatus', 'MUTATING', (d) => d.updateTableStatus(tbl.id, 'occupied'));
  await auditEntry('saveTableCart (debounced cashier cart)', 'MUTATING', (d) => d.saveTableCart(tbl.id, { cart: [{ id: prod.id, name: prod.name, price: 15, qty: 2 }], _rev: 0 }, { debounce: true }));
  await auditEntry('appendItemsToTableCart (waiter/QR instant persistence)', 'MUTATING', (d) => d.appendItemsToTableCart(tbl.id, [{ id: prod.id, name: prod.name, price: 15, qty: 1 }]), { immediateSync: true });
  await auditEntry('createOrder', 'MUTATING', (d) => d.createOrder({
    items: [{ id: prod.id, name: prod.name, price: 15, qty: 2 }],
    total: 30, subtotal: 30, paymentMethod: 'cash', amountPaid: 30,
    orderType: 'takeaway', shiftId: shift.id, user: admin
  }));
  const lastOrder = db.queryGet('SELECT id FROM orders ORDER BY id DESC LIMIT 1');
  await auditEntry('cancelOrder', 'MUTATING', (d) => d.cancelOrder(lastOrder.id, 'تجربة إلغاء', admin, 'cash', true));
  await auditEntry('restoreOrder', 'MUTATING', (d) => d.restoreOrder(lastOrder.id, admin));
  await auditEntry('addExpense', 'MUTATING', (d) => d.addExpense({
    amount: 50, category: 'مشتريات خامات', notes: 'شراء شاي', shiftId: shift.id, userId: admin.id, userName: admin.name, force: true
  }));
  const lastExp = db.queryGet('SELECT id FROM expenses ORDER BY id DESC LIMIT 1');
  await auditEntry('updateExpense', 'MUTATING', (d) => d.updateExpense({
    id: lastExp.id, amount: 55, category: 'مشتريات خامات', notes: 'تعديل شاي', actor: admin, adminPassword: 'AdminPass123!@#'
  }));
  await auditEntry('deleteExpense', 'MUTATING', (d) => d.deleteExpense(lastExp.id, admin, 'AdminPass123!@#'));
  await auditEntry('saveUser', 'MUTATING', (d) => d.saveUser({ username: 'cashier_audit', name: 'كاشير تجريبي', password: 'CashierPass123!', role: 'cashier' }));
  const testCashier = db.queryGet('SELECT id FROM users WHERE username = "cashier_audit"');
  await auditEntry('changePassword', 'MUTATING', (d) => d.changePassword({ userId: testCashier.id, currentPassword: 'CashierPass123!', newPassword: 'NewPass123456!' }));
  await auditEntry('addShiftAdjustment', 'MUTATING', (d) => d.addShiftAdjustment({ shiftId: shift.id, type: 'in', amount: 20, reason: 'زيادة في الدرج', actor: admin }));
  await auditEntry('addEmployeeAdjustment', 'MUTATING', (d) => d.addEmployeeAdjustment({ userId: testCashier.id, type: 'bonus', amount: 100, reason: 'مكافأة' }));
  await auditEntry('saveCustomerDetails', 'MUTATING', (d) => d.saveCustomerDetails({ name: 'عميل تدقيق', phone: '01099999999', address: 'القاهرة' }));
  await auditEntry('payDebt', 'MUTATING', (d) => {
    db.runSql('INSERT INTO customer_debts (order_id, customer_name, total_amount, paid_amount, remaining_amount, status, created_at) VALUES (1, "عميل", 100, 0, 100, "unpaid", "2026-01-01T00:00:00Z")');
    const dRow = db.queryGet('SELECT id FROM customer_debts ORDER BY id DESC LIMIT 1');
    return d.payDebt(dRow.id, 50, 'دفعة جزئية', 'cash');
  });
  await auditEntry('saveSettings', 'MUTATING', (d) => d.saveSettings({ cafe_name: 'كافيه التدقيق العالمي' }));
  await auditEntry('savePinLockoutState', 'MUTATING', (d) => d.savePinLockoutState({ count: 1, windowStart: Date.now(), lockedUntil: 0 }));
  await auditEntry('toggleTableQr', 'MUTATING', (d) => d.toggleTableQr(tbl.id, false));
  await auditEntry('regenerateTableQrToken', 'MUTATING', (d) => d.regenerateTableQrToken(tbl.id));
  await auditEntry('resetClockGuard', 'MUTATING', (d) => d.resetClockGuard({ adminPassword: 'AdminPass123!@#', actor: admin }));

  // --- READ-ONLY FUNCTIONS ---
  await auditEntry('listProducts', 'READ_ONLY', (d) => d.listProducts());
  await auditEntry('listCategories', 'READ_ONLY', (d) => d.listCategories());
  await auditEntry('listSections', 'READ_ONLY', (d) => d.listSections());
  await auditEntry('listTables', 'READ_ONLY', (d) => d.listTables());
  await auditEntry('getTableCarts', 'READ_ONLY', (d) => d.getTableCarts());
  await auditEntry('getOrder', 'READ_ONLY', (d) => d.getOrder(lastOrder.id));
  await auditEntry('listOrders', 'READ_ONLY', (d) => d.listOrders({ limit: 10 }));
  await auditEntry('listExpenses', 'READ_ONLY', (d) => d.listExpenses());
  await auditEntry('currentShift', 'READ_ONLY', (d) => d.currentShift());
  await auditEntry('listShifts', 'READ_ONLY', (d) => d.listShifts());
  await auditEntry('computeShiftCash', 'READ_ONLY', (d) => d.computeShiftCash(shift.id));
  await auditEntry('listUsers', 'READ_ONLY', (d) => d.listUsers());
  await auditEntry('listPublicUsers', 'READ_ONLY', (d) => d.listPublicUsers());
  await auditEntry('getUser', 'READ_ONLY', (d) => d.getUser(admin.id));
  await auditEntry('hasAdminUser', 'READ_ONLY', (d) => d.hasAdminUser());
  await auditEntry('listStockMovements', 'READ_ONLY', (d) => d.listStockMovements());
  await auditEntry('listAuditLog', 'READ_ONLY', (d) => d.listAuditLog());
  await auditEntry('listCustomers', 'READ_ONLY', (d) => d.listCustomers());
  await auditEntry('listDebts', 'READ_ONLY', (d) => d.listDebts());
  await auditEntry('listDebtsGroupedByCustomer', 'READ_ONLY', (d) => d.listDebtsGroupedByCustomer());
  await auditEntry('getDashboardStats', 'READ_ONLY', (d) => d.getDashboardStats());
  await auditEntry('getReportSales', 'READ_ONLY', (d) => d.getReportSales({ startDate: '2026-01-01', endDate: '2026-12-31' }));
  await auditEntry('getReportInventory', 'READ_ONLY', (d) => d.getReportInventory());
  await auditEntry('getReportShift', 'READ_ONLY', (d) => d.getReportShift(shift.id));
  await auditEntry('getDailySummaryReport', 'READ_ONLY', (d) => d.getDailySummaryReport('2026-11-09'));
  await auditEntry('getSettings', 'READ_ONLY', (d) => d.getSettings());
  await auditEntry('getPinLockoutState', 'READ_ONLY', (d) => d.getPinLockoutState());
  await auditEntry('getMachineId', 'READ_ONLY', (d) => d.getMachineId());
  await auditEntry('getLicenseStatus', 'READ_ONLY', (d) => d.getLicenseStatus());
  await auditEntry('isEgyptDST', 'READ_ONLY', (d) => d.isEgyptDST(new Date()));
  await auditEntry('toCairoDateString', 'READ_ONLY', (d) => d.toCairoDateString(new Date().toISOString()));
  await auditEntry('isDbDirty', 'READ_ONLY', (d) => d.isDbDirty());

  // Generate Markdown Table
  console.log('\n### Global isDirty & DB Export Hash Audit Matrix (All Tested Functions)\n');
  console.log('| Function Name | Classification | Hash Changed? | isDirty Expected? | Result | Notes |');
  console.log('| :--- | :--- | :---: | :---: | :---: | :--- |');
  let totalPass = 0;
  let totalFail = 0;
  for (const r of auditResults) {
    if (r.status === 'PASS') totalPass++; else totalFail++;
    const hashMark = r.hashChanged ? 'YES' : 'NO';
    const dirtyMark = r.isDirty ? 'TRUE' : 'FALSE';
    const statusMark = r.status === 'PASS' ? 'PASS' : `FAIL (${r.status})`;
    console.log(`| \`${r.name}\` | ${r.type} | ${hashMark} | ${dirtyMark} | ${statusMark} | ${r.notes} |`);
  }

  console.log(`\nAudit Summary: ${totalPass} Passed, ${totalFail} Failed out of ${auditResults.length} audited functions.`);
  assert.strictEqual(totalFail, 0, 'All functions must pass hash and isDirty invariants');

  // Clean up
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  console.log('\n--- ALL GLOBAL ISDIRTY HASH AUDIT TESTS PASSED (GREEN) ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
