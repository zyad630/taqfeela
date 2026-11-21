const assert = require('assert');
const { launchTestElectron } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Playwright Electron Verification: Latte Theme Contrast & Visibility ---');
  const { app, win, cleanup } = await launchTestElectron('cafe-pw-latte-');

  try {
    // Enable Latte theme via the real app setting (app_theme = 'latte')
    await win.evaluate(async () => {
      localStorage.setItem('cafepos_app_theme', 'latte');
      await window.api.saveSettings({ app_theme: 'latte' });
    });
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(bw => !bw.isDestroyed() && bw.isVisible()) || BrowserWindow.getAllWindows()[0];
      if (w) {
        w.webContents.removeAllListeners('will-prevent-unload');
        w.webContents.on('will-prevent-unload', (e) => e.preventDefault());
        w.webContents.reloadIgnoringCache();
      }
    });
    await win.waitForTimeout(1500);
    await win.waitForSelector('.tab-navigation', { timeout: 15000 });
    await win.waitForTimeout(600);
    const hasLatte = await win.evaluate(() => document.body.classList.contains('theme-latte'));
    assert.ok(hasLatte, 'body must have theme-latte class after real app_theme=latte load');

    // 1. Go to Reports Tab
    const reportsBtn = win.locator('.tab-navigation button').filter({ hasText: /التقارير/ }).first();
    await reportsBtn.click();
    await win.waitForTimeout(500);
    await win.evaluate(() => { document.body.classList.add('theme-latte'); });

    // Check Screenshot 3: .active-report-badge inside .report-tab-card.active
    const badgeStyles = await win.evaluate(() => {
      const badge = document.querySelector('.report-tab-card.active .active-report-badge');
      if (!badge) return null;
      const cs = getComputedStyle(badge);
      return { text: badge.textContent.trim(), color: cs.color, backgroundColor: cs.backgroundColor };
    });
    console.log('1. Active Report Badge (Screenshot 3):', badgeStyles);
    assert.ok(badgeStyles, 'Active report badge must exist');
    assert.notStrictEqual(badgeStyles.color, badgeStyles.backgroundColor, 'Badge text MUST NOT be same color as background (white-on-white)');
    assert.strictEqual(badgeStyles.backgroundColor, 'rgb(255, 255, 255)', 'Badge background must be crisp white');
    assert.strictEqual(badgeStyles.color, 'rgb(124, 67, 22)', 'Badge text must be dark brown #7c4316');

    // Switch to Shift Report tab to check Screenshot 1 (<select> employee dropdown)
    const shiftReportCard = win.locator('.report-tab-card').filter({ hasText: 'تقرير الشيفت' }).first();
    await shiftReportCard.click();
    await win.waitForTimeout(400);

    const selectStyles = await win.evaluate(() => {
      const sel = document.querySelector('.reports-view select');
      if (!sel) return null;
      const cs = getComputedStyle(sel);
      const opt = sel.querySelector('option');
      const optCs = opt ? getComputedStyle(opt) : null;
      return {
        bg: cs.backgroundColor,
        color: cs.color,
        optBg: optCs?.backgroundColor,
        optColor: optCs?.color
      };
    });
    console.log('2. Reports <select> Dropdown (Screenshot 1):', selectStyles);
    assert.ok(selectStyles, 'Shift report <select> must exist');
    assert.strictEqual(selectStyles.bg, 'rgb(255, 255, 255)', 'Select background must be white in Latte theme');
    assert.strictEqual(selectStyles.color, 'rgb(44, 30, 22)', 'Select text must be dark espresso #2c1e16 in Latte theme');

    // 2. Go to Settings Tab to check Screenshot 2 (Waiter System & Mobile Hub cards)
    const settingsBtn = win.locator('button').filter({ hasText: /إعدادات/ }).first();
    await settingsBtn.click();
    await win.waitForTimeout(500);

    const settingsAudit = await win.evaluate(() => {
      const insetBoxes = Array.from(document.querySelectorAll(
        '.settings-card [style*="rgba(0,0,0,0.2"], .settings-card [style*="rgba(0, 0, 0, 0.2"], .settings-card [style*="rgba(0,0,0,0.3"], .settings-card [style*="rgba(0, 0, 0, 0.3"]'
      ));
      const insetBgs = insetBoxes.map(el => getComputedStyle(el).backgroundColor);
      const cyanLinks = Array.from(document.querySelectorAll('.settings-view [style*="#38bdf8"], .settings-view [style*="rgb(56, 189, 248)"]')).map(el => getComputedStyle(el).color);
      return {
        insetCount: insetBoxes.length,
        uniqueInsetBgs: [...new Set(insetBgs)],
        cyanLinks: [...new Set(cyanLinks)]
      };
    });
    console.log('3. Settings Mobile Hub & Waiter Inset Boxes (Screenshot 2):', settingsAudit);
    assert.ok(settingsAudit.insetCount > 0, 'Must find inset boxes in SettingsTab');
    for (const bg of settingsAudit.uniqueInsetBgs) {
      assert.strictEqual(bg, 'rgb(248, 242, 233)', `Inset box in Latte theme must be warm cream #f8f2e9, got ${bg}`);
    }
    for (const col of settingsAudit.cyanLinks) {
      assert.strictEqual(col, 'rgb(3, 105, 161)', `Cyan links in Latte theme must be deep readable blue #0369a1, got ${col}`);
    }

    console.log('✓ ALL LATTE THEME CONTRAST CHECKS PASSED!');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ LATTE THEME TEST FAILED:', err);
  process.exit(1);
});

