const path = require('path');
const assert = require('assert');
const { launchTestElectron, parsePdfDetails } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Acceptance Test FIX-05 (Playwright Electron): Real printToPDF for All 7 Templates ---');
  const { win, pdfDir, cleanup } = await launchTestElectron('cafe-pw-fix05-');

  try {
    const templates = [
      {
        name: 'ReceiptModal (Cashier Invoice)',
        id: 'printable-receipt',
        rawHtml: `<div id="printable-receipt" class="receipt-preview"><div class="receipt-header"><h2>كافيه التجربة</h2></div><div class="receipt-meta">رقم الفاتورة: #501</div><table class="receipt-table"><tr><td>شاي أخضر</td><td>1</td><td>35.00</td></tr></table><div class="r-grand">الإجمالي المطلوب: 35.00 ج.م</div></div>`,
        expectedContent: ['501', '35.00']
      },
      {
        name: 'BarTicket (Bar Station)',
        id: 'printable-bar-ticket',
        rawHtml: `<div id="printable-bar-ticket" class="receipt-preview"><div class="bar-header">بون بار - طاولة 4</div><div>رقم البون: #882</div><div>2x قهوة تركي مظبوط</div></div>`,
        expectedContent: ['882', '2x']
      },
      {
        name: 'ShishaTicket (Shisha Station)',
        id: 'printable-shisha-ticket',
        rawHtml: `<div id="printable-shisha-ticket" class="receipt-preview"><div class="bar-header">بون شيشة - طاولة 4</div><div>رقم البون: #883</div><div>1x شيشة تفاح فاخر</div></div>`,
        expectedContent: ['883', '1x']
      },
      {
        name: 'BarVoidTicket (Void/Cancel Ticket)',
        id: 'printable-bar-void',
        rawHtml: `<div id="printable-bar-void" class="receipt-preview"><div>إلغاء بون بار - طاولة 2</div><div>صنف ملغي: 1x لاتيه كراميل</div></div>`,
        expectedContent: ['1x']
      },
      {
        name: 'PreBillCheck (Dine-in Pre-bill Check)',
        id: 'printable-prebill-check',
        rawHtml: `<div id="printable-prebill-check" style="position: fixed; top: -99999px; left: -99999px; z-index: -1;"><div>🧾 شيك حساب العميل</div><div>طاولة رقم 5 - صالة داخلية</div><div>المجموع: 120.00 ج.م</div><div>الإجمالي المطلوب: 120.00 ج.م</div></div>`,
        expectedContent: ['120.00']
      },
      {
        name: 'ExpensesPrint (Shift Expenses Voucher)',
        id: 'printable-expenses',
        rawHtml: `<div id="printable-expenses" class="receipt-preview"><div>إيصال صرف نقدية</div><div>بند: صيانة ماكينة القهوة</div><div>المبلغ: 150.00 ج.م</div></div>`,
        expectedContent: ['150.00']
      },
      {
        name: 'PrintableReport (Shift & Sales Report)',
        id: 'printable-report',
        rawHtml: `<div id="printable-report" class="printable-report-thermal"><div>تقرير الوردية رقم: #12</div><div>الكاشير: أحمد</div><div>إجمالي المبيعات: 1850.00 ج.م</div><div>الكاش الفعلي بالدرج: 1850.00 ج.م</div></div>`,
        expectedContent: ['12', '1850.00']
      }
    ];

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const targetPdfPath = path.join(pdfDir, `template-${i + 1}-${t.id}.pdf`);
      console.log(`\nTesting template [${i + 1}/${templates.length}]: ${t.name}...`);

      const result = await win.evaluate(async ({ html, targetPdfPath }) => {
        return await window.api.printTicketHtml({
          html,
          silent: true,
          pdfPath: targetPdfPath
        });
      }, { html: t.rawHtml, targetPdfPath });

      assert.ok(result && result.success, `printTicketHtml must succeed for ${t.name}: ${JSON.stringify(result)}`);
      
      const pdfDetails = parsePdfDetails(targetPdfPath);
      assert.ok(pdfDetails.pageCount >= 1, `PDF must have at least 1 page for ${t.name}`);

      for (const expectedText of t.expectedContent) {
        assert.ok(
          pdfDetails.fullText.includes(expectedText),
          `Extracted PDF text for ${t.name} must include "${expectedText}".\nGot text:\n${pdfDetails.fullText}`
        );
      }
      console.log(`✓ Template verified: [${t.name}] -> PDF pages: ${pdfDetails.pageCount}, pdftotext matched: ${t.expectedContent.join(', ')}`);
    }

    console.log('\n=== TEST-ACCEPTANCE-FIX-05 (PLAYWRIGHT ELECTRON REAL PDF) PASSED ===');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ FIX-05 Playwright test failed:', err);
  process.exit(1);
});
