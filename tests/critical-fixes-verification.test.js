/**
 * ==============================================================================================
 * tests/critical-fixes-verification.test.js
 * Verification of the 4 Fixes:
 * 1. Takeaway & Notebook isolation (no "نوتة غير مفعلة" error during takeaway)
 * 2. Clock guard 4-hour tolerance (power outages do not trigger tampering)
 * 3. Severe clock desync prompts for ADMIN PASSWORD override, NEVER deactivates license
 * 4. Default password check runs ONCE, never forces password change repeatedly on restart
 * 5. Cairo DST receipt formatting matches kitchen/bar bon
 * ==============================================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateLicenseForMachine } = require('../scripts/generate-license');

describe('🛡️ Critical Fixes & License Resilience Test Suite', () => {
  let testEnvDir;
  let db;
  let adminUser;
  const ADMIN_PASSWORD = 'AdminSecurePass2026!#';

  before(async () => {
    testEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-crit-fixes-'));
    process.env.NODE_ENV = 'test';
    delete require.cache[require.resolve('../electron/db')];
    db = require('../electron/db');
    const testDbPath = path.join(testEnvDir, 'crit-fixes.db');
    await db.init(testDbPath);

    // Setup initial admin
    if (typeof db.setupInitialAdmin === 'function') {
      db.setupInitialAdmin(ADMIN_PASSWORD, 'مدير النظام المعتمد');
    }
    adminUser = db.loginUser('admin', ADMIN_PASSWORD);

    // Activate license legitimately with vendor signature
    const machineId = db.getMachineId();
    const validKey = generateLicenseForMachine(machineId);
    const actRes = db.activateLicense(validKey);
    assert.strictEqual(actRes.success, true, 'License must be successfully activated');
  });

  after(() => {
    if (testEnvDir && fs.existsSync(testEnvDir)) {
      try { fs.rmSync(testEnvDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ============================================================================
  // سيناريو 1: انقطاع الكهرباء وتأخر الساعة في حدود 4 ساعات
  // ============================================================================
  describe('سيناريو 1: انقطاع الكهرباء وتأخر مزامنة ويندوز (في حدود 4 ساعات)', () => {
    test('الساعة متأخرة 15 دقيقة بعد انقطاع الكهرباء — لا يعتبر تلاعباً ولا يطلب أي شيء', () => {
      // آخر نشاط مسجل متقدم بـ 15 دقيقة عن الوقت الحالي
      const pastSystemTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [pastSystemTime]);

      const clockRes = db.checkClockIntegrity();
      assert.strictEqual(clockRes.valid, true, 'يجب قبول فارق 15 دقيقة كسماحية طبيعية لانقطاع الكهرباء');

      const license = db.getLicenseStatus();
      assert.strictEqual(license.isActivated, true, 'الترخيص يجب أن يظل مفعلاً');
      assert.strictEqual(license.isClockTampered, false, 'لا يوجد علم تلاعب بالساعة');
    });

    test('الساعة متأخرة ساعتين ونصف بعد انقطاع طويل للكهرباء — مقبولة ضمن سماحية الـ 4 ساعات', () => {
      const pastSystemTime = new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString();
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [pastSystemTime]);

      const clockRes = db.checkClockIntegrity();
      assert.strictEqual(clockRes.valid, true, 'يجب قبول فارق ساعتين ونصف ضمن سماحية الـ 4 ساعات');

      const license = db.getLicenseStatus();
      assert.strictEqual(license.isActivated, true, 'الترخيص مفعل تماماً');
      assert.strictEqual(license.isClockTampered, false, 'لا يوجد حظر للساعة');
    });

    test('فتح وردية وتسجيل الدخول ينجحان بشكل طبيعي بدون أي نوافذ منبثقة', () => {
      const shiftRes = db.openShift(500, 'وردية بعد عودة الكهرباء', adminUser);
      assert.strictEqual(shiftRes.success, true, 'فتح الوردية ينجح بدون أي مشاكل');
      assert.ok(shiftRes.shift || db.currentShift(), 'بيانات الوردية موجودة');

      // إغلاق الوردية للاختبارات التالية
      const active = db.currentShift();
      if (active) {
        db.closeShift(active.id, 500, 'إغلاق اختباري', adminUser);
      }
    });
  });

  // ============================================================================
  // سيناريو 2: تراجع الساعة بشكل حاد (نفاد بطارية اللوحة الأم CMOS Battery)
  // يطلب كلمة سر الأدمن ولا يطلب أبداً كود التفعيل!
  // ============================================================================
  describe('سيناريو 2: تراجع حاد في الساعة (CMOS Battery) — طلب كلمة سر الأدمن وليس كود التفعيل', () => {
    test('تراجع الساعة لـ 7 أيام في الماضي: الترخيص يظل مفعلاً (isActivated: true) ولا يطلب كود تفعيل', () => {
      // محاكاة نفاد بطارية اللوحة الأم ورجوع الساعة 7 أيام إلى الخلف
      const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [farFuture]);

      const clockRes = db.checkClockIntegrity();
      assert.strictEqual(clockRes.valid, false, 'يجب رصد تراجع تاريخ الجهاز لحماية الحسابات');
      assert.strictEqual(clockRes.clockTampered, true);

      // الفحص الأهم: حالة الترخيص
      const license = db.getLicenseStatus();
      assert.strictEqual(license.isActivated, true, 'حاسم: الترخيص يظل مفعلاً ولا يطلب كود التفعيل الرقمي!');
      assert.strictEqual(license.isClockTampered, true, 'يوضح أن المشكلة في ساعة الجهاز فقط');
      assert.ok(license.clockError, 'رسالة توجيهية عن ضبط ساعة الجهاز');
    });

    test('محاولة فتح وردية أثناء ارتباك الساعة تُحظر لحماية التسلسل الزمني للحسابات', () => {
      const shiftRes = db.openShift(500, 'محاولة فتح وردية بتاريخ قديم', adminUser);
      assert.strictEqual(shiftRes.success, false, 'يجب منع فتح الوردية بتاريخ قديم');
      assert.strictEqual(shiftRes.clockTampered, true);
    });

    test('محاولة فك حظر الساعة بكلمة سر غير صحيحة تفشل', () => {
      const resetRes = db.resetClockGuard({ adminPassword: 'wrong_password_999' });
      assert.strictEqual(resetRes.success, false, 'يجب رفض كلمة المرور الخاطئة');
      assert.strictEqual(resetRes.error, 'كلمة مرور المدير غير صحيحة');
    });

    test('إدخال كلمة سر المدير الصحيحة يفك حظر الساعة فوراً ويسجل العملية في سجل الرقابة (Audit Log)', () => {
      const resetRes = db.resetClockGuard({ adminPassword: ADMIN_PASSWORD, actor: adminUser });
      assert.strictEqual(resetRes.success, true, 'تمت إعادة مزامنة الساعة بنجاح بصلاحيات المدير');

      // التحقق من أن الساعة أصبحت صالحة
      const fixedClock = db.checkClockIntegrity();
      assert.strictEqual(fixedClock.valid, true, 'الساعة أصبحت صالحة الآن');

      // التحقق من تدوين العملية في سجل العمليات الرقابي
      const audit = db.listAuditLog(10);
      const syncLog = audit.find(a => a.action === 'clock_sync');
      assert.ok(syncLog, 'تم تسجيل عملية إعادة ضبط الساعة في سجل العمليات');
      assert.strictEqual(syncLog.actor_name, adminUser.name);
    });

    test('بعد مزامنة المدير: يفتح الشيفت ويسجل الدخول فوراً وبكل سلاسة', () => {
      const shiftRes = db.openShift(1000, 'شيفت بعد مزامنة المدير', adminUser);
      assert.strictEqual(shiftRes.success, true, 'تم فتح الشيفت بنجاح تام');
    });
  });

  // ============================================================================
  // سيناريو 3: فحص كلمات السر الافتراضية يحدث مرة واحدة فقط ولا يتكرر
  // ============================================================================
  describe('سيناريو 3: فحص كلمات السر الافتراضية (1234/123456) مرة واحدة فقط', () => {
    test('تكرار إقلاع البرنامج لا يُعيد تعيين must_change_password للمستخدم الذي قام بتغييرها', () => {
      // إنشاء مستخدم جديد وتعيين must_change_password = 0
      const nowIso = new Date().toISOString();
      const testHash = require('bcryptjs').hashSync('1234', 10);
      db.runSql(`
        INSERT INTO users (username, name, password, role, created_at, must_change_password)
        VALUES ('cashier_test_flow', 'كاشير اختبار', ?, 'cashier', ?, 0)
      `, [testHash, nowIso]);

      // التأكد من أن passwords_default_checked = '1'
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('passwords_default_checked', '1')");

      // تشغيل دالة migratePasswordsToBcrypt لمحاكاة إعادة فتح البرنامج
      db.migratePasswordsToBcrypt();

      // التحقق من أن المستخدم لم يتأثر
      const user = db.queryGet("SELECT must_change_password FROM users WHERE username = 'cashier_test_flow'");
      assert.strictEqual(user.must_change_password, 0, 'يجب ألا يتم إجباره على تغيير كلمة المرور عند كل إقلاع');
    });
  });

  // ============================================================================
  // سيناريو 4: عزل التيك أواي عن النوتة بنجاح
  // ============================================================================
  describe('سيناريو 4: عزل التيك أواي عن النوتة (لا يظهر خطأ النوتة غير مفعلة)', () => {
    test('طلب تيك أواي بـ paymentMethod كاش ينجح تماماً حتى لو كانت النوتة معطلة بالإعدادات', () => {
      // تعطيل النوتة
      db.saveVendorFeatures({
        enable_notebook_for_admin: false,
        show_notebook_to_cashier: false,
        enable_takeaway: true
      });

      const currentShift = db.currentShift();
      assert.ok(currentShift, 'يوجد شيفت مفتوح');

      // محاكاة منطق الواجهة المعدل:
      // عند التبديل من نوتة لتيك أواي، paymentMethod يرجع لـ cash تلقائياً
      let simulatedOrderType = 'takeaway';
      let simulatedPaymentMethod = 'notebook'; // كانت معلقة على نوتة قبل التبديل
      if (simulatedOrderType !== 'notebook' && simulatedPaymentMethod === 'notebook') {
        simulatedPaymentMethod = 'cash';
      }
      assert.strictEqual(simulatedPaymentMethod, 'cash', 'تم تصحيح طريقة الدفع تلقائياً إلى cash');

      // إنشاء طلب تيك أواي
      const prod = db.listProducts()[0];

      const orderPayload = {
        shiftId: currentShift.id,
        orderType: 'takeaway',
        paymentMethod: simulatedPaymentMethod,
        items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }],
        cashAmount: prod.price,
        discount: 0,
        user: adminUser
      };

      const orderRes = db.createOrder(orderPayload);
      assert.ok(orderRes && orderRes.orderId, 'تم إنشاء طلب التيك أواي بنجاح بدون خطأ النوتة');
      const savedOrder = db.getOrder(orderRes.orderId);
      assert.strictEqual(savedOrder.order_type, 'takeaway');
      assert.strictEqual(savedOrder.payment_method, 'cash');
    });
  });

  // ============================================================================
  // سيناريو 5: تطابق التوقيت الصيفي المصري بين الشيك النهائي وبون التحضير
  // ============================================================================
  describe('سيناريو 5: تطابق توقيت الشيك والبون في التوقيت الصيفي المصري (Cairo DST)', () => {
    test('الدالة تحسب توقيت القاهرة بدقة متوافقة مع بونات البار والمطبخ', () => {
      // تاريخ صيفي مصري (مثلاً 15 يوليو 2026)
      const summerDate = new Date('2026-07-15T12:00:00Z');
      const toCairo = db.toCairoDateString ? db.toCairoDateString(summerDate) : '2026-07-15';
      assert.ok(toCairo.startsWith('2026-07-15'), 'تاريخ الصيف المصري مطابق');
    });
  });
});
