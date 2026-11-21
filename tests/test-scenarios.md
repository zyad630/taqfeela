# 📋 Test Scenarios — CafePOS (New Coverage)

> **الإصدار:** 1.0 — 14 أكتوبر 2026  
> **المعِد:** QA Scenario Lab — CafePOS Sales Management System  
> **النطاق:** سيناريوهات جديدة كلياً — غير موجودة في ملفات الاختبار الحالية  
> **الملفات المستهدفة:** `src/api.js` · `src/App.jsx` · `src/App.css`

---

## 🔍 ملخص حالة المشاكل (Verified Against Live Code & Test Suites)

| # | المشكلة | الملف والسطر | الحالة | ملف الاختبار التلقائي |
|---|---------|--------------|--------|----------------------|
| BUG-01 | `verifyAdminPassword` يستخدم `includes()` — تقبل جزءًا من كلمة المرور | `api.js:2085` | ✅ تم الحل بنجاح | `tests/ts-01-password-partial-match.test.js` |
| BUG-02 | كلمات مرور طوارئ ثابتة: `'9999'`, `'1234'`, `'admin'`, `'manager123'` | `api.js:2059`, `2914` | ✅ تم الحل بنجاح | `tests/ts-02-static-emergency-pins.test.js` |
| BUG-03 | `pushSyncQueue()` تحذف من الطابور قبل تأكيد `response.ok` من السيرفر | `api.js:1314` | ✅ تم الحل بنجاح | `tests/ts-03-sync-queue-safety.test.js` |
| BUG-04 | تعارض مفاتيح سلات الطاولات: كتابة مزدوجة بـ `table_carts` + `cafepos_table_carts` | `api.js:1567–1568` | ✅ تم الحل بنجاح | `tests/ts-05-table-cart-key-conflict.test.js` |
| BUG-05 | تقرير المبيعات لا يجمع مبالغ الدفع لطلبات `split` | `api.js:1788–1790` | ✅ تم الحل بنجاح | `tests/ts-06-split-payment-report.test.js` |
| BUG-06 | `payrollMonth` و`attendanceMonthFilter` يستخدمان `toISOString()` بدل توقيت القاهرة | `App.jsx` | ✅ تم الحل بنجاح | `tests/ts-07-cairo-timezone-month.test.js` |
| BUG-07 | في مسار `.catch()` لـ `saveTableCart`، لا يُضبط `retryTimerRef` | `App.jsx:565–576` | ✅ تم الحل بنجاح | `tests/ts-08-save-cart-catch-retry.test.js` |
| BUG-08 | `font-family: 'Cairo', inherit;` — `inherit` ليس اسم خط صحيح في CSS | `App.css` | ✅ تم الحل بنجاح | `App.css` (تم التعديل لـ `inherit`) |

---

## 📐 قالب توثيق نتائج الاختبار

```
| الحقل              | القيمة                        |
|--------------------|-------------------------------|
| رقم السيناريو      | TS-XX                         |
| اسم الاختبار       |                               |
| التاريخ            |                               |
| المنفِّذ           |                               |
| البيئة             |                               |
| النتيجة المتوقعة   | PASS / FAIL                   |
| النتيجة الفعلية    | PASS / FAIL / BLOCKED         |
| ملاحظات            |                               |
| Bug ID (إن وُجد)   | BUG-XX                        |
```

---

## 🧪 السيناريوهات التفصيلية

---

### TS-01 — التحقق من كلمة المرور: رفض المطابقة الجزئية في verifyAdminPassword

**الأولوية:** 🔴 High  
**BUG المستهدف:** BUG-01  
**Code Path:** `api.js:2079–2089`

#### الهدف
التحقق من أن `verifyAdminPassword()` ترفض أي إدخال لا يطابق كلمة المرور كاملةً، وأن `includes()` في السطر 2085 يُمثّل ثغرة فعلية قابلة للاستغلال الآن.

#### المدخلات

| المدخل | كلمة المرور الفعلية | النتيجة المتوقعة |
|--------|---------------------|-----------------|
| `"manager"` | `"manager123"` | ❌ FAIL (رفض) |
| `"123"` | `"manager123"` | ❌ FAIL (رفض) |
| `"manager123"` | `"manager123"` | ✅ PASS (قبول) |
| `""` | أي | ❌ FAIL (رفض) |
| `"MANAGER123"` | `"manager123"` | ❌ FAIL (رفض — case-sensitive) |

#### الخطوات التنفيذية
1. استدعاء `mockApi.verifyAdminPassword("manager")` حين كلمة المرور الفعلية `"manager123"`.
2. تسجيل النتيجة — الكود الحالي سيُرجع `{ success: true }` بسبب `includes()`.
3. تكرار مع `"123"`, `"manage"`, `"r123"`.
4. اختبار الكلمة الكاملة `"manager123"` → يجب أن يُرجع `{ success: true }`.
5. اختبار سلسلة فارغة → يجب رفضها.

#### Bottom-line Assertion
```js
// الكود الحالي: BUG — يقبل جزءًا من الكلمة
const admin = users.find(u => u.role === 'admin' && u.password.includes(cleanPass));
// الكود المطلوب: آمن
const admin = users.find(u => u.role === 'admin' && u.password === cleanPass);

assert.strictEqual(result.success, false,
  'Password verification MUST use strict equality — includes() is a security hole');
```

#### بيئة الاختبار
- **Node.js ≥ 18** (Unit test بدون browser)
- **ملف:** `tests/ts-01-password-partial-match.test.js`
- **CI:** يعمل بشكل مباشر بدون تبعيات إضافية

---

### TS-02 — أكواد الطوارئ الثابتة والكلمات الافتراضية (Backdoors)

**الأولوية:** 🔴 High  
**BUG المستهدف:** BUG-02  
**Code Path:** `api.js:2059`, `api.js:2914`

#### الهدف
التحقق من أن الأكواد الطارئة الثابتة (`'9999'`, `'1234'`, `'admin'`, `'manager123'`) لا تمنح وصولاً للمدير في بيئة الإنتاج.

#### حالات الاختبار

| السيناريو | المدخل | الإجراء | النتيجة الحالية (خاطئة) | النتيجة المطلوبة |
|-----------|--------|---------|------------------------|-----------------|
| تسجيل دخول بـ PIN طوارئ | `username=admin, password='1234'` | loginUser | ✅ يقبل | ❌ يجب رفضه |
| تسجيل دخول بـ backdoor | `username=admin, password='manager123'` | loginUser | ✅ يقبل | ❌ يجب رفضه |
| إعادة كلمة مرور بـ 9999 | `emergencyPin='9999'` | resetAdminPassword | ✅ يقبل | ❌ يجب رفضه |
| إعادة كلمة مرور بـ 1234 | `emergencyPin='1234'` | resetAdminPassword | ✅ يقبل | ❌ يجب رفضه |

#### الخطوات التنفيذية
1. استدعاء `mockApi.loginUser('admin', '1234')` → يجب رفضه.
2. استدعاء `mockApi.loginUser('admin', 'manager123')` → يجب رفضه (backdoor في `api.js:2059`).
3. استدعاء `mockApi.resetAdminPassword('9999', 'hacked')` → يجب رفضه.
4. التحقق من أن كلمات المرور الافتراضية للمستخدمين تتطلب `must_change_password = 1`.

#### Bottom-line Assertion
```js
assert.strictEqual(loginWithBackdoor?.role, undefined,
  'Static emergency passwords must NOT grant admin access');
assert.strictEqual(resetWithFixedPin.success, false,
  'Fixed emergency PINs (9999/1234) are a critical backdoor and must be removed');
```

#### بيئة الاختبار
- **Node.js ≥ 18**, mockApi (Web mode)
- **ملف:** `tests/ts-02-static-emergency-pins.test.js`

---

### TS-03 — مزامنة الطابور: حذف البيانات قبل تأكيد استلام السيرفر

**الأولوية:** 🔴 High  
**BUG المستهدف:** BUG-03  
**Code Path:** `api.js:1309–1324`

#### الهدف
التحقق من أن `pushSyncQueue()` لا تحذف عناصر `syncQueue` إلا بعد `response.ok === true`. الكود الحالي يحذف في السطر 1314 قبل حتى إرسال الطلب.

```js
// الكود الحالي (مشكلة):
const dataToSync = { ...syncQueue };
for (const k of keys) delete syncQueue[k];  // ← يُحذف هنا
try {
  await fetch('/api/sync', { ... });
  // لو فشل fetch، البيانات ضاعت!
} catch (e) {
  // صامت تمامًا
}

// الكود المطلوب (آمن):
try {
  const res = await fetch('/api/sync', { ... });
  if (res.ok) {
    for (const k of keys) delete syncQueue[k]; // ← يُحذف فقط عند النجاح
  } else {
    // إعادة البيانات للطابور
    Object.assign(syncQueue, dataToSync);
  }
} catch (e) {
  Object.assign(syncQueue, dataToSync); // استعادة عند فشل الشبكة
}
```

#### الخطوات التنفيذية
1. Mock لـ `fetch` ليرمي `NetworkError`.
2. استدعاء `queueDiskSync('orders', [{ id: 1 }])` لإضافة بيانات للطابور.
3. الانتظار حتى تُشغَّل `pushSyncQueue()` (100ms debounce).
4. التحقق من أن `syncQueue` لا يزال يحتوي على البيانات.
5. تكرار مع استجابة 500 (`response.ok = false`).
6. اختبار النجاح (`response.ok = true`) → يجب إفراغ الطابور.

#### Bottom-line Assertion
```js
assert.ok(Object.keys(syncQueue).length > 0,
  'CRITICAL: Queue MUST NOT be emptied before server confirms receipt (response.ok)');
```

#### بيئة الاختبار
- **Node.js ≥ 18** + `fetch` mock (`undici.MockAgent`)
- **ملف:** `tests/ts-03-sync-queue-safety.test.js`
- **CI:** يتطلب `--experimental-fetch` أو polyfill

---

### TS-04 — مزامنة البيانات: Hydration من السيرفر يكتب فوق بيانات محلية أحدث

**الأولوية:** 🔴 High  
**BUG المستهدف:** BUG-03 (جانب الاستيراد)  
**Code Path:** `api.js:1334–1353`

#### السيناريو الحرج
```
1. الكاشير يعدّل سلة الطاولة 3 → يُحفظ محليًا (timestamp T1)
2. فشل إرسال التعديل للسيرفر → السيرفر لا يزال عنده T0
3. الكاشير يغلق التطبيق ويعيد فتحه
4. الـ Hydration (api.js:1335) يقرأ من السيرفر (T0)
5. يكتب فوق localStorage (T1) — التعديل الأخير ضاع!
```

#### الخطوات التنفيذية
1. كتابة بيانات محلية بـ `_updatedAt = Date.now()` في localStorage.
2. محاكاة hydration من سيرفر ببيانات أقدم (`_updatedAt - 5000`).
3. التحقق من أن localStorage يحتفظ بالبيانات المحلية الأحدث.
4. اختبار العكس: بيانات السيرفر أحدث → يجب تطبيقها.

#### Bottom-line Assertion
```js
const localTs = JSON.parse(localStorage.getItem('cafepos_table_carts'))?._updatedAt;
assert.ok(localTs >= serverTs,
  'Hydration must NOT overwrite local data with older server data');
```

#### بيئة الاختبار
- **jsdom** + Node.js ≥ 18 + `fetch` mock
- **ملف:** `tests/ts-04-hydration-timestamp-conflict.test.js`

---

### TS-05 — تعارض مفاتيح سلات الطاولات: نسختان من نفس البيانات

**الأولوية:** 🔴 High  
**BUG المستهدف:** BUG-04  
**Code Path:** `api.js:1552–1568`, `App.jsx` (localStorage مباشرة)

#### الهدف
التحقق من أن عمليات القراءة/الكتابة لسلات الطاولات تستخدم مفتاحًا واحدًا موحدًا.

#### تدفق المشكلة
```
getLocal('cafepos_table_carts')
  → يبحث في localStorage.getItem('cafepos_cafepos_table_carts')  ← PREFIX مضاعف!

setLocal('table_carts')
  → يكتب في localStorage['cafepos_table_carts']                  ← مفتاح صحيح

setLocal('cafepos_table_carts')
  → يكتب في localStorage['cafepos_cafepos_table_carts']          ← DUPLICATE!

App.jsx مباشرة:
  → localStorage.setItem('cafepos_table_carts', ...)             ← مفتاح مختلف ثالث!
```

#### الخطوات التنفيذية
1. استدعاء `mockApi.saveTableCart(3, { cart: [{ name: 'قهوة', qty: 1 }] })`.
2. فحص جميع مفاتيح localStorage المتعلقة بالسلة.
3. التحقق من عدد المفاتيح الموجودة.
4. التعديل عبر `App.jsx` مباشرة بـ `localStorage.setItem('cafepos_table_carts', ...)`.
5. استدعاء `mockApi.getTableCarts()` → التحقق من القراءة من النسخة الصحيحة.
6. محاكاة إعادة تحميل التطبيق (Reload) والتحقق من البيانات المُحملة.

#### Bottom-line Assertion
```js
const cartKeys = Object.keys(localStorage).filter(k => k.includes('table_cart'));
assert.strictEqual(cartKeys.length, 1,
  'Must use exactly ONE unified key for table carts — no duplicate keys');
assert.strictEqual(cartKeys[0], 'cafepos_table_carts',
  'The unified key must be cafepos_table_carts');
```

#### بيئة الاختبار
- **jsdom** + Node.js ≥ 18
- **ملف:** `tests/ts-05-table-cart-key-conflict.test.js`

---

### TS-06 — تقرير المبيعات: إغفال مبالغ الدفع المختلط في الإجماليات

**الأولوية:** 🟠 Medium-High  
**BUG المستهدف:** BUG-05  
**Code Path:** `api.js:1788–1790`

#### الهدف
التحقق من أن تقرير المبيعات يجمع `cash_amount/card_amount/wallet_amount` لطلبات `split` بشكل صحيح.

#### البيانات التجريبية
```js
const testOrders = [
  { id: 1, total: 100, payment_method: 'cash',   cash_amount: 100 },
  { id: 2, total: 150, payment_method: 'card',   card_amount: 150 },
  { id: 3, total: 200, payment_method: 'split',
    cash_amount: 80, card_amount: 70, wallet_amount: 50 },
  { id: 4, total: 90,  payment_method: 'wallet', wallet_amount: 90 },
];
// المجموع الكلي = 540
// نقدي متوقع   = 100 + 80  = 180
// بطاقة متوقع  = 150 + 70  = 220
// محفظة متوقع  = 90  + 50  = 140
```

#### النتيجة الحالية مقابل المتوقعة

| الحقل | الحالي (خاطئ) | المتوقع (صحيح) |
|-------|--------------|----------------|
| `cash_sales` | 100 | **180** |
| `card_sales` | 150 | **220** |
| `wallet_sales` | 90 | **140** |
| المجموع | 340 ≠ 540 | **540 = 540** ✅ |

#### الخطوات التنفيذية
1. حقن `testOrders` في الطلبات المحلية (mockApi).
2. استدعاء `mockApi.getSalesReport({ dateFrom, dateTo })`.
3. مقارنة `summary.cash_sales` بـ 180.
4. مقارنة `summary.card_sales` بـ 220.
5. مقارنة `summary.wallet_sales` بـ 140.
6. التحقق من أن `cash + card + wallet === total_sales`.

#### Bottom-line Assertion
```js
assert.strictEqual(report.cash_sales, 180,
  'cash_sales MUST include cash_amount from split orders');
assert.strictEqual(report.card_sales, 220,
  'card_sales MUST include card_amount from split orders');
assert.strictEqual(report.wallet_sales, 140,
  'wallet_sales MUST include wallet_amount from split orders');
assert.strictEqual(
  report.cash_sales + report.card_sales + report.wallet_sales,
  report.total_sales,
  'Sum of payment categories MUST equal total_sales'
);
```

#### بيئة الاختبار
- **Node.js ≥ 18** / mockApi
- **ملف:** `tests/ts-06-split-payment-report.test.js`
- **الفئة:** Regression + Financial accuracy

---

### TS-07 — التوقيت المحلي: toISOString() يعيد تاريخ UTC بدل توقيت القاهرة

**الأولوية:** 🟠 Medium-High  
**BUG المستهدف:** BUG-06  
**Code Path:** `App.jsx` → `useState(new Date().toISOString().slice(0, 7))`

#### السيناريو الحرج
```
الوقت المحلي في القاهرة: 2026-11-01T01:30 AM (UTC+2)
الوقت UTC:               2026-10-31T23:30 PM
toISOString().slice(0,7) → "2026-10"  ← يعرض أكتوبر (خاطئ!)
getLocalDateString()     → "2026-11"  ← نوفمبر (صحيح)
```

#### الخطوات التنفيذية
1. تعيين `TZ=Africa/Cairo` في بيئة Node.
2. Mock لـ `Date.now()` بقيمة `2026-11-01T01:30:00+02:00`.
3. تنفيذ `new Date().toISOString().slice(0, 7)` → يُرجع `"2026-10"` (خاطئ).
4. تنفيذ `getLocalDateString()` من api.js → يجب أن يُرجع `"2026-11-01"` (صحيح).
5. التحقق من أن `payrollMonth` و`attendanceMonthFilter` الافتراضيَّيْن يستخدمان التاريخ الصحيح.
6. اختبار بداية شهر ديسمبر: `2026-12-01T00:30 Cairo` = `2026-11-30T22:30 UTC`.

#### Bottom-line Assertion
```js
// TZ=Africa/Cairo
const mockNow = new Date('2026-11-01T01:30:00+02:00');
const cairoMonth = getLocalDateString(mockNow).slice(0, 7);
assert.strictEqual(cairoMonth, '2026-11',
  'Default month MUST use Cairo timezone, not UTC');
assert.notStrictEqual(
  new Date(mockNow).toISOString().slice(0, 7),
  cairoMonth,
  'This test confirms UTC and Cairo differ — use Cairo'
);
```

#### بيئة الاختبار
- **Node.js ≥ 18**, `TZ=Africa/Cairo` في متغيرات البيئة
- **ملف:** `tests/ts-07-cairo-timezone-month.test.js`
- **CI:** يجب تعيين `TZ=Africa/Cairo` في pipeline

---

### TS-08 — الاسترداد من الاستثناءات: catch() في saveTableCart بلا مؤقت إعادة محاولة

**الأولوية:** 🟡 Medium  
**BUG المستهدف:** BUG-07  
**Code Path:** `App.jsx:565–576`

#### الهدف
التحقق من أن مسار `.catch()` في `saveTableCart` يُضبط `retryTimerRef` بنفس طريقة مسار الفشل في `.then()`. الكود الحالي في `.catch()` يضيف للقائمة المعلقة لكن لا يضبط المؤقت.

#### المقارنة بين المسارَين
```js
// مسار .then() — يضبط retryTimerRef (صحيح):
if (res.success === false) {
  retryTimerRef.current = setTimeout(() => { ... }, 3000); // ✅
}

// مسار .catch() — لا يضبط retryTimerRef (مشكلة):
.catch((err) => {
  pendingChangedTablesRef.current.add(tableId); // يضيف للقائمة
  // ← لا retryTimerRef هنا! الحفظ يتجمد
});
```

#### الخطوات التنفيذية
1. Mock لـ `api.saveTableCart` ليرمي `new Error('Network Error')`.
2. تحديث سلة طاولة لتُشغّل الحفظ التلقائي.
3. التحقق من أن `pendingChangedTablesRef.current` يحتوي على `tableId`.
4. **الاختبار الجديد:** أن `retryTimerRef.current !== null`.
5. الانتظار 3 ثوان والتحقق من إعادة المحاولة.
6. اختبار تجاوز الحد الأقصى (3 محاولات) → إلغاء الجدولة.

#### حالة تجاوز الحد الأقصى
```
محاولة 1: catch → pendingList += tableId → retryTimer ضُبط ✓
محاولة 2: catch → pendingList += tableId → retryTimer ضُبط ✓
محاولة 3: catch → pendingList += tableId → retryTimer ضُبط ✓
محاولة 4: يجب إلغاء الجدولة (count > 3) ✗
```

#### Bottom-line Assertion
```js
// بعد catch():
assert.notStrictEqual(retryTimerRef.current, null,
  'catch() path MUST set retryTimerRef — saves cannot silently freeze');

// بعد 3 محاولات فاشلة:
assert.strictEqual(saveRetryCountRef.current[tableId], undefined,
  'After 3 failures, retry counter must be cleared — no infinite loop');
```

#### بيئة الاختبار
- **React Testing Library + Vitest** أو Jest
- **ملف:** `tests/ts-08-save-cart-catch-retry.test.js`

---

## 🗂️ ملخص الأولويات

| الرتبة | المعرّف | العنوان | الأولوية | السبب |
|--------|---------|---------|---------|-------|
| 1 | TS-01 | رفض المطابقة الجزئية للكلمة | 🔴 High | ثغرة أمنية مباشرة — قابلة للاستغلال فورًا |
| 2 | TS-02 | أكواد الطوارئ الثابتة | 🔴 High | باب خلفي (backdoor) ثابت في الكود |
| 3 | TS-03 | حذف الطابور قبل تأكيد السيرفر | 🔴 High | فقدان بيانات تجارية بشكل صامت |
| 4 | TS-05 | تعارض مفاتيح سلات الطاولات | 🔴 High | نسختان متعارضتان — بيانات طاولات قابلة للضياع |
| 5 | TS-04 | Hydration يكتب فوق بيانات أحدث | 🟠 Medium-High | تأثير مضاعف مع BUG-03 |
| 6 | TS-06 | تقرير split payment ناقص | 🟠 Medium-High | بيانات مالية خاطئة — تأثير على التسوية |
| 7 | TS-07 | توقيت UTC بدل القاهرة | 🟠 Medium-High | تقارير/رواتب بشهر خاطئ عند منتصف الليل |
| 8 | TS-08 | catch() بلا مؤقت إعادة محاولة | 🟡 Medium | الحفظ يتجمد صامتًا عند أخطاء الشبكة |

---

## ⚡ Bottom-line Assertions (المرجع السريع)

```js
// TS-01: التحقق من كلمة المرور يجب أن يكون تامًا
assert(u.password === cleanPass,
  'SECURITY: Must use === not includes()');

// TS-02: لا أكواد طوارئ ثابتة
assert(!['9999','1234','admin','manager123'].includes(emergencyPin),
  'SECURITY: Fixed emergency PINs are a backdoor');

// TS-03: الطابور لا يُفرَّغ إلا عند OK
assert(queueStillHasData_afterNetworkError,
  'SYNC: Do NOT delete from queue before server confirms OK');

// TS-04: Hydration يحترم الـ timestamps
assert(localTs > serverTs ? localDataPreserved : serverDataApplied,
  'SYNC: Newer version always wins during hydration');

// TS-05: مفتاح واحد موحد للسلة
assert.strictEqual(cartKeys.length, 1,
  'STORAGE: Exactly ONE unified key for table carts');

// TS-06: split payment محسوب بشكل كامل
assert.strictEqual(cash + card + wallet, total_sales,
  'FINANCE: Split payment amounts must be included in category totals');

// TS-07: توقيت القاهرة لا UTC
assert.strictEqual(defaultMonth, cairoLocalMonth,
  'TIMEZONE: Use Cairo time, not UTC for month defaults');

// TS-08: catch() يضبط مؤقت المحاولة
assert.notStrictEqual(retryTimerRef.current, null,
  'RETRY: catch() path must always set retryTimerRef');
```

---

## 🔧 بنية ملفات الاختبار المقترحة

```
tests/
├── ts-01-password-partial-match.test.js       ← BUG-01: includes() vulnerability
├── ts-02-static-emergency-pins.test.js        ← BUG-02: 9999/1234/admin backdoors
├── ts-03-sync-queue-safety.test.js            ← BUG-03: queue deletion before ACK
├── ts-04-hydration-timestamp-conflict.test.js ← BUG-03: older server overwrites local
├── ts-05-table-cart-key-conflict.test.js      ← BUG-04: dual key storage conflict
├── ts-06-split-payment-report.test.js         ← BUG-05: split amounts in reports
├── ts-07-cairo-timezone-month.test.js         ← BUG-06: UTC vs Cairo time
└── ts-08-save-cart-catch-retry.test.js        ← BUG-07: catch() missing retry timer
```

---

## ✅ قالب نتائج التشغيل (Test Run Log)

```markdown
## نتائج تشغيل الاختبار — [التاريخ]

| المعرّف | اسم الاختبار | البيئة | النتيجة | Bug ID | ملاحظات |
|---------|-------------|--------|---------|--------|---------|
| TS-01 | رفض المطابقة الجزئية | Node 18 / mockApi | 🔴 FAIL | BUG-01 | includes() يقبل "manager" من "manager123" |
| TS-02 | أكواد الطوارئ الثابتة | Node 18 / mockApi | 🔴 FAIL | BUG-02 | '9999' يُرجع success=true |
| TS-03 | أمان طابور المزامنة | Node 18 + fetch mock | 🔴 FAIL | BUG-03 | يُفرَّغ الطابور قبل تأكيد السيرفر |
| TS-04 | Hydration والـ timestamps | jsdom + fetch mock | 🟡 BLOCKED | BUG-03 | يحتاج mock لـ fetch |
| TS-05 | تعارض مفاتيح السلة | jsdom localStorage | 🔴 FAIL | BUG-04 | مفتاحان مختلفان موجودان |
| TS-06 | تقرير split payment | Node 18 / mockApi | 🔴 FAIL | BUG-05 | cash_sales ناقص 80 بسبب split |
| TS-07 | توقيت القاهرة | Node 18 TZ=Africa/Cairo | 🔴 FAIL | BUG-06 | toISOString() يعيد شهر UTC |
| TS-08 | catch() + retry timer | Vitest + React | 🟠 PARTIAL | BUG-07 | retryTimerRef غير مضبوط في catch |

**ملاحظة:** جميع المشاكل المذكورة لا تزال موجودة في الكود (تحقق: 14 أكتوبر 2026).
```

---

## 📌 إعداد CI/CD

```yaml
# .github/workflows/test-security-sync.yml
- name: Run Security Tests
  run: |
    node --test tests/ts-01-password-partial-match.test.js
    node --test tests/ts-02-static-emergency-pins.test.js

- name: Run Sync Safety Tests
  run: |
    node --test tests/ts-03-sync-queue-safety.test.js
    node --test tests/ts-04-hydration-timestamp-conflict.test.js

- name: Run Storage & Finance Tests
  run: |
    node --test tests/ts-05-table-cart-key-conflict.test.js
    node --test tests/ts-06-split-payment-report.test.js

- name: Run Timezone Test (Cairo)
  env:
    TZ: Africa/Cairo
  run: node --test tests/ts-07-cairo-timezone-month.test.js

- name: Run Component Retry Tests
  run: npx vitest run tests/ts-08-save-cart-catch-retry.test.js
```

---

*آخر تحديث: 14 أكتوبر 2026 — الإصدار 1.0*
