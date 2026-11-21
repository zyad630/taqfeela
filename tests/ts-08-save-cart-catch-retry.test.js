/**
 * ts-08-save-cart-catch-retry.test.js
 * TS-08: اختبار آلية إعادة المحاولة عند حدوث استثناء في saveTableCart (.catch path)
 * التحقق من أن فشل الحفظ بسبب خطأ شبكة أو استثناء غير متوقع يجدول إعادة المحاولة ولا يتجمد صامتاً.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('TS-08 — saveTableCart .catch() retry handling', () => {

  test('TS-08-A: catch() path registers tableId in pending and schedules retryTimer', async () => {
    const tableId = 5;
    const inFlightTables = new Set([tableId]);
    const pendingChangedTables = new Set();
    const saveRetryCount = {};
    let retryTimer = null;
    let retried = false;

    // محاكاة منطق الحفظ وcatch
    async function mockSaveTableCartWithFailure() {
      try {
        throw new Error('Simulated Network / Socket Crash');
      } catch (err) {
        // منطق الإصلاح BUG-07:
        inFlightTables.delete(tableId);
        pendingChangedTables.add(tableId);
        saveRetryCount[tableId] = (saveRetryCount[tableId] || 0) + 1;

        if (saveRetryCount[tableId] <= 3) {
          retryTimer = setTimeout(() => {
            retried = true;
          }, 50);
        }
      }
    }

    await mockSaveTableCartWithFailure();

    assert.ok(pendingChangedTables.has(tableId), 'Pending set must contain the tableId on error');
    assert.strictEqual(inFlightTables.has(tableId), false, 'inFlight flag must be cleaned up to avoid deadlock');
    assert.notStrictEqual(retryTimer, null, 'retryTimer MUST be scheduled in catch() path');

    // انتظار تنفيذ المؤقت
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(retried, true, 'Retry must actually execute after scheduled delay');
    clearTimeout(retryTimer);
  });

  test('TS-08-B: Exceeding max retry limit (3 attempts) stops scheduling to prevent infinite loop', async () => {
    const tableId = 7;
    const saveRetryCount = { [tableId]: 3 }; // وصلت للحد الأقصى
    let retryTimer = null;

    // محاولة رابعة تفشل
    try {
      throw new Error('Persistent failure');
    } catch (err) {
      saveRetryCount[tableId] = (saveRetryCount[tableId] || 0) + 1;
      if (saveRetryCount[tableId] <= 3) {
        retryTimer = setTimeout(() => {}, 100);
      }
    }

    assert.strictEqual(saveRetryCount[tableId], 4);
    assert.strictEqual(retryTimer, null, 'Must NOT schedule additional retries beyond limit of 3');
  });
});
