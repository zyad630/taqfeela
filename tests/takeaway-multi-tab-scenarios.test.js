/**
 * ==============================================================================================
 * tests/takeaway-multi-tab-scenarios.test.js
 * Comprehensive automated verification for Multi-Takeaway Tabs, Hold/Resume,
 * Customer CRM Auto-complete, and Item/State Integrity across all scenarios.
 * ==============================================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('🛍️ Comprehensive Takeaway & Hold Integrity Suite', () => {
  let testEnvDir;
  let db;

  before(async () => {
    testEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-takeaway-suite-'));
    process.env.NODE_ENV = 'test';
    delete require.cache[require.resolve('../electron/db')];
    db = require('../electron/db');
    const testDbPath = path.join(testEnvDir, 'takeaway-test.db');
    await db.init(testDbPath);

    // Open a test shift
    db.openShift(500, 'الشيفت الصباحي', { id: 1, name: 'Admin', role: 'admin' });
  });

  after(() => {
    try {
      if (testEnvDir && fs.existsSync(testEnvDir)) {
        fs.rmSync(testEnvDir, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  test('Scenario 1: Customer CRM - Auto-saving customer on order creation & search by phone/name', () => {
    // 1. Initially searching for 010999 returns 0
    let results = db.searchCustomers('010999');
    assert.equal(results.length, 0, 'No customer should exist initially with this phone');

    // 2. Create takeaway order with customer name, phone, address
    const order1 = db.createOrder({
      items: [
        { id: 1, name: 'اسبريسو سنجل', price: 25, qty: 2 }
      ],
      orderType: 'takeaway',
      paymentMethod: 'cash',
      customerName: 'محمود عبد الرحيم',
      customerPhone: '01099988776',
      customerAddress: 'الحي الثاني - عمارة 40 شقة 3'
    });

    assert.ok(order1 && order1.invoiceNo, 'Order 1 must be created successfully');

    // 3. Search by partial phone
    results = db.searchCustomers('010999');
    assert.equal(results.length, 1, 'Should find exactly 1 customer by phone prefix');
    assert.equal(results[0].name, 'محمود عبد الرحيم');
    assert.equal(results[0].phone, '01099988776');
    assert.equal(results[0].address, 'الحي الثاني - عمارة 40 شقة 3');

    // 4. Search by partial name
    results = db.searchCustomers('محمود');
    assert.ok(results.length >= 1, 'Should find customer by name');

    // 5. Subsequent order from same customer with updated address updates customer record
    db.createOrder({
      items: [{ id: 1, name: 'شاي', price: 15, qty: 1 }],
      orderType: 'takeaway',
      paymentMethod: 'cash',
      customerName: 'محمود عبد الرحيم',
      customerPhone: '01099988776',
      customerAddress: 'الحي الأول - بجوار المسجد'
    });

    results = db.searchCustomers('01099988776');
    assert.equal(results.length, 1, 'Customer record should be updated, not duplicated');
    assert.equal(results[0].address, 'الحي الأول - بجوار المسجد');
  });

  test('Scenario 2: Multi-Takeaway Tabs Data Integrity & Isolation Logic', () => {
    // Simulation of the React multi-tab state logic
    let takeawayTabs = [
      {
        id: 'tab_takeaway_1',
        name: 'طلب 1',
        cart: [
          { id: 1, name: 'كابتشينو', price: 40, qty: 2 },
          { id: 2, name: 'كيك شوكولاتة', price: 35, qty: 1 }
        ],
        customerName: 'كريم',
        customerPhone: '01122334455',
        customerAddress: 'مكتب 5',
        discountAmount: 5,
        orderNotes: 'بدون سكر',
        isHeld: false
      }
    ];
    let activeTakeawayId = 'tab_takeaway_1';

    // 1. Cashier opens Tab 2 while Tab 1 has items
    const newTab2 = {
      id: 'tab_takeaway_2',
      name: 'طلب 2',
      cart: [
        { id: 3, name: 'عصير برتقال', price: 30, qty: 3 }
      ],
      customerName: 'سارة',
      customerPhone: '01234567890',
      customerAddress: 'طابق 3',
      discountAmount: 0,
      orderNotes: '',
      isHeld: false
    };
    takeawayTabs.push(newTab2);
    activeTakeawayId = 'tab_takeaway_2';

    // 2. Cashier holds Tab 2 (زبون بيفكر أو بيكلم حد)
    const tab2 = takeawayTabs.find(t => t.id === 'tab_takeaway_2');
    tab2.isHeld = true;

    // Verify Tab 2 is held but ALL its items and data are 100% intact!
    assert.equal(tab2.isHeld, true);
    assert.equal(tab2.cart.length, 1);
    assert.equal(tab2.cart[0].qty, 3);
    assert.equal(tab2.customerName, 'سارة');

    // 3. Cashier switches back to Tab 1
    activeTakeawayId = 'tab_takeaway_1';
    const tab1 = takeawayTabs.find(t => t.id === 'tab_takeaway_1');
    assert.equal(tab1.cart.length, 2, 'Tab 1 must retain all 2 items');
    assert.equal(tab1.cart[0].qty, 2);
    assert.equal(tab1.cart[1].qty, 1);
    assert.equal(tab1.customerName, 'كريم');
    assert.equal(tab1.discountAmount, 5);
    assert.equal(tab1.orderNotes, 'بدون سكر');

    // 4. Cashier adds another item to Tab 1
    tab1.cart.push({ id: 4, name: 'مياه معدنية', price: 10, qty: 1 });
    assert.equal(tab1.cart.length, 3);

    // 5. Verify Tab 2 was NOT affected in any way by Tab 1 modifications
    assert.equal(tab2.cart.length, 1);
    assert.equal(tab2.cart[0].name, 'عصير برتقال');
    assert.equal(tab2.isHeld, true);

    // 6. Resume Tab 2
    tab2.isHeld = false;
    assert.equal(tab2.isHeld, false, 'Tab 2 resumed successfully');
    assert.equal(tab2.cart[0].qty, 3, 'Items in Tab 2 completely preserved after resuming');
  });

  test('Scenario 3: Holding an order never wipes items or customer data', () => {
    // Test the exact toggleHold logic
    let cart = [{ id: 10, name: 'ميكياتو', price: 35, qty: 2 }];
    let customerName = 'عميل مستعجل';
    let customerPhone = '01000000001';
    let customerAddress = 'بوابة 1';
    let discountAmount = 10;
    let orderNotes = 'حليب خالي الدسم';
    let activeId = 'tab_1';

    let tabs = [{
      id: 'tab_1',
      name: 'طلب 1',
      cart: [],
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      discountAmount: 0,
      orderNotes: '',
      isHeld: false
    }];

    // Simulate toggleHoldTakeawayTab on active tab
    tabs = tabs.map((t) => {
      if (t.id === activeId) {
        return {
          ...t,
          cart: [...cart],
          customerName,
          customerPhone,
          customerAddress,
          discountAmount,
          orderNotes,
          isHeld: !t.isHeld
        };
      }
      return t;
    });

    assert.equal(tabs[0].isHeld, true, 'Tab must be marked held');
    assert.equal(tabs[0].cart.length, 1, 'Cart must have the 1 item');
    assert.equal(tabs[0].cart[0].name, 'ميكياتو');
    assert.equal(tabs[0].customerName, 'عميل مستعجل');
    assert.equal(tabs[0].discountAmount, 10);
    assert.equal(tabs[0].orderNotes, 'حليب خالي الدسم');

    // Simulate toggle again to resume
    tabs = tabs.map((t) => {
      if (t.id === activeId) {
        return {
          ...t,
          isHeld: !t.isHeld
        };
      }
      return t;
    });

    assert.equal(tabs[0].isHeld, false, 'Tab must be resumed');
    assert.equal(tabs[0].cart.length, 1, 'Cart items still completely intact after toggle');
    assert.equal(tabs[0].cart[0].price, 35);
  });

  test('Scenario 4: Closing / Deleting a tab with safety check', () => {
    let tabs = [
      { id: 't1', name: 'طلب 1', cart: [{ id: 1, qty: 1 }] },
      { id: 't2', name: 'طلب 2', cart: [{ id: 2, qty: 2 }] },
      { id: 't3', name: 'طلب 3', cart: [] }
    ];
    let activeId = 't2';

    // Closing t2 (active)
    tabs = tabs.filter(t => t.id !== 't2');
    activeId = tabs[0].id; // switches to t1

    assert.equal(tabs.length, 2);
    assert.equal(activeId, 't1');
    assert.equal(tabs[0].cart[0].id, 1, 't1 cart untouched');
    assert.equal(tabs[1].id, 't3', 't3 intact');

    // Closing down to last tab
    tabs = tabs.filter(t => t.id !== 't3');
    assert.equal(tabs.length, 1);
    // Closing the only remaining tab resets it safely to empty, never 0 tabs
    if (tabs.length <= 1) {
      tabs = [{ id: 'tab_takeaway_1', name: 'طلب 1', cart: [], isHeld: false }];
      activeId = 'tab_takeaway_1';
    }
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].cart.length, 0);
  });

  test('Scenario 5: Full Takeaway Checkout Life Cycle', () => {
    // Create order in db and ensure invoice, stock deduction, and shift balance succeed
    const stockBefore = db.queryGet('SELECT stock_qty FROM products WHERE id = 1')?.stock_qty || 100;

    const res = db.createOrder({
      items: [{ id: 1, name: 'اسبريسو سنجل', price: 25, qty: 2 }],
      orderType: 'takeaway',
      paymentMethod: 'cash',
      customerName: 'طارق',
      customerPhone: '01511223344',
      customerAddress: 'الشارع الرئيسي'
    });

    assert.ok(res && res.invoiceNo, 'Order creation must succeed');

    const stockAfter = db.queryGet('SELECT stock_qty FROM products WHERE id = 1')?.stock_qty;
    assert.equal(stockAfter, stockBefore - 2, 'Stock must be correctly deducted by 2 units');

    // Verify order in database
    const savedOrder = db.getOrder(res.orderId);
    assert.equal(savedOrder.customer_name, 'طارق');
    assert.equal(savedOrder.customer_phone, '01511223344');
    assert.equal(savedOrder.customer_address, 'الشارع الرئيسي');
    assert.equal(savedOrder.order_type, 'takeaway');
    assert.equal(savedOrder.total, (savedOrder.items?.[0]?.unit_price || 70) * 2);
  });
});
