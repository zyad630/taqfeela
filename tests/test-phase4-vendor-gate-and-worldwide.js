/**
 * tests/test-phase4-vendor-gate-and-worldwide.js
 *
 * Comprehensive Verification Suite for Phase 4:
 * 1. Vendor Developer Code (Ed25519 VENDOR_DEV|<machineId>) CANNOT be bypassed via:
 *    - saveSettings() overwriting enable_mobile_hub, enable_waiter_system, enable_customer_qr, etc.
 *    - saveSettings() overwriting tamper_locked, last_system_time, license_key, pin_lockout_state
 *    - saveVendorFeatures() with empty, wrong, or wrong-machineId signature
 * 2. Legitimate Vendor Ed25519 signature unlocks & locks enable_mobile_hub cleanly
 * 3. Worldwide Timezone Fix: main.js no longer forces Africa/Cairo unconditionally
 * 4. IPC Backend Gating: main.js gates mobile:createPairingSession/list/revoke/delete behind enable_mobile_hub
 *    and enforces rate-limiting on vendor:saveFeatures
 * 5. Frontend Gating: SettingsTab.jsx gates Mobile Hub card & MobilePairingModal behind isMobileHubEnabled
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
const testDir = path.join(baseTemp, `cafe-phase4-test-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'cafe-pos.db');

async function run() {
  console.log('====================================================');
  console.log('   PHASE 4 VENDOR GATE & WORLDWIDE AUDIT SUITE      ');
  console.log('====================================================\n');

  const db = require('../electron/db');
  await db.init(testDbPath);

  try {
    // 1. Default state: Mobile Hub MUST be disabled by default
    console.log('--- 1. Default Locked State ---');
    assert.strictEqual(db.isVendorFeatureEnabled('enable_mobile_hub'), false, 'enable_mobile_hub must default to false');
    assert.strictEqual(db.isVendorFeatureEnabled('enable_waiter_system'), false, 'enable_waiter_system must default to false');
    assert.strictEqual(db.isVendorFeatureEnabled('enable_customer_qr'), false, 'enable_customer_qr must default to false');
    console.log('✓ Paid/Developer modules are locked by default');

    // 2. Attack: Admin tries to bypass Vendor Code via saveSettings()
    console.log('\n--- 2. Bypass Resistance via saveSettings() ---');
    db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('tamper_locked', '1')", [], { skipSave: true });
    db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', '2026-11-20T12:00:00.000Z')", [], { skipSave: true });

    db.saveSettings({
      cafe_name: 'كافيه الرياض',
      enable_mobile_hub: 'true',
      enable_waiter_system: 'true',
      enable_customer_qr: 'true',
      enable_waiter_qr: 'true',
      enable_notebook_for_admin: 'false',
      enable_guest_check: 'false',
      tamper_locked: '0',
      last_system_time: '2020-01-01T00:00:00.000Z',
      license_key: 'FORGED_KEY'
    });

    const s = db.getSettings();
    assert.strictEqual(s.cafe_name, 'كافيه الرياض', 'Normal setting cafe_name must still save');
    assert.strictEqual(db.isVendorFeatureEnabled('enable_mobile_hub'), false, 'saveSettings MUST NOT enable enable_mobile_hub');
    assert.strictEqual(db.isVendorFeatureEnabled('enable_waiter_system'), false, 'saveSettings MUST NOT enable enable_waiter_system');
    assert.strictEqual(db.isVendorFeatureEnabled('enable_customer_qr'), false, 'saveSettings MUST NOT enable enable_customer_qr');
    assert.strictEqual(s.tamper_locked, '1', 'saveSettings MUST NOT clear tamper_locked');
    assert.strictEqual(s.last_system_time, '2026-11-20T12:00:00.000Z', 'saveSettings MUST NOT overwrite last_system_time');
    assert.notStrictEqual(s.license_key, 'FORGED_KEY', 'saveSettings MUST NOT overwrite license_key');
    console.log('✓ saveSettings() strictly blocked all vendor feature flags and protected security keys');

    // 3. Attack: saveVendorFeatures() with empty, invalid, or wrong-machineId signatures
    console.log('\n--- 3. Vendor Ed25519 Signature Enforcement ---');
    const keygenSrc = fs.readFileSync(path.join(__dirname, '../scripts/generate-license.js'), 'utf8');
    const privateKeyPem = keygenSrc.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)[0];

    const bad1 = db.saveVendorFeatures({ vendorPassword: '', features: { enable_mobile_hub: true } });
    assert.strictEqual(bad1.success, false);

    const bad2 = db.saveVendorFeatures({ vendorPassword: '123456', features: { enable_mobile_hub: true } });
    assert.strictEqual(bad2.success, false);

    // Valid Ed25519 signature, but signed for a DIFFERENT Machine ID
    const wrongMachineSig = crypto.sign(null, Buffer.from('VENDOR_DEV|OTHER_MACHINE_999', 'utf8'), privateKeyPem).toString('base64');
    const bad3 = db.saveVendorFeatures({ vendorPassword: wrongMachineSig, features: { enable_mobile_hub: true } });
    assert.strictEqual(bad3.success, false);
    assert.strictEqual(db.isVendorFeatureEnabled('enable_mobile_hub'), false);
    console.log('✓ Rejected empty, plaintext, and wrong-MachineID signatures');

    // 4. Legitimate Vendor Ed25519 signature for THIS machine unlocks and locks enable_mobile_hub
    const machineId = db.getMachineId();
    const validVendorSig = crypto.sign(null, Buffer.from(`VENDOR_DEV|${machineId}`, 'utf8'), privateKeyPem).toString('base64');

    const okEnable = db.saveVendorFeatures({ vendorPassword: validVendorSig, features: { enable_mobile_hub: true } });
    assert.strictEqual(okEnable.success, true);
    assert.strictEqual(db.isVendorFeatureEnabled('enable_mobile_hub'), true, 'Valid vendor signature must unlock enable_mobile_hub');

    const okDisable = db.saveVendorFeatures({ vendorPassword: validVendorSig, features: { enable_mobile_hub: false } });
    assert.strictEqual(okDisable.success, true);
    assert.strictEqual(db.isVendorFeatureEnabled('enable_mobile_hub'), false, 'Valid vendor signature must lock enable_mobile_hub back');
    console.log('✓ Legitimate Ed25519 VENDOR_DEV signature toggled enable_mobile_hub cleanly');

    // 5. Static Audit: Worldwide TZ + IPC Gating + UI Gating
    console.log('\n--- 4. Worldwide Timezone, IPC & UI Gating Verification ---');
    const mainSrc = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
    const settingsTabSrc = fs.readFileSync(path.join(__dirname, '../src/components/tabs/SettingsTab.jsx'), 'utf8');

    assert.ok(!mainSrc.includes("process.env.TZ = 'Africa/Cairo'"), 'main.js must not hardcode Africa/Cairo for worldwide deployment');
    assert.ok(mainSrc.includes("isVendorFeatureEnabled('enable_mobile_hub')"), 'main.js must gate mobile pairing IPC behind enable_mobile_hub');
    assert.ok(mainSrc.includes("ipcMain.handle('vendor:saveFeatures'") && mainSrc.includes('checkPinRateLimit()'), 'vendor:saveFeatures must be rate-limited');
    assert.ok(settingsTabSrc.includes('const isMobileHubEnabled ='), 'SettingsTab must compute isMobileHubEnabled');
    assert.ok(settingsTabSrc.includes('{isMobileHubEnabled && ('), 'SettingsTab must hide Mobile Hub & QR pairing unless vendor enabled');
    console.log('✓ Worldwide timezone, backend IPC gating, rate-limiting, and UI gating verified');

    console.log('\n====================================================');
    console.log('   ALL PHASE 4 VENDOR GATE & WORLDWIDE PASSED!      ');
    console.log('====================================================');
  } finally {
    if (typeof db.shutdownWriterWorker === 'function') {
      await db.shutdownWriterWorker();
    }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((err) => {
  console.error('❌ PHASE 4 TEST FAILED:', err);
  process.exit(1);
});

