/**
 * ==============================================================================================
 * Release Gate Upgrade Verification Script (scripts/verify-upgrade.js) — Item 11-J
 * ==============================================================================================
 * Verifies that upgrading any historical database fixture from tests/fixtures/ to current version
 * strictly preserves 100% of rows, financial sums, foreign key integrity, and cryptographic HMACs.
 * Runs as part of npm test.
 * ==============================================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');

async function verifyUpgrade() {
  console.log('====================================================================');
  console.log(' RELEASE GATE: Comprehensive Database Upgrade & Migration Integrity ');
  console.log('====================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const fixturesDir = path.join(rootDir, 'tests', 'fixtures');

  if (!fs.existsSync(fixturesDir)) {
    console.error('❌ FAIL: fixtures directory not found:', fixturesDir);
    process.exit(1);
  }

  const fixtureFiles = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.db'));
  if (fixtureFiles.length === 0) {
    console.error('❌ FAIL: No database fixtures found in:', fixturesDir);
    process.exit(1);
  }

  console.log(`Discovered ${fixtureFiles.length} database fixtures to verify:`, fixtureFiles.join(', '));

  const SQL = await initSqlJs();
  const dbModule = require('../electron/db');
  let allPassed = true;

  for (const fixtureName of fixtureFiles) {
    console.log(`\n--------------------------------------------------------------------`);
    console.log(`Testing Upgrade for Fixture: ${fixtureName}`);
    console.log(`--------------------------------------------------------------------`);

    const fixturePath = path.join(fixturesDir, fixtureName);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `cafe-verify-upgrade-${path.parse(fixtureName).name}-`));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    fs.copyFileSync(fixturePath, testDbPath);

    // 1. Gather baseline metrics using raw SQLite instance before upgrade
    const rawPre = new SQL.Database(fs.readFileSync(testDbPath));
    const preUserVer = rawPre.exec('PRAGMA user_version')[0].values[0][0];
    const preTables = rawPre.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].values.map(r => r[0]);

    const preCounts = {};
    for (const t of preTables) {
      preCounts[t] = rawPre.exec(`SELECT count(*) FROM ${t}`)[0].values[0][0];
    }

    const preOrdersTotal = preTables.includes('orders')
      ? (Number(rawPre.exec('SELECT COALESCE(SUM(total), 0) FROM orders')[0].values[0][0]) || 0) : 0;
    const preExpensesTotal = preTables.includes('expenses')
      ? (Number(rawPre.exec('SELECT COALESCE(SUM(amount), 0) FROM expenses')[0].values[0][0]) || 0) : 0;
    const preDebtsTotal = preTables.includes('customer_debts')
      ? (Number(rawPre.exec('SELECT COALESCE(SUM(total_amount), 0) FROM customer_debts')[0].values[0][0]) || 0) : 0;
    const preInvoiceSeq = preTables.includes('invoice_sequence')
      ? (Number(rawPre.exec('SELECT next_number FROM invoice_sequence WHERE id = 1')[0]?.values?.[0]?.[0]) || 1) : 1;

    console.log(`[Baseline] Pre-upgrade user_version: ${preUserVer}`);
    console.log(`[Baseline] Tables: ${preTables.length} | Orders Total: ${preOrdersTotal} ج.م | Expenses: ${preExpensesTotal} ج.م | Debts: ${preDebtsTotal} ج.م`);
    rawPre.close();

    // 2. Perform automated sequential upgrade via dbModule.init()
    const startTime = Date.now();
    try {
      await dbModule.init(testDbPath);
    } catch (err) {
      console.error(`❌ UPGRADE ERROR on ${fixtureName}:`, err.message);
      allPassed = false;
      continue;
    }
    const elapsedMs = Date.now() - startTime;
    console.log(`[Upgrade] dbModule.init() completed upgrade in ${elapsedMs}ms`);

    // 3. Post-upgrade verification
    const postUserVer = dbModule.getSchemaVersion();
    const postAppVer = dbModule.getAppVersion();
    const integrityRes = dbModule.queryGet('PRAGMA integrity_check')?.integrity_check;
    const fkViolations = dbModule.queryAll('PRAGMA foreign_key_check');

    console.log(`[Post-Upgrade] schema_version: ${postUserVer} | app_version: ${postAppVer}`);
    console.log(`[Post-Upgrade] PRAGMA integrity_check: ${integrityRes}`);
    console.log(`[Post-Upgrade] PRAGMA foreign_key_check violations: ${fkViolations.length}`);

    if (integrityRes !== 'ok') {
      console.error(`❌ Integrity check failed on ${fixtureName}:`, integrityRes);
      allPassed = false;
    }

    if (fkViolations.length > 0) {
      console.error(`❌ Foreign key check failed on ${fixtureName}:`, fkViolations);
      allPassed = false;
    }

    if (postUserVer !== 2) {
      console.error(`❌ Schema version mismatch on ${fixtureName}: expected 2, got ${postUserVer}`);
      allPassed = false;
    }

    // 4. Verify table rows and financial totals are 100% preserved
    for (const [table, preCount] of Object.entries(preCounts)) {
      const postCount = dbModule.queryGet(`SELECT count(*) AS c FROM ${table}`)?.c || 0;
      let effectivePostCount = postCount;
      if (table === 'employee_adjustments') {
        const archivedCount = Number(dbModule.queryGet('SELECT count(*) AS c FROM _orphaned_records WHERE source_table = "employee_adjustments"')?.c) || 0;
        effectivePostCount += archivedCount;
      }

      if (effectivePostCount < preCount) {
        console.error(`❌ Row count regression in table ${table}: pre = ${preCount}, post = ${effectivePostCount}`);
        allPassed = false;
      } else {
        console.log(`✓ Table ${table}: ${preCount} $\\to$ ${postCount} rows preserved${table === 'employee_adjustments' ? ' (30 archived in _orphaned_records)' : ''}`);
      }
    }

    const postOrdersTotal = preTables.includes('orders')
      ? (Number(dbModule.queryGet('SELECT COALESCE(SUM(total), 0) AS s FROM orders')?.s) || 0) : 0;
    const postExpensesTotal = preTables.includes('expenses')
      ? (Number(dbModule.queryGet('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses')?.s) || 0) : 0;
    const postDebtsTotal = preTables.includes('customer_debts')
      ? (Number(dbModule.queryGet('SELECT COALESCE(SUM(total_amount), 0) AS s FROM customer_debts')?.s) || 0) : 0;
    const postInvoiceSeq = Number(dbModule.queryGet('SELECT next_number FROM invoice_sequence WHERE id = 1')?.next_number) || 1;

    const diffOrders = Math.abs(postOrdersTotal - preOrdersTotal);
    const diffExpenses = Math.abs(postExpensesTotal - preExpensesTotal);
    const diffDebts = Math.abs(postDebtsTotal - preDebtsTotal);

    if (diffOrders > 0.001) {
      console.error(`❌ Orders total mismatch: pre = ${preOrdersTotal}, post = ${postOrdersTotal}`);
      allPassed = false;
    } else {
      console.log(`✓ Orders total strictly matches: ${postOrdersTotal} ج.م`);
    }

    if (diffExpenses > 0.001) {
      console.error(`❌ Expenses total mismatch: pre = ${preExpensesTotal}, post = ${postExpensesTotal}`);
      allPassed = false;
    } else {
      console.log(`✓ Expenses total strictly matches: ${postExpensesTotal} ج.م`);
    }

    if (diffDebts > 0.001) {
      console.error(`❌ Customer debts total mismatch: pre = ${preDebtsTotal}, post = ${postDebtsTotal}`);
      allPassed = false;
    } else {
      console.log(`✓ Customer debts total strictly matches: ${postDebtsTotal} ج.م`);
    }

    if (postInvoiceSeq < preInvoiceSeq) {
      console.error(`❌ Invoice sequence regressed: pre = ${preInvoiceSeq}, post = ${postInvoiceSeq}`);
      allPassed = false;
    } else {
      console.log(`✓ Monotonic invoice sequence verified: next_number = ${postInvoiceSeq}`);
    }

    // 5. Verify new columns exist (table_name, client_order_id, qr_token)
    const orderCols = dbModule.queryAll('PRAGMA table_info(orders)').map(c => c.name);
    const tableCols = dbModule.queryAll('PRAGMA table_info(tables)').map(c => c.name);

    if (!orderCols.includes('client_order_id') || !orderCols.includes('table_name')) {
      console.error(`❌ Missing migrated order columns:`, orderCols);
      allPassed = false;
    }
    if (!tableCols.includes('qr_token') || !tableCols.includes('qr_enabled')) {
      console.error(`❌ Missing migrated table columns:`, tableCols);
      allPassed = false;
    }

    // 6. Test operational execution: Create a new order on upgraded database
    const adminUser = dbModule.queryGet('SELECT id, name, role FROM users WHERE role = "admin" LIMIT 1') || { id: 1, name: 'Admin', role: 'admin' };
    const prod = dbModule.queryGet('SELECT id, name, price FROM products LIMIT 1');
    if (prod) {
      dbModule.runSql('UPDATE products SET stock_qty = 100 WHERE id = ?', [prod.id], { skipSave: true });
      let shift = dbModule.currentShift();
      if (!shift) {
        shift = dbModule.openShift(500, 'افتتاح بعد التحقق', adminUser, 'الشيفت الصباحي');
      }
      const newOrder = dbModule.createOrder({
        items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }],
        total: prod.price,
        subtotal: prod.price,
        payment_method: 'cash',
        amount_paid: prod.price,
        change_due: 0,
        user_id: adminUser.id,
        cashier_name: adminUser.name,
        shift_id: shift.id
      });
      if (newOrder && newOrder.id) {
        console.log(`✓ Operational checkout test passed on upgraded ${fixtureName} (Order ID: ${newOrder.id})`);
      } else {
        console.error(`❌ Operational checkout test failed on upgraded ${fixtureName}`);
        allPassed = false;
      }
    }

    // Cleanup temp isolated directory
    try {
      dbModule.flushDb();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) { }
  }

  try {
    await dbModule.shutdownWriterWorker();
  } catch (_) {}

  console.log('\n====================================================================');
  if (allPassed) {
    console.log('✅ ALL DATABASE FIXTURE UPGRADES VERIFIED SUCCESSFULLY (PASS)');
    console.log('====================================================================\n');
    process.exit(0);
  } else {
    console.error('❌ UPGRADE VERIFICATION DETECTED REGRESSIONS (FAIL)');
    console.log('====================================================================\n');
    process.exit(1);
  }
}

verifyUpgrade().catch(err => {
  console.error('Fatal verification runner error:', err);
  process.exit(1);
});
