/**
 * ts-01-password-partial-match.test.js
 * BUG-01: verifyAdminPassword كانت تستخدم includes() — يقبل جزء من الكلمة
 * يتحقق هذا الملف من أن الإصلاح يعمل وأن المشكلة اتكتشفت قبله
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadMockApi() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-ts01-'));
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
  const { db, dir } = loadMockApi();
  await db.init();
  db.setupInitialAdmin('InitialAdminPass2026!', 'مدير النظام');
  return { db, dir };
}

describe('TS-01 — BUG-01: Password strict equality (no includes())', () => {

  test('TS-01-A: admin login with FULL correct password succeeds', async () => {
    const { db } = await setupTestDb();
    const result = db.loginUser('admin', 'InitialAdminPass2026!');
    assert.ok(result, 'Admin must login with correct full password');
    assert.strictEqual(result.role, 'admin');
  });

  test('TS-01-B: verifyAdminPassword rejects PARTIAL password substring', async () => {
    // الثغرة: includes('123') كانت تنجح لو الكلمة 'manager123'
    const { db } = await setupTestDb();
    // غيّر كلمة المرور لقيمة مركّبة
    db.changePassword({ userId: 1, newPassword: 'manager123' });
    const result = db.verifyAdminPassword('manager');
    assert.strictEqual(result?.success, false,
      'SECURITY: partial password "manager" must be REJECTED when full password is "manager123"');
    assert.ok(result?.error, 'Must return error message');
  });

  test('TS-01-C: verifyAdminPassword rejects another substring', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'manager123' });
    const result = db.verifyAdminPassword('123');
    assert.strictEqual(result?.success, false,
      'SECURITY: partial password "123" must be REJECTED when full password is "manager123"');
  });

  test('TS-01-D: verifyAdminPassword rejects trailing substring', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'manager123' });
    const result = db.verifyAdminPassword('r123');
    assert.strictEqual(result?.success, false,
      'Trailing substring must be rejected');
  });

  test('TS-01-E: verifyAdminPassword accepts FULL exact password', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'manager123' });
    const result = db.verifyAdminPassword('manager123');
    assert.strictEqual(result?.success, true,
      'Full exact password must be accepted');
  });

  test('TS-01-F: verifyAdminPassword rejects empty string', async () => {
    const { db } = await setupTestDb();
    const result = db.verifyAdminPassword('');
    assert.strictEqual(result?.success, false, 'Empty string must be rejected');
  });

  test('TS-01-G: verifyAdminPassword is case-sensitive', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'Secret99' });
    const result = db.verifyAdminPassword('secret99');
    assert.strictEqual(result?.success, false,
      'Password check must be case-sensitive — "secret99" !== "Secret99"');
  });

  test('TS-01-H: single character substring is rejected', async () => {
    const { db } = await setupTestDb();
    db.changePassword({ userId: 1, newPassword: 'xYz123' });
    const result = db.verifyAdminPassword('x');
    assert.strictEqual(result?.success, false,
      'Single char substring must be rejected');
  });
});
