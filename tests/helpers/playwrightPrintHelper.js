const path = require('path');
const { _electron: electron } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const PDFTOTEXT = 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe';

function parsePdfDetails(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const raw = buf.toString('latin1');
  const pageMatches = raw.match(/\/Type\s*\/Page\b/g) || [];
  const mediaBoxes = [];
  const mbRegex = /\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g;
  let m;
  while ((m = mbRegex.exec(raw)) !== null) {
    const wPt = parseFloat(m[3]) - parseFloat(m[1]);
    const hPt = parseFloat(m[4]) - parseFloat(m[2]);
    mediaBoxes.push({
      wPt,
      hPt,
      wMm: +(wPt * 25.4 / 72).toFixed(2),
      hMm: +(hPt * 25.4 / 72).toFixed(2)
    });
  }
  const fullText = execFileSync(PDFTOTEXT, [pdfPath, '-'], { encoding: 'utf8' });
  const pagesText = fullText.split('\f').map(s => s.trim()).filter((_, idx, arr) => idx < pageMatches.length || _);
  return {
    pageCount: pageMatches.length,
    mediaBox: mediaBoxes[0] || null,
    fullText,
    pagesText
  };
}

async function launchTestElectron(prefix = 'cafe-pw-') {
  const TEMP_ROOT = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
  const tmpDir = fs.mkdtempSync(path.join(TEMP_ROOT, prefix));
  const pdfDir = path.join(tmpDir, 'pdfs');
  fs.mkdirSync(pdfDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CHROME_CRASHPAD_PIPE_NAME;
  env.TEMP = TEMP_ROOT;
  env.TMP = TEMP_ROOT;
  env.CAFE_TEST_AUTOMATION = '1';
  env.CAFE_USER_DATA = tmpDir;
  env.CAFE_PRINT_PDF_DIR = pdfDir;

  const electronBinary = require('electron');
  console.log('[PW Helper] Calling electron.launch with binary:', electronBinary);
  const app = await electron.launch({
    executablePath: electronBinary,
    args: ['.', '--disable-gpu'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });
  console.log('[PW Helper] electron.launch resolved! Getting firstWindow...');

  const win = await app.firstWindow({ timeout: 60000 });
  console.log('[PW Helper] firstWindow resolved!');
  await win.setViewportSize({ width: 1366, height: 768 });
  await win.waitForLoadState('domcontentloaded');
  console.log('[PW Helper] domcontentloaded!');

  // Ensure initial admin setup + login + open shift via preload API, then reload so React hydrates session
  await win.evaluate(async () => {
    sessionStorage.setItem('skip_printer_wizard', '1');
    const hasAdmin = await window.api.hasAdminUser();
    if (!hasAdmin) {
      await window.api.setupInitialAdmin('AdminPass1234', 'مدير النظام', { cafe_name: 'كافيه الاختبار' });
    }
    const user = await window.api.loginUser('admin', 'AdminPass1234');
    await window.api.saveSettings({ printer_setup_done: 'true', silent_print: '1', receipt_paper_width: '80' });
    const curShift = await window.api.currentShift();
    if (!curShift || curShift.error) {
      await window.api.openShift(500, 'وردية اختبار Playwright', user, 'الشيفت الصباحي');
    }
  });
  console.log('[PW Helper] Admin & shift initialized! Reloading...');

  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  console.log('[PW Helper] Waiting for .tab-navigation...');
  await win.waitForSelector('.tab-navigation', { timeout: 15000 });
  console.log('[PW Helper] Ready!');

  async function cleanup() {
    try {
      await app.evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.removeAllListeners('close');
          w.destroy();
        }
      });
    } catch (_) {}
    try { await app.close(); } catch (_) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }

  return { app, win, tmpDir, pdfDir, cleanup };
}

module.exports = {
  PDFTOTEXT,
  parsePdfDetails,
  launchTestElectron
};
