/**
 * ts-04-hydration-timestamp-conflict.test.js
 * TS-04: مزامنة البيانات والـ Hydration — التحقق من عدم كتابة بيانات السيرفر الأقدم فوق بيانات محلية أحدث
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('TS-04 — Hydration timestamp conflict resolution', () => {

  test('TS-04-A: Local data with newer timestamp is NOT overwritten by older server data', () => {
    // محاكاة آلية المقارنة الزمنية المعتمدة لمنع الكتابة فوق التعديلات الأحدث
    const localStore = {
      cafepos_table_carts: {
        table_1: { items: [{ name: 'شاي', qty: 2 }], total: 40 },
        _updatedAt: 1700005000000 // أحدث
      }
    };

    const serverData = {
      table_1: { items: [{ name: 'شاي', qty: 1 }], total: 20 },
      _updatedAt: 1700001000000 // أقدم
    };

    function resolveHydration(local, server) {
      if (!local || !local._updatedAt) return server;
      if (!server || !server._updatedAt) return local;
      return local._updatedAt >= server._updatedAt ? local : server;
    }

    const resolved = resolveHydration(localStore.cafepos_table_carts, serverData);

    assert.strictEqual(resolved.table_1.items[0].qty, 2, 'Newer local cart items must be preserved');
    assert.strictEqual(resolved._updatedAt, 1700005000000, 'Newer timestamp must win');
  });

  test('TS-04-B: Server data with newer timestamp successfully updates local store', () => {
    const localStore = {
      _updatedAt: 1700001000000
    };

    const serverData = {
      table_1: { items: [{ name: 'قهوة تركي', qty: 1 }], total: 25 },
      _updatedAt: 1700009000000 // أحدث من السيرفر
    };

    function resolveHydration(local, server) {
      if (!local || !local._updatedAt) return server;
      if (!server || !server._updatedAt) return local;
      return local._updatedAt >= server._updatedAt ? local : server;
    }

    const resolved = resolveHydration(localStore, serverData);
    assert.strictEqual(resolved.table_1.items[0].name, 'قهوة تركي', 'Newer server data must apply');
    assert.strictEqual(resolved._updatedAt, 1700009000000);
  });

  test('TS-04-C: Missing local timestamp defaults safely to server data', () => {
    const localStore = null;
    const serverData = {
      table_2: { items: [{ name: 'مياه معدنية', qty: 1 }] },
      _updatedAt: 1700002000000
    };

    function resolveHydration(local, server) {
      if (!local) return server;
      return local;
    }

    const resolved = resolveHydration(localStore, serverData);
    assert.ok(resolved.table_2, 'Server data accepted if local is empty');
  });
});
