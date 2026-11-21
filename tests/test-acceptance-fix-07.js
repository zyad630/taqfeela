const path = require('path');
const assert = require('assert');
const { launchTestElectron, parsePdfDetails } = require('./helpers/playwrightPrintHelper');

(async () => {
  console.log('--- Acceptance Test FIX-07 (Playwright Electron): A4 Shift Report & Payroll Statement PDF ---');
  const { win, pdfDir, cleanup } = await launchTestElectron('cafe-pw-fix07-');

  try {
    // 1. A4 Shift Report
    const shiftReportHtml = `
      <div id="printable-report-a4" class="printable-report-a4" dir="rtl">
        <div class="report-header">
          <h1>تقرير الوردية التفصيلي - A4</h1>
          <p>كافيه التجربة والتقييم - رقم الوردية: #45</p>
        </div>
        <table class="report-table">
          <thead>
            <tr>
              <th>البيان</th>
              <th>القيمة (ج.م)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>إجمالي المبيعات النقدية</td><td>4520.00</td></tr>
            <tr><td>إجمالي المصروفات</td><td>350.00</td></tr>
            <tr><td>الكاش المتوقع بالدرج</td><td>4170.00</td></tr>
            <tr><td>الكاش الفعلي المعدود</td><td>4170.00</td></tr>
            <tr><td>عجز / زيادة</td><td>0.00</td></tr>
          </tbody>
        </table>
        <div class="report-footer">
          المسؤول: أحمد محمود - إغلاق رسمي
        </div>
      </div>
    `;

    const shiftPdfPath = path.join(pdfDir, 'shift-report-a4.pdf');
    console.log('1. Printing A4 Shift Report to PDF...');

    const resShift = await win.evaluate(async ({ html, shiftPdfPath }) => {
      return await window.api.printTicketHtml({
        html,
        isA4: true,
        silent: true,
        pdfPath: shiftPdfPath
      });
    }, { html: shiftReportHtml, shiftPdfPath });

    assert.ok(resShift && resShift.success, `A4 Shift Report print failed: ${JSON.stringify(resShift)}`);
    const shiftPdf = parsePdfDetails(shiftPdfPath);
    console.log('A4 Shift Report MediaBox:', shiftPdf.mediaBox);
    assert.ok(shiftPdf.mediaBox, 'Shift Report must have MediaBox');
    assert.ok(Math.abs(shiftPdf.mediaBox.wMm - 210) < 3, `Width must be ~210mm (A4), got: ${shiftPdf.mediaBox.wMm}mm`);
    assert.ok(Math.abs(shiftPdf.mediaBox.hMm - 297) < 3, `Height must be ~297mm (A4), got: ${shiftPdf.mediaBox.hMm}mm`);
    assert.ok(shiftPdf.fullText.includes('4520.00'), 'PDF text must include sales total');
    assert.ok(shiftPdf.fullText.includes('4170.00'), 'PDF text must include expected cash');

    // 2. A4 Payroll Statement
    const payrollRows = Array.from({ length: 15 }, (_, i) => `
      <tr>
        <td>2026-10-${String(i + 1).padStart(2, '0')}</td>
        <td>وردية صباحية</td>
        <td>08:00 ص</td>
        <td>04:00 م</td>
        <td>8 ساعات</td>
        <td>حاضر</td>
      </tr>
    `).join('');

    const payrollHtml = `
      <div id="printable-payroll-details" class="printable-report-a4" dir="rtl">
        <div class="payroll-header">
          <h1>كشف حساب راتب الموظف - شهر 10/2026</h1>
          <p>اسم الموظف: محمد خليل | المسمى الوظيفي: كاشير | الراتب الأساسي: 4000.00 ج.م</p>
        </div>
        <div class="table-container">
          <table class="payroll-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>نوع الوردية</th>
                <th>الحضور</th>
                <th>الانصراف</th>
                <th>ساعات العمل</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${payrollRows}
            </tbody>
          </table>
        </div>
        <div class="payroll-summary">
          <p>إجمالي المستحق: 4250.00 ج.م | إجمالي الاستقطاعات: 150.00 ج.م | صافي الراتب: 4100.00 ج.م</p>
        </div>
      </div>
    `;

    const payrollPdfPath = path.join(pdfDir, 'payroll-statement-a4.pdf');
    console.log('2. Printing A4 Payroll Statement to PDF...');

    const resPayroll = await win.evaluate(async ({ html, payrollPdfPath }) => {
      return await window.api.printTicketHtml({
        html,
        isA4: true,
        silent: true,
        pdfPath: payrollPdfPath
      });
    }, { html: payrollHtml, payrollPdfPath });

    assert.ok(resPayroll && resPayroll.success, `A4 Payroll Statement print failed: ${JSON.stringify(resPayroll)}`);
    const payrollPdf = parsePdfDetails(payrollPdfPath);
    console.log('A4 Payroll Statement MediaBox:', payrollPdf.mediaBox);
    assert.ok(payrollPdf.mediaBox, 'Payroll Statement must have MediaBox');
    assert.ok(Math.abs(payrollPdf.mediaBox.wMm - 210) < 3, `Width must be ~210mm (A4), got: ${payrollPdf.mediaBox.wMm}mm`);
    assert.ok(Math.abs(payrollPdf.mediaBox.hMm - 297) < 3, `Height must be ~297mm (A4), got: ${payrollPdf.mediaBox.hMm}mm`);
    assert.ok(payrollPdf.fullText.includes('4000.00'), 'PDF text must include base salary');
    assert.ok(payrollPdf.fullText.includes('4100.00'), 'PDF text must include net salary');
    assert.ok(payrollPdf.fullText.includes('2026-10-15'), 'PDF text must include table rows down to 15th');

    console.log('✓ Both A4 Shift Report and Payroll Statement successfully verified on real A4 MediaBox.');
    console.log('=== TEST-ACCEPTANCE-FIX-07 (PLAYWRIGHT ELECTRON REAL PDF) PASSED ===');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('❌ FIX-07 Playwright test failed:', err);
  process.exit(1);
});
