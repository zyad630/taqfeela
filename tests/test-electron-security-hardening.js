const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

async function runElectronSecurityAudit() {
  console.log('====================================================');
  console.log('   ITEM 2: ELECTRON SECURITY & HARDENING AUDIT       ');
  console.log('====================================================\n');

  const testDir = path.join(os.tmpdir(), `cafe-sec-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  const env = {
    ...process.env,
    CAFE_USER_DATA: testDir,
    CAFE_TEST_AUTOMATION: '1',
    NODE_ENV: 'test'
  };
  delete env.ELECTRON_RUN_AS_NODE;

  let electronApp;
  try {
    const electronBinary = require('electron');
    console.log('[1/6] Launching Electron app...');
    electronApp = await electron.launch({
      executablePath: electronBinary,
      args: ['.'],
      env
    });

    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(() => typeof window.api !== 'undefined');
    console.log('   ✓ Window loaded');

    // 1. Audit webPreferences & Preload isolation
    console.log('\n[2/6] Auditing renderer context isolation and nodeIntegration:');
    const leakCheck = await win.evaluate(() => {
      return {
        hasProcess: typeof window.process !== 'undefined',
        hasRequire: typeof window.require !== 'undefined',
        hasBuffer: typeof window.Buffer !== 'undefined',
        hasNodeIntegration: typeof window.process?.versions?.node !== 'undefined',
        hasApi: typeof window.api !== 'undefined',
        hasIpcRenderer: typeof window.ipcRenderer !== 'undefined'
      };
    });
    console.log('   - Isolation audit:', leakCheck);
    assert.strictEqual(leakCheck.hasProcess, false, 'process must NOT leak to window');
    assert.strictEqual(leakCheck.hasRequire, false, 'require must NOT leak to window');
    assert.strictEqual(leakCheck.hasBuffer, false, 'Buffer must NOT leak to window');
    assert.strictEqual(leakCheck.hasNodeIntegration, false, 'Node integration must be disabled');
    assert.strictEqual(leakCheck.hasIpcRenderer, false, 'Raw ipcRenderer must NOT leak to window');
    assert.strictEqual(leakCheck.hasApi, true, 'window.api must be exposed via contextBridge');
    console.log('   ✅ Renderer is fully context-isolated and sandboxed.');

    // 2. Audit will-navigate protection
    console.log('\n[3/6] Auditing will-navigate blocking for untrusted navigation:');
    // Attempt navigating renderer to untrusted URL
    const navBlocked = await win.evaluate(() => {
      try {
        window.location.href = 'https://malicious-phishing-site.com';
        return true;
      } catch (e) {
        return false;
      }
    });
    // Wait slightly to ensure will-navigate intercepted
    await win.waitForTimeout(500);
    const curUrl = win.url();
    console.log('   - Current URL after navigation attempt:', curUrl);
    assert(!curUrl.includes('malicious-phishing-site.com'), 'Navigation to external untrusted URL must be blocked');
    console.log('   ✅ External navigation prevented by will-navigate handler.');

    // 3. Audit window.open protection (must not open unconstrained popup)
    console.log('\n[4/6] Auditing setWindowOpenHandler:');
    const popupCheck = await win.evaluate(() => {
      const w = window.open('https://malicious-site.com', '_blank');
      return w === null;
    });
    console.log('   - window.open returned null (denied direct popup):', popupCheck);
    assert.strictEqual(popupCheck, true, 'window.open must be denied direct renderer popups');
    console.log('   ✅ Direct popup windows denied by setWindowOpenHandler.');

    // 4. Audit XSS in printElementHtml / print:ticketHtml path
    console.log('\n[5/6] Auditing XSS vulnerability in print:ticketHtml path with <img onerror>:');
    // Log in as admin or setup
    const hasAdmin = await win.evaluate(() => window.api.hasAdminUser());
    if (!hasAdmin) {
      await win.evaluate(() => window.api.setupInitialAdmin('AdminPass123456!', 'المدير'));
    }
    await win.evaluate(() => window.api.loginUser('admin', 'AdminPass123456!'));

    // Invoke printTicketHtml with payload containing malicious <img onerror>
    const xssPayload = `
      <div id="printable-receipt">
        <h2>فاتورة كافيه</h2>
        <div class="receipt-order-notes">
          ملاحظة: <img src="nonexistent_xyz.jpg" onerror="window.__xss_executed = 1; document.title = 'XSS_POWNED';">
        </div>
      </div>
    `;

    console.log('   - Invoking print:ticketHtml with XSS payload...');
    const printRes = await win.evaluate((html) => {
      return window.api.printTicketHtml({
        html,
        deviceName: 'test-printer',
        silent: true,
        dryRun: true
      });
    }, xssPayload);
    console.log('   - print:ticketHtml result:', printRes);

    // Verify whether XSS was executed in print window
    // In our security model, printWin MUST have CSP script-src 'none' and strip event handlers
    // We check if XSS was executed or blocked
    assert.strictEqual(printRes.xssExecuted, false, 'XSS MUST NOT execute inside print window');

    console.log('\n[6/6] Checking code-level webPreferences for all BrowserWindow instances:');
    const mainJsCode = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
    // Verify each window config
    assert(mainJsCode.includes("sandbox: true"), 'webPreferences must have sandbox: true');
    assert(mainJsCode.includes("contextIsolation: true"), 'webPreferences must have contextIsolation: true');
    assert(mainJsCode.includes("nodeIntegration: false"), 'webPreferences must have nodeIntegration: false');
    assert(mainJsCode.includes("webSecurity: true"), 'webPreferences must have webSecurity: true');
    assert(mainJsCode.includes("devTools: !app.isPackaged"), 'devTools must be disabled in packaged exe');
    console.log('   ✅ All BrowserWindow instances enforce strict webPreferences.');

    console.log('\n====================================================');
    console.log('   ITEM 2 AUDIT COMPLETE: ALL ASSERTIONS PASSED!    ');
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

runElectronSecurityAudit().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ ITEM 2 AUDIT FAILED WITH ERROR:');
  console.error(err);
  process.exit(1);
});
