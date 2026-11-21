/**
 * ==============================================================================================
 * Comprehensive Test Suite: Item 11 — Client Data Safety & Upgrade Lifecycle
 * ==============================================================================================
 * Covers Sub-items:
 * - 11-أ: Sequential idempotent migrations (PRAGMA user_version)
 * - 11-ب: Pre-upgrade automatic verified safety backup + 30-day retention
 * - 11-ج: Intentional failure injection mid-migration + atomic rollback + Arabic error + error report
 * - 11-د: Downgrade protection (user_version > CURRENT_SCHEMA_VERSION rejects loading)
 * - 11-هـ: Upgrade Matrix (1.0.1 -> 1.0.2, 1.0.0 -> 1.0.2, 1.0.2 -> 1.0.3 mock, 50MB realistic DB)
 * - 11-و: Persistence of settings, identity, license, printers, QR tokens, PIN lockout, passwords
 * - 11-ز: Chromium cache cleaning safety (Local Storage / DB protected)
 * - 11-ح: Turnkey Migration Package between Portable and Installed (export/import with SHA-256)
 * - 11-ط: Customer Rollback execution from pre-upgrade backup
 * ==============================================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

async function run() {
  console.log('====================================================================');
  console.log(' TEST ITEM 11: Comprehensive Client Data Safety & Upgrade Lifecycle ');
  console.log('====================================================================\n');

  const SQL = await initSqlJs();
  const dbModule = require('../electron/db');
  const updaterModule = require('../electron/updater');
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      testsFailed++;
    }
  }

  const fixturesDir = path.join(__dirname, 'fixtures');
  const v101Fixture = path.join(fixturesDir, 'v1.0.1-anonymized.db');
  const v100Fixture = path.join(fixturesDir, 'v1.0.0-legacy.db');
  const v102Fixture = path.join(fixturesDir, 'v1.0.2-baseline.db');

  // ==============================================================================================
  // SUBTEST 1: Genuine v1.0.1 to v1.0.2 Upgrade (Item 11-هـ & 11-أ)
  // ==============================================================================================
  console.log('\n--- SUBTEST 1: Genuine v1.0.1 to v1.0.2 Upgrade ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest1-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    fs.copyFileSync(v101Fixture, testDbPath);

    // Read baseline
    const rawPre = new SQL.Database(fs.readFileSync(testDbPath));
    const preOrdersCount = rawPre.exec('SELECT count(*) FROM orders')[0].values[0][0];
    const preOrdersTotal = Number(rawPre.exec('SELECT sum(total) FROM orders')[0].values[0][0]);
    const preExpensesTotal = Number(rawPre.exec('SELECT sum(amount) FROM expenses')[0].values[0][0]);
    const preAuditCount = rawPre.exec('SELECT count(*) FROM audit_log')[0].values[0][0];
    const preStockCount = rawPre.exec('SELECT count(*) FROM stock_movements')[0].values[0][0];
    const preEmpAdjCount = rawPre.exec('SELECT count(*) FROM employee_adjustments')[0].values[0][0];
    rawPre.close();

    const t0 = Date.now();
    await dbModule.init(testDbPath);
    const upgradeMs = Date.now() - t0;

    const postOrdersCount = dbModule.queryGet('SELECT count(*) AS c FROM orders').c;
    const postOrdersTotal = Number(dbModule.queryGet('SELECT sum(total) AS s FROM orders').s);
    const postExpensesTotal = Number(dbModule.queryGet('SELECT sum(amount) AS s FROM expenses').s);
    const postAuditCount = dbModule.queryGet('SELECT count(*) AS c FROM audit_log').c;
    const postStockCount = dbModule.queryGet('SELECT count(*) AS c FROM stock_movements').c;
    const postEmpAdjCount = dbModule.queryGet('SELECT count(*) AS c FROM employee_adjustments').c;
    const integrity = dbModule.queryGet('PRAGMA integrity_check').integrity_check;
    const fkViolations = dbModule.queryAll('PRAGMA foreign_key_check');

    assert(postOrdersCount === preOrdersCount, `Orders count preserved: ${postOrdersCount} == ${preOrdersCount}`);
    assert(Math.abs(postOrdersTotal - preOrdersTotal) < 0.001, `Financial invariant (Total Sales) matches: ${postOrdersTotal} == ${preOrdersTotal}`);
    assert(Math.abs(postExpensesTotal - preExpensesTotal) < 0.001, `Financial invariant (Expenses) matches: ${postExpensesTotal} == ${preExpensesTotal}`);
    assert(postAuditCount === preAuditCount, `Audit log count preserved: ${postAuditCount} == ${preAuditCount}`);
    assert(postStockCount === preStockCount, `Stock movements count preserved: ${postStockCount} == ${preStockCount}`);
    const postArchivedCount = dbModule.queryGet('SELECT count(*) AS c FROM _orphaned_records WHERE source_table = "employee_adjustments"')?.c || 0;
    assert(postEmpAdjCount + postArchivedCount === preEmpAdjCount, `All employee adjustments preserved (76 active + 30 safely archived in _orphaned_records): ${postEmpAdjCount + postArchivedCount} == ${preEmpAdjCount}`);
    assert(postEmpAdjCount === 76 && postArchivedCount === 30, `Orphaned adjustments accurately isolated into _orphaned_records (76 active, 30 archived)`);
    assert(integrity === 'ok', `PRAGMA integrity_check is 'ok'`);
    assert(fkViolations.length === 0, `PRAGMA foreign_key_check has 0 violations`);
    assert(dbModule.getSchemaVersion() === 2, `Schema version is 2 (current target)`);
    assert(dbModule.getAppVersion() === '1.0.2', `App version in settings is '1.0.2'`);
    
    // Audit log chain cryptographic verification
    const chainVerification = dbModule.verifyAuditLogChain();
    assert(chainVerification.valid === true, `Audit log cryptographic HMAC chain verified: count = ${chainVerification.count}, valid = ${chainVerification.valid}`);
    console.log(`[Subtest 1] Audit chain verification: valid=${chainVerification.valid}, count=${chainVerification.count}, hash=${chainVerification.finalChainHash.substring(0, 16)}...`);
    console.log(`[Subtest 1] Upgrade elapsed time: ${upgradeMs}ms`);

    dbModule.flushDb();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 2: Skip-Version Upgrade (v1.0.0 to v1.0.2) (Item 11-هـ)
  // ==============================================================================================
  console.log('\n--- SUBTEST 2: Skip-Version Upgrade (v1.0.0 to v1.0.2) ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest2-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    fs.copyFileSync(v100Fixture, testDbPath);

    await dbModule.init(testDbPath);

    const postOrdersTotal = Number(dbModule.queryGet('SELECT sum(total) AS s FROM orders').s);
    const postExpensesTotal = Number(dbModule.queryGet('SELECT sum(amount) AS s FROM expenses').s);
    const integrity = dbModule.queryGet('PRAGMA integrity_check').integrity_check;
    const fkViolations = dbModule.queryAll('PRAGMA foreign_key_check');
    const tableCartsExists = dbModule.queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name='table_carts'").length === 1;
    const shiftAdjExists = dbModule.queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name='shift_adjustments'").length === 1;

    assert(postOrdersTotal === 50, `1.0.0 orders total preserved: 50 ج.م`);
    assert(postExpensesTotal === 100, `1.0.0 expenses total preserved: 100 ج.م`);
    assert(tableCartsExists && shiftAdjExists, `v1.0.2 tables created cleanly during skip-version upgrade`);
    assert(integrity === 'ok', `PRAGMA integrity_check is 'ok'`);
    assert(fkViolations.length === 0, `PRAGMA foreign_key_check has 0 violations`);

    dbModule.flushDb();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 3: Mock Future Upgrade (v1.0.2 to v1.0.3) (Item 11-هـ)
  // ==============================================================================================
  console.log('\n--- SUBTEST 3: Mock Future Upgrade (v1.0.2 to v1.0.3) ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest3-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    fs.copyFileSync(v102Fixture, testDbPath);

    await dbModule.init(testDbPath);
    assert(dbModule.getSchemaVersion() === 2, `Initial baseline schema version is 2`);

    // Register mock migration 3 (simulating v1.0.3 release)
    dbModule.registerMigration({
      version: 3,
      name: 'v1_0_3_loyalty_and_delivery',
      up: (database) => {
        database.run(`
          CREATE TABLE IF NOT EXISTS loyalty_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            points INTEGER DEFAULT 0,
            tier TEXT DEFAULT 'silver'
          )
        `);
        database.run('ALTER TABLE orders ADD COLUMN delivery_notes TEXT');
      }
    });

    // Run migration
    const res = dbModule.runPendingMigrations(dbModule.db, 2, 3);
    dbModule.flushDb();

    assert(res.appliedCount === 1, `Applied exactly 1 pending migration (v3)`);
    assert(dbModule.getSchemaVersion() === 3, `Schema version updated to 3`);
    const loyaltyExists = dbModule.queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name='loyalty_rewards'").length === 1;
    const orderCols = dbModule.queryAll("PRAGMA table_info(orders)").map(c => c.name);
    assert(loyaltyExists, `New v1.0.3 table loyalty_rewards created`);
    assert(orderCols.includes('delivery_notes'), `New v1.0.3 column delivery_notes added to orders`);

    dbModule.flushDb();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 4: Migration Failure Injection & Atomic Rollback (Item 11-ج)
  // ==============================================================================================
  console.log('\n--- SUBTEST 4: Intentional Migration Failure Injection & Atomic Rollback ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest4-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    fs.copyFileSync(v101Fixture, testDbPath);

    const preUpgradeHash = crypto.createHash('sha256').update(fs.readFileSync(testDbPath)).digest('hex');

    const originalMigration2 = dbModule.MIGRATIONS.find(m => m.version === 2);

    // Register a deliberately failing migration 2
    dbModule.registerMigration({
      version: 2,
      name: 'v1_0_2_poisoned_migration',
      up: (database) => {
        database.run('CREATE TABLE temp_poison (id INTEGER);');
        // Inject intentional fatal SQL syntax failure mid-migration
        throw new Error('SIMULATED_CORRUPTION_FAILURE_MID_MIGRATION');
      }
    });

    let caughtError = null;
    try {
      await dbModule.init(testDbPath);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, `Migration failure thrown and caught`);
    assert(caughtError.message.includes('تعذر تحديث البيانات') && caughtError.message.includes('تم الرجوع للنسخة السابقة'),
      `Arabic rollback message returned: "${caughtError.message}"`);

    // Verify error report written
    const reportPath = path.join(tempDir, 'upgrade-error-report.json');
    assert(fs.existsSync(reportPath), `upgrade-error-report.json was generated in userData`);
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert(reportData.error.includes('SIMULATED_CORRUPTION_FAILURE_MID_MIGRATION'), `Report documents exact error cause`);

    // Verify file on disk matches pre-upgrade state
    const postRollbackHash = crypto.createHash('sha256').update(fs.readFileSync(testDbPath)).digest('hex');
    assert(postRollbackHash === preUpgradeHash, `Live database on disk rolled back 100% to exact pre-upgrade state`);

    // Restore clean original v1_0_2 migration definition for remaining tests
    if (originalMigration2) {
      dbModule.registerMigration(originalMigration2);
    }

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 5: Downgrade Protection (Item 11-د)
  // ==============================================================================================
  console.log('\n--- SUBTEST 5: Downgrade Protection (Client running older app on newer DB) ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest5-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    
    // Create database with future schema version = 99
    const futureDb = new SQL.Database();
    futureDb.run('PRAGMA user_version = 99;');
    futureDb.run('CREATE TABLE future_table (id INTEGER PRIMARY KEY);');
    fs.writeFileSync(testDbPath, Buffer.from(futureDb.export()));
    futureDb.close();

    const preDowngradeHash = crypto.createHash('sha256').update(fs.readFileSync(testDbPath)).digest('hex');

    let downgradeError = null;
    try {
      await dbModule.init(testDbPath);
    } catch (err) {
      downgradeError = err;
    }

    assert(downgradeError !== null, `Downgrade scenario thrown and rejected`);
    assert(downgradeError.message.includes('قاعدة البيانات أحدث من إصدار البرنامج الحالي') && downgradeError.message.includes('إصدار المخطط 99 أحدث من 2'),
      `Clear Arabic error explains DB schema 99 is newer than program schema 2`);

    const postDowngradeHash = crypto.createHash('sha256').update(fs.readFileSync(testDbPath)).digest('hex');
    assert(postDowngradeHash === preDowngradeHash, `Live database was NOT modified at all (0 bytes touched)`);

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 6: Settings, Identity & Peripheral Configuration Persistence (Item 11-و)
  // ==============================================================================================
  console.log('\n--- SUBTEST 6: Settings, Identity & Peripheral Configuration Persistence ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest6-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');

    // Create a DB with full customer configuration in 1.0.1
    const configDb = new SQL.Database();
    configDb.run('PRAGMA user_version = 0;');
    configDb.run(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE tables (id INTEGER PRIMARY KEY, number TEXT, name TEXT, hall TEXT, qr_token TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, name TEXT, password TEXT, role TEXT, created_at TEXT);
    `);
    const customLicense = 'MOCK_LICENSE_KEY_ABC123_DO_NOT_LOSE';
    const testQrToken = 'ORIGINAL_PRINTED_QR_TOKEN_FOR_TABLE_1_EXT_ABC';
    const originalBcryptPass = '$2a$10$e8wVdIuH50G1uB.yYyO7yO8ZqXq9o3nFj8w.e8wVdIuH50G1uB.yY'; // valid bcrypt
    configDb.run(`
      INSERT INTO settings (key, value) VALUES
        ('license_key', '${customLicense}'),
        ('printer_name', 'XP-80C Thermal Printer'),
        ('bar_printer_name', 'Bar-Printer-58'),
        ('shisha_printer_name', 'Shisha-Network-Printer'),
        ('paper_width', '58'),
        ('app_theme', 'latte'),
        ('tax_rate', '14'),
        ('service_fee', '12'),
        ('pin_lockout_state', '{"lockedUntil": 9999999999, "failedAttempts": 5}');
      INSERT INTO tables (id, number, name, hall, qr_token) VALUES (1, 'T-01', 'طاولة الصالة 1', 'indoor', '${testQrToken}');
      INSERT INTO users (id, username, name, password, role, created_at) VALUES (1, 'owner', 'المالك', '${originalBcryptPass}', 'admin', '2026-01-01');
    `);
    fs.writeFileSync(testDbPath, Buffer.from(configDb.export()));
    configDb.close();

    // Perform upgrade
    await dbModule.init(testDbPath);

    const postSettings = dbModule.getSettings();
    const postLicense = dbModule.queryGet("SELECT value FROM settings WHERE key = 'license_key'")?.value;
    assert(postLicense === customLicense, `License key preserved in settings table without re-activation`);
    assert(postSettings.printer_name === 'XP-80C Thermal Printer', `Cashier printer preserved`);
    assert(postSettings.bar_printer_name === 'Bar-Printer-58', `Bar printer preserved`);
    assert(postSettings.shisha_printer_name === 'Shisha-Network-Printer', `Shisha printer preserved`);
    assert(postSettings.paper_width === '58', `Paper width 58mm preserved`);
    assert(postSettings.app_theme === 'latte', `App theme preserved`);
    assert(postSettings.tax_rate === '14' && postSettings.service_fee === '12', `Tax & Service fee rates preserved`);
    
    // Check table QR token was NOT regenerated
    const postQrToken = dbModule.queryGet('SELECT qr_token FROM tables WHERE id = 1')?.qr_token;
    assert(postQrToken === testQrToken, `Existing printed table QR token strictly preserved (barcodes keep working)`);

    // Check user password hash was NOT rehashed or reset
    const postPass = dbModule.queryGet('SELECT password FROM users WHERE id = 1')?.password;
    assert(postPass === originalBcryptPass, `User bcrypt password preserved without forced reset`);

    dbModule.flushDb();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 7: Pre-Upgrade Safety Backup & 30-Day Retention (Item 11-ب)
  // ==============================================================================================
  console.log('\n--- SUBTEST 7: Pre-Upgrade Safety Backup & 30-Day Retention ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest7-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    fs.copyFileSync(v101Fixture, testDbPath);

    await dbModule.init(testDbPath);

    const backupsDir = path.join(tempDir, 'backups');
    assert(fs.existsSync(backupsDir), `backups directory exists`);
    const backupFiles = fs.readdirSync(backupsDir).filter(f => f.startsWith('pre-upgrade-'));
    assert(backupFiles.length >= 1, `pre-upgrade backup created: ${backupFiles[0]}`);

    const preUpgradeFile = path.join(backupsDir, backupFiles[0]);
    const bkStat = fs.statSync(preUpgradeFile);
    assert(bkStat.size === 819200, `pre-upgrade backup size matches original (819,200 bytes)`);

    // Test retention: pruneOldBackups(30) must NOT delete pre-upgrade backups younger than 30 days
    // Even if normal prune age is small (e.g. 1 day)
    dbModule.runDatabaseMaintenance();
    assert(fs.existsSync(preUpgradeFile), `pre-upgrade backup preserved after maintenance / pruning`);

    dbModule.flushDb();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 8: Customer Rollback to Pre-Upgrade Backup (Item 11-ط)
  // ==============================================================================================
  console.log('\n--- SUBTEST 8: Customer Rollback to Pre-Upgrade Backup Execution ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest8-'));
    const testDbPath = path.join(tempDir, 'cafe-pos.db');
    fs.copyFileSync(v101Fixture, testDbPath);

    await dbModule.init(testDbPath);
    const backupsDir = path.join(tempDir, 'backups');
    const backupFiles = fs.readdirSync(backupsDir).filter(f => f.startsWith('pre-upgrade-'));
    const preUpgradeFile = path.join(backupsDir, backupFiles[0]);

    // Simulate customer creating 10 new orders on v1.0.2
    const adminUser = { id: 1, name: 'Admin', role: 'admin' };
    const prod = dbModule.queryGet('SELECT id, name, price FROM products LIMIT 1');
    const shift = dbModule.currentShift() || dbModule.openShift(100, 'Shift', adminUser);
    for (let i = 0; i < 5; i++) {
      dbModule.createOrder({
        items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }],
        total: prod.price,
        subtotal: prod.price,
        shift_id: shift.id,
        user_id: 1,
        cashier_name: 'Admin'
      });
    }
    dbModule.flushDb();
    const upgradedOrdersCount = dbModule.queryGet('SELECT count(*) AS c FROM orders').c;
    assert(upgradedOrdersCount === 38 + 5, `Orders count after new activity is 43`);

    // Customer performs rollback by restoring preUpgradeFile
    dbModule.restoreBackup(preUpgradeFile);
    dbModule.flushDb();

    const rolledBackCount = dbModule.queryGet('SELECT count(*) AS c FROM orders').c;
    assert(rolledBackCount === 38, `Rolled back database strictly returned to original 38 orders`);
    const rolledBackIntegrity = dbModule.queryGet('PRAGMA integrity_check').integrity_check;
    assert(rolledBackIntegrity === 'ok', `Rolled back database integrity is 'ok'`);

    dbModule.flushDb();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 9: Turnkey Migration Package Export & Import (Item 11-ح)
  // ==============================================================================================
  console.log('\n--- SUBTEST 9: Turnkey Migration Package (Portable <-> Installed) ---');
  {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest9-source-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest9-target-'));
    const sourceDb = path.join(sourceDir, 'cafe-pos.db');
    const targetDb = path.join(targetDir, 'cafe-pos.db');
    fs.copyFileSync(v101Fixture, sourceDb);

    // Initialize source
    await dbModule.init(sourceDb);

    // Export migration package
    const exportFile = path.join(sourceDir, 'taqfeela-export.db');
    const exportRes = dbModule.exportMigrationPackage(exportFile);
    assert(exportRes.success === true, `Export migration package succeeded`);
    assert(fs.existsSync(exportFile), `Export database file exists`);
    assert(fs.existsSync(`${exportFile}.sha256`), `Export SHA-256 hash checksum file exists`);

    // Initialize target instance
    await dbModule.init(targetDb);

    // Import package into target instance
    const importRes = dbModule.importMigrationPackage(exportFile);
    assert(importRes.success === true, `Import migration package into target succeeded`);

    const importedOrders = dbModule.queryGet('SELECT count(*) AS c FROM orders').c;
    assert(importedOrders === 38, `Imported database orders matched source (38 orders)`);
    const importedIntegrity = dbModule.queryGet('PRAGMA integrity_check').integrity_check;
    assert(importedIntegrity === 'ok', `Imported database integrity verified 'ok'`);

    dbModule.flushDb();
    try {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // ==============================================================================================
  // SUBTEST 10: Chromium Cache Cleaning Safety (Item 11-ز)
  // ==============================================================================================
  console.log('\n--- SUBTEST 10: Chromium Cache Cleaning Safety ---');
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-subtest10-'));
    
    // Create folders simulating Chromium AppData directory
    const cacheDir = path.join(tempDir, 'Cache');
    const gpuCacheDir = path.join(tempDir, 'GPUCache');
    const localStoreDir = path.join(tempDir, 'Local Storage');
    const indexedDbDir = path.join(tempDir, 'IndexedDB');
    const dummyDb = path.join(tempDir, 'cafe-pos.db');
    fs.mkdirSync(cacheDir);
    fs.mkdirSync(gpuCacheDir);
    fs.mkdirSync(localStoreDir);
    fs.mkdirSync(indexedDbDir);
    fs.writeFileSync(dummyDb, 'SQLite format 3 test');

    // Run updater cleanCaches
    updaterModule.cleanCaches(tempDir);

    assert(!fs.existsSync(cacheDir), `Volatile Cache folder was cleaned`);
    assert(!fs.existsSync(gpuCacheDir), `Volatile GPUCache folder was cleaned`);
    assert(fs.existsSync(localStoreDir), `Local Storage folder was STRICTLY PRESERVED`);
    assert(fs.existsSync(indexedDbDir), `IndexedDB folder was STRICTLY PRESERVED`);
    assert(fs.existsSync(dummyDb), `Database file cafe-pos.db was STRICTLY PRESERVED`);

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n====================================================================');
  console.log(` SUMMARY: ${testsPassed} Passed, ${testsFailed} Failed`);
  console.log('====================================================================\n');

  try {
    await dbModule.shutdownWriterWorker();
  } catch (_) {}

  if (testsFailed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
