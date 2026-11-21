const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const testDbDir = path.join(__dirname, 'tmp_task8_test');
const testDbPath = path.join(testDbDir, 'cafe-task8.db');

describe('🔒 Task 8 Security Hardening: Idempotent Migrations & Safe Atomic Restore', () => {
  let db;

  before(async () => {
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDbDir, { recursive: true });
    db = require('../electron/db');
    await db.init(testDbPath);
  });

  after(() => {
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('1. ADV-T8-01: restoreBackup aborts and throws if safety pre-restore backup fails', () => {
    // Create a valid backup first to restore from
    const backupRes = db.createBackup(path.join(testDbDir, 'valid-backup.db'));
    assert.strictEqual(backupRes.success, true);

    const originalCopyFileSync = fs.copyFileSync;
    try {
      // Simulate disk write / permission failure when saving pre-restore safety copy
      fs.copyFileSync = (src, dest) => {
        if (dest.includes('pre-restore')) {
          throw new Error('EACCES: permission denied, simulated backup failure');
        }
        return originalCopyFileSync(src, dest);
      };

      assert.throws(
        () => {
          db.restoreBackup(path.join(testDbDir, 'valid-backup.db'));
        },
        /نسخة الأمان|pre-restore|EACCES|أمان/i,
        'restoreBackup MUST abort when pre-restore backup fails to protect live data'
      );
    } finally {
      fs.copyFileSync = originalCopyFileSync;
    }
  });

  test('2. ADV-T8-02: restoreBackup strictly rejects corrupted backup file', () => {
    const corruptPath = path.join(testDbDir, 'corrupt.db');
    fs.writeFileSync(corruptPath, 'This is completely corrupted and not a sqlite database!');

    assert.throws(
      () => {
        db.restoreBackup(corruptPath);
      },
      /غير صالح|SQLite/i,
      'Corrupt backup file must be rejected'
    );
  });

  test('3. ADV-T8-03: Migrations are strictly idempotent without error', async () => {
    // Calling init again on an already initialized db simulates restarting the app
    // and re-running all ALTER TABLE migrations. It must succeed with 0 errors.
    await assert.doesNotReject(
      async () => {
        await db.init(testDbPath);
      },
      'Re-running migrations must be completely idempotent and error-free'
    );
  });
});
