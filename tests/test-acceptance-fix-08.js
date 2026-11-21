const path = require('path');
const assert = require('assert');
const { launchTestElectron } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Acceptance Test FIX-08 (Playwright Electron): Large Numbers (99999.00 & 1234567.89) on 72mm Receipt ---');
  const { win, pdfDir, cleanup } = await launchTestElectron('cafe-pw-fix08-');

  try {
    const targetPdfPath = path.join(pdfDir, 'receipt-large-numbers-72mm.pdf');

    const html = `
      <div id="printable-receipt" class="receipt-preview" dir="rtl" style="width: 72mm; max-width: 72mm;">
        <div class="receipt-header">
          <h2>كافيه الأرقام الكبيرة</h2>
          <div>فاتورة رقم: #8801</div>
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
              <td class="td-item">جملة مشتريات سنوية</td>
              <td class="td-qty">1</td>
              <td class="td-price">99999.00</td>
              <td class="td-total">99999.00</td>
            </tr>
            <tr>
              <td class="td-item">توريد بضاعة كبرى</td>
              <td class="td-qty">1</td>
              <td class="td-price">1234567.89</td>
              <td class="td-total">1234567.89</td>
            </tr>
          </tbody>
        </table>
        <div class="r-grand" style="font-weight: bold; margin-top: 8px;">
          الإجمالي: 1334566.89 ج.م
        </div>
      </div>
    `;

    console.log('1. Printing 72mm receipt with large numbers (99999.00 & 1234567.89)...');

    const result = await win.evaluate(async ({ html, targetPdfPath }) => {
      return await window.api.printTicketHtml({
        html,
        silent: true,
        pdfPath: targetPdfPath
      });
    }, { html, targetPdfPath });

    assert.ok(result && result.success, `printTicketHtml must succeed: ${JSON.stringify(result)}`);
    console.log('2. Measured DOM price/total cells metrics:');
    result.metrics.priceCells.forEach(cell => {
      console.log(`   [${cell.className}] "${cell.text}" -> scrollWidth: ${cell.scrollWidth}px, clientWidth: ${cell.clientWidth}px, overflows: ${cell.overflows}`);
    });

    const overflowingCells = result.metrics.priceCells.filter(c => c.scrollWidth > c.clientWidth);
    assert.strictEqual(
      overflowingCells.length,
      0,
      `Large numbers must fit on a single line with ZERO overflow (scrollWidth <= clientWidth). Overflowing cells:\n${JSON.stringify(overflowingCells, null, 2)}`
    );

    console.log('✓ All large number cells fit without wrapping or truncation.');
    console.log('=== TEST-ACCEPTANCE-FIX-08 (PLAYWRIGHT ELECTRON REAL DOM METRICS) PASSED ===');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ FIX-08 Playwright test failed:', err);
  process.exit(1);
});
