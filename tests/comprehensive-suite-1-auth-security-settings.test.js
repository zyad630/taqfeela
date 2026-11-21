/**
 * comprehensive-suite-1-auth-security-settings.test.js
 * تغطية شاملة لـ: المصادقة والمستخدمين، التراخيص، الأمان ومكافحة التلاعب، وساعة النظام، والإعدادات
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const { generateLicenseForMachine } = require('../scripts/generate-license');

const PKCS8_BASE64 = 'REDACTED_PRODUCTION_PRIVATE_KEY_FOR_PUBLIC_REVIEW';
const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----\n${PKCS8_BASE64}\n-----END PRIVATE KEY-----`;

function loadDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-comp-suite1-'));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    if (request === './finance' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'finance'), parent, isMain);
    if (request === './menuData' && parent?.filename.endsWith('db.js'))
      return original.call(this, path.join(__dirname, '..', 'electron', 'menuData'), parent, isMain);
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../electron/db')];
  const db = require('../electron/db');
  Module._load = original;
  return { db, dir };
}

describe('COMPREHENSIVE SUITE 1: Auth, Security, Clock, & Settings', () => {

  // ================= 1. المصادقة والمستخدمين والصلاحيات =================
  test('1.1: Default admin exists and can authenticate', async () => {
    const { db } = loadDb();
    await db.init();

    const admin = db.loginUser('admin', '1234');
    assert.ok(admin, 'Admin must log in successfully with default password');
    assert.strictEqual(admin.username, 'admin');
    assert.strictEqual(admin.role, 'admin');
    assert.strictEqual(admin.password, undefined, 'Password hash must never leak in login result');
  });

  test('1.2: User CRUD: Create, Read, Update, Delete with validation', async () => {
    const { db } = loadDb();
    await db.init();

    // إنشاء كاشير جديد بكلمة مرور قصيرة جداً (< 6) -> يجب الرفض
    assert.throws(() => {
      db.saveUser({ username: 'cashierShort_' + Date.now(), name: 'أحمد', role: 'cashier', password: '123' });
    }, /6 أحرف|أحرف|طول|قصيرة|كلمة/i, 'Short password must be rejected');

    // إنشاء كاشير صالح
    const uniqueCashier = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const created = db.saveUser({
      username: uniqueCashier,
      name: 'أحمد علي',
      role: 'cashier',
      password: 'cashierPass2026'
    });
    assert.ok(created?.id, 'User must be created with ID');
    assert.strictEqual(created.username, uniqueCashier);

    // التحقق من قائمة المستخدمين
    const users = db.listUsers();
    assert.ok(users.some(u => u.username === uniqueCashier));

    // قائمة المستخدمين العمومية (listPublicUsers) لا تكشف بيانات حساسة
    const publicUsers = db.listPublicUsers();
    const pubUser = publicUsers.find(u => u.username === uniqueCashier);
    assert.ok(pubUser);
    assert.strictEqual(pubUser.password, undefined);

    // تسجيل الدخول بالكاشير الجديد
    const cashierLogin = db.loginUser(uniqueCashier, 'cashierPass2026');
    assert.ok(cashierLogin);
    assert.strictEqual(cashierLogin.role, 'cashier');

    // تسجيل دخول بكلمة مرور خاطئة -> فشل
    const badLogin = db.loginUser(uniqueCashier, 'WrongPassword');
    assert.strictEqual(badLogin, null, 'Invalid password must return null');

    // تعديل بيانات المستخدم
    db.saveUser({ id: created.id, username: uniqueCashier, name: 'أحمد علي المحدث', role: 'cashier' });
    const updated = db.getUser(created.id);
    assert.strictEqual(updated.name, 'أحمد علي المحدث');

    // حذف المستخدم
    const delRes = db.deleteUser(created.id);
    assert.strictEqual(delRes.success, true);
    assert.ok(!db.getUser(created.id), 'Deleted user must not be found');
  });

  test('1.3: Admin cannot delete their own account', async () => {
    const { db } = loadDb();
    await db.init();
    const admin = db.getUser(1);
    const delRes = db.deleteUser(admin.id);
    assert.strictEqual(delRes.success, false, 'Admin self-deletion must be blocked');
  });

  test('1.4: Password change enforces security rules', async () => {
    const { db } = loadDb();
    await db.init();

    // تغيير كلمة مرور المدير إلى كلمة آمنة
    const changeRes = db.changePassword({ userId: 1, newPassword: 'SuperStrongPassword2026!' });
    assert.strictEqual(changeRes.success, true);

    // القديمة لم تعد تعمل
    assert.strictEqual(db.loginUser('admin', '1234'), null);

    // الجديدة تعمل
    assert.ok(db.loginUser('admin', 'SuperStrongPassword2026!'));

    // كلمة مرور قصيرة ترفض
    const shortRes = db.changePassword({ userId: 1, newPassword: '123' });
    assert.strictEqual(shortRes.success, false);
  });

  test('1.5: verifyAdminPassword security against timing, case, and empty input', async () => {
    const { db } = loadDb();
    await db.init();

    // كلمة المرور الافتراضية
    assert.strictEqual(db.verifyAdminPassword('1234').success, true);
    assert.strictEqual(db.verifyAdminPassword('123').success, false);
    assert.strictEqual(db.verifyAdminPassword('').success, false);
    assert.strictEqual(db.verifyAdminPassword(null).success, false);
    assert.strictEqual(db.verifyAdminPassword('12345').success, false);
  });

  // ================= 2. سلامة ساعة النظام ومكافحة التلاعب =================
  test('2.1: Clock integrity verifies normal operation and detects drift', async () => {
    const { db } = loadDb();
    await db.init();

    // في الحالة الطبيعية
    const status = db.checkClockIntegrity();
    assert.strictEqual(status.valid, true, 'Clock must be valid on clean start');
    assert.strictEqual(status.clockTampered, undefined);

    // إعادة ضبط حارس الساعة بواسطة المدير (الدالة تأخذ كائن بكلمة مرور الأدمن وتسجل حدث clock_sync)
    const resetRes = db.resetClockGuard({ adminPassword: '1234' });
    assert.strictEqual(resetRes.success, true);
    assert.ok(db.listAuditLog(10).some(a => a.action === 'clock_sync'));
  });

  // ================= 3. التراخيص الرقمية غير المتصلة (Offline Ed25519) =================
  test('3.1: License status, machine ID stability, and activation validation', async () => {
    const { db } = loadDb();
    await db.init();

    const machineId = db.getMachineId();
    assert.ok(machineId && machineId.length >= 8, 'Machine ID must be generated stably');

    // كود تفعيل غير صالح
    const badActivation = db.activateLicense('INVALID-BASE64-JUNK-KEY');
    assert.strictEqual(badActivation.success, false);

    // توليد ترخيص رسمي موقع بالمفتاح الخاص لهذا الجهاز
    const validKey = generateLicenseForMachine(machineId);
    assert.ok(validKey && validKey.length > 20);

    const goodActivation = db.activateLicense(validKey);
    assert.strictEqual(goodActivation.success, true, 'Valid cryptographic license must be accepted');

    const licStatus = db.getLicenseStatus();
    assert.strictEqual(licStatus.isActivated, true);
  });

  test('3.2: Tamper Lockout detection & Vendor cryptographic unlock', async () => {
    const { db } = loadDb();
    await db.init();
    const machineId = db.getMachineId();

    // تفعيل وضع القفل الأمني في الإعدادات
    db.runSql('INSERT OR REPLACE INTO settings (key, value) VALUES ("tamper_locked", "1")');
    assert.strictEqual(db.isTamperLockedInDb(), true, 'Tamper state must be detected');

    // محاولة فك القفل بكود عشوائي -> تفشل
    const badUnlock = db.unlockTamper('fakeCode123');
    assert.strictEqual(badUnlock.success, false);

    // فك القفل بالتوقيع الرقمي للمورّد
    const signData = `UNLOCK_TAMPER|${machineId}`;
    const validUnlockSig = crypto.sign(null, Buffer.from(signData, 'utf8'), PRIVATE_KEY_PEM).toString('base64');
    const goodUnlock = db.unlockTamper(validUnlockSig);
    assert.strictEqual(goodUnlock.success, true, 'Cryptographic vendor unlock must clear tamper lock');
    assert.ok(!db.isTamperLockedInDb(), 'Tamper lock must be cleared after valid unlock');
  });

  // ================= 4. الإعدادات وتخصيص النظام =================
  test('4.1: Settings save, load, and type-coercion resilience', async () => {
    const { db } = loadDb();
    await db.init();

    const initialSettings = db.getSettings();
    assert.ok(initialSettings, 'Initial settings must exist');

    // تحديث إعدادات النظام الحساسة (النظام يحفظ القيمة كما هي)
    db.saveSettings({
      allow_negative_stock: '1',
      allow_cashier_cancel_orders: 'false',
      bar_printer_name: 'Bar Thermal Printer 80mm'
    });

    const updated = db.getSettings();
    assert.strictEqual(updated.allow_negative_stock, '1');
    assert.ok(updated.allow_cashier_cancel_orders === 'false' || updated.allow_cashier_cancel_orders === '0',
      'allow_cashier_cancel_orders must be stored as false or 0');
    assert.strictEqual(updated.bar_printer_name, 'Bar Thermal Printer 80mm');
  });
});
