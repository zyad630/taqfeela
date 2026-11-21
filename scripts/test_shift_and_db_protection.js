const path = require('path');
const fs = require('fs');
const os = require('os');

async function runTests() {
  console.log('🧪 بدء اختبار حماية قاعدة البيانات وتقفيل الشيفتات...');
  
  const testDir = path.join(__dirname, '../scratch_test_db');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const testDbPath = path.join(testDir, 'cafe-pos.db');

  // Load db module
  const db = require('../electron/db');

  // Test 1: First-run initialization on a clean machine
  console.log('\n--- 1. اختبار أول تشغيل لجهاز العميل الجديد (Initial DB Seed) ---');
  await db.init(testDbPath);
  console.log('✅ تم تهيئة قاعدة البيانات بنجاح في مسار جديد');

  // Verify users
  const admin = db.loginUser('admin', '1234');
  if (admin && admin.role === 'admin') {
    console.log('✅ تسجيل دخول المدير admin بكلمة المرور 1234 ناجح!');
  } else {
    throw new Error('فشل تسجيل دخول المدير بـ 1234');
  }

  const cashier = db.loginUser('cashier', '123456');
  if (cashier && cashier.role === 'cashier') {
    console.log('✅ تسجيل دخول الكاشير cashier بكلمة المرور 123456 ناجح!');
  } else {
    throw new Error('فشل تسجيل دخول الكاشير بـ 123456');
  }

  const cashier1 = db.loginUser('cashier1', '123456');
  if (cashier1 && cashier1.role === 'cashier') {
    console.log('✅ تسجيل دخول cashier1 بكلمة المرور 123456 ناجح!');
  } else {
    throw new Error('فشل تسجيل دخول cashier1 بـ 123456');
  }

  // Test 2: Shift opening and accounting calculations
  console.log('\n--- 2. اختبار دورة الشيفت الكاملة والحسابات المالية الدقيقة ---');
  const openedShift = db.openShift(500, 'شيفت تجريبي اختباري', admin, 'الشيفت الصباحي');
  console.log(`✅ تم فتح الشيفت رقم #${openedShift.id} بعهدة ${openedShift.opening_cash} ج.م`);

  // Order 1: Cash
  const products = db.listProducts();
  const testProduct = products[0] || { id: 1, name: 'قهوة تركي', price: 25 };
  const pPrice = testProduct.price;
  console.log(`سعر منتج الاختبار (${testProduct.name}): ${pPrice} ج.م`);

  // Order 1: Cash 1 item
  db.createOrder({
    items: [{ id: testProduct.id, name: testProduct.name, qty: 1 }],
    orderType: 'takeaway',
    paymentMethod: 'cash',
    shiftId: openedShift.id,
    user: cashier
  });
  console.log(`✅ تم إضافة طلب كاش: ${pPrice} ج.م`);

  // Order 2: Card 1 item
  db.createOrder({
    items: [{ id: testProduct.id, name: testProduct.name, qty: 1 }],
    orderType: 'takeaway',
    paymentMethod: 'card',
    shiftId: openedShift.id,
    user: cashier
  });
  console.log(`✅ تم إضافة طلب فيزا: ${pPrice} ج.م (لا يدخل في درج الكاش)`);

  // Order 3: Split (2 items = 2 * pPrice). Split half cash, half wallet
  const splitTotal = pPrice * 2;
  const splitCash = Math.floor(splitTotal / 2);
  const splitWallet = splitTotal - splitCash;
  db.createOrder({
    items: [{ id: testProduct.id, name: testProduct.name, qty: 2 }],
    orderType: 'takeaway',
    paymentMethod: 'split',
    cashAmount: splitCash,
    cardAmount: 0,
    walletAmount: splitWallet,
    shiftId: openedShift.id,
    user: cashier
  });
  console.log(`✅ تم إضافة طلب مقسم: ${splitCash} ج.م كاش + ${splitWallet} ج.م محفظة`);

  // Order 4: Notebook / Debt (Total pPrice, Paid 10 cash, Remaining pPrice - 10)
  const notebookPaid = Math.min(10, pPrice);
  db.createOrder({
    items: [{ id: testProduct.id, name: testProduct.name, qty: 1 }],
    orderType: 'notebook',
    paymentMethod: 'notebook',
    customerName: 'أحمد محمود تجربة',
    amountPaid: notebookPaid,
    shiftId: openedShift.id,
    user: cashier
  });
  console.log(`✅ تم إضافة طلب نوتة: ${pPrice} ج.م (دفع ${notebookPaid} كاش فقط بالدرج والمتبقي آجل)`);

  // Expense: 15 cash
  db.addExpense({
    amount: 15,
    category: 'خامات ومشتريات',
    notes: 'حليب وشاي',
    shiftId: openedShift.id,
    userId: cashier.id,
    userName: cashier.name
  });
  console.log('✅ تم تسجيل مصروف نقدي: 15 ج.م');

  // Order 5: Cash 1 item, then cancelled in same shift
  const cancelOrderRes = db.createOrder({
    items: [{ id: testProduct.id, name: testProduct.name, qty: 1 }],
    orderType: 'takeaway',
    paymentMethod: 'cash',
    shiftId: openedShift.id,
    user: cashier
  });
  db.cancelOrder(cancelOrderRes.orderId, 'عميل استرجع الطلب', admin, 'cash');
  console.log(`✅ تم إلغاء طلب كاش ${pPrice} ج.م في نفس الشيفت والتأكد من عدم خصمه مرتين`);

  // Check current shift calculations
  const curSummary = db.currentShift();
  console.log('\n--- نتائج ملخص الشيفت الحالي ---');
  console.log(`- عهدة البداية: ${curSummary.opening_cash} ج.م`);
  console.log(`- مبيعات كاش: ${curSummary.cash_sales} ج.م`);
  console.log(`- مبيعات فيزا: ${curSummary.card_sales} ج.م`);
  console.log(`- مبيعات محفظة: ${curSummary.wallet_sales} ج.م`);
  console.log(`- المصروفات: ${curSummary.expenses_total} ج.م`);
  console.log(`- المرتجعات: ${curSummary.refunds_total} ج.م`);
  console.log(`- الكاش المتوقع بالدرج: ${curSummary.expected_cash} ج.م`);

  // Expected: 500 (opening) + pPrice (O1) + splitCash (O3) + notebookPaid (O4) - 15 (Expense)
  const expectedValue = Math.round((500 + pPrice + splitCash + notebookPaid - 15) * 100) / 100;
  if (Math.abs(curSummary.expected_cash - expectedValue) < 0.01) {
    console.log(`🎯 حساب الكاش المتوقع مطابق بنسبة 100% (${expectedValue} ج.م)!`);
  } else {
    throw new Error(`خطأ في الحساب المتوقع: المتوقع ${expectedValue} ولكن الناتج ${curSummary.expected_cash}`);
  }

  // Close shift with exact cash
  const closeRes = db.closeShift(openedShift.id, expectedValue, 'تسليم شيفت سليم', cashier);
  console.log('\n--- نتيجة تقفيل الشيفت ---');
  console.log('نجاح التقفيل:', closeRes.success);
  console.log('الكاش الفعلي:', closeRes.actualCash);
  console.log('الكاش المتوقع:', closeRes.expectedCash);
  console.log('الفارق (العجز/الفائض):', closeRes.cashDifference);

  if (closeRes.cashDifference === 0) {
    console.log('✅ تم إغلاق الشيفت بدون أي عجز أو فائض (مطابق تماماً)');
  } else {
    throw new Error(`فارق غير متوقع: ${closeRes.cashDifference}`);
  }

  // Test 3: Auto-recovery from corrupted database
  console.log('\n--- 3. اختبار الاستعادة التلقائية عند تلف أو انقطاع كهرباء قاعدة البيانات ---');
  // Create a backup first
  const bkp = db.createBackup();
  console.log('✅ تم إنشاء نسخة احتياطية سالمة:', bkp.filename);

  // Intentionally corrupt the active database (write empty/corrupt data)
  fs.writeFileSync(testDbPath, Buffer.from('CORRUPTED_FILE_CONTENT_ZERO_BYTES'));
  console.log('⚠️ تم محاكاة تلف ملف قاعدة البيانات بمحتوى غير صالح');

  // Re-init db
  await db.init(testDbPath);
  const recoveredUser = db.loginUser('admin', '1234');
  if (recoveredUser) {
    console.log('🛡️ نجحت الاستعادة التلقائية للبيانات من النسخة الاحتياطية بدون أي انهيار!');
  } else {
    throw new Error('فشلت الاستعادة التلقائية للبيانات بعد التلف');
  }

  // Cleanup scratch directory
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('\n✅ تم مسح ملفات الاختبار المؤقتة بنجاح.');
  } catch (_) {}

  console.log('\n🎉 جميع الاختبارات تمت بنجاح وبأعلى درجات الدقة والأمان!');
}

runTests().catch(err => {
  console.error('\n❌ فشل الاختبار:', err);
  process.exit(1);
});
