const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../electron/db');
const security = require('../electron/security');

describe('🛡️ Anti-Tamper & Security Lockdown Verification', () => {
  const testDir = path.join(__dirname, 'tmp-security-test');
  const testDbPath = path.join(testDir, 'test-sec.db');

  before(() => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    // Clean any leftover lock file
    const lockFile = security.getLockFilePath();
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  });

  after(() => {
    const lockFile = security.getLockFilePath();
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('1. Legal Notice contains explicit AI / IDE / Decompiler warning', () => {
    assert.ok(security.LEGAL_NOTICE_TEXT.includes('الملكية الفكرية'));
    assert.ok(security.LEGAL_NOTICE_TEXT.includes('الذكاء الاصطناعي'));
    assert.ok(security.LEGAL_NOTICE_TEXT.includes('الهندسة العكسية'));
  });

  test('2. Tamper Lockout detection and Fail-Closed activation rejection', () => {
    const lockFile = security.getLockFilePath();
    assert.strictEqual(fs.existsSync(lockFile), false);

    // Simulate tamper detection by creating lock file
    fs.writeFileSync(lockFile, JSON.stringify({
      tamperLocked: true,
      reason: 'AI_MODEL_CODE_EXTRACTION_ATTEMPT',
      timestamp: new Date().toISOString()
    }), 'utf8');

    assert.strictEqual(security.isTamperLocked(), true);

    const status = db.getLicenseStatus();
    assert.strictEqual(status.isTamperLocked, true);
    assert.strictEqual(status.isActivated, false);
    assert.ok(status.error.includes('قفل البرنامج نهائياً'));

    // Attempting to activate should be blocked
    const actResult = db.activateLicense('DUMMY_KEY');
    assert.strictEqual(actResult.success, false);
    assert.ok(actResult.error.includes('القفل الأمني'));

    // Cleanup lock
    fs.unlinkSync(lockFile);
    assert.strictEqual(security.isTamperLocked(), false);
  });

  test('3. Vendor Emergency Tamper Unlock with Ed25519 signature', () => {
    const machineId = db.getMachineId();

    const PKCS8_BASE64 = 'REDACTED_PRODUCTION_PRIVATE_KEY_FOR_PUBLIC_REVIEW';
    const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----\n${PKCS8_BASE64}\n-----END PRIVATE KEY-----`;

    // Lock system
    const lockFile = security.getLockFilePath();
    fs.writeFileSync(lockFile, JSON.stringify({ tamperLocked: true }), 'utf8');
    assert.strictEqual(security.isTamperLocked(), true);

    // Try fake unlock
    const fakeUnlock = db.unlockTamper('INVALID_UNLOCK_CODE');
    assert.strictEqual(fakeUnlock.success, false);
    assert.strictEqual(security.isTamperLocked(), true);

    // Sign valid unlock payload: "UNLOCK_TAMPER|MACHINEID"
    const signData = `UNLOCK_TAMPER|${machineId}`;
    const validSig = crypto.sign(null, Buffer.from(signData, 'utf8'), PRIVATE_KEY_PEM).toString('base64');
    const unlockResult = db.unlockTamper(validSig);

    assert.strictEqual(unlockResult.success, true);
    assert.ok(unlockResult.message.includes('فك القفل'));
    assert.strictEqual(security.isTamperLocked(), false);
  });
});
