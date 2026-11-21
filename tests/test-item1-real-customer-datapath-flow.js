/**
 * Item 1: Real Customer Upgrade Flow & Legacy Data Path Auto-Discovery
 * Simulates:
 * 1. Customer has 1.0.1 installed: userData in %APPDATA%\cafe-pos (and Local Storage leveldb)
 * 2. Customer installs 1.0.2: userData is %APPDATA%\TaqfeelaPOS
 * 3. 1.0.2 automatically discovers legacy DB, verifies integrity, COPIES (does not move),
 *    migrates Local Storage, keeps legacy intact, runs migrations to schema v2,
 *    and preserves 100% of data without manual user intervention.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const initSqlJs = require('sql.js');

async function testCustomerUpgradeFlow() {
  console.log('====================================================================');
  console.log(' ITEM 1: Real Customer Upgrade Flow & Data Path Auto-Discovery      ');
  console.log('====================================================================\n');

  // Simulated Roaming AppData
  const mockAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-appdata-'));
  const legacyDir = path.join(mockAppData, 'cafe-pos');
  const targetDir = path.join(mockAppData, 'TaqfeelaPOS');
  fs.mkdirSync(legacyDir, { recursive: true });

  console.log('[Step 1] Simulating genuine 1.0.1 customer installation:');
  console.log(`- 1.0.1 userData directory: ${legacyDir}`);
  console.log(`- 1.0.2 userData directory: ${targetDir}`);

  // Copy genuine 1.0.1 fixture into legacyDir
  const fixture101 = path.resolve(__dirname, 'fixtures/v1.0.1-anonymized.db');
  assert(fs.existsSync(fixture101), 'Fixture v1.0.1-anonymized.db must exist');
  const legacyDbFile = path.join(legacyDir, 'cafe-pos.db');
  fs.copyFileSync(fixture101, legacyDbFile);

  // Simulate legacy Local Storage
  const legacyLocalStorage = path.join(legacyDir, 'Local Storage', 'leveldb');
  fs.mkdirSync(legacyLocalStorage, { recursive: true });
  fs.writeFileSync(path.join(legacyLocalStorage, '000001.log'), 'MOCK_LEVELDB_LOCAL_STORAGE_STATE_THEME_LATTE');

  const legacyStatBefore = fs.statSync(legacyDbFile);
  console.log(`- Legacy DB seeded: ${legacyDbFile} (${legacyStatBefore.size} bytes)`);
  console.log(`- Legacy Local Storage seeded at: ${legacyLocalStorage}`);

  // Confirm target directory has NO database initially
  const targetDbFile = path.join(targetDir, 'cafe-pos.db');
  assert(!fs.existsSync(targetDbFile), 'Target 1.0.2 DB must NOT exist prior to launch');
  console.log('\n[Step 2] Launching 1.0.2 (no initial DB in TaqfeelaPOS)...');

  // Run auto-discovery & migration
  const dbModule = require('../electron/db.js');
  const migrationRes = await dbModule.discoverAndMigrateLegacyDatabase({
    targetDbPath: targetDbFile,
    searchDirs: [legacyDir]
  });

  console.log('[Step 2] Auto-migration result:', migrationRes);
  assert(migrationRes.migrated === true, '1.0.2 must auto-discover and migrate legacy DB');
  assert.strictEqual(migrationRes.source, legacyDbFile, 'Source matches legacy 1.0.1 path');
  assert.strictEqual(migrationRes.target, targetDbFile, 'Target matches 1.0.2 TaqfeelaPOS path');

  // Step 3: Verify legacy DB was COPIED, not deleted or moved
  assert(fs.existsSync(legacyDbFile), 'Legacy 1.0.1 DB must NOT be moved or deleted (kept as safety backup)');
  const legacyStatAfter = fs.statSync(legacyDbFile);
  assert.strictEqual(legacyStatAfter.size, legacyStatBefore.size, 'Legacy 1.0.1 DB size untouched');
  console.log('✅ PASS: Legacy 1.0.1 DB preserved in %APPDATA%\\cafe-pos (zero deletion/movement)');

  // Step 4: Verify Local Storage was copied
  const targetLocalStorage = path.join(targetDir, 'Local Storage', 'leveldb');
  assert(fs.existsSync(targetLocalStorage), 'Target 1.0.2 Local Storage folder created');
  assert(fs.existsSync(path.join(targetLocalStorage, '000001.log')), 'Target 1.0.2 Local Storage leveldb preserved');
  console.log('✅ PASS: Legacy Local Storage copied cleanly into %APPDATA%\\TaqfeelaPOS');

  // Step 5: Initialize 1.0.2 database and run pending migrations
  console.log('\n[Step 3] Initializing 1.0.2 and executing migrations on migrated database...');
  await dbModule.init(targetDbFile);

  const ordersCount = dbModule.queryGet('SELECT count(*) AS c FROM orders').c;
  const salesTotal = dbModule.queryGet('SELECT sum(total) AS s FROM orders').s;
  const schemaVer = dbModule.getSchemaVersion();
  const appVer = dbModule.getAppVersion();
  const integrity = dbModule.queryGet('PRAGMA integrity_check').integrity_check;
  const fkViolations = dbModule.queryAll('PRAGMA foreign_key_check').length;

  console.log(`- Schema version: ${schemaVer}`);
  console.log(`- App version: ${appVer}`);
  console.log(`- Orders count: ${ordersCount}`);
  console.log(`- Total sales: ${salesTotal} EGP`);
  console.log(`- PRAGMA integrity_check: ${integrity}`);
  console.log(`- PRAGMA foreign_key_check violations: ${fkViolations}`);

  assert.strictEqual(schemaVer, 2, 'Schema version migrated to 2');
  assert.strictEqual(appVer, '1.0.2', 'App version in settings recorded as 1.0.2');
  assert.strictEqual(ordersCount, 38, 'All 38 original orders preserved 100%');
  assert.strictEqual(salesTotal, 4275, 'All 4,275 EGP sales preserved 100%');
  assert.strictEqual(integrity, 'ok', 'Database integrity ok');
  assert.strictEqual(fkViolations, 0, 'Foreign key violations: 0');

  console.log('✅ PASS: All 38 orders and 4,275.00 EGP sales preserved without manual intervention');
  console.log('✅ PASS: PRAGMA integrity_check is ok and foreign_key_check has 0 violations');

  // Clean up
  dbModule.flushDb();
  try { await dbModule.shutdownWriterWorker(); } catch (_) {}
  try { fs.rmSync(mockAppData, { recursive: true, force: true }); } catch (_) {}

  console.log('\n====================================================================');
  console.log(' REAL CUSTOMER UPGRADE FLOW COMPLETED SUCCESSFULLY!');
  console.log('====================================================================\n');
}

testCustomerUpgradeFlow().catch(err => {
  console.error('Customer upgrade flow failed:', err);
  process.exit(1);
});

