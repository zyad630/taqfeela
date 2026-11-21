/**
 * Acceptance Test for FIX-12 (SEC-01): Password Length Uniformity & Backward-Compatibility
 * Tests:
 * 1. Unified constant MIN_PASSWORD_LENGTH = 6 in constants.js and electron/db.js.
 * 2. Rejection of passwords with length < 6 in emergency reset and user creation.
 * 3. Verification that existing users with 4-char legacy passwords can still authenticate (no lockout).
 * 4. UI alignment in LoginScreen.jsx and App.jsx.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const os = require('os');

const { MIN_PASSWORD_LENGTH } = require('../src/constants.js');
const db = require('../electron/db.js');

async function testPasswordRules() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-fix12-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  await db.init(dbPath);

  console.log('--- TEST 1: Unified Constant Definition ---');
  assert.strictEqual(MIN_PASSWORD_LENGTH, 6, 'MIN_PASSWORD_LENGTH must equal 6');
  console.log('✓ Unified MIN_PASSWORD_LENGTH is 6 in constants.js.\n');

  console.log('--- TEST 2: Rejection of Sub-6-Character Passwords in db.js ---');
  // Attempt emergency reset with 4-char password
  const shortReset = db.emergencyResetPassword('0000', '1234');
  console.log('Sub-6 emergency reset response:', shortReset);
  assert.strictEqual(shortReset.success, false);
  assert(shortReset.error.includes('6'), 'Error message must specify 6 characters');

  // Attempt user creation with 5-char password
  let userError = '';
  try {
    db.saveUser({
      name: 'موظف تجريبي',
      username: 'temp_cashier_short',
      password: '12345',
      role: 'cashier'
    });
  } catch (err) {
    userError = err.message;
  }
  console.log('Sub-6 saveUser error:', userError);
  assert(userError.includes('6'), 'saveUser error message must specify 6 characters');
  console.log('✅ TEST 2 PASSED: Passwords < 6 chars are cleanly rejected.\n');

  console.log('--- TEST 3: Existing Legacy Users Compatibility (No Lockout) ---');
  // Create or verify an existing user with legacy 4-char hash
  const legacyPass = '1234';
  const legacyHash = bcrypt.hashSync(legacyPass, 10);

  // Directly insert legacy user to simulate pre-existing database record
  db.runSql(
    "INSERT OR REPLACE INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ['legacy_cashier', 'كاشير قديم', legacyHash, 'cashier', '01011111111', 3500, 'الصباحي', '08:00', '16:00', new Date().toISOString(), 0]
  );

  // Verify that legacy user can still login successfully
  const loginResult = db.loginUser('legacy_cashier', legacyPass);
  console.log('Legacy 4-char user login result:', loginResult ? `Success (User ID: ${loginResult.id})` : 'Failed');
  assert(loginResult && loginResult.id, 'Existing users with legacy 4-char passwords must be allowed to log in');
  console.log('✅ TEST 3 PASSED: Legacy accounts remain accessible without breaking.\n');
}

function testCodebaseAlignment() {
  console.log('--- TEST 4: Frontend UI Alignment ---');
  const baseDir = path.resolve(__dirname, '..');
  const loginSrc = fs.readFileSync(path.join(baseDir, 'src/components/screens/LoginScreen.jsx'), 'utf8');
  const loginSplit = fs.readFileSync(path.join(baseDir, 'cafe-pos-split/src/components/screens/LoginScreen.jsx'), 'utf8');
  const appSrc = fs.readFileSync(path.join(baseDir, 'src/App.jsx'), 'utf8');
  const appSplit = fs.readFileSync(path.join(baseDir, 'cafe-pos-split/src/App.jsx'), 'utf8');
  const dbSrc = fs.readFileSync(path.join(baseDir, 'electron/db.js'), 'utf8');

  // Verify MIN_PASSWORD_LENGTH in UI
  assert(loginSrc.includes('MIN_PASSWORD_LENGTH'), 'LoginScreen.jsx must import and use MIN_PASSWORD_LENGTH');
  assert(loginSplit.includes('MIN_PASSWORD_LENGTH'), 'cafe-pos-split LoginScreen.jsx must import and use MIN_PASSWORD_LENGTH');
  assert(!loginSrc.includes('length < 4'), 'LoginScreen.jsx must not have legacy length < 4');

  assert(appSrc.includes('MIN_PASSWORD_LENGTH'), 'App.jsx must import and use MIN_PASSWORD_LENGTH');
  assert(appSplit.includes('MIN_PASSWORD_LENGTH'), 'cafe-pos-split App.jsx must import and use MIN_PASSWORD_LENGTH');

  assert(dbSrc.includes('const MIN_PASSWORD_LENGTH = 6;'), 'db.js must define MIN_PASSWORD_LENGTH = 6');
  assert(!dbSrc.includes('length < 4'), 'db.js must not contain length < 4 for passwords');

  console.log('✅ TEST 4 PASSED: Frontend and Backend password lengths are completely unified.\n');
}

async function run() {
  console.log('====================================================');
  console.log('       RUNNING ACCEPTANCE TEST FIX-12 (SEC-01)      ');
  console.log('====================================================\n');
  await testPasswordRules();
  testCodebaseAlignment();
  console.log('====================================================');
  console.log('       ALL ACCEPTANCE TESTS FOR FIX-12 PASSED!      ');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

