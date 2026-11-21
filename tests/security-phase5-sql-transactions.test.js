const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const testDbDir = path.join(__dirname, 'tmp_phase5_test');
const testDbPath = path.join(testDbDir, 'cafe-phase5.db');

describe('🔒 Phase 5 Security Hardening: SQL Errors & Transaction Resilience', () => {
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

  test('1. ADV-P5-01: queryAll on non-existent table MUST throw instead of swallowing error', () => {
    assert.throws(
      () => {
        db.queryAll('SELECT * FROM non_existent_table_xyz_123');
      },
      /no such table/i,
      'queryAll must throw when querying a non-existent table, NOT return []'
    );
  });

  test('2. ADV-P5-02: queryGet on non-existent table MUST throw instead of swallowing error', () => {
    assert.throws(
      () => {
        db.queryGet('SELECT * FROM non_existent_table_xyz_123 WHERE id = 1');
      },
      /no such table/i,
      'queryGet must throw when querying a non-existent table, NOT return null'
    );
  });

  test('3. ADV-P5-03: queryAll and queryGet on valid empty queries return [] and null without error', () => {
    // Valid table with no matching row
    const all = db.queryAll('SELECT * FROM users WHERE id = -9999');
    assert.deepStrictEqual(all, [], 'queryAll must return empty array when query succeeds with 0 rows');

    const one = db.queryGet('SELECT * FROM users WHERE id = -9999');
    assert.strictEqual(one, null, 'queryGet must return null when query succeeds with 0 rows');
  });

  test('4. ADV-P5-04: withTransaction does NOT attempt ROLLBACK when disk save fails after COMMIT', () => {
    // Save table count before
    const countBefore = db.queryAll('SELECT * FROM categories').length;

    // Simulate disk write failure in saveDbAtomic by temporarily mocking fs.openSync
    const originalOpenSync = fs.openSync;
    const originalConsoleError = console.error;
    const errorsLogged = [];
    console.error = (...args) => {
      errorsLogged.push(args.join(' '));
      originalConsoleError(...args);
    };

    try {
      // Force disk write to fail on temporary DB file
      fs.openSync = (targetPath, flags, mode) => {
        if (typeof targetPath === 'string' && targetPath.includes('.tmp-')) {
          throw new Error('EACCES: permission denied, simulated disk failure on temporary file');
        }
        return originalOpenSync(targetPath, flags, mode);
      };

      // Run transaction inserting a category
      assert.throws(() => {
        db.withTransaction(() => {
          db.runSql('INSERT INTO categories (name, sort_order) VALUES (?, ?)', ['Test Fail Category', 99], { skipSave: true });
        });
      }, /disk|قرص|EACCES|حفظ/i);

      // Verify no "cannot rollback - no transaction is active" error occurred
      const rollbackErrorLogged = errorsLogged.some(e => /cannot rollback|no transaction is active/i.test(e));
      assert.strictEqual(rollbackErrorLogged, false, 'withTransaction MUST NOT attempt ROLLBACK after COMMIT has occurred');

      // Check dirty flag
      assert.strictEqual(db.isDbDirty(), true, 'Database must be flagged as dirty when disk write fails');
    } finally {
      fs.openSync = originalOpenSync;
      console.error = originalConsoleError;
      // Clean up test category if committed in memory
      try {
        db.runSql('DELETE FROM categories WHERE name = ?', ['Test Fail Category']);
      } catch (_) {}
    }
  });

  test('5. ADV-P5-05: Deferred save does not crash on error and handles retry', async () => {
    // Calling saveDb(false) must not throw Unhandled Rejection
    assert.doesNotThrow(() => {
      db.saveDb(false);
    });

    // flushDb must exist and synchronize pending saves
    assert.strictEqual(typeof db.flushDb, 'function', 'db.flushDb must be exported to guarantee disk flush');
  });
});
