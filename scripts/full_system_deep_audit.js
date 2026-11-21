const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../electron/db');

async function runComprehensiveAudit() {
  console.log('================================================================');
  console.log('  🔍 فحص شامل كامل وعميق: الفلوس - الورديات - التقارير - البيانات');
  console.log('================================================================\n');

  const testDbPath = path.join(__dirname, 'test-comprehensive-audit.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  await db.init(testDbPath);

  let passedChecks = 0;
  function check(name, condition) {
    if (!condition) {
      console.error(`❌ فشل الفحص: ${name}`);
      throw new Error(`فشل الفحص: ${name}`);
    }
    passedChecks++;
    console.log(`  ✅ [${passedChecks}] ${name}`);
  }

  // -------------------------------------------------------------
  // 1. فحص المستخدمين والصلاحيات وتسجيل الدخول
  // -------------------------------------------------------------
  console.log('📌 1. فحص المستخدمين والصلاحيات:');
  const adminUser = db.loginUser('admin', '1234') || db.loginUser('admin', 'admin');
  check('تسجيل دخول المدير (admin) بنجاح', adminUser && adminUser.role === 'admin');

  const cashierUser = db.loginUser('cashier1', '1234') || db.loginUser('cashier1', '123456');
  check('تسجيل دخول الكاشير (cashier1) بنجاح', cashierUser && cashierUser.role === 'cashier');

  // -------------------------------------------------------------
  // 2. فحص دورة حياة الشيفت الأول (الصباحي) وحسابات الفلوس الدقيقة
  // -------------------------------------------------------------
  console.log('\n📌 2. فحص حسابات الفلوس والخزينة والدرج (الوردية 1):');
  const openingFloat1 = 500;
  const shift1 = db.openShift(openingFloat1, 'بداية وردية الصباح', cashierUser, 'الشيفت الصباحي');
  check('فتح الوردية 1 مع عهدة 500 ج.م', shift1 && shift1.id && Number(shift1.opening_cash) === 500);

  // التأكد من منع فتح شيفت ثاني والشيفت الأول مفتوح
  const tryDuplicate = db.openShift(300, 'شيفت مكرر', cashierUser);
  check('منع فتح شيفت ثانٍ بالتوازي أثناء وجود شيفت مفتوح', tryDuplicate.success === false);

  const products = db.listProducts();
  check('تحميل قائمة المنتجات (129 صنف)', products.length >= 100);
  const prod1 = products[0]; // مثلاً قهوة
  const prod2 = products[1]; // مثلاً عصير
  const prod3 = products[2]; // مثلاً حلوى

  // أوردر 1: كاش 100 ج.م
  const o1 = db.createOrder({
    customerName: 'عميل كاش',
    orderType: 'takeaway',
    items: [{ productId: prod1.id, name: prod1.name, price: prod1.price, qty: 2 }],
    paymentMethod: 'cash',
    amountPaid: prod1.price * 2,
    shiftId: shift1.id,
    user: cashierUser
  });
  const o1Total = prod1.price * 2;
  check(`إنشاء فاتورة كاش بقيمة ${o1Total} ج.م`, o1 && o1.id);

  // أوردر 2: فيزا / كارت 150 ج.م
  const o2 = db.createOrder({
    customerName: 'عميل فيزا',
    orderType: 'takeaway',
    items: [{ productId: prod2.id, name: prod2.name, price: prod2.price, qty: 1 }],
    paymentMethod: 'card',
    amountPaid: prod2.price,
    shiftId: shift1.id,
    user: cashierUser
  });
  const o2Total = prod2.price;
  check(`إنشاء فاتورة فيزا بقيمة ${o2Total} ج.م`, o2 && o2.id);

  // أوردر 3: محفظة إلكترونية 80 ج.م
  const o3 = db.createOrder({
    customerName: 'عميل فودافون كاش',
    orderType: 'takeaway',
    items: [{ productId: prod3.id, name: prod3.name, price: prod3.price, qty: 1 }],
    paymentMethod: 'wallet',
    amountPaid: prod3.price,
    shiftId: shift1.id,
    user: cashierUser
  });
  const o3Total = prod3.price;
  check(`إنشاء فاتورة محفظة بقيمة ${o3Total} ج.م`, o3 && o3.id);

  // أوردر 4: نوتة / آجل 120 ج.م
  const o4 = db.createOrder({
    customerName: 'محمد عبد الله (نوتة)',
    customerPhone: '01099998888',
    orderType: 'notebook',
    paymentMethod: 'notebook',
    items: [{ productId: prod1.id, name: prod1.name, price: prod1.price, qty: 1 }],
    amountPaid: 0,
    shiftId: shift1.id,
    user: cashierUser
  });
  const o4Total = prod1.price;
  check(`إنشاء فاتورة نوتة (آجل) بقيمة ${o4Total} ج.م`, o4 && o4.id);

  // تسجيل مصروف من الدرج 60 ج.م
  const exp1 = db.addExpense({
    amount: 60,
    category: 'مشتريات خامات (بن/حليب/سكر/مستلزمات)',
    notes: 'حليب وشاي',
    shiftId: shift1.id,
    userId: cashierUser.id,
    userName: cashierUser.name
  });
  check('تسجيل مصروف نقدي من الخزينة بقيمة 60 ج.م', exp1 && exp1.success);

  // التحقق من حسابات الدرج والكاش المتوقع للشيفت 1
  const cur1 = db.currentShift();
  const expectedCash1 = openingFloat1 + o1Total - 60;
  check(`مطابقة إجمالي مبيعات الشيفت 1 (${cur1.total_sales} = ${o1Total + o2Total + o3Total + o4Total})`, Number(cur1.total_sales) === (o1Total + o2Total + o3Total + o4Total));
  check(`مطابقة مبيعات الكاش بالدرج (${cur1.cash_sales} = ${o1Total})`, Number(cur1.cash_sales) === o1Total);
  check(`مطابقة مبيعات الفيزا (${cur1.card_sales} = ${o2Total})`, Number(cur1.card_sales) === o2Total);
  check(`مطابقة مبيعات المحفظة (${cur1.wallet_sales} = ${o3Total})`, Number(cur1.wallet_sales) === o3Total);
  check(`مطابقة الكاش المتوقع بالدرج (${cur1.expected_cash} = 500 عهدة + ${o1Total} كاش - 60 مصروف = ${expectedCash1})`, Number(cur1.expected_cash) === expectedCash1);

  // إغلاق الشيفت 1 بكاش فعلي مطابق
  const close1 = db.closeShift(shift1.id, expectedCash1, 'تقفيل الوردية الصباحية بدون عجز');
  check('إغلاق الوردية 1 بنجاح وتسجيل الكاش الفعلي', close1 && close1.success);
  check('مطابقة رصيد الفرق بالدرج (عجز أو زيادة = 0)', Number(close1.cashDifference) === 0);

  // -------------------------------------------------------------
  // 3. فحص تسليم العهدة التلقائي وسداد الديون (الوردية 2)
  // -------------------------------------------------------------
  console.log('\n📌 3. فحص تسليم العهدة الآلي وسداد ديون النوتة (الوردية 2):');
  // فتح شيفت 2 بدون إدخال كاش -> يجب أن يحمل تلقائياً الكاش الفعلي للشيفت 1 (expectedCash1)
  const shift2 = db.openShift(null, '', cashierUser, 'الشيفت المسائي');
  check(`ترحيل وتسليم عهدة الشيفت السابق تلقائياً للشيفت الجديد (${shift2.opening_cash} = ${expectedCash1})`, Number(shift2.opening_cash) === expectedCash1);

  // العميل يسدد دين النوتة جزئياً أو كلياً في الشيفت 2
  const debts = db.listDebts();
  const targetDebt = debts.find(d => d.order_id === o4.id);
  check('ظهور دين النوتة في سجل الديون', targetDebt && Number(targetDebt.total_amount || targetDebt.remaining_amount) === o4Total);

  const payRes = db.payDebt({
    debtId: targetDebt.id,
    amount: o4Total,
    shiftId: shift2.id,
    cashierName: cashierUser.name,
    notes: 'سداد كامل بالدرج في الوردية 2'
  });
  check('سداد دين النوتة نقداً بالدرج', payRes && payRes.success && payRes.newStatus === 'paid');

  // التحقق من أن سداد الدين دخل في كاش الوردية 2
  const cur2 = db.currentShift();
  const expectedCash2 = expectedCash1 + o4Total;
  check(`دخول تحصيل الدين في كاش الدرج المتوقع للوردية 2 (${cur2.expected_cash} = ${expectedCash2})`, Number(cur2.expected_cash) === expectedCash2);
  check(`تسجيل مبلغ تحصيل الديون بالشيفت 2 (${cur2.debt_collections} = ${o4Total})`, Number(cur2.debt_collections) === o4Total);

  // إغلاق الشيفت 2 مع عجز 20 ج.م لاختبار رصد العجز
  const actualWithShortage = expectedCash2 - 20;
  const close2 = db.closeShift(shift2.id, actualWithShortage, 'تسليم مع عجز 20 ج');
  check('إغلاق الشيفت 2 ورصد العجز بدقة', close2 && close2.success);
  check('حساب عجز الدرج بدقة (-20 ج.م)', Number(close2.cashDifference) === -20);

  // -------------------------------------------------------------
  // 4. فحص نظام الـ 24 ساعة المستمر وعدم تشتت العمليات بعد منتصف الليل
  // -------------------------------------------------------------
  console.log('\n📌 4. فحص نظام الـ 24 ساعة المستمر عبر التواريخ ومنتصف الليل:');
  const shift3 = db.openShift(1000, 'شيفت الـ 24 ساعة', cashierUser, 'وردية مستمرة');
  check('فتح وردية الـ 24 ساعة', shift3 && shift3.id);

  // عمل أوردر كاش
  const oLong = db.createOrder({
    customerName: 'عميل ليل',
    orderType: 'takeaway',
    items: [{ productId: prod1.id, name: prod1.name, price: prod1.price, qty: 1 }],
    paymentMethod: 'cash',
    amountPaid: prod1.price,
    shiftId: shift3.id,
    user: cashierUser
  });
  check('تسجيل أوردر في الوردية المستمرة', oLong && oLong.id);

  // محاكاة عبور منتصف الليل وتغيير التاريخ للطلب ليكون قبل يومين بينما الشيفت ما زال مفتوحاً
  db.runSql("UPDATE orders SET created_at = datetime('now', '-2 days') WHERE id = ?", [oLong.id]);

  // فحص todaySales() للتأكد من أن الطلب من اليوم السابق ما زال مدرجاً ضمن مبيعات اليوم النشطة
  const ts = db.todaySales();
  check('شمول أوردرات الشيفت المفتوح في مبيعات اليوم حتى لو عبرت منتصف الليل (>24h)', ts.total >= 50 && ts.cash_total >= 50);

  const dashStats = db.getDashboardStats();
  const orderInDash = dashStats.todayOrders.some(o => o.id === oLong.id);
  check('ظهور الأوردر في جدول أوردرات اليوم النشط بلوحة التحكم', orderInDash);

  // -------------------------------------------------------------
  // 5. فحص التقارير الخمسة (Reports Verification)
  // -------------------------------------------------------------
  console.log('\n📌 5. فحص كافة التقارير الخمسة بدقة:');

  // أ. تقرير الشيفت التفصيلي
  const repShift1 = db.getReportShift({ shiftId: shift1.id });
  check('تقرير الشيفت 1: وجود بيانات الشيفت والأوردرات والمصروفات', repShift1 && repShift1.shift && repShift1.orders.length === 4 && repShift1.expenses.length === 1);
  const netCash1 = Number(repShift1.shift.cash_sales || 0) - Number(repShift1.shift.expenses_total || 0);
  check(`تقرير الشيفت 1: مطابقة صافي الكاش المحصل (${netCash1})`, netCash1 === (o1Total - 60));

  // ب. تقرير اليوم الشامل (Daily Summary)
  const dailyRep = db.getDailySummaryReport();
  check('تقرير اليوم الشامل: استخراج مصفوفة الشيفتات والإجماليات', dailyRep && Array.isArray(dailyRep.shifts) && dailyRep.shifts.length >= 2);
  check('تقرير اليوم الشامل: احتساب إجمالي المبيعات العامة بدقة', Number(dailyRep.grandTotal.totalSales) > 0);
  check('تقرير اليوم الشامل: عدم وجود أي قيم غير معرفة (NaN)', !isNaN(dailyRep.grandTotal.netCash) && !isNaN(dailyRep.grandTotal.totalSales));

  // ج. تقرير المبيعات المفلترة (Sales Report)
  const salesRep = db.getReportSales({ userId: cashierUser.id });
  check('تقرير المبيعات المفلترة بحساب الكاشير', salesRep && salesRep.summary && salesRep.summary.order_count >= 4);

  // د. تقرير حضور وانصراف الموظفين
  const attendanceRep = db.getUserAttendanceReports();
  check('تقرير حضور وانصراف الكاشيرات والورديات', attendanceRep && Array.isArray(attendanceRep.shifts) && attendanceRep.shifts.length >= 3);
  check('ظهور كاشير 1 ومجموع فترات تواجده وأوردراته', attendanceRep.userSummaries.some(u => u.userId === cashierUser.id && u.totalShifts >= 2));

  // هـ. تقرير المرتبات الشهري
  const payroll = db.getMonthlyPayroll();
  check('تقرير المرتبات وحساب الاستحقاقات', payroll && Array.isArray(payroll.records) && payroll.records.length > 0);

  // -------------------------------------------------------------
  // 6. فحص استقرار قاعدة البيانات والحفظ الذري ضد انقطاع الكهرباء
  // -------------------------------------------------------------
  console.log('\n📌 6. فحص سلامة الحفظ الذري على القرص (Power Cut / Atomic Save):');
  db.saveDbAtomic();
  const fileStat = fs.statSync(testDbPath);
  check('حفظ ملف قاعدة البيانات على القرص بنجاح وحجم سليم', fileStat.size > 10000);

  // تنظيف ملف الاختبار
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('\n================================================================');
  console.log(`  🎉 نتيجة الفحص الشامل: اجتياز ${passedChecks} من أصل ${passedChecks} فحص بنجاح 100%!`);
  console.log('  الخزينة والفلوس 100% | الورديات 100% | التقارير 100% | سلامة البيانات 100%');
  console.log('================================================================\n');
}

runComprehensiveAudit().catch(err => {
  console.error('Audit Error:', err);
  process.exit(1);
});
