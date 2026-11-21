const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

describe('🔒 Phase 4 Security Hardening: Authentication, Password Hardening & Lockout Tests', () => {
  const freshDbPath = path.join(__dirname, 'test-phase4-fresh.db');
  let db;

  before(async () => {
    if (fs.existsSync(freshDbPath)) fs.unlinkSync(freshDbPath);
    db = require('../electron/db');
  });

  after(() => {
    if (fs.existsSync(freshDbPath)) {
      try { fs.unlinkSync(freshDbPath); } catch (_) {}
    }
  });

  test('1. ADV-P4-01: Fresh database MUST NOT seed default admin/1234 or cashier/123456', async () => {
    await db.init(freshDbPath);

    // Default admin/1234 must NOT exist
    const adminLogin = db.loginUser('admin', '1234');
    assert.strictEqual(adminLogin, null, 'Fresh DB must NOT allow login with default admin/1234');

    const cashierLogin = db.loginUser('cashier', '123456');
    assert.strictEqual(cashierLogin, null, 'Fresh DB must NOT allow login with default cashier/123456');

    // hasAdminUser should report false on fresh installation
    assert.strictEqual(db.hasAdminUser ? db.hasAdminUser() : false, false, 'Fresh DB must report no admin configured');
  });

  test('2. ADV-P4-02: Setup wizard rejects weak passwords (<12 chars, common passwords)', () => {
    assert(typeof db.setupInitialAdmin === 'function', 'db.setupInitialAdmin function must exist');

    // Weak: short (< 12 chars)
    const shortRes = db.setupInitialAdmin('Short123!');
    assert.strictEqual(shortRes.success, false, 'Must reject password shorter than 12 characters');

    // Weak: common sequence
    const commonRes = db.setupInitialAdmin('123456789012');
    assert.strictEqual(commonRes.success, false, 'Must reject common trivial numeric password');

    // Weak: all letters without complexity
    const lettersRes = db.setupInitialAdmin('administrator');
    assert.strictEqual(lettersRes.success, false, 'Must reject simple single-class password');
  });

  test('3. ADV-P4-03: Setup wizard succeeds with strong 12+ character password', () => {
    const strongPass = 'SuperSecureAdminPass2026!';
    const setupRes = db.setupInitialAdmin(strongPass, 'مدير النظام المعتمد');
    assert.strictEqual(setupRes.success, true, 'Setup with strong password must succeed');

    // Now admin can log in with new password
    const loginRes = db.loginUser('admin', strongPass);
    assert(loginRes && loginRes.id, 'Admin must be able to log in with newly configured password');
    assert.strictEqual(loginRes.role, 'admin');
  });

  test('4. ADV-P4-04: Plaintext password comparison is strictly rejected (bcrypt only)', () => {
    // Manually insert a user with unhashed plaintext password
    db.runSql("INSERT INTO users (username, name, password, role, created_at) VALUES ('plaintext_user', 'مستخدم نصي', 'rawSecret123', 'cashier', '2026-10-15')");

    // Login attempting raw comparison must be REJECTED (must not accept plain text)
    const loginAttempt = db.loginUser('plaintext_user', 'rawSecret123');
    assert.strictEqual(loginAttempt, null, 'loginUser must NEVER match plaintext password directly');
  });

  test('5. ADV-P4-05: Progressive lockout triggers after repeated failed login attempts', () => {
    const strongPass = 'SuperSecureAdminPass2026!';
    const clientIp = '192.168.1.99';

    // 10 consecutive failed attempts
    for (let i = 0; i < 10; i++) {
      db.loginUser('admin', 'wrong_pass_' + i, clientIp);
    }

    // Now even correct password should be locked out temporarily
    const lockedAttempt = db.loginUser('admin', strongPass, clientIp);
    assert(lockedAttempt && lockedAttempt.locked === true, 'Account/IP must be locked after 10 failed attempts');
    assert(lockedAttempt.error && lockedAttempt.error.includes('مؤقت'), 'Error must inform about temporary lockout');
  });

  test('6. ADV-P4-06: Existing user with known default password is flagged with must_change_password', async () => {
    const legacyDbPath = path.join(__dirname, 'test-phase4-legacy.db');
    if (fs.existsSync(legacyDbPath)) fs.unlinkSync(legacyDbPath);

    // Create legacy DB with bcrypt('1234')
    const bcrypt = require('bcryptjs');
    const legacyHash = bcrypt.hashSync('1234', 10);
    await db.init(legacyDbPath);

    db.runSql("INSERT INTO users (username, name, password, role, created_at, must_change_password) VALUES ('legacy_admin', 'مدير قديم', ?, 'admin', '2026-10-15', 0)", [legacyHash]);
    if (typeof db.saveDb === 'function') db.saveDb();

    // Re-run init to trigger migration checks
    await db.init(legacyDbPath);

    const legacyUser = db.queryGet("SELECT must_change_password FROM users WHERE username = 'legacy_admin'");
    assert.strictEqual(legacyUser.must_change_password, 1, 'Legacy user with default password must have must_change_password = 1');

    if (fs.existsSync(legacyDbPath)) fs.unlinkSync(legacyDbPath);
  });
});
