const assert = require('assert');
const { launchTestElectron } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Acceptance Test FIX-04 (Playwright Electron): 100-Item ReceiptModal Scroll & Viewport Bounds ---');
  const { win, cleanup } = await launchTestElectron('cafe-pw-fix04-');
  try {
    // Create a real 100-item order in DB via window.api.createOrder
    const created = await win.evaluate(async () => {
      const products = await window.api.listProducts();
      const baseProd = products[0];
      await window.api.saveProduct({ ...baseProd, stock_qty: 10000 });
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: baseProd.id,
        product_id: baseProd.id,
        name: `صنف اختبار سكرول رقم ${i + 1}`,
        product_name: `صنف اختبار سكرول رقم ${i + 1}`,
        price: 25.5,
        unit_price: 25.5,
        qty: (i % 3) + 1,
        notes: i % 10 === 0 ? `ملاحظة سطر ${i + 1}` : ''
      }));
      const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
      const shift = await window.api.currentShift();
      const session = await window.api.getSession();
      return await window.api.createOrder({
        orderType: 'takeaway',
        items,
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMethod: 'cash',
        cashAmount: subtotal,
        walletAmount: 0,
        cardAmount: 0,
        shiftId: shift.id,
        userId: session.id,
        cashierName: session.name
      });
    });

    assert.ok(created && created.id, '100-item order must be created in DB');
    console.log(`1. Created 100-item order #${created.invoice_no || created.id} (Total: ${created.total} LE)`);

    // Navigate to Orders tab and open ReceiptModal for this order
    await win.click('button.tab-btn:has-text("سجل الفواتير")');
    await win.waitForSelector('.orders-view', { timeout: 10000 });
    await win.click('.orders-view button:has-text("🖨️ الفاتورة")');

    const sc = win.locator('.receipt-scroll');
    await sc.waitFor({ state: 'visible', timeout: 10000 });

    // 1) Measure .receipt-scroll scrollHeight > clientHeight
    const scrollDims = await sc.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: window.getComputedStyle(el).overflowY
    }));
    console.log('2. .receipt-scroll dimensions:', scrollDims);
    assert.ok(scrollDims.scrollHeight > scrollDims.clientHeight, `Expected scrollHeight (${scrollDims.scrollHeight}) > clientHeight (${scrollDims.clientHeight})`);

    // Scroll to bottom and verify grand total is visible inside .receipt-scroll viewport
    const afterScroll = await sc.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      const grandEl = el.querySelector('.r-grand');
      const scRect = el.getBoundingClientRect();
      const grRect = grandEl.getBoundingClientRect();
      return {
        scrollTop: el.scrollTop,
        grandText: (grandEl.textContent || '').trim(),
        grandVisibleInScroll: grRect.top >= scRect.top - 2 && grRect.bottom <= scRect.bottom + 2
      };
    });
    console.log('3. After scrolling to bottom:', afterScroll);
    assert.ok(afterScroll.scrollTop > 0, 'scrollTop must advance when scrolling');
    assert.ok(afterScroll.grandVisibleInScroll, 'Grand total (.r-grand) must be visible after scrolling to bottom');
    assert.ok(afterScroll.grandText.includes(String(created.total)), `Grand total text "${afterScroll.grandText}" must include ${created.total}`);

    // 2) Verify print and close action buttons are within 1366x768 viewport
    const actionsBox = await win.locator('.receipt-actions').boundingBox();
    const printBtnBox = await win.locator('.receipt-actions button:has-text("طباعة")').first().boundingBox();
    const closeBtnBox = await win.locator('.receipt-actions button:has-text("إغلاق")').boundingBox();

    console.log('4. Action buttons bounding boxes:', { actionsBox, printBtnBox, closeBtnBox });
    assert.ok(actionsBox && (actionsBox.y + actionsBox.height <= 768), `receipt-actions bottom (${actionsBox.y + actionsBox.height}) must be <= 768`);
    assert.ok(printBtnBox && (printBtnBox.y + printBtnBox.height <= 768), `Print button bottom (${printBtnBox.y + printBtnBox.height}) must be <= 768`);
    assert.ok(closeBtnBox && (closeBtnBox.y + closeBtnBox.height <= 768), `Close button bottom (${closeBtnBox.y + closeBtnBox.height}) must be <= 768`);

    console.log('=== TEST-ACCEPTANCE-FIX-04 (PLAYWRIGHT) PASSED ===');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ FIX-04 Playwright test failed:', err);
  process.exit(1);
});
