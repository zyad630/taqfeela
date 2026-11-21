const assert = require('assert');
const { launchTestElectron } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Playwright Electron E2E: Cancellations Report + Latte Occupied/Check-Printed Tables ---');
  const { app, win, cleanup } = await launchTestElectron('cafe-pw-cancel-tables-');

  try {
    // 1. Setup Latte theme + 1 cancelled order + 1 voided cart item + 2 tables (1 occupied, 1 check-printed)
    const setup = await win.evaluate(async () => {
      localStorage.setItem('cafepos_app_theme', 'latte');
      await window.api.saveSettings({ app_theme: 'latte' });

      const prods = await window.api.listProducts();
      const tables = await window.api.listTables();
      const p1 = prods[0];
      const p2 = prods[1] || prods[0];
      const t1 = tables[0];
      const t2 = tables[1];

      // Create and cancel a real order with a specific reason
      const ord = await window.api.createOrder({
        orderType: 'dine_in',
        tableId: t1.id,
        paymentMethod: 'cash',
        amountPaid: (p1.price || 20) * 2,
        items: [{ productId: p1.id, name: p1.name, price: p1.price || 20, qty: 2 }]
      });
      const orderId = ord.id || ord.order?.id;
      await window.api.cancelOrder(orderId, 'العميل غيّر رأيه قبل التقديم', null, 'cash', 'AdminPass1234');

      // Log a voided sent item via verifyAdminPassword with voidAudit
      const voidRes = await window.api.verifyAdminPassword({
        password: 'AdminPass1234',
        voidAudit: {
          action: 'void_item',
          itemName: p2.name,
          oldQty: 2,
          newQty: 0,
          cancelledQty: 2,
          unitPrice: p2.price || 25,
          tableName: t2.name || `طاولة ${t2.number}`,
          reason: 'طلب زائد بالغلط من الكاشير',
          actorName: 'مدير النظام'
        }
      });

      // Set Table 1 as occupied (active cart, NOT check printed)
      await window.api.saveTableCart(t1.id, {
        cart: [{ id: p1.id, name: p1.name, price: p1.price || 20, qty: 2, sent_qty: 2 }],
        printedCheck: false
      });
      await window.api.updateTableStatus(t1.id, 'occupied', null);

      // Set Table 2 as check-printed (awaiting payment)
      await window.api.saveTableCart(t2.id, {
        cart: [{ id: p2.id, name: p2.name, price: p2.price || 25, qty: 1, sent_qty: 1 }],
        printedCheck: true,
        printedCheckTime: new Date().toISOString()
      });
      await window.api.updateTableStatus(t2.id, 'occupied', null);

      return { p1Name: p1.name, p2Name: p2.name, orderId, voidOk: voidRes?.success };
    });

    assert.ok(setup.voidOk, 'verifyAdminPassword with voidAudit must succeed');

    // Reload cleanly to hydrate Latte theme + tables
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

    // 2. Verify TablesTab styling in Latte mode
    const tablesTabBtn = win.locator('.tab-navigation button').filter({ hasText: /الصالة والطاولات/ }).first();
    await tablesTabBtn.click();
    await win.waitForTimeout(600);

    const tableStyles = await win.evaluate(() => {
      const occ = document.querySelector('.table-card.table-has-cart:not(.table-check-printed)');
      const chk = document.querySelector('.table-card.table-check-printed');
      const chkBadge = chk ? chk.querySelector('.printed-check-badge') : null;
      const chkDot = chk ? chk.querySelector('.check-blink-dot') : null;
      return {
        hasLatte: document.body.classList.contains('theme-latte'),
        occBorder: occ ? getComputedStyle(occ).borderColor : null,
        occBgImg: occ ? getComputedStyle(occ).backgroundImage : null,
        chkBorder: chk ? getComputedStyle(chk).borderColor : null,
        chkBadgeAnim: chkBadge ? getComputedStyle(chkBadge).animationName : null,
        chkDotAnim: chkDot ? getComputedStyle(chkDot).animationName : null
      };
    });
    console.log('1. Latte Table Cards Styles:', tableStyles);
    assert.ok(tableStyles.hasLatte, 'Must be in Latte theme');
    assert.strictEqual(tableStyles.occBorder, 'rgb(235, 160, 160)', 'Occupied table must have warm soft red border');
    assert.ok(tableStyles.occBgImg && tableStyles.occBgImg.includes('253, 234, 234'), 'Occupied table must have warm soft red tint gradient');
    assert.strictEqual(tableStyles.chkBorder, 'rgb(217, 119, 6)', 'Check-printed table must have distinct amber border');
    assert.strictEqual(tableStyles.chkBadgeAnim, 'checkPrintedPulse', 'Check-printed badge must pulse/blink');
    assert.strictEqual(tableStyles.chkDotAnim, 'checkBlinkDot', 'Check-printed dot must blink');
    console.log('✓ Latte occupied (warm red) & check-printed (blinking) table cards verified!');

    // 3. Verify Cancellations Report in ReportsTab
    const reportsTabBtn = win.locator('.tab-navigation button').filter({ hasText: /التقارير/ }).first();
    await reportsTabBtn.click();
    await win.waitForTimeout(500);

    const cancelReportCard = win.locator('.report-tab-card').filter({ hasText: 'تقرير الإلغاءات' }).first();
    await cancelReportCard.waitFor({ state: 'visible', timeout: 5000 });
    await cancelReportCard.click();
    await win.waitForTimeout(700);

    const reportText = await win.locator('#printable-cancellations-report').innerText();
    console.log('2. Cancellations Report snippet:', reportText.slice(0, 350));
    assert.ok(reportText.includes(setup.p1Name), `Report must include cancelled order product "${setup.p1Name}"`);
    assert.ok(reportText.includes('العميل غيّر رأيه قبل التقديم'), 'Report must include order cancel reason');
    assert.ok(reportText.includes(setup.p2Name), `Report must include voided item "${setup.p2Name}"`);
    assert.ok(reportText.includes('طلب زائد بالغلط من الكاشير'), 'Report must include item void reason');
    assert.ok(reportText.includes('مدير النظام'), 'Report must include who cancelled it');
    console.log('✓ Cancellations & Voids Report verified (both cancelled orders & voided items + reasons + actor + time)!');

    // 4. Verify PrintableReportModal shows full cancellations content in BOTH 80mm Thermal AND A4!
    const printCancelBtn = win.locator('button').filter({ hasText: /طباعة تقرير الإلغاءات/ }).first();
    await printCancelBtn.click();
    await win.waitForTimeout(400);

    const thermalPreviewText = await win.locator('#printable-report').innerText();
    assert.ok(thermalPreviewText.includes(setup.p1Name), `Thermal print preview must include "${setup.p1Name}" (NOT blank!). Got:\n${thermalPreviewText}`);
    assert.ok(thermalPreviewText.includes(setup.p2Name), `Thermal print preview must include "${setup.p2Name}"`);
    assert.ok(thermalPreviewText.includes('العميل غيّر رأيه قبل التقديم'), 'Thermal print preview must include cancel reason');

    // Switch to A4 preview and verify
    const a4ToggleBtn = win.locator('button').filter({ hasText: /تقرير كامل \(A4\)/ }).first();
    await a4ToggleBtn.click();
    await win.waitForTimeout(300);
    const a4PreviewText = await win.locator('#printable-report').innerText();
    assert.ok(a4PreviewText.includes(setup.p1Name) && a4PreviewText.includes(setup.p2Name), 'A4 print preview must include all cancelled products');
    console.log('✓ PrintableReportModal verified for Cancellations Report in BOTH 80mm thermal & A4 modes!');

    // 5. Verify Restore Order ALWAYS requires Admin Password (even when logged in as Admin!)
    const restoreCheck = await win.evaluate(async (orderId) => {
      const noPass = await window.api.restoreOrder(orderId, '');
      const wrongPass = await window.api.restoreOrder(orderId, 'WrongPass999');
      const goodPass = await window.api.restoreOrder(orderId, 'AdminPass1234');
      return { noPass, wrongPass, goodPass };
    }, setup.orderId);
    console.log('3. Restore Order Admin Password Enforcement:', restoreCheck);
    assert.strictEqual(restoreCheck.noPass?.success, false, 'Restore WITHOUT password MUST fail even for Admin');
    assert.strictEqual(restoreCheck.wrongPass?.success, false, 'Restore with WRONG password MUST fail');
    assert.ok(restoreCheck.goodPass && !restoreCheck.goodPass.error && restoreCheck.goodPass.success !== false,
      `Restore with CORRECT Admin password must succeed: ${JSON.stringify(restoreCheck.goodPass)}`);
    console.log('✓ Restore Order Admin Password enforcement verified!');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ E2E TEST FAILED:', err);
  process.exit(1);
});

