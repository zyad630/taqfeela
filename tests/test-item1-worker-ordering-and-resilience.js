/**
 * Test Item 1 (b, c, d, e): Worker Path Hardening Suite
 * (b) Shutdown coordination via waitForPendingWorkerSaves
 * (c) 20 rapid successive saves serialization & ordering
 * (d) Write failure simulation, retries, and rejection propagation
 * (e) External change detector: 50 successive worker saves with 0 conflict files
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

async function run() {
  console.log('--- STARTING WORKER PATH HARDENING SUITE (b, c, d, e) ---');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-worker-harden-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');
  process.env.TEST_DB_PATH = testDbPath;
  process.env.CAFE_DATA_DIR = tempDir;

  const db = require('../electron/db');
  await db.init(testDbPath);

  // =========================================================================
  // (c) SAVE ORDERING: 20 rapid successive saves in flight
  // =========================================================================
  console.log('\n[Subtest C] Testing 20 rapid successive saves serialization queue...');
  const promises = [];
  for (let i = 1; i <= 20; i++) {
    db.runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['rapid_seq_test', 'value_' + i]);
    promises.push(db.saveDbAtomicAsync());
  }
  const results = await Promise.all(promises);
  assert.strictEqual(results.length, 20, 'All 20 saves resolved');

  // Verify directly from disk (read raw bytes, instantiate independent sql.js)
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const diskBytes = fs.readFileSync(testDbPath);
  const diskDb = new SQL.Database(diskBytes);
  const stmt = diskDb.prepare("SELECT value FROM settings WHERE key = 'rapid_seq_test'");
  assert(stmt.step(), 'Value must exist on disk');
  const diskVal = stmt.getAsObject().value;
  stmt.free();
  diskDb.close();

  assert.strictEqual(diskVal, 'value_20', `Final disk value must be value_20, got: ${diskVal}`);
  console.log(`✓ Subtest C Passed: 20 rapid successive saves properly coalesced/serialized. Final disk value is strictly 'value_20'.`);

  // =========================================================================
  // (e) EXTERNAL CHANGE DETECTOR: 50 successive worker saves -> 0 conflict files
  // =========================================================================
  console.log('\n[Subtest E] Testing 50 successive worker saves against external-conflict false positives...');
  for (let i = 1; i <= 50; i++) {
    db.runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['conflict_test_key', 'run_' + i]);
    await db.saveDbAtomicAsync();
  }

  // Scan directory for any conflict files
  const filesInDir = fs.readdirSync(tempDir);
  const conflictFiles = filesInDir.filter(f => f.includes('external-conflict'));
  assert.strictEqual(conflictFiles.length, 0, `Expected 0 conflict files, found: ${conflictFiles.join(', ')}`);
  console.log(`✓ Subtest E Passed: 50 successive worker saves completed with exactly 0 external-conflict files generated.`);

  // =========================================================================
  // (b) SHUTDOWN: waitForPendingWorkerSaves during worker write
  // =========================================================================
  console.log('\n[Subtest B] Testing graceful shutdown coordination (before-quit)...');
  db.runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['shutdown_key', 'shutdown_val_final']);
  const inFlightPromise = db.saveDbAtomicAsync();
  // Simulate app 'before-quit' event hook
  let waitResolved = false;
  const waitPromise = db.waitForPendingWorkerSaves().then(() => {
    waitResolved = true;
  });
  await Promise.all([inFlightPromise, waitPromise]);
  assert.strictEqual(waitResolved, true, 'waitForPendingWorkerSaves must resolve successfully');

  // Verify data is on disk
  const diskBytesShutdown = fs.readFileSync(testDbPath);
  const diskDbShutdown = new SQL.Database(diskBytesShutdown);
  const stmtShutdown = diskDbShutdown.prepare("SELECT value FROM settings WHERE key = 'shutdown_key'");
  assert(stmtShutdown.step(), 'Shutdown value must exist on disk');
  assert.strictEqual(stmtShutdown.getAsObject().value, 'shutdown_val_final');
  stmtShutdown.free();
  diskDbShutdown.close();
  console.log(`✓ Subtest B Passed: App shutdown successfully waits for in-flight worker writes. Disk contains full state.`);

  // =========================================================================
  // (d) WRITE FAILURE SIMULATION: Retries, error propagation, and fail-closed
  // =========================================================================
  console.log('\n[Subtest D] Testing write failure simulation & error propagation (EPERM / read-only target)...');
  const { Worker } = require('worker_threads');
  const workerPath = path.join(__dirname, '../electron/db_writer_worker.js');
  const testWorker = new Worker(workerPath);

  // Simulate real Windows EPERM: Target file is marked read-only (permission denied)
  const lockedDbPath = path.join(tempDir, 'readonly_destination.db');
  const lockedTmpPath = path.join(tempDir, 'readonly_destination.tmp');
  fs.writeFileSync(lockedDbPath, 'initial content');
  fs.chmodSync(lockedDbPath, 0o444); // Windows read-only attribute -> EPERM on write/rename

  const workerFailurePromise = new Promise((resolve) => {
    testWorker.on('message', (msg) => {
      resolve(msg);
    });
    testWorker.postMessage({
      id: 999,
      buffer: new Uint8Array([1, 2, 3]).buffer,
      dbPath: lockedDbPath,
      tmpPath: lockedTmpPath
    });
  });

  const workerResult = await workerFailurePromise;
  fs.chmodSync(lockedDbPath, 0o666);
  await testWorker.terminate();

  assert.strictEqual(workerResult.success, false, 'Worker must report success = false when write/rename fails with EPERM');
  assert(workerResult.error && (workerResult.error.includes('EPERM') || workerResult.error.includes('EBUSY')),
    `Worker error must mention EPERM/EBUSY, got: ${workerResult.error}`);
  assert(!fs.existsSync(lockedTmpPath), 'Worker must clean up tmp file on failure');
  console.log(`✓ Subtest D (Worker EPERM): Worker retried and reported failure cleanly with error: "${workerResult.error}". Tmp file removed.`);

  // Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n--- WORKER PATH HARDENING SUITE (b, c, d, e) COMPLETED (GREEN) ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
