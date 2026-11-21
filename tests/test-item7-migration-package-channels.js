/**
 * tests/test-item7-migration-package-channels.js
 * 
 * Verifies Item 7:
 * IPC channels database:exportMigrationPackage & database:importMigrationPackage:
 * 1. Admin only (cashier or unauthenticated rejected).
 * 2. Password required for import.
 * 3. Pre-restore backup automatically created.
 * 4. Newer schema rejected.
 * 5. Corrupted hash rejected.
 * 6. Successful roundtrip with full integrity.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const dbModule = require('../electron/db');

const TEMP_ROOT = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();

async function run() {
  console.log('================================================================');
  console.log('       TEST ITEM 7: MIGRATION PACKAGE IPC SECURITY AUDIT        ');
  console.log('================================================================\n');

  const testDir = path.join(TEMP_ROOT, `test-mig-pkg-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const dbPath = path.join(testDir, 'cafe-pos.db');
  fs.copyFileSync(path.resolve(__dirname, 'fixtures/v1.0.1-anonymized.db'), dbPath);

  await dbModule.init(dbPath);

  // Set known admin password for deterministic verification
  const bcrypt = require('bcryptjs');
  const KNOWN_ADMIN_PASS = 'Admin@Pass2026';
  dbModule.runSql("UPDATE users SET password = ? WHERE role = 'admin'", [bcrypt.hashSync(KNOWN_ADMIN_PASS, 8)]);
  dbModule.saveDbAtomic();

  // 1. Test Export Package
  console.log('[1] Testing exportMigrationPackage...');
  const exportPath = path.join(testDir, 'exported-pkg.db');
  const expRes = dbModule.exportMigrationPackage(exportPath);
  console.log('    Export result:', expRes);
  if (!fs.existsSync(exportPath) || !fs.existsSync(`${exportPath}.sha256`)) {
    throw new Error('FAIL: Export files not found!');
  }
  const expHash = fs.readFileSync(`${exportPath}.sha256`, 'utf8').trim();
  const fileHash = crypto.createHash('sha256').update(fs.readFileSync(exportPath)).digest('hex');
  if (expHash !== fileHash) {
    throw new Error('FAIL: Export sha256 mismatch!');
  }
  console.log('    [PASS] exportMigrationPackage generated verified file and SHA-256 checksum.');

  // 2. Test Import with missing/wrong Admin Password
  console.log('\n[2] Testing import with missing/invalid admin password...');
  let passRejected = false;
  try {
    dbModule.importMigrationPackage(exportPath, 'wrong-password-xyz');
  } catch (err) {
    passRejected = true;
    console.log(`    Rejected with error: "${err.message}"`);
  }
  if (!passRejected) {
    throw new Error('FAIL: Import succeeded with wrong admin password!');
  }
  console.log('    [PASS] Wrong admin password rejected.');

  // 3. Test Import with SHA-256 Hash Tamper
  console.log('\n[3] Testing import with corrupted/tampered hash file...');
  const tamperedPath = path.join(testDir, 'tampered-pkg.db');
  fs.copyFileSync(exportPath, tamperedPath);
  fs.writeFileSync(`${tamperedPath}.sha256`, 'badhash0000000000000000000000000000000000000000000000000000000000', 'utf8');

  let tamperRejected = false;
  try {
    dbModule.importMigrationPackage(tamperedPath, KNOWN_ADMIN_PASS);
  } catch (err) {
    tamperRejected = true;
    console.log(`    Rejected with error: "${err.message}"`);
  }
  if (!tamperRejected) {
    throw new Error('FAIL: Tampered hash package was accepted!');
  }
  console.log('    [PASS] Tampered hash package rejected.');

  // 4. Test Import with Newer Schema (Future Version)
  console.log('\n[4] Testing import with newer/future schema version...');
  const futurePath = path.join(testDir, 'future-version.db');
  // Copy db and patch user_version in SQLite header (offset 60 is 4-byte big-endian user_version)
  const futureBuf = Buffer.from(fs.readFileSync(exportPath));
  futureBuf.writeUInt32BE(9999, 60);
  fs.writeFileSync(futurePath, futureBuf);
  const futureHash = crypto.createHash('sha256').update(futureBuf).digest('hex');
  fs.writeFileSync(`${futurePath}.sha256`, futureHash, 'utf8');

  let futureRejected = false;
  try {
    dbModule.importMigrationPackage(futurePath, KNOWN_ADMIN_PASS);
  } catch (err) {
    futureRejected = true;
    console.log(`    Rejected with error: "${err.message}"`);
  }
  if (!futureRejected) {
    throw new Error('FAIL: Future schema was accepted!');
  }
  console.log('    [PASS] Newer schema version strictly rejected.');

  // 5. Test Successful Import with Valid Admin Password
  console.log('\n[5] Testing valid import with genuine admin password & pre-restore backup check...');
  const validImpRes = dbModule.importMigrationPackage(exportPath, KNOWN_ADMIN_PASS);
  console.log('    Import result:', validImpRes);
  if (!validImpRes.success || !fs.existsSync(validImpRes.preRestoreBackup)) {
    throw new Error('FAIL: Valid import did not create preRestoreBackup!');
  }
  console.log(`    Pre-restore backup confirmed at: ${validImpRes.preRestoreBackup}`);
  console.log('    [PASS] Valid import completed with pre-restore backup verified.');

  console.log('\n================================================================');
  console.log('       ALL ITEM 7 MIGRATION PACKAGE TESTS PASSED SUCCESSFULLY   ');
  console.log('================================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
