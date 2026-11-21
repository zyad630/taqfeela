const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const initSqlJs = require('sql.js');

async function testDataPathMigration() {
  console.log('=== TEST ITEM 2: Legacy Data Path Discovery & Integrity Verification ===\n');

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-migration-'));
  const legacyDir = path.join(testRoot, 'cafe-pos');
  const targetDir = path.join(testRoot, 'TaqfeelaPOS');
  fs.mkdirSync(legacyDir, { recursive: true });

  // 1. Seed a valid legacy 1.0.1 database inside legacyDir
  const SQL = await initSqlJs();
  const legacyDb = new SQL.Database();
  legacyDb.run(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT);
    INSERT INTO users VALUES (1, 'legacy_cashier', 'cashier');
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
    INSERT INTO products VALUES (1, 'شاي كشري قديم', 15.0);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, invoice_no TEXT, total REAL);
    INSERT INTO orders VALUES (1, 'INV-1001', 15.0);
  `);
  const legacyBytes = legacyDb.export();
  const legacyDbFile = path.join(legacyDir, 'cafe-pos.db');
  fs.writeFileSync(legacyDbFile, Buffer.from(legacyBytes));
  legacyDb.close();

  console.log('[Test 2] Seeded legacy database at:', legacyDbFile, `(${legacyBytes.byteLength} bytes)`);

  // Target directory has no DB initially
  const targetDbFile = path.join(targetDir, 'cafe-pos.db');
  assert.strictEqual(fs.existsSync(targetDbFile), false, 'Target database must not exist before migration');

  // Load db module and test discoverAndMigrateLegacyDatabase
  const db = require('../electron/db.js');

  // Verify function existence
  assert.ok(typeof db.discoverAndMigrateLegacyDatabase === 'function', 'db.discoverAndMigrateLegacyDatabase must be defined');

  const migrationResult = await db.discoverAndMigrateLegacyDatabase({
    targetDbPath: targetDbFile,
    searchDirs: [legacyDir]
  });

  console.log('[Test 2] Migration result:', migrationResult);
  assert.strictEqual(migrationResult.migrated, true, 'Migration must report success');
  assert.strictEqual(migrationResult.source, legacyDbFile, 'Source must match legacy path');

  // Verify target file exists now
  assert.strictEqual(fs.existsSync(targetDbFile), true, 'Target database must exist after migration');

  // Verify original legacy file was COPIED, not deleted or moved
  assert.strictEqual(fs.existsSync(legacyDbFile), true, 'Legacy database must NOT be deleted or moved');

  // Verify contents in target DB
  const targetData = fs.readFileSync(targetDbFile);
  const targetLoadedDb = new SQL.Database(targetData);
  const orders = targetLoadedDb.exec('SELECT * FROM orders');
  assert.strictEqual(orders[0].values.length, 1);
  assert.strictEqual(orders[0].values[0][1], 'INV-1001');
  targetLoadedDb.close();

  // 2. Test Corrupt File Rejection (Integrity Check)
  console.log('\n--- Test 2.B: Corrupted Candidate Rejection ---');
  const corruptDir = path.join(testRoot, 'corrupt-app');
  fs.mkdirSync(corruptDir, { recursive: true });
  const corruptFile = path.join(corruptDir, 'cafe-pos.db');
  fs.writeFileSync(corruptFile, Buffer.from('NOT A VALID SQLITE DATABASE FILE - CORRUPTED HEADER'));

  const secondTargetDir = path.join(testRoot, 'TaqfeelaPOS-Second');
  const secondTargetDb = path.join(secondTargetDir, 'cafe-pos.db');

  const corruptResult = await db.discoverAndMigrateLegacyDatabase({
    targetDbPath: secondTargetDb,
    searchDirs: [corruptDir]
  });

  console.log('[Test 2.B] Corrupted candidate migration result:', corruptResult);
  assert.strictEqual(corruptResult.migrated, false, 'Corrupted candidate must NOT be migrated');
  assert.strictEqual(fs.existsSync(secondTargetDb), false, 'Corrupted file must NOT be copied to target');

  // Cleanup
  try { fs.rmSync(testRoot, { recursive: true, force: true }); } catch (_) {}
  console.log('\n✅ TEST ITEM 2 PASSED: Legacy data path migration with integrity check verified.');
}

testDataPathMigration().catch(err => {
  console.error('❌ TEST ITEM 2 FAILED:', err);
  process.exit(1);
});

