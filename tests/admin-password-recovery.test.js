const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const PKCS8_BASE64 = 'REDACTED_PRODUCTION_PRIVATE_KEY_FOR_PUBLIC_REVIEW';
const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----\n${PKCS8_BASE64}\n-----END PRIVATE KEY-----`;

function loadDbModule(modulePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-admin-recovery-test-'));
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    if (request === './finance' && parent && parent.filename.endsWith('db.js') && !parent.filename.includes('electron')) {
      return original.call(this, path.join(__dirname, '..', 'electron', 'finance'), parent, isMain);
    }
    if (request === './menuData' && parent && parent.filename.endsWith('db.js') && !parent.filename.includes('electron')) {
      return original.call(this, path.join(__dirname, '..', 'electron', 'menuData'), parent, isMain);
    }
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve(modulePath)];
  const db = require(modulePath);
  Module._load = original;
  return { db, dir };
}

describe('🔐 Addendum 14: Secure Admin Password Reset via Ed25519 Signature', () => {
  test('electron/db.js: resetAdminPassword security and signature verification', async () => {
    const { db, dir } = loadDbModule('../electron/db');
    await db.init();

    const machineId = db.getMachineId();
    assert.ok(machineId, 'machineId must exist');

    // 1. Rejection of empty or non-string pin
    const emptyRes = db.resetAdminPassword('', 'NewPass1234');
    assert.strictEqual(emptyRes.success, false);
    assert.strictEqual(emptyRes.error, 'رمز الاسترجاع مطلوب');

    // 2. Rejection of random string / invalid base64 / invalid signature
    const randomRes = db.resetAdminPassword('RandomJunkText123', 'NewPass1234');
    assert.strictEqual(randomRes.success, false);
    assert.ok(randomRes.error.includes('رمز الاسترجاع غير'));

    // 3. Rejection of valid signature generated for a DIFFERENT machine ID
    const otherMachineId = 'DIFFERENT0000000';
    const otherSignData = `RESET_ADMIN|${otherMachineId}`;
    const otherSignature = crypto.sign(null, Buffer.from(otherSignData, 'utf8'), PRIVATE_KEY_PEM).toString('base64');
    const wrongMachineRes = db.resetAdminPassword(otherSignature, 'NewPass1234');
    assert.strictEqual(wrongMachineRes.success, false);
    assert.ok(wrongMachineRes.error.includes('لا يخص هذا الجهاز') || wrongMachineRes.error.includes('غير صحيح'));

    // 4. Acceptance of valid signature generated for THIS machine ID
    const validSignData = `RESET_ADMIN|${machineId}`;
    const validSignature = crypto.sign(null, Buffer.from(validSignData, 'utf8'), PRIVATE_KEY_PEM).toString('base64');
    const successRes = db.resetAdminPassword(validSignature, 'CorrectNewPass9999');
    assert.strictEqual(successRes.success, true);

    // 5. Verify admin can login with the new password
    const loginRes = db.loginUser('admin', 'CorrectNewPass9999');
    assert.ok(loginRes, 'Admin should successfully log in with the new password');
    assert.strictEqual(loginRes.username, 'admin');

    // 6. Old password must be rejected
    const oldLoginRes = db.loginUser('admin', '1234');
    assert.strictEqual(oldLoginRes, null, 'Old password must fail');

    // Cleanup temp dir
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('db.js (root): resetAdminPassword security and signature verification', async (t) => {
    let exists = false;
    try {
      require.resolve('../db');
      exists = true;
    } catch (_) {}
    if (!exists) {
      t.skip('Root db.js is not present; only electron/db.js is active.');
      return;
    }
    const { db, dir } = loadDbModule('../db');
    await db.init();

    const machineId = db.getMachineId();
    assert.ok(machineId, 'machineId must exist');

    // Random string rejected
    const randomRes = db.resetAdminPassword('ArbitraryToken', 'NewPass1234');
    assert.strictEqual(randomRes.success, false);

    // Signature for different machine rejected
    const otherMachineSign = crypto.sign(null, Buffer.from('RESET_ADMIN|WRONGMACHINE999', 'utf8'), PRIVATE_KEY_PEM).toString('base64');
    const wrongRes = db.resetAdminPassword(otherMachineSign, 'NewPass1234');
    assert.strictEqual(wrongRes.success, false);

    // Correct signature succeeds
    const validSignData = `RESET_ADMIN|${machineId}`;
    const validSignature = crypto.sign(null, Buffer.from(validSignData, 'utf8'), PRIVATE_KEY_PEM).toString('base64');
    const successRes = db.resetAdminPassword(validSignature, 'RootNewPass8888');
    assert.strictEqual(successRes.success, true);

    // Login with new password succeeds
    const loginRes = db.loginUser('admin', 'RootNewPass8888');
    assert.ok(loginRes, 'Admin should log in with new password');

    // Cleanup temp dir
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
