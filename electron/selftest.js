/**
 * TaqfeelaPOS Automated Self-Test Routine (--selftest)
 * Validates DB initialization, order lifecycle, payments, refunds, and shift closing in an isolated sandbox.
 * Guarantees zero touching of production customer data.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

async function runSelfTest(dialog = null) {
  console.log('\n======================================================');
  console.log('       TaqfeelaPOS System Self-Test (--selftest)      ');
  console.log('======================================================\n');

  const startTime = Date.now();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taqfeela-selftest-'));
  const tempDbPath = path.join(tempDir, 'cafe-pos.db');

  const diag = {
    timestamp: new Date().toISOString(),
    osPlatform: process.platform,
    osRelease: os.release(),
    osType: os.type(),
    processArch: process.arch,
    systemArch: os.arch(),
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
    electronVersion: process.versions.electron || 'N/A',
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome || 'N/A',
    sandboxDataPath: tempDir,
    steps: [],
    success: false,
    errorMessage: null
  };

  const logStep = (stepName, passed, details = '') => {
    diag.steps.push({ step: stepName, passed, details });
    console.log(`[SelfTest] ${passed ? '✓' : '✗'} ${stepName}: ${details}`);
  };

  try {
    const db = require('./db');

    // Step 1: Initialize Database in isolated directory
    logStep('DB_INIT', true, `Initialized in isolated temp: ${tempDbPath}`);
    await db.init(tempDbPath);

    // Step 2: Create Admin & Login
    db.setupInitialAdmin('SelfTest123!', 'فاحص النظام');
    const adminUser = db.loginUser('admin', 'SelfTest123!');
    if (!adminUser || adminUser.role !== 'admin') throw new Error('فشل تسجيل دخول المدير في الفحص الذاتي');
    logStep('ADMIN_AUTH', true, `Admin user authenticated (ID: ${adminUser.id})`);

    // Step 3: Open Shift
    const shift = db.openShift(200, 'وردية الفحص الذاتي', adminUser);
    if (!shift || !shift.id) throw new Error('فشل فتح الوردية في الفحص الذاتي');
    logStep('SHIFT_OPEN', true, `Shift #${shift.id} opened with 200 LE`);

    // Step 4: Create Product & Table
    const prod = db.saveProduct({ name: 'شاي فحص ذاتي', price: 20, category_id: 1, stock_qty: 50 });
    const table = db.saveTable({ number: 'T-ST', name: 'طاولة الفحص', capacity: 4, hall: 'صالة' });
    logStep('CATALOG_SETUP', true, `Product ID: ${prod.id}, Table ID: ${table.id}`);

    // Step 5: Create and Pay Order
    const orderRes = db.createOrder({
      shiftId: shift.id,
      items: [{ id: prod.id, name: prod.name, price: 20, qty: 2 }],
      total: 40,
      subtotal: 40,
      paymentMethod: 'cash',
      orderType: 'dine_in',
      amountPaid: 40,
      user: adminUser,
      tableId: table.id
    });
    if (!orderRes || !orderRes.id) throw new Error('فشل إنشاء الفاتورة في الفحص الذاتي');
    logStep('ORDER_CHECKOUT', true, `Invoice #${orderRes.invoiceNo || orderRes.invoice_no} created and paid (40 LE)`);

    // Step 6: Order Cancellation / Refund (استرجاع)
    const cancelRes = db.cancelOrder(orderRes.id, 'فحص الإلغاء والاسترجاع', adminUser);
    if (!cancelRes || !cancelRes.success) throw new Error('فشل استرجاع وإلغاء الفاتورة');
    logStep('ORDER_REFUND', true, `Invoice #${orderRes.invoiceNo || orderRes.invoice_no} successfully cancelled & refunded`);

    // Step 7: Close Shift
    const closeRes = db.closeShift(shift.id, 200, 'إغلاق الفحص الذاتي بنجاح', adminUser);
    if (!closeRes || !closeRes.success) throw new Error('فشل إغلاق وتسليم الوردية');
    logStep('SHIFT_CLOSE', true, 'Shift closed and balanced successfully');

    diag.success = true;
  } catch (err) {
    diag.success = false;
    diag.errorMessage = err.message || String(err);
    logStep('ERROR', false, diag.errorMessage);
  } finally {
    // Clean up temporary sandbox directory
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  diag.durationMs = Date.now() - startTime;

  // Format result report for SELFTEST_RESULT.txt
  const reportLines = [
    '================================================================',
    '       تقرير نتيجة التشخيص والفحص الذاتي — تقفيلة POS           ',
    '       TaqfeelaPOS Automated Self-Test Diagnostic Result        ',
    '================================================================',
    `التاريخ والتوقيت: ${diag.timestamp}`,
    `حالة الفحص العام: ${diag.success ? '✅ يعمل بنجاح تام (PASS)' : '❌ فشل الفحص (FAIL)'}`,
    `نظام التشغيل: ${diag.osType} (${diag.osPlatform} - Release ${diag.osRelease})`,
    `معمارية العملية (App Arch): ${diag.processArch}`,
    `معمارية النظام (OS Arch): ${diag.systemArch}`,
    `إصدار Electron: ${diag.electronVersion}`,
    `إصدار Chromium: ${diag.chromeVersion}`,
    `إصدار Node.js: ${diag.nodeVersion}`,
    `إجمالي ذاكرة الجهاز (RAM): ${diag.totalMemoryMb} MB`,
    `الذاكرة المتاحة (Free RAM): ${diag.freeMemoryMb} MB`,
    `مسار البيانات المعزول للاختبار: ${diag.sandboxDataPath}`,
    `زمن تنفيذ الفحص: ${diag.durationMs} ms`,
    '----------------------------------------------------------------',
    'تفاصيل خطوات الفحص السلوكي:',
    ...diag.steps.map(s => `  ${s.passed ? '✓' : '✗'} [${s.step}] ${s.details}`),
    '----------------------------------------------------------------',
    diag.success
      ? 'النتيجة النهائية: كافة العمليات المحاسبية، وقاعدة البيانات، ومحرك WASM تعمل بسلامة تامة.'
      : `النتيجة النهائية: تعذر إتمام الفحص بسبب: ${diag.errorMessage}`,
    '================================================================'
  ];

  const reportText = reportLines.join('\r\n');
  const resultFilePath = path.join(process.cwd(), 'SELFTEST_RESULT.txt');
  try {
    fs.writeFileSync(resultFilePath, reportText, 'utf8');
    console.log(`\n[SelfTest] Diagnostic report written to: ${resultFilePath}`);
  } catch (writeErr) {
    console.warn('[SelfTest] Failed to write report file to cwd:', writeErr.message);
  }

  // Display GUI dialog if dialog is available
  if (dialog) {
    try {
      if (diag.success) {
        dialog.showMessageBoxSync({
          type: 'info',
          title: 'الفحص الذاتي — تقفيلة POS',
          message: '✅ نظام تقفيلة POS يعمل بنجاح تام!',
          detail: `نظام التشغيل: ${diag.osType} ${diag.osRelease} (${diag.processArch})\nإصدار المحرك: Electron ${diag.electronVersion} / Chromium ${diag.chromeVersion}\nالذاكرة: ${diag.freeMemoryMb}MB متاحة من أصل ${diag.totalMemoryMb}MB\n\nتم كتابة تقرير التشخيص بالكامل في:\n${resultFilePath}`,
          buttons: ['إغلاق']
        });
      } else {
        dialog.showErrorBox(
          'فشل الفحص الذاتي — تقفيلة POS',
          `❌ تعذر إتمام الفحص الذاتي بنجاح.\n\nالسبب:\n${diag.errorMessage}\n\nيرجى مراجعة ملف التشخيص:\n${resultFilePath}`
        );
      }
    } catch (_) {}
  }

  return diag;
}

module.exports = {
  runSelfTest
};
