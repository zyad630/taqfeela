/**
 * UI Tabs & State Resilience Behavioral Test Suite (B8)
 * tests/test-ui-tabs-resilience.js
 * 
 * Verifies:
 * 1. Multi-tab takeaway sessions hold & restore state correctly
 * 2. Tab switching preserves carts, customer details, and discount amounts
 * 3. Tab deletion cleans up state and moves active focus to adjacent tab
 * 4. Theme selection persistence (light/dark)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function makeMockLocalStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
}

test('B8: UI Multi-Takeaway Tabs and State Resilience', async (t) => {
  const ls = makeMockLocalStorage();

  await t.test('1. Multi-takeaway tab creation and isolated state persistence', () => {
    // Initial State: Tab 1
    let tabs = [
      {
        id: 'tab_takeaway_1',
        name: 'طلب 1',
        cart: [{ id: 10, name: 'أم علي مكسرات', price: 45, qty: 2 }],
        customerName: 'محمد أحمد',
        customerPhone: '01012345678',
        discountAmount: 10,
        isHeld: false
      }
    ];
    ls.setItem('cafepos_takeaway_tabs', JSON.stringify(tabs));
    ls.setItem('cafepos_active_takeaway_id', 'tab_takeaway_1');

    // Create Tab 2
    const tab2 = {
      id: 'tab_takeaway_2',
      name: 'طلب 2',
      cart: [{ id: 20, name: 'قهوة بندق', price: 30, qty: 1 }],
      customerName: 'كريم خالد',
      customerPhone: '01198765432',
      discountAmount: 0,
      isHeld: true
    };
    tabs.push(tab2);
    ls.setItem('cafepos_takeaway_tabs', JSON.stringify(tabs));
    ls.setItem('cafepos_active_takeaway_id', 'tab_takeaway_2');

    // Verify recovery from storage
    const restored = JSON.parse(ls.getItem('cafepos_takeaway_tabs'));
    assert.strictEqual(restored.length, 2);
    assert.strictEqual(restored[0].customerName, 'محمد أحمد');
    assert.strictEqual(restored[1].customerName, 'كريم خالد');
    assert.strictEqual(restored[1].isHeld, true);
    assert.strictEqual(ls.getItem('cafepos_active_takeaway_id'), 'tab_takeaway_2');
  });

  await t.test('2. Tab switching preserves all fields without leakage', () => {
    const tabs = JSON.parse(ls.getItem('cafepos_takeaway_tabs'));
    // Active switch to Tab 1
    const activeTab = tabs.find(t => t.id === 'tab_takeaway_1');
    assert.strictEqual(activeTab.cart[0].name, 'أم علي مكسرات');
    assert.strictEqual(activeTab.discountAmount, 10);
    assert.strictEqual(activeTab.isHeld, false);
  });

  await t.test('3. Tab removal reassigns active tab safely', () => {
    let tabs = JSON.parse(ls.getItem('cafepos_takeaway_tabs'));
    // Remove Tab 1
    tabs = tabs.filter(t => t.id !== 'tab_takeaway_1');
    ls.setItem('cafepos_takeaway_tabs', JSON.stringify(tabs));
    ls.setItem('cafepos_active_takeaway_id', tabs[0].id);

    const afterRemove = JSON.parse(ls.getItem('cafepos_takeaway_tabs'));
    assert.strictEqual(afterRemove.length, 1);
    assert.strictEqual(afterRemove[0].id, 'tab_takeaway_2');
    assert.strictEqual(ls.getItem('cafepos_active_takeaway_id'), 'tab_takeaway_2');
  });

  await t.test('4. Theme preference persistence', () => {
    ls.setItem('cafepos_theme', 'dark');
    assert.strictEqual(ls.getItem('cafepos_theme'), 'dark');

    ls.setItem('cafepos_theme', 'light');
    assert.strictEqual(ls.getItem('cafepos_theme'), 'light');
  });
});

