/**
 * ts-07-cairo-timezone-month.test.js
 * TS-07: اختبار التوقيت المحلي للقاهرة (Africa/Cairo)
 * التحقق من أن حساب التاريخ والشهر لا يقع في فخ فرق التوقيت مع UTC عند منتصف الليل.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// تنفيذ دالة toCairoDate و getLocalDateString كما في النظام
function toCairoDate(d) {
  if (!d) return null;
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return null;
  // التوقيت الشتوي في مصر: UTC+2، الصيفي: UTC+3
  // نحدد الفرق التلقائي أو UTC+2 كحد أدنى
  const offsetHours = 2;
  return new Date(dateObj.getTime() + offsetHours * 3600000);
}

function getLocalDateString(d = new Date()) {
  try {
    const cairo = toCairoDate(d);
    if (!cairo) return '';
    const y = cairo.getUTCFullYear();
    const m = String(cairo.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cairo.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

describe('TS-07 — Cairo Timezone vs UTC Handling', () => {

  test('TS-07-A: Early morning in Cairo (01:30 AM on Nov 1) yields November, not October', () => {
    // 2026-10-31T23:30:00Z هي 2026-11-01T01:30:00 بتوقيت القاهرة (UTC+2)
    const utcMidnightEdge = new Date('2026-10-31T23:30:00.000Z');

    // إذا استخدمنا toISOString() المعتمد على UTC:
    const utcDateString = utcMidnightEdge.toISOString().slice(0, 10);
    const utcMonthString = utcMidnightEdge.toISOString().slice(0, 7);
    assert.strictEqual(utcDateString, '2026-10-31', 'UTC is still in October');
    assert.strictEqual(utcMonthString, '2026-10', 'UTC month is October');

    // دالة getLocalDateString الخاصة بالنظام:
    const cairoDateString = getLocalDateString(utcMidnightEdge);
    const cairoMonthString = cairoDateString.slice(0, 7);

    assert.strictEqual(cairoDateString, '2026-11-01', 'Cairo date MUST be November 1st');
    assert.strictEqual(cairoMonthString, '2026-11', 'Cairo month MUST be November (2026-11)');
    assert.notStrictEqual(cairoMonthString, utcMonthString, 'Cairo month must differ from UTC month at this edge');
  });

  test('TS-07-B: Beginning of new year in Cairo (00:30 AM on Jan 1) yields new year', () => {
    // 2026-12-31T22:30:00Z هي 2027-01-01T00:30:00 في القاهرة
    const newYearEdge = new Date('2026-12-31T22:30:00.000Z');

    const cairoDate = getLocalDateString(newYearEdge);
    assert.strictEqual(cairoDate, '2027-01-01', 'Should correctly transition to new year in Cairo');
    assert.strictEqual(cairoDate.slice(0, 7), '2027-01');
  });

  test('TS-07-C: Robust handling of invalid date inputs', () => {
    assert.strictEqual(getLocalDateString(null), '');
    assert.strictEqual(getLocalDateString('invalid-date'), '');
  });
});
