const path = require('path');
const fs = require('fs');
const assert = require('assert');
const http = require('http');
const { launchTestElectron, parsePdfDetails } = require('./helpers/playwrightPrintHelper');

function httpRequest(method, urlStr, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(raw), raw });
        } catch (_) {
          resolve({ status: res.statusCode, json: null, raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function readPrintLog(pdfDir) {
  const logFile = path.join(pdfDir, 'print_log.jsonl');
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function clearPrintLog(pdfDir) {
  const logFile = path.join(pdfDir, 'print_log.jsonl');
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
}

async function waitForPrintJobs(pdfDir, expectedCount, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const jobs = readPrintLog(pdfDir);
    if (jobs.length >= expectedCount) {
      // Wait a brief moment to make sure no extra unexpected print job arrives
      await new Promise(r => setTimeout(r, 700));
      return readPrintLog(pdfDir);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return readPrintLog(pdfDir);
}

(async () => {
  console.log('======================================================================');
  console.log('COMPREHENSIVE E2E TEST: Thermal Receipt Scale + Shisha/Bar Routing');
  console.log('======================================================================');

  // Static sanity check on electron/main.js
  const mainSrc = fs.readFileSync(path.resolve(__dirname, '../electron/main.js'), 'utf8');
  assert.ok(
    mainSrc.includes('@page { size: ${thermalWidthMm} auto; margin: 0; }'),
    'electron/main.js MUST use `@page { size: ${thermalWidthMm} auto; margin: 0; }` (NOT 297mm) to prevent fingertip shrinking!'
  );
  assert.ok(
    mainSrc.includes('printOpts.scaleFactor = 100;'),
    'electron/main.js MUST explicitly set printOpts.scaleFactor = 100 for thermal receipts!'
  );
  console.log('✓ Static check passed: @page auto height + scaleFactor 100 confirmed in electron/main.js');

  const { app, win, pdfDir, cleanup } = await launchTestElectron('cafe-pw-shisha-scale-');

  try {
    // =========================================================================
    // TEST 1: Thermal Receipt Real Scale Verification (80mm & 58mm)
    // =========================================================================
    console.log('\n--- TEST 1: Thermal Receipt Anti-Fingertip Scale Check (80mm & 58mm) ---');

    const shortReceipt80Html = `
      <div id="printable-receipt" class="receipt-preview" dir="rtl">
        <div class="receipt-header">
          <h2 class="receipt-cafe-name">كافيه الاختبار</h2>
          <div class="receipt-title-badge">فاتورة مبيعات نقدية</div>
        </div>
        <table class="receipt-table">
          <thead>
            <tr>
              <th class="th-item">الصنف</th>
              <th class="th-qty">العدد</th>
              <th class="th-price">السعر</th>
              <th class="th-total">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="td-item"><div class="item-title">قهوة تركي</div></td>
              <td class="td-qty">2</td>
              <td class="td-price">25.00</td>
              <td class="td-total">50.00</td>
            </tr>
            <tr>
              <td class="td-item"><div class="item-title">شيشة تفاحتين</div></td>
              <td class="td-qty">1</td>
              <td class="td-price">45.00</td>
              <td class="td-total">45.00</td>
            </tr>
          </tbody>
        </table>
        <div class="receipt-totals">
          <div class="r-row r-grand"><span>الإجمالي المطلوب:</span><strong>95.00 ج.م</strong></div>
        </div>
        <div class="receipt-footer">شكراً لزيارتكم</div>
      </div>
    `;

    const pdf80Path = path.join(pdfDir, 'thermal-80mm-dynamic.pdf');
    const res80 = await win.evaluate(async ({ html, pdfPath }) => {
      return await window.api.printTicketHtml({
        html,
        paperWidth: '80',
        isA4: false,
        silent: true,
        pdfPath,
        pdfDynamicHeight: true
      });
    }, { html: shortReceipt80Html, pdfPath: pdf80Path });

    assert.ok(res80 && res80.success, `80mm print failed: ${JSON.stringify(res80)}`);
    const pdf80 = parsePdfDetails(pdf80Path);
    console.log('80mm Metrics:', {
      bodyOffsetWidth: res80.metrics.bodyOffsetWidth,
      contentHeight: res80.metrics.contentHeight,
      mediaBox: pdf80.mediaBox,
      pageCount: pdf80.pageCount
    });

    // 72.1mm at 96dpi is ~272.5px
    assert.ok(res80.metrics.bodyOffsetWidth >= 265 && res80.metrics.bodyOffsetWidth <= 280,
      `80mm bodyOffsetWidth must be ~272px (72.1mm), got ${res80.metrics.bodyOffsetWidth}px`);
    assert.strictEqual(pdf80.pageCount, 1, `Short 80mm receipt must fit on 1 page, got ${pdf80.pageCount}`);
    assert.ok(Math.abs(pdf80.mediaBox.wMm - 72.1) < 1.5,
      `80mm PDF width must be ~72.1mm, got ${pdf80.mediaBox.wMm}mm`);
    assert.ok(pdf80.mediaBox.hMm >= 40 && pdf80.mediaBox.hMm < 200,
      `80mm short receipt dynamic height must be realistic (40-200mm), got ${pdf80.mediaBox.hMm}mm`);
    assert.ok(pdf80.fullText.includes('95.00'), '80mm PDF must contain total 95.00');
    console.log('✓ 80mm short thermal receipt renders at exact 72.1mm width & dynamic height (NO fingertip shrink!)');

    const pdf58Path = path.join(pdfDir, 'thermal-58mm-dynamic.pdf');
    const res58 = await win.evaluate(async ({ html, pdfPath }) => {
      return await window.api.printTicketHtml({
        html,
        paperWidth: '58',
        isA4: false,
        silent: true,
        pdfPath,
        pdfDynamicHeight: true
      });
    }, { html: shortReceipt80Html, pdfPath: pdf58Path });

    assert.ok(res58 && res58.success, `58mm print failed: ${JSON.stringify(res58)}`);
    const pdf58 = parsePdfDetails(pdf58Path);
    console.log('58mm Metrics:', {
      bodyOffsetWidth: res58.metrics.bodyOffsetWidth,
      contentHeight: res58.metrics.contentHeight,
      mediaBox: pdf58.mediaBox,
      pageCount: pdf58.pageCount
    });
    assert.ok(res58.metrics.bodyOffsetWidth >= 175 && res58.metrics.bodyOffsetWidth <= 190,
      `58mm bodyOffsetWidth must be ~181px (48mm), got ${res58.metrics.bodyOffsetWidth}px`);
    assert.strictEqual(pdf58.pageCount, 1, `Short 58mm receipt must fit on 1 page, got ${pdf58.pageCount}`);
    assert.ok(Math.abs(pdf58.mediaBox.wMm - 48.0) < 1.5,
      `58mm PDF width must be ~48mm, got ${pdf58.mediaBox.wMm}mm`);
    console.log('✓ 58mm short thermal receipt renders at exact 48mm width & dynamic height');

    // =========================================================================
    // SETUP FOR SHISHA VS BAR ROUTING TESTS
    // =========================================================================
    console.log('\n--- Setting up Dedicated Bar & Shisha Printers + Categories + Products + Tables ---');

    const setupData = await win.evaluate(async () => {
      // Configure distinct dedicated printers
      await window.api.saveSettings({
        printer_name: 'Cashier-Printer-XP80',
        bar_printer_name: 'Bar-Printer-XP80',
        shisha_printer_name: 'Shisha-Printer-XP80',
        silent_print: '1',
        receipt_paper_width: '80'
      });

      // Create Bar category and Shisha category
      const barCat = await window.api.saveCategory({ name: 'المشروبات الساخنة والباردة', icon: '☕' });
      const shishaCat = await window.api.saveCategory({ name: 'قسم الشيشة', icon: '💨' });

      const barCatId = barCat.id || barCat.lastInsertRowid || (await window.api.listCategories()).find(c => c.name.includes('المشروبات'))?.id;
      const shishaCatId = shishaCat.id || shishaCat.lastInsertRowid || (await window.api.listCategories()).find(c => c.name.includes('الشيشة'))?.id;

      // Create products:
      // 1. Regular bar item
      await window.api.saveProduct({ name: 'قهوة تركي سبيشيال', price: 30, category_id: barCatId, stock_qty: 100 });
      // 2. False-positive trap: "عصير قصب" contains "قص" — MUST go to Bar, NOT Shisha!
      await window.api.saveProduct({ name: 'عصير قصب فريش', price: 20, category_id: barCatId, stock_qty: 100 });
      // 3. Explicit shisha item
      await window.api.saveProduct({ name: 'تفاحتين فاخر', price: 50, category_id: shishaCatId, stock_qty: 100 });
      // 4. Category-only shisha item (name has NO shisha keywords at all!)
      await window.api.saveProduct({ name: 'لوف 66 فاخر', price: 45, category_id: shishaCatId, stock_qty: 100 });

      const allProds = await window.api.listProducts();
      const allTables = await window.api.listTables();

      return {
        barCatId,
        shishaCatId,
        coffee: allProds.find(p => p.name === 'قهوة تركي سبيشيال'),
        sugarcane: allProds.find(p => p.name === 'عصير قصب فريش'),
        tfahten: allProds.find(p => p.name === 'تفاحتين فاخر'),
        lemonMint: allProds.find(p => p.name === 'لوف 66 فاخر'),
        tables: allTables.slice(0, 5)
      };
    });

    assert.ok(setupData.coffee && setupData.sugarcane && setupData.tfahten && setupData.lemonMint,
      `All 4 test products must exist: ${JSON.stringify(setupData)}`);
    assert.ok(setupData.tables.length >= 3, 'At least 3 tables must exist');
    console.log('✓ Test products & dedicated printers configured:', {
      coffee: setupData.coffee.id,
      sugarcane: setupData.sugarcane.id,
      tfahten: setupData.tfahten.id,
      lemonMint: setupData.lemonMint.id
    });

    // Reload window cleanly via Electron main process (bypasses any open-shift beforeunload guard)
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
    await win.waitForTimeout(800);

    // =========================================================================
    // TEST 2: Cashier POS ("الخزنة") Mixed Order -> Send to Bar
    // =========================================================================
    console.log('\n--- TEST 2: Cashier POS Mixed Order (Bar + Sugarcane + Explicit Shisha + Category-Only Shisha) ---');
    clearPrintLog(pdfDir);

    // Make sure we are on POS tab and select Table 1
    await win.click('button:has-text("ترابيزات")').catch(() => {});
    const table1Btn = win.locator('.table-card, .table-btn, button').filter({ hasText: new RegExp(`^.*${setupData.tables[0].number}.*$`) }).first();
    // Click on POS tab -> dine_in -> select first table
    const firstTableCard = win.locator('.tables-grid .table-card').first();
    if (await firstTableCard.isVisible().catch(() => false)) {
      await firstTableCard.click();
    } else {
      // Try switching to takeaway if tables panel is collapsed, or click dine_in toggle
      const dineInBtn = win.locator('button:has-text("صالة")').first();
      if (await dineInBtn.isVisible().catch(() => false)) {
        await dineInBtn.click();
        await win.waitForTimeout(300);
        await win.locator('.tables-grid .table-card').first().click();
      }
    }
    await win.waitForTimeout(300);

    // Click "كل الأصناف" category so all products across all categories are searchable
    const allCatBtn = win.locator('.cat-item').filter({ hasText: 'كل الأصناف' }).first();
    if (await allCatBtn.isVisible().catch(() => false)) {
      await allCatBtn.click();
      await win.waitForTimeout(250);
    }

    const searchInput = win.locator('.search-input').first();
    for (const prodName of ['قهوة تركي سبيشيال', 'عصير قصب فريش', 'تفاحتين فاخر', 'لوف 66 فاخر']) {
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill(prodName);
        await win.waitForTimeout(250);
      }
      const prodCard = win.locator('.product-card').filter({ hasText: prodName }).first();
      await prodCard.waitFor({ state: 'visible', timeout: 5000 });
      await prodCard.click();
      await win.waitForTimeout(150);
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill('');
        await win.waitForTimeout(150);
      }
    }

    // Click "إرسال للبار"
    const sendToBarBtn = win.locator('button').filter({ hasText: /إرسال للبار|ارسال للبار/ }).first();
    await sendToBarBtn.waitFor({ state: 'visible', timeout: 5000 });
    await sendToBarBtn.click();

    const posMixedJobs = await waitForPrintJobs(pdfDir, 2, 8000);
    console.log('Cashier Mixed Print Jobs:', posMixedJobs.map(j => ({ deviceName: j.deviceName, pdf: path.basename(j.pdfPath) })));
    assert.strictEqual(posMixedJobs.length, 2, `Cashier mixed order MUST produce exactly 2 print jobs (Bar + Shisha), got ${posMixedJobs.length}`);

    const posBarJob = posMixedJobs.find(j => j.deviceName === 'Bar-Printer-XP80');
    const posShishaJob = posMixedJobs.find(j => j.deviceName === 'Shisha-Printer-XP80');
    assert.ok(posBarJob, 'Must have a print job routed to Bar-Printer-XP80');
    assert.ok(posShishaJob, 'Must have a print job routed to Shisha-Printer-XP80');

    const posBarText = posBarJob.bodyText || '';
    const posShishaText = posShishaJob.bodyText || '';
    assert.strictEqual(parsePdfDetails(posBarJob.pdfPath).pageCount, 1, 'Bar ticket PDF must be 1 page');
    assert.strictEqual(parsePdfDetails(posShishaJob.pdfPath).pageCount, 1, 'Shisha ticket PDF must be 1 page');

    // Bar ticket assertions
    assert.ok(posBarText.includes('قهوة تركي سبيشيال'), `Bar ticket must contain coffee. Got:\n${posBarText}`);
    assert.ok(posBarText.includes('عصير قصب فريش'), `Bar ticket must contain sugarcane juice (NOT misclassified as shisha!). Got:\n${posBarText}`);
    assert.ok(!posBarText.includes('تفاحتين'), `Bar ticket must NOT contain shisha item تفاحتين. Got:\n${posBarText}`);
    assert.ok(!posBarText.includes('لوف 66 فاخر'), `Bar ticket must NOT contain shisha item لوف 66 فاخر. Got:\n${posBarText}`);

    // Shisha ticket assertions
    assert.ok(posShishaText.includes('تفاحتين فاخر'), `Shisha ticket must contain تفاحتين. Got:\n${posShishaText}`);
    assert.ok(posShishaText.includes('لوف 66 فاخر'), `Shisha ticket must contain category-only shisha item لوف 66 فاخر. Got:\n${posShishaText}`);
    assert.ok(!posShishaText.includes('قهوة تركي'), `Shisha ticket must NOT contain coffee. Got:\n${posShishaText}`);
    assert.ok(!posShishaText.includes('عصير قصب'), `Shisha ticket must NOT contain sugarcane juice. Got:\n${posShishaText}`);
    console.log('✓ TEST 2 PASSED: Cashier mixed order cleanly split -> Bar items to Bar-Printer-XP80, Shisha items to Shisha-Printer-XP80!');

    // =========================================================================
    // TEST 3: Cashier POS Shisha-Only Order -> Shisha Printer ONLY
    // =========================================================================
    console.log('\n--- TEST 3: Cashier POS Shisha-Only Order (Category-only item "لوف 66 فاخر") ---');
    clearPrintLog(pdfDir);

    const searchInput3 = win.locator('.search-input').first();
    if (await searchInput3.isVisible().catch(() => false)) {
      await searchInput3.fill('لوف 66 فاخر');
      await win.waitForTimeout(200);
    }
    await win.locator('.product-card').filter({ hasText: 'لوف 66 فاخر' }).first().click();
    await win.waitForTimeout(150);
    if (await searchInput3.isVisible().catch(() => false)) await searchInput3.fill('');

    await sendToBarBtn.click();
    const posShishaOnlyJobs = await waitForPrintJobs(pdfDir, 1, 6000);
    console.log('Cashier Shisha-Only Print Jobs:', posShishaOnlyJobs.map(j => ({ deviceName: j.deviceName })));
    assert.strictEqual(posShishaOnlyJobs.length, 1, `Shisha-only order must produce exactly 1 job, got ${posShishaOnlyJobs.length}`);
    assert.strictEqual(posShishaOnlyJobs[0].deviceName, 'Shisha-Printer-XP80', 'Shisha-only job MUST go to Shisha-Printer-XP80');
    console.log('✓ TEST 3 PASSED: Cashier Shisha-only order printed ONLY on Shisha-Printer-XP80!');

    // =========================================================================
    // TEST 4: Cashier POS Bar-Only Order -> Bar Printer ONLY
    // =========================================================================
    console.log('\n--- TEST 4: Cashier POS Bar-Only Order ("عصير قصب فريش") ---');
    clearPrintLog(pdfDir);

    if (await searchInput3.isVisible().catch(() => false)) {
      await searchInput3.fill('عصير قصب فريش');
      await win.waitForTimeout(200);
    }
    await win.locator('.product-card').filter({ hasText: 'عصير قصب فريش' }).first().click();
    await win.waitForTimeout(150);
    if (await searchInput3.isVisible().catch(() => false)) await searchInput3.fill('');

    await sendToBarBtn.click();
    const posBarOnlyJobs = await waitForPrintJobs(pdfDir, 1, 6000);
    console.log('Cashier Bar-Only Print Jobs:', posBarOnlyJobs.map(j => ({ deviceName: j.deviceName })));
    assert.strictEqual(posBarOnlyJobs.length, 1, `Bar-only order must produce exactly 1 job, got ${posBarOnlyJobs.length}`);
    assert.strictEqual(posBarOnlyJobs[0].deviceName, 'Bar-Printer-XP80', 'Bar-only job MUST go to Bar-Printer-XP80');
    console.log('✓ TEST 4 PASSED: Cashier Bar-only order printed ONLY on Bar-Printer-XP80!');

    // =========================================================================
    // TEST 5: Mobile Waiter App ("الويتر من التلفون") Mixed Order via REAL HTTP /m/v1/orders
    // =========================================================================
    console.log('\n--- TEST 5: Mobile Waiter App Mixed Order via REAL HTTP /m/v1/orders ---');

    // Create pairing session via IPC (also ensures Express server is running on port 3000)
    const pairing = await win.evaluate(async () => {
      return await window.api.createMobilePairingSession();
    });
    assert.ok(pairing && (pairing.code || pairing.qrToken), `createMobilePairingSession must return code/qrToken: ${JSON.stringify(pairing)}`);
    const port = pairing.port || 3000;

    // Pair device via POST /m/v1/pair just like the Android/iOS Waiter App does
    const claimRes = await httpRequest('POST', `http://127.0.0.1:${port}/m/v1/pair`, {
      code: pairing.code,
      qrToken: pairing.qrToken,
      deviceName: 'Waiter-Phone-Test',
      platform: 'android'
    });
    assert.strictEqual(claimRes.status, 200, `Pair failed: ${claimRes.raw}`);
    const deviceToken = claimRes.json.deviceToken;
    assert.ok(deviceToken, 'Device token must be returned');
    console.log('✓ Mobile waiter device paired via /m/v1/pair');

    // Submit mixed order from Waiter Phone (Bar + Sugarcane + Explicit Shisha + Category-Only Shisha)
    clearPrintLog(pdfDir);
    const targetTable = setupData.tables[1];
    const waiterMixedRes = await httpRequest(
      'POST',
      `http://127.0.0.1:${port}/m/v1/orders`,
      {
        clientOrderId: `waiter-mixed-${Date.now()}`,
        tableId: targetTable.id,
        waiterName: 'ويتر محمد',
        items: [
          { productId: setupData.coffee.id, qty: 2, note: 'سادة' },
          { productId: setupData.sugarcane.id, qty: 1, note: 'بتلج' },
          { productId: setupData.tfahten.id, qty: 1, note: 'فحم زيادة' },
          { productId: setupData.lemonMint.id, qty: 1, note: 'لي طبي' }
        ]
      },
      { Authorization: `Bearer ${deviceToken}` }
    );
    assert.strictEqual(waiterMixedRes.status, 200, `Waiter mixed order HTTP failed: ${waiterMixedRes.raw}`);
    assert.ok(waiterMixedRes.json && waiterMixedRes.json.ok, `Waiter mixed order must return ok: ${waiterMixedRes.raw}`);

    const mobileMixedJobs = await waitForPrintJobs(pdfDir, 2, 8000);
    console.log('Waiter Phone Mixed Print Jobs:', mobileMixedJobs.map(j => ({ deviceName: j.deviceName, pdf: path.basename(j.pdfPath) })));
    assert.strictEqual(mobileMixedJobs.length, 2, `Waiter phone mixed order MUST produce exactly 2 print jobs (Bar + Shisha), got ${mobileMixedJobs.length}`);

    const mobileBarJob = mobileMixedJobs.find(j => j.deviceName === 'Bar-Printer-XP80');
    const mobileShishaJob = mobileMixedJobs.find(j => j.deviceName === 'Shisha-Printer-XP80');
    assert.ok(mobileBarJob, 'Waiter mixed order MUST route bar items to Bar-Printer-XP80');
    assert.ok(mobileShishaJob, 'Waiter mixed order MUST route shisha items to Shisha-Printer-XP80');

    const mobileBarText = mobileBarJob.bodyText || '';
    const mobileShishaText = mobileShishaJob.bodyText || '';
    assert.strictEqual(parsePdfDetails(mobileBarJob.pdfPath).pageCount, 1, 'Mobile Bar ticket PDF must be 1 page');
    assert.strictEqual(parsePdfDetails(mobileShishaJob.pdfPath).pageCount, 1, 'Mobile Shisha ticket PDF must be 1 page');

    assert.ok(mobileBarText.includes('قهوة تركي سبيشيال'), `Mobile Bar ticket must include coffee. Got:\n${mobileBarText}`);
    assert.ok(mobileBarText.includes('عصير قصب فريش'), `Mobile Bar ticket must include sugarcane. Got:\n${mobileBarText}`);
    assert.ok(!mobileBarText.includes('تفاحتين'), `Mobile Bar ticket must NOT include تفاحتين. Got:\n${mobileBarText}`);
    assert.ok(!mobileBarText.includes('لوف 66 فاخر'), `Mobile Bar ticket must NOT include لوف 66 فاخر. Got:\n${mobileBarText}`);

    assert.ok(mobileShishaText.includes('تفاحتين فاخر'), `Mobile Shisha ticket must include تفاحتين. Got:\n${mobileShishaText}`);
    assert.ok(mobileShishaText.includes('لوف 66 فاخر'), `Mobile Shisha ticket must include category-only shisha item لوف 66 فاخر. Got:\n${mobileShishaText}`);
    assert.ok(!mobileShishaText.includes('قهوة تركي'), `Mobile Shisha ticket must NOT include coffee. Got:\n${mobileShishaText}`);
    assert.ok(!mobileShishaText.includes('عصير قصب'), `Mobile Shisha ticket must NOT include sugarcane. Got:\n${mobileShishaText}`);
    console.log('✓ TEST 5 PASSED: Waiter phone mixed order automatically routed Shisha -> Shisha-Printer-XP80 and Bar -> Bar-Printer-XP80!');

    // =========================================================================
    // TEST 6: Mobile Waiter App Shisha-Only Order via REAL HTTP /m/v1/orders
    // =========================================================================
    console.log('\n--- TEST 6: Mobile Waiter App Shisha-Only Order (Category-only "ليمون نعناع") ---');
    clearPrintLog(pdfDir);

    const waiterShishaOnlyRes = await httpRequest(
      'POST',
      `http://127.0.0.1:${port}/m/v1/orders`,
      {
        clientOrderId: `waiter-shisha-only-${Date.now()}`,
        tableId: setupData.tables[2].id,
        waiterName: 'ويتر كريم',
        items: [
          { productId: setupData.lemonMint.id, qty: 2, note: 'بدون تلج' }
        ]
      },
      { Authorization: `Bearer ${deviceToken}` }
    );
    assert.strictEqual(waiterShishaOnlyRes.status, 200, `Waiter shisha-only HTTP failed: ${waiterShishaOnlyRes.raw}`);

    const mobileShishaOnlyJobs = await waitForPrintJobs(pdfDir, 1, 8000);
    console.log('Waiter Phone Shisha-Only Print Jobs:', mobileShishaOnlyJobs.map(j => ({ deviceName: j.deviceName })));
    assert.strictEqual(mobileShishaOnlyJobs.length, 1, `Waiter shisha-only order must produce exactly 1 job, got ${mobileShishaOnlyJobs.length}`);
    assert.strictEqual(mobileShishaOnlyJobs[0].deviceName, 'Shisha-Printer-XP80', 'Waiter shisha-only job MUST go to Shisha-Printer-XP80');
    console.log('✓ TEST 6 PASSED: Waiter phone Shisha-only order printed ONLY on Shisha-Printer-XP80!');

    console.log('\n======================================================================');
    console.log('ALL 6 E2E TESTS PASSED (Thermal Scale + Cashier & Waiter Shisha Routing)');
    console.log('======================================================================');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ E2E TEST FAILED:', err);
  process.exit(1);
});

