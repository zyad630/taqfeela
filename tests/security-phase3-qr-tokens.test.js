const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

describe('🔒 Phase 3 Security Hardening: Strong QR Tokens & Uniqueness Audit', () => {
  const testDbPath = path.join(__dirname, 'test-phase3-tokens.db');
  let db;

  before(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    db = require('../electron/db');
    await db.init(testDbPath);
  });

  after(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
    }
  });

  test('1. ADV-P3-01: db.generateQrToken must exist and produce >= 32-byte entropy tokens', () => {
    assert(typeof db.generateQrToken === 'function', 'db.generateQrToken must be a function exported by db.js');
    const token = db.generateQrToken();
    assert(typeof token === 'string', 'Token must be a string');
    // 32 bytes in hex = 64 chars, in base64url = 43 chars. Both >= 40 chars. Old tokens were 8 chars.
    assert(token.length >= 40, `Token length must be at least 40 characters for 32 bytes entropy, got ${token.length}`);
  });

  test('2. ADV-P3-02: Generating 10,000 tokens produces 0 collisions with uniform length', () => {
    assert(typeof db.generateQrToken === 'function', 'db.generateQrToken must exist');
    const set = new Set();
    const count = 10000;
    let expectedLen = null;

    for (let i = 0; i < count; i++) {
      const tok = db.generateQrToken();
      if (expectedLen === null) expectedLen = tok.length;
      assert.strictEqual(tok.length, expectedLen, `Token length mismatch at iteration ${i}`);
      assert(!set.has(tok), `Collision detected at iteration ${i} for token: ${tok}`);
      set.add(tok);
    }
    assert.strictEqual(set.size, count, 'Must generate exactly 10,000 unique tokens without collisions');
  });

  test('3. ADV-P3-03: New tables and regenerated tokens MUST use 32-byte tokens', () => {
    const table = db.saveTable({
      name: 'طاولة فحص 1',
      number: '901',
      hall: 'الرئيسية'
    });
    assert(table && table.id, 'Table must be created');
    assert(table.qr_token, 'qr_token must exist');
    assert(table.qr_token.length >= 40, `New table token must be >= 40 chars (32 bytes), got length ${table.qr_token.length}`);

    const regen = db.regenerateTableQrToken(table.id);
    assert(regen.qr_token, 'Regenerated token must exist');
    assert(regen.qr_token.length >= 40, `Regenerated token must be >= 40 chars, got ${regen.qr_token.length}`);
    assert.notStrictEqual(regen.qr_token, table.qr_token, 'Regenerated token must differ from old token');
  });

  test('4. ADV-P3-04: Tables schema MUST enforce UNIQUE constraint on qr_token', () => {
    const uniqueToken = (typeof db.generateQrToken === 'function') 
      ? db.generateQrToken() 
      : 'DUPLICATE_TOKEN_TEST_XYZ';

    // Insert first table with uniqueToken
    const t1 = db.saveTable({
      name: 'طاولة فريدة 1',
      number: '902',
      hall: 'الرئيسية',
      qr_token: uniqueToken
    });
    assert(t1 && t1.id, 'First table with token must succeed');

    // Attempt to insert second table with the EXACT same token must fail
    let threwError = false;
    try {
      db.saveTable({
        name: 'طاولة مكررة 2',
        number: '903',
        hall: 'الرئيسية',
        qr_token: uniqueToken
      });
    } catch (err) {
      threwError = true;
      assert(/unique|constraint/i.test(err.message), `Error message must indicate unique violation, got: ${err.message}`);
    }
    assert.strictEqual(threwError, true, 'Inserting duplicate qr_token MUST fail due to UNIQUE constraint');
  });

  test('5. ADV-P3-05: Non-destructive migration replaces weak 8-character tokens with strong tokens', async () => {
    // Manually force an 8-char weak token into a table directly via SQL (simulating legacy database)
    const weakToken = '1A2B3C4D';
    db.runSql("INSERT INTO tables (number, name, capacity, status, hall, qr_enabled, qr_token) VALUES ('904', 'طاولة قديمة', 4, 'available', 'الصالون', 1, ?)", [weakToken]);
    if (typeof db.saveDb === 'function') db.saveDb();

    const beforeMigration = db.queryGet("SELECT qr_token FROM tables WHERE number = '904'");
    assert(beforeMigration && beforeMigration.qr_token, 'Inserted table should exist before migration');
    assert.strictEqual(beforeMigration.qr_token, weakToken, 'Weak token was inserted');

    // Re-run database migration (via db.init)
    await db.init(testDbPath);

    const afterMigration = db.queryGet("SELECT qr_token FROM tables WHERE number = '904'");
    assert(afterMigration && afterMigration.qr_token, 'Migrated table must exist');
    assert(afterMigration.qr_token.length >= 40, `Legacy 8-character token must be auto-migrated to >= 40 chars, got: ${afterMigration.qr_token}`);
    assert.notStrictEqual(afterMigration.qr_token, weakToken, 'Legacy weak token must be replaced');
  });
});
