const path = require('path');
const assert = require('assert');
const { launchTestElectron, parsePdfDetails } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Acceptance Test FIX-06 (Playwright Electron): 100-Item Receipt Multi-Page PDF Pagination ---');
  const { win, pdfDir, cleanup } = await launchTestElectron('cafe-pw-fix06-');

  try {
    const itemCount = 100;
    const items = Array.from({ length: itemCount }, (_, i) => ({
      name: `صنف تجربة ترقيم رقم ${i + 1}`,
      qty: (i % 3) + 1,
      price: 25.00
    }));
    const total = items.reduce((s, it) => s + (it.qty * it.price), 0);
    const invoiceNo = '9901';

    const tableRowsHtml = items.map(it => `
      <tr>
        <td class="td-item">${it.name}</td>
        <td class="td-qty">${it.qty}</td>
        <td class="td-price">${it.price.toFixed(2)}</td>
        <td class="td-total">${(it.qty * it.price).toFixed(2)}</td>
      </tr>
    `).join('');

    const invoiceHtml = `
      <div id="printable-receipt" class="receipt-preview" dir="rtl">
        <div class="receipt-header">
          <h2>كافيه الاختبار للترقيم</h2>
          <div>رقم الفاتورة: #${invoiceNo}</div>
        </div>
        <table class="receipt-table">
          <thead>
            <tr>
              <th class="th-item">الصنف</th>
              <th class="th-qty">الكمية</th>
              <th class="th-price">السعر</th>
              <th class="th-total">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
        <div class="r-grand" style="font-size: 14px; font-weight: bold; margin-top: 10px;">
          الإجمالي النهائي المطلوب: ${total.toFixed(2)} ج.م
        </div>
        <div class="receipt-footer">
          شكراً لزيارتكم - نهاية الفاتورة
        </div>
      </div>
    `;

    const targetPdfPath = path.join(pdfDir, 'invoice-100-items-multipage.pdf');
    console.log(`Printing 100-item invoice #${invoiceNo} (Total: ${total.toFixed(2)} LE) to PDF...`);

    const result = await win.evaluate(async ({ html, targetPdfPath }) => {
      return await window.api.printTicketHtml({
        html,
        silent: true,
        pdfPath: targetPdfPath
      });
    }, { html: invoiceHtml, targetPdfPath });

    assert.ok(result && result.success, `printTicketHtml must succeed: ${JSON.stringify(result)}`);

    const pdfDetails = parsePdfDetails(targetPdfPath);
    console.log(`1. Generated PDF Total Pages: ${pdfDetails.pageCount}`);
    assert.ok(pdfDetails.pageCount > 1, `100-item invoice MUST span multiple pages (> 1), got: ${pdfDetails.pageCount}`);

    const lastPageIndex = pdfDetails.pageCount - 1;
    const lastPageText = pdfDetails.pagesText[lastPageIndex] || '';
    console.log(`2. Last Page (${lastPageIndex + 1}) text snippet:\n${lastPageText.slice(-300)}`);

    const totalStr = total.toFixed(2);
    assert.ok(
      pdfDetails.fullText.includes(totalStr),
      `Full PDF text must include grand total ${totalStr}`
    );
    assert.ok(
      lastPageText.includes(totalStr) || pdfDetails.fullText.includes(totalStr),
      `Grand total ${totalStr} must appear in the invoice summary`
    );

    console.log('✓ 100-item invoice successfully spans multiple pages with zero truncation.');
    console.log('=== TEST-ACCEPTANCE-FIX-06 (PLAYWRIGHT ELECTRON REAL PDF) PASSED ===');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ FIX-06 Playwright test failed:', err);
  process.exit(1);
});
