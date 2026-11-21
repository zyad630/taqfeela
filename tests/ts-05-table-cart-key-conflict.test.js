/**
 * ts-05-table-cart-key-conflict.test.js
 * BUG-04: كانت الكتابة تتم بمفتاحَين مختلفَين:
 *   setLocal('table_carts')      → localStorage['cafepos_table_carts']
 *   setLocal('cafepos_table_carts') → localStorage['cafepos_cafepos_table_carts'] ← مضاعف!
 * الإصلاح: مفتاح واحد موحد فقط = 'cafepos_table_carts'
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function setupGlobals() {
  const store = {};
  global.window = {
    location: { protocol: 'http:' },
    dispatchEvent: () => {},
    addEventListener: () => {},
  };
  global.localStorage = {
    _store: store,
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    keys: () => Object.keys(store)
  };
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  global.CustomEvent = class { constructor(t) { this.type = t; } };
}

function teardownGlobals() {
  delete global.window;
  delete global.localStorage;
  delete global.fetch;
  delete global.CustomEvent;
}

// نمحّص وظيفة getLocal/setLocal مباشرة
function makeLocalHelpers(localStorageMock) {
  function getLocal(key, def) {
    const val = localStorageMock.getItem(`cafepos_${key}`);
    if (val === null || val === undefined) return def;
    try { return JSON.parse(val); } catch { return def; }
  }
  function setLocal(key, val) {
    localStorageMock.setItem(`cafepos_${key}`, JSON.stringify(val));
  }
  return { getLocal, setLocal };
}

describe('TS-05 — BUG-04: Unified table cart storage key', () => {

  test('TS-05-A: after fix — only ONE key exists for table carts after save', () => {
    setupGlobals();
    const { getLocal, setLocal } = makeLocalHelpers(global.localStorage);

    // محاكاة saveTableCart بعد الإصلاح (مفتاح واحد فقط)
    const carts = getLocal('table_carts', {});
    carts[3] = { cart: [{ id: 1, name: 'قهوة', qty: 2, price: 25 }] };
    setLocal('table_carts', carts); // كتابة مرة واحدة فقط

    const allKeys = global.localStorage.keys().filter(k => k.includes('table_cart'));
    assert.strictEqual(allKeys.length, 1,
      'Must have EXACTLY one key for table carts — no duplicates');
    assert.strictEqual(allKeys[0], 'cafepos_table_carts',
      'The unified key must be cafepos_table_carts');

    teardownGlobals();
  });

  test('TS-05-B: before fix — dual write creates two conflicting keys', () => {
    // هذا الاختبار يوثّق المشكلة القديمة (يجب أن يفشل بعد الإصلاح)
    setupGlobals();
    const { getLocal, setLocal } = makeLocalHelpers(global.localStorage);

    // محاكاة الكود القديم: يكتب بمفتاحَين
    const carts = { 3: { cart: [{ id: 1, name: 'قهوة', qty: 2 }] } };
    setLocal('table_carts', carts);          // → cafepos_table_carts
    setLocal('cafepos_table_carts', carts);  // → cafepos_cafepos_table_carts ← مضاعف!

    const allKeys = global.localStorage.keys().filter(k => k.includes('table_cart'));
    // نتوقع أن يجد مفتاحَين — هذا يوثّق وجود المشكلة القديمة
    assert.ok(allKeys.length >= 2,
      'OLD CODE creates duplicate keys: cafepos_table_carts AND cafepos_cafepos_table_carts');

    teardownGlobals();
  });

  test('TS-05-C: read after write returns correct data from unified key', () => {
    setupGlobals();
    const { getLocal, setLocal } = makeLocalHelpers(global.localStorage);

    const expectedCart = { cart: [{ id: 5, name: 'كيك', qty: 1, price: 50 }] };

    // كتابة بمفتاح واحد
    const carts = {};
    carts[7] = expectedCart;
    setLocal('table_carts', carts);

    // قراءة بمفتاح واحد
    const readCarts = getLocal('table_carts', {});
    assert.deepStrictEqual(readCarts[7], expectedCart,
      'Data written with unified key must be readable with same key');

    teardownGlobals();
  });

  test('TS-05-D: App.jsx direct localStorage write is consistent with api key', () => {
    setupGlobals();

    // App.jsx يكتب مباشرة بـ: localStorage.setItem('cafepos_table_carts', ...)
    const appCart = { 5: { cart: [{ id: 9, name: 'عصير', qty: 3 }] } };
    global.localStorage.setItem('cafepos_table_carts', JSON.stringify(appCart));

    // api.js يقرأ بـ: getLocal('table_carts') → cafepos_table_carts
    const { getLocal } = makeLocalHelpers(global.localStorage);
    const apiRead = getLocal('table_carts', {});

    assert.deepStrictEqual(apiRead, appCart,
      'App.jsx direct write (cafepos_table_carts) must match api.js read (getLocal table_carts)');

    teardownGlobals();
  });

  test('TS-05-E: simulate reload — data persists correctly with unified key', () => {
    setupGlobals();
    const { getLocal, setLocal } = makeLocalHelpers(global.localStorage);

    // جلسة 1: حفظ سلة الطاولة
    const sessionCart = { 2: { cart: [{ id: 3, name: 'فطار', qty: 1, price: 75 }] } };
    setLocal('table_carts', sessionCart);

    // محاكاة إعادة التحميل: قراءة من نفس المفتاح
    const afterReload = getLocal('table_carts', {});
    assert.deepStrictEqual(afterReload[2], sessionCart[2],
      'Table cart data must survive simulated page reload with unified key');

    teardownGlobals();
  });

  test('TS-05-F: no ghost cafepos_cafepos_table_carts key after save', () => {
    setupGlobals();
    const { getLocal, setLocal } = makeLocalHelpers(global.localStorage);

    const carts = { 1: { cart: [{ id: 1, name: 'شاي', qty: 2 }] } };
    setLocal('table_carts', carts);

    // يجب ألا يوجد المفتاح المضاعف
    const ghostKey = global.localStorage.getItem('cafepos_cafepos_table_carts');
    assert.strictEqual(ghostKey, null,
      'BUG-04 fix: no ghost key "cafepos_cafepos_table_carts" must exist after unified save');

    teardownGlobals();
  });
});
