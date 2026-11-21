/**
 * Test Item 9: PIN Lockout in SQLite DB + HMAC Integrity (Survives File Deletion & Resists Tamper)
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

async function run() {
  console.log('--- STARTING PIN LOCKOUT TAMPER RESISTANCE TEST ---');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-pin-lockout-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');
  process.env.TEST_DB_PATH = testDbPath;
  process.env.CAFE_DATA_DIR = tempDir;

  const db = require('../electron/db');
  await db.init(testDbPath);

  // 1. Initial state check
  const s0 = db.getPinLockoutState();
  assert.strictEqual(s0.count, 0, 'Initial count should be 0');
  assert.strictEqual(s0.lockedUntil, 0, 'Initial lockedUntil should be 0');
  console.log('✓ 1. Initial state is clean (0 attempts)');

  // 2. Simulate 5 failed PIN attempts
  const now = Date.now();
  db.savePinLockoutState({
    count: 5,
    windowStart: now,
    lockedUntil: now + 60000
  });

  const s1 = db.getPinLockoutState();
  assert.strictEqual(s1.count, 5, 'Count should be 5');
  assert(s1.lockedUntil > now, 'lockedUntil should be in the future');
  console.log('✓ 2. 5 failures properly recorded and locked until:', new Date(s1.lockedUntil).toISOString());

  // 3. Test that deleting any .pin_lockout.json file does NOT reset lockout
  const dummyFile = path.join(tempDir, '.pin_lockout.json');
  fs.writeFileSync(dummyFile, JSON.stringify({ count: 0, windowStart: 0, lockedUntil: 0 }), 'utf8');
  assert(fs.existsSync(dummyFile));
  fs.unlinkSync(dummyFile);
  assert(!fs.existsSync(dummyFile));

  const s2 = db.getPinLockoutState();
  assert.strictEqual(s2.count, 5, 'Deleting file does NOT reset count');
  assert(s2.lockedUntil > now, 'Deleting file does NOT reset lockedUntil');
  console.log('✓ 3. File deletion does NOT reset the lockout (persists safely in SQLite)');

  // 4. Test HMAC Tamper Resistance: Maliciously edit settings row without valid HMAC
  db.runSql("UPDATE settings SET value = '{\"count\":0,\"windowStart\":0,\"lockedUntil\":0,\"hmac\":\"forged_fake_signature\"}' WHERE key = 'pin_lockout_state'");
  const s3 = db.getPinLockoutState();
  assert(s3.lockedUntil > Date.now(), 'Forged HMAC must trigger fail-closed security lockout');
  assert.strictEqual(s3.count, 5, 'Forged HMAC must maintain maximum penalty count');
  console.log('✓ 4. HMAC tamper resistance verified: Forged signature fails closed and locks out');

  // 5. Test successful reset
  db.savePinLockoutState({ count: 0, windowStart: 0, lockedUntil: 0 });
  const s4 = db.getPinLockoutState();
  assert.strictEqual(s4.count, 0, 'Reset count should be 0');
  assert.strictEqual(s4.lockedUntil, 0, 'Reset lockedUntil should be 0');
  console.log('✓ 5. Legitimate reset functions correctly');

  // Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('--- ALL PIN LOCKOUT TAMPER RESISTANCE TESTS PASSED (GREEN) ---');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
