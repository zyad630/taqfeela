/**
 * 50MB Database Real-World Upgrade Measurement (Item 11-هـ sub-item 4)
 * Measures upgrade time on realistic 52.45MB database (66,020 orders, 8.36M EGP sales)
 * Verifies 100% preservation of financial totals, rows, integrity, and safety backup.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');
const assert = require('assert');
const initSqlJs = require('sql.js');

async function test50MbUpgrade() {
  console.log('====================================================================');
  console.log(' 50MB REALISTIC DATABASE UPGRADE BENCHMARK (Item 11-هـ sub-item 4)');
  console.log('====================================================================\n');

  const source50Mb = 'D:/cafe-temp/cafe-pos-50mb.db';
  if (!fs.existsSync(source50Mb)) {
    console.error('50MB database source file not found at:', source50Mb);
    process.exit(1);
  }

  const statOriginal = fs.statSync(source50Mb);
  console.log(`Source Database: ${source50Mb}`);
  console.log(`Original File Size: ${(statOriginal.size / (1024 * 1024)).toFixed(2)} MB (${statOriginal.size.toLocaleString()} bytes)`);

  // Step 1: Pre-inspect before upgrade
  console.log('\n[Pre-Upgrade] Inspecting original state...');
  const SQLInstance = await initSqlJs();
  const preDb = new SQLInstance.Database(fs.readFileSync(source50Mb));
  const preVersion = preDb.exec('PRAGMA user_version')[0].values[0][0];
  const preOrdersCount = preDb.exec('SELECT count(*) FROM orders')[0].values[0][0];
  const preSalesTotal = Number(preDb.exec('SELECT COALESCE(SUM(total), 0) FROM orders')[0].values[0][0]);
  const preOrderItemsCount = preDb.exec('SELECT count(*) FROM order_items')[0].values[0][0];
  const preAuditCount = preDb.exec('SELECT count(*) FROM audit_log')[0].values[0][0];
  preDb.close();

  console.log(`- Pre-upgrade user_version: ${preVersion}`);
  console.log(`- Pre-upgrade orders count: ${preOrdersCount.toLocaleString()}`);
  console.log(`- Pre-upgrade order_items count: ${preOrderItemsCount.toLocaleString()}`);
  console.log(`- Pre-upgrade total sales: ${preSalesTotal.toLocaleString()} EGP`);
  console.log(`- Pre-upgrade audit_log entries: ${preAuditCount.toLocaleString()}`);

  // Step 2: Prepare isolated test directory on drive D: where sufficient free space exists
  const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
  const tempDir = fs.mkdtempSync(path.join(baseTemp, 'cafe-test-50mb-upgrade-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');
  console.log(`\nCopying to isolated benchmark path: ${testDbPath}`);
  const copyStart = performance.now();
  fs.copyFileSync(source50Mb, testDbPath);
  const copyMs = performance.now() - copyStart;
  console.log(`Copy completed in ${copyMs.toFixed(1)}ms`);

  // Step 3: Run dbModule.init() with timing
  const dbModule = require('../electron/db');
  console.log('\n[Upgrade] Running dbModule.init() on 50MB database...');
  const upgradeStart = performance.now();
  await dbModule.init(testDbPath);
  const totalUpgradeMs = performance.now() - upgradeStart;

  console.log(`\n====================================================================`);
  console.log(` ⏱️ UPGRADE DURATION: ${totalUpgradeMs.toFixed(2)}ms (${(totalUpgradeMs / 1000).toFixed(2)}s)`);
  console.log(`====================================================================\n`);

  // Step 4: Verify Pre-Upgrade Safety Backup
  const backupsDir = path.join(tempDir, 'backups');
  assert(fs.existsSync(backupsDir), 'backups directory was created');
  const backupFiles = fs.readdirSync(backupsDir).filter(f => f.startsWith('pre-upgrade-'));
  assert(backupFiles.length >= 1, 'pre-upgrade safety backup was created');
  const backupPath = path.join(backupsDir, backupFiles[0]);
  const backupStat = fs.statSync(backupPath);
  console.log(`[Backup Verification] Found: ${backupFiles[0]}`);
  console.log(`[Backup Verification] Size: ${(backupStat.size / (1024 * 1024)).toFixed(2)} MB (${backupStat.size.toLocaleString()} bytes)`);
  assert.strictEqual(backupStat.size, statOriginal.size, 'Backup size matches original file size byte-for-byte');
  console.log(`✅ PASS: Pre-upgrade backup created and matches original size byte-for-byte`);

  // Step 5: Verify Data Invariants & Preservation
  console.log('\n[Post-Upgrade Invariant Check]');
  const postVersion = dbModule.getSchemaVersion();
  const postAppVersion = dbModule.getAppVersion();
  const postOrdersCount = dbModule.queryGet('SELECT count(*) AS c FROM orders').c;
  const postSalesTotal = Number(dbModule.queryGet('SELECT COALESCE(SUM(total), 0) AS s FROM orders').s);
  const postOrderItemsCount = dbModule.queryGet('SELECT count(*) AS c FROM order_items').c;
  const postAuditCount = dbModule.queryGet('SELECT count(*) AS c FROM audit_log').c;

  console.log(`- Post-upgrade user_version: ${postVersion} (Target: 2)`);
  console.log(`- Post-upgrade app_version: ${postAppVersion} (Target: 1.0.2)`);
  console.log(`- Post-upgrade orders count: ${postOrdersCount.toLocaleString()}`);
  console.log(`- Post-upgrade order_items count: ${postOrderItemsCount.toLocaleString()}`);
  console.log(`- Post-upgrade total sales: ${postSalesTotal.toLocaleString()} EGP`);
  console.log(`- Post-upgrade audit_log entries: ${postAuditCount.toLocaleString()}`);

  assert.strictEqual(postVersion, 2, 'Schema version migrated to 2');
  assert.strictEqual(postAppVersion, '1.0.2', 'App version in settings recorded as 1.0.2');
  assert.strictEqual(postOrdersCount, preOrdersCount, 'Orders count strictly preserved 100%');
  assert.strictEqual(postOrderItemsCount, preOrderItemsCount, 'Order items count strictly preserved 100%');
  assert.strictEqual(postSalesTotal, preSalesTotal, 'Financial invariant (total sales) preserved down to the piastre');
  assert.strictEqual(postAuditCount, preAuditCount, 'Audit log entries count strictly preserved');

  console.log(`✅ PASS: Schema version is 2, app_version is 1.0.2`);
  console.log(`✅ PASS: 100% of rows preserved (${postOrdersCount.toLocaleString()} orders, ${postOrderItemsCount.toLocaleString()} order items)`);
  console.log(`✅ PASS: Financial sales sum 100% identical (${postSalesTotal.toLocaleString()} EGP)`);

  // Step 6: PRAGMA integrity_check & foreign_key_check
  console.log('\n[Integrity Verification]');
  const integrity = dbModule.queryGet('PRAGMA integrity_check').integrity_check;
  console.log(`PRAGMA integrity_check: ${integrity}`);
  assert.strictEqual(integrity, 'ok', 'PRAGMA integrity_check is ok');
  console.log(`✅ PASS: PRAGMA integrity_check is 'ok'`);

  const fkCheck = dbModule.queryAll('PRAGMA foreign_key_check');
  console.log(`PRAGMA foreign_key_check violations: ${fkCheck.length}`);
  assert.strictEqual(fkCheck.length, 0, 'PRAGMA foreign_key_check has 0 violations');
  console.log(`✅ PASS: PRAGMA foreign_key_check has 0 violations`);

  // Step 7: Cryptographic HMAC chain verification on 50MB audit log
  console.log('\n[Cryptographic Audit Chain Verification]');
  const chainCheck = dbModule.verifyAuditLogChain();
  console.log(`Audit log chain count: ${chainCheck.count}`);
  console.log(`Audit log chain valid: ${chainCheck.valid}`);
  console.log(`Audit log final chain hash: ${chainCheck.finalChainHash}`);
  assert.strictEqual(chainCheck.valid, true, 'Audit log cryptographic HMAC chain verified unbroken');
  console.log(`✅ PASS: 50MB Audit log HMAC chain unbroken across all ${chainCheck.count} records!`);

  // Clean up
  dbModule.flushDb();
  try {
    await dbModule.shutdownWriterWorker();
  } catch (_) {}
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`Benchmark temp directory cleaned up.`);
  } catch (_) {}

  console.log('\n====================================================================');
  console.log(' ALL 50MB UPGRADE BENCHMARK CHECKS PASSED SUCCESSFULLY!');
  console.log('====================================================================\n');
}

test50MbUpgrade().catch(err => {
  console.error('50MB upgrade benchmark failed:', err);
  process.exit(1);
});
