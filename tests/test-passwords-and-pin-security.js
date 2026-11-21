const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const bcrypt = require('bcryptjs');

async function runPasswordsAndPinAudit() {
  console.log('====================================================');
  console.log('   ITEM 3: PASSWORDS, PIN LOCKOUT & SECRETS AUDIT   ');
  console.log('====================================================\n');

  const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
  const testDir = path.join(baseTemp, `cafe-pin-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  const env = {
    ...process.env,
    TEMP: baseTemp,
    TMP: baseTemp,
    CAFE_USER_DATA: testDir,
    CAFE_TEST_AUTOMATION: '1',
    NODE_ENV: 'test'
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CHROME_CRASHPAD_PIPE_NAME;

  let electronApp;
  try {
    const electronBinary = require('electron');
    console.log('[1/5] Launching Electron app...');
    electronApp = await electron.launch({
      executablePath: electronBinary,
      args: ['.', '--disable-gpu'],
      env
    });

    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(() => typeof window.api !== 'undefined');

    // 1. Audit bcrypt cost factor in database
    console.log('\n[2/5] Auditing bcrypt cost factor for generated hashes:');
    const hasAdmin = await win.evaluate(() => window.api.hasAdminUser());
    if (!hasAdmin) {
      await win.evaluate(() => window.api.setupInitialAdmin('AdminPass123456!', 'المدير'));
    }

    // Read users directly from SQLite database file on disk to inspect raw password hashes
    const dbModule = require('../electron/db');
    // Save DB to disk so we can read it
    const dbPath = path.join(testDir, 'cafe-pos.db');
    assert(fs.existsSync(dbPath), 'Database file must exist on disk');

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const dbData = fs.readFileSync(dbPath);
    const diskDb = new SQL.Database(dbData);
    const stmt = diskDb.prepare('SELECT username, password FROM users');
    let hashCount = 0;
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const hash = row.password;
      if (hash && (hash.startsWith('$2a$') || hash.startsWith('$2b$'))) {
        hashCount++;
        // Extract cost factor: format is $2b$XX$... where XX is cost
        const parts = hash.split('$');
        const cost = parseInt(parts[2], 10);
        console.log(`   - User "${row.username}": bcrypt hash cost factor = ${cost}`);
        assert(cost >= 10, `bcrypt cost factor must be at least 10 (found ${cost})`);
      }
    }
    stmt.free();
    diskDb.close();
    assert(hashCount > 0, 'Must have inspected at least one bcrypt hash');
    console.log('   ✅ All user password hashes use bcrypt cost factor >= 10.');

    // 2. Audit 4-digit PIN attempt lockout in main.js
    console.log('\n[3/5] Auditing 4-digit PIN / Emergency PIN lockout in main.js:');
    let pinLockoutTriggered = false;
    let pinLockoutMessage = '';
    for (let i = 1; i <= 6; i++) {
      const pinRes = await win.evaluate((attempt) => {
        return window.api.resetAdminPassword(`123${attempt}`, 'NewSecureAdminPassword123!');
      }, i);
      console.log(`   - PIN attempt ${i}:`, pinRes);
      if (i <= 5) {
        assert.strictEqual(pinRes.success, false, `Attempt ${i} must fail`);
      } else {
        // 6th attempt MUST trigger rate-limit lockout
        assert.strictEqual(pinRes.success, false, '6th attempt must be blocked by rate limiter');
        if (pinRes.error && pinRes.error.includes('تم تجاوز الحد المسموح')) {
          pinLockoutTriggered = true;
          pinLockoutMessage = pinRes.error;
        }
      }
    }
    assert(pinLockoutTriggered, 'PIN lockout MUST be triggered after 5 failed attempts in main.js');
    console.log('   ✓ PIN lockout message confirmed:', pinLockoutMessage);
    console.log('   ✅ Main process enforces strict PIN rate-limiting and brute-force lockout.');

    // 3. Audit default weak passwords handling
    console.log('\n[4/5] Auditing weak / default passwords enforcement (1234 / 123456):');
    // Setup login as admin to create test user with default pass
    await win.evaluate(() => window.api.loginUser('admin', 'AdminPass123456!'));
    // Attempt saving user with weak default password (123456)
    const weakUser = await win.evaluate(() => {
      return window.api.saveUser({
        username: 'weak_test_cashier',
        name: 'كاشير ضعيف',
        password: '123456',
        role: 'cashier',
        salary: 3000
      });
    });
    console.log('   - saveUser with weak default password (123456):', weakUser);
    // Logout admin
    await win.evaluate(() => window.api.logoutUser());

    // Login with weak password — must flag must_change_password
    const weakLogin = await win.evaluate(() => window.api.loginUser('weak_test_cashier', '123456'));
    console.log('   - Login response for weak password user:', weakLogin);
    assert(weakLogin && weakLogin.role === 'cashier', 'Login must authenticate');
    assert.strictEqual(weakLogin.must_change_password, 1, 'Weak default passwords MUST trigger mandatory change flag (must_change_password=1)');
    console.log('   ✅ Weak passwords automatically trigger must_change_password flag.');

    // 4. Audit code for secrets and sensitive log leakage
    console.log('\n[5/5] Auditing codebase packaging exclusions and sensitive log exposure:');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    const filesToPackage = JSON.stringify(pkg.build.files);
    assert(!filesToPackage.includes('"scripts"'), 'scripts/ folder MUST NOT be packaged into distribution exe');
    assert(!filesToPackage.includes('generate-license.js'), 'Keygen script MUST NOT be packaged into distribution exe');
    console.log('   ✓ Verified packaging configuration excludes scripts/ and private keygen tools');

    // Audit audit_log table to verify no passwords stored
    const diskDb2 = new SQL.Database(fs.readFileSync(dbPath));
    const auditRows = diskDb2.exec('SELECT action, entity_type, details FROM audit_log');
    if (auditRows.length > 0) {
      for (const row of auditRows[0].values) {
        const details = String(row[2] || '');
        assert(!details.includes('$2a$') && !details.includes('$2b$'), 'audit_log must NEVER contain password hash');
        assert(!details.includes('AdminPass123456!'), 'audit_log must NEVER contain plaintext password');
        assert(!details.includes('NewSecureAdminPassword123!'), 'audit_log must NEVER contain plaintext password');
      }
    }
    diskDb2.close();
    console.log('   ✅ audit_log entries are completely free of plaintext passwords or hashes.');

    console.log('\n====================================================');
    console.log('   ITEM 3 AUDIT COMPLETE: ALL ASSERTIONS PASSED!    ');
    console.log('====================================================');
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runPasswordsAndPinAudit().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ ITEM 3 AUDIT FAILED WITH ERROR:');
  console.error(err);
  process.exit(1);
});
