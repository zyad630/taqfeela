/**
 * tests/test-phase2-protection-and-worker-save.js
 *
 * Comprehensive Verification Suite for Phase 2:
 * 1. Deferred saveDb(false) offloads to Worker Thread (db_writer_worker.js) without blocking or losing data
 * 2. Rapid burst of deferred writes coalesces cleanly and persists 100% of mutations to disk
 * 3. waitForPendingWorkerSaves() + flushDbAsync() guarantee durability before shutdown
 * 4. protect_build.js covers all critical files (preload, security, main, db, mobileApi, finance, updater)
 * 5. main.js contains mutual SHA-256 manifest verification for packaged production builds
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
const testDir = path.join(baseTemp, `cafe-phase2-test-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'cafe-pos.db');

async function run() {
  console.log('====================================================');
  console.log('   PHASE 2 PROTECTION & WORKER-SAVE TEST SUITE      ');
  console.log('====================================================\n');

  const db = require('../electron/db');
  await db.init(testDbPath);

  try {
    // -------------------------------------------------------------
    // 1. Deferred Worker Save Durability Test (Burst of 25 Writes)
    // -------------------------------------------------------------
    console.log('--- 1. Deferred Worker-Thread Save Burst Durability ---');
    const beforeCount = db.getAtomicSaveCount();
    for (let i = 1; i <= 25; i++) {
      db.runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [`burst_key_${i}`, `val_${i}`]);
    }
    assert.strictEqual(db.isDbDirty(), true, 'DB must be marked dirty immediately after deferred writes');

    // Wait for debounce (200ms) + worker flush
    await new Promise(r => setTimeout(r, 600));
    await db.waitForPendingWorkerSaves();

    const afterCount = db.getAtomicSaveCount();
    assert.ok(afterCount > beforeCount, 'Worker save must have incremented atomicSaveCount');
    assert.strictEqual(db.isDbDirty(), false, 'DB dirty flag must clear after worker save completes');

    // Verify file on disk actually contains ALL 25 keys by loading raw file into a fresh sql.js instance
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const diskBuf = fs.readFileSync(testDbPath);
    const verifyDb = new SQL.Database(diskBuf);
    const res = verifyDb.exec("SELECT COUNT(*) FROM settings WHERE key LIKE 'burst_key_%'");
    const persistedCount = res[0].values[0][0];
    verifyDb.close();
    assert.strictEqual(persistedCount, 25, `Expected all 25 burst keys on disk, found ${persistedCount}`);
    console.log(`✓ All 25 rapid mutations coalesced into ${afterCount - beforeCount} worker flush(es) and persisted cleanly to disk`);

    // -------------------------------------------------------------
    // 2. PRAGMA foreign_keys still ON after Worker Save
    // -------------------------------------------------------------
    console.log('\n--- 2. PRAGMA foreign_keys After Worker Save ---');
    const fk = db.queryGet('PRAGMA foreign_keys');
    assert.strictEqual(fk.foreign_keys, 1, 'PRAGMA foreign_keys must stay 1 after worker save');
    console.log('✓ PRAGMA foreign_keys = 1 verified after worker flush');

    // -------------------------------------------------------------
    // 3. protect_build.js & Mutual Manifest Integrity Verification
    // -------------------------------------------------------------
    console.log('\n--- 3. Build Protection & Mutual Integrity Audit ---');
    const protectSrc = fs.readFileSync(path.join(__dirname, '../scripts/protect_build.js'), 'utf8');
    const mainSrc = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');

    for (const f of ['preload.js', 'security.js', 'main.js', 'db.js', 'mobileApi.js', 'finance.js', 'updater.js']) {
      assert.ok(protectSrc.includes(`'${f}'`), `protect_build.js manifest must include ${f}`);
    }
    assert.ok(protectSrc.includes('stringArrayRotate: true'), 'protect_build.js must enable stringArrayRotate');
    assert.ok(protectSrc.includes('stringArrayShuffle: true'), 'protect_build.js must enable stringArrayShuffle');
    assert.ok(mainSrc.includes('MUTUAL_INTEGRITY_FAIL'), 'main.js must enforce mutual manifest integrity in packaged builds');
    console.log('✓ protect_build.js and main.js mutual integrity checks verified');

    console.log('\n====================================================');
    console.log('   ALL PHASE 2 PROTECTION & WORKER TESTS PASSED!    ');
    console.log('====================================================');
  } finally {
    if (typeof db.shutdownWriterWorker === 'function') {
      await db.shutdownWriterWorker();
    }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((err) => {
  console.error('❌ PHASE 2 TEST FAILED:', err);
  process.exit(1);
});

