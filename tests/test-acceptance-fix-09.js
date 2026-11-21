const path = require('path');
const assert = require('assert');
const { launchTestElectron, parsePdfDetails } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Acceptance Test FIX-09 (Playwright Electron): 58mm Thermal Receipt (48mm Width & Zero Clipping) ---');
  const { win, pdfDir, cleanup } = await launchTestElectron('cafe-pw-fix09-');

  try {
    const targetPdfPath = path.join(pdfDir, 'receipt-58mm.pdf');

    const html58 = `
      <div id="printable-receipt" class="receipt-preview paper-58 receipt-paper-58" dir="rtl" style="width: 48mm; max-width: 48mm;">
        <div class="receipt-header">
          <h2>كافيه التجربة 58mm</h2>
          <div>فاتورة رقم: #5801</div>
        </div>
        <table class="receipt-table" style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th class="th-item">الصنف</th>
              <th class="th-qty">الكمية</th>
              <th class="th-price">السعر</th>
              <th class="th-total">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="td-item">اسبريسو دبل</td>
              <td class="td-qty">2</td>
              <td class="td-price">35.00</td>
              <td class="td-total">70.00</td>
            </tr>
            <tr>
              <td class="td-item">مياه معدنية</td>
              <td class="td-qty">1</td>
              <td class="td-price">10.00</td>
              <td class="td-total">10.00</td>
            </tr>
          </tbody>
        </table>
        <div class="r-grand" style="font-weight: bold; margin-top: 6px;">
          المطلوب: 80.00 ج.م
        </div>
        <div class="receipt-footer">
          شكراً لزيارتكم
        </div>
      </div>
    `;

    console.log('1. Printing 58mm receipt to PDF...');

    const result = await win.evaluate(async ({ html, targetPdfPath }) => {
      return await window.api.printTicketHtml({
        html,
        paperWidth: '58',
        silent: true,
        pdfPath: targetPdfPath
      });
    }, { html: html58, targetPdfPath });

    assert.ok(result && result.success, `printTicketHtml must succeed: ${JSON.stringify(result)}`);
    console.log('2. Measured DOM layout metrics for 58mm receipt:', {
      bodyScrollWidth: result.metrics.bodyScrollWidth,
      bodyClientWidth: result.metrics.bodyClientWidth,
      tableScrollWidth: result.metrics.tableScrollWidth,
      tableClientWidth: result.metrics.tableClientWidth
    });

    // Zero horizontal overflow / zero clipping
    assert.ok(
      result.metrics.bodyScrollWidth <= result.metrics.bodyClientWidth + 1,
      `bodyScrollWidth (${result.metrics.bodyScrollWidth}) must be <= bodyClientWidth (${result.metrics.bodyClientWidth}) to ensure zero clipping on 58mm`
    );

    const pdfDetails = parsePdfDetails(targetPdfPath);
    console.log('3. PDF MediaBox for 58mm roll:', pdfDetails.mediaBox);
    assert.ok(pdfDetails.mediaBox, '58mm PDF must have MediaBox');
    assert.ok(
      Math.abs(pdfDetails.mediaBox.wMm - 48.0) < 1.5,
      `PDF MediaBox width must be ~48mm for 58mm roll, got: ${pdfDetails.mediaBox.wMm}mm`
    );

    assert.ok(pdfDetails.fullText.includes('5801'), 'PDF text must contain invoice no 5801');
    assert.ok(pdfDetails.fullText.includes('70.00'), 'PDF text must contain line total 70.00');
    assert.ok(pdfDetails.fullText.includes('80.00'), 'PDF text must contain grand total 80.00');

    console.log('✓ 58mm receipt printed with exact 48mm printable width and zero clipping.');
    console.log('=== TEST-ACCEPTANCE-FIX-09 (PLAYWRIGHT ELECTRON REAL PDF) PASSED ===');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ FIX-09 Playwright test failed:', err);
  process.exit(1);
});
