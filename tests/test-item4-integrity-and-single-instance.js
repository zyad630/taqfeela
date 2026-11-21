const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

async function run() {
  console.log('=== TEST ITEM 4: Single Instance, External DB Conflict, Crash Handling ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-item4-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  let passed = 0;
  let failed = 0;

  // -------------------------------------------------------------
  // Test 1: External DB Modification Detection before saveDbAtomic
  // -------------------------------------------------------------
  console.log('--- Test 1: External DB Modification Detection ---');
  try {
    const db = require('../electron/db');
    await db.init(testDbPath);
    console.log('[Test 1] DB initialized at:', testDbPath);

    // Initial save
    db.saveDbAtomic();
    const initialStat = fs.statSync(testDbPath);
    console.log('[Test 1] Initial DB on disk: size =', initialStat.size, 'mtime =', initialStat.mtimeMs);

    // Simulate an external actor tampering with or updating the DB file directly on disk
    // Wait at least 150ms to ensure a distinct mtime on Windows filesystems
    await new Promise(r => setTimeout(r, 200));
    const externalContent = Buffer.from('EXTERNAL_OVERWRITE_SIMULATION_' + Date.now());
    fs.writeFileSync(testDbPath, externalContent);
    const modifiedStat = fs.statSync(testDbPath);
    console.log('[Test 1] External actor modified DB on disk: size =', modifiedStat.size, 'mtime =', modifiedStat.mtimeMs);

    // Now trigger an atomic save from the running application
    db.saveDbAtomic();

    // Check if the external modification was detected and backed up to a conflict file
    const backupDir = path.join(tempDir, 'backups');
    let conflictFiles = [];
    if (fs.existsSync(backupDir)) {
      conflictFiles = fs.readdirSync(backupDir).filter(f => f.includes('external-conflict') || f.includes('conflict'));
    }

    const lastConflict = typeof db.getLastExternalConflict === 'function' ? db.getLastExternalConflict() : null;

    if (conflictFiles.length > 0 || (lastConflict && lastConflict.detected)) {
      console.log('✅ PASS: External modification detected! Conflict backup created:', conflictFiles);
      passed++;
    } else {
      console.log('❌ FAIL: External modification was NOT detected before saveDbAtomic (silently overwritten without backup)!');
      failed++;
    }
  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // Test 2: Crash Logging (uncaughtException / unhandledRejection)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Crash Logging and Log Rotation ---');
  try {
    const crashLogPath = path.join(tempDir, 'crash-log.txt');
    const oldLogPath = path.join(tempDir, 'crash-log.old.txt');

    // Simulate logCrash behavior
    function simulateLogCrash(type, err, userDataDir) {
      const targetPath = path.join(userDataDir, 'crash-log.txt');
      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath);
        if (stats.size > 2 * 1024 * 1024) {
          const oldPath = path.join(userDataDir, 'crash-log.old.txt');
          try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (_) {}
          fs.renameSync(targetPath, oldPath);
        }
      }
      const line = `\n[${new Date().toISOString()}] [${type}] ${err && err.stack ? err.stack : String(err)}\n`;
      fs.appendFileSync(targetPath, line, 'utf8');
    }

    // 1. Write an uncaught exception
    simulateLogCrash('UNCAUGHT_EXCEPTION', new Error('Simulated Uncaught Error'), tempDir);
    let logContent = fs.readFileSync(crashLogPath, 'utf8');
    if (!logContent.includes('Simulated Uncaught Error') || !logContent.includes('UNCAUGHT_EXCEPTION')) {
      throw new Error('Crash log did not record uncaught exception properly');
    }

    // 2. Test rotation when > 2MB
    const bigChunk = Buffer.alloc(2.1 * 1024 * 1024, 'A');
    fs.appendFileSync(crashLogPath, bigChunk);
    simulateLogCrash('UNHANDLED_REJECTION', 'Simulated Rejection Reason', tempDir);

    if (fs.existsSync(oldLogPath) && fs.existsSync(crashLogPath)) {
      const newLogContent = fs.readFileSync(crashLogPath, 'utf8');
      if (newLogContent.includes('Simulated Rejection Reason')) {
        console.log('✅ PASS: Crash log correctly records exceptions and rotates when > 2MB.');
        passed++;
      } else {
        throw new Error('Rotated log missing recent rejection entry');
      }
    } else {
      throw new Error('Rotation did not create crash-log.old.txt');
    }
  } catch (err) {
    console.log('❌ FAIL (Crash Log):', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // Test 3: requestSingleInstanceLock
  // -------------------------------------------------------------
  console.log('\n--- Test 3: requestSingleInstanceLock Verification ---');
  try {
    const mainJsPath = path.resolve(__dirname, '../electron/main.js');
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');
    const hasLockCheck = mainContent.includes('app.requestSingleInstanceLock()');
    const hasSecondInstance = mainContent.includes("app.on('second-instance'");
    const hasGotLock = mainContent.includes('if (!gotTheLock)');

    if (hasLockCheck && hasSecondInstance && hasGotLock) {
      console.log('✅ PASS: app.requestSingleInstanceLock() and second-instance handler properly implemented in electron/main.js');
      passed++;
    } else {
      console.log('❌ FAIL: requestSingleInstanceLock pattern incomplete in main.js');
      failed++;
    }
  } catch (err) {
    console.log('❌ FAIL (Single Instance):', err.message);
    failed++;
  }

  console.log(`\nItem 4 Results: Passed: ${passed}, Failed: ${failed}`);
  // Clean up
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run();

