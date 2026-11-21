/**
 * ts-02-static-emergency-pins.test.js
 * BUG-02: أكواد طوارئ ثابتة '9999','1234','admin','manager123' كانت تمنح
 *         وصولاً كاملاً للمدير بغض النظر عن كلمة المرور الفعلية.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-ts02-'));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    if (request === './finance' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'finance'), parent, isMain);
    if (request === './menuData' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'menuData'), parent, isMain);
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

async function setupTestDb() {
  const { db, dir } = loadDb();
  await db.init();
  db.setupInitialAdmin('InitialAdminPass2026!', 'مدير النظام');
  return { db, dir };
}

const STATIC_BACKDOOR_PINS = ['9999', '1234', 'admin', 'manager123', '0000', ''];

describe('TS-02 — BUG-02: No static emergency backdoor passwords', () => {

  test('TS-02-A: loginUser rejects static backdoor "1234" when password is different', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'mySecurePass99' });
    const result = db.loginUser('admin', '1234');
    assert.ok(!result || !result.role,
      'SECURITY: Static PIN "1234" must NOT grant login when admin password is different');
  });

  test('TS-02-B: loginUser rejects backdoor keyword "admin"', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'mySecurePass99' });
    const result = db.loginUser('admin', 'admin');
    assert.ok(!result || !result.role,
      'SECURITY: Backdoor keyword "admin" must NOT bypass real password check');
  });

  test('TS-02-C: loginUser rejects backdoor "manager123"', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'mySecurePass99' });
    const result = db.loginUser('admin', 'manager123');
    assert.ok(!result || !result.role,
      'SECURITY: Backdoor keyword "manager123" must NOT bypass real password check');
  });

  test('TS-02-D: resetAdminPassword rejects fixed PIN "9999"', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'RealPass2026' });
    const result = db.resetAdminPassword('9999', 'hackedPassword');
    assert.strictEqual(result?.success, false,
      'SECURITY: Fixed PIN "9999" must NOT allow password reset');
    // تأكد أن الكلمة لم تتغير
    const loginOld = db.loginUser('admin', 'RealPass2026');
    assert.ok(loginOld && loginOld.role === 'admin', 'Old password must still work after failed reset attempt');
    const loginHacked = db.loginUser('admin', 'hackedPassword');
    assert.ok(!loginHacked || !loginHacked.role, 'Hacked password must NOT work');
  });

  test('TS-02-E: resetAdminPassword rejects fixed PIN "1234"', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'RealPass2026' });
    const result = db.resetAdminPassword('1234', 'hackedPassword');
    assert.strictEqual(result?.success, false,
      'SECURITY: Fixed PIN "1234" must NOT allow password reset');
  });

  test('TS-02-F: resetAdminPassword succeeds with valid cryptographic Ed25519 signature', async () => {
    const { db } = await setupTestDb();
    const machineId = db.getMachineId();
    const PKCS8_BASE64 = 'REDACTED_PRODUCTION_PRIVATE_KEY_FOR_PUBLIC_REVIEW';
    const privKey = `-----BEGIN PRIVATE KEY-----\n${PKCS8_BASE64}\n-----END PRIVATE KEY-----`;
    const signData = `RESET_ADMIN|${machineId}`;
    const validSignature = crypto.sign(null, Buffer.from(signData, 'utf8'), privKey).toString('base64');
    
    const result = db.resetAdminPassword(validSignature, 'NewSecure2026');
    assert.strictEqual(result?.success, true,
      'Password reset must succeed when using a valid cryptographic Ed25519 signature for this machine');
    const login = db.loginUser('admin', 'NewSecure2026');
    assert.ok(login, 'New password must work after reset');
    assert.strictEqual(login.role, 'admin');
  });

  test('TS-02-G: resetAdminPassword rejects empty emergencyPin', async () => {
    const { db } = await setupTestDb();
    const result = db.resetAdminPassword('', 'newpass');
    assert.strictEqual(result?.success, false, 'Empty pin must be rejected');
  });

  test('TS-02-H: resetAdminPassword rejects newPass shorter than 4 chars', async () => {
    const { db } = await setupTestDb();
    const result = db.resetAdminPassword('1234', 'ab');
    assert.strictEqual(result?.success, false,
      'New password shorter than 4 chars must be rejected');
  });

  test('TS-02-I: all static backdoor pins are rejected in loginUser', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'DefinitelyNotBackdoor!' });
    for (const pin of STATIC_BACKDOOR_PINS) {
      const result = db.loginUser('admin', pin);
      const isGranted = Boolean(result && result.role === 'admin');
      assert.ok(!isGranted,
        `SECURITY: Static backdoor pin "${pin}" must NOT grant admin login`);
    }
  });
});
