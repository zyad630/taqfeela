const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log('🧪 Starting Strict Takeaway vs Dine-In Table Isolation Tests...');
  const testDbDir = path.join(__dirname, 'tmp_isolation_test');
  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDbDir, { recursive: true });
  const testDbPath = path.join(testDbDir, 'test.db');

  const db = require('../electron/db.js');
  await db.init(testDbPath);

  // Setup shift and cashier
  const shiftUser = { id: 1, name: 'كاشير التجربة', role: 'cashier' };
  db.openShift(500, 'شيفت اختبار العزل التام', shiftUser, 'morning');

  // Add sample products
  db.saveCategory({ id: 1, name: 'مشروبات ساخنة' });
  db.saveProduct({ name: 'شاي عزل', price: 15, category_id: 1, cost: 5, stock_qty: 100 });
  db.saveProduct({ name: 'قهوة عزل', price: 25, category_id: 1, cost: 10, stock_qty: 100 });

  const tea = db.queryGet("SELECT id, name, price FROM products WHERE name = 'شاي عزل'");
  const coffee = db.queryGet("SELECT id, name, price FROM products WHERE name = 'قهوة عزل'");

  // Get tables
  const tables = db.listTables();
  assert(tables.length >= 2, 'Must have at least 2 tables for isolation test');
  const table1 = tables[0];
  const table2 = tables[1];

  console.log(`✓ Tables found: Table 1 (ID: ${table1.id}), Table 2 (ID: ${table2.id})`);

  // =========================================================================
  // Test 1: Occupy Table 1 with an order cart
  // =========================================================================
  console.log('\n--- Test 1: Occupy Table 1 with Dine-In Cart ---');
  const table1Cart = [
    { id: coffee.id, name: coffee.name, price: coffee.price, qty: 2, sent_qty: 2 }
  ];
  await db.saveTableCart(table1.id, {
    cart: table1Cart,
    customerName: 'زبون طاولة 1',
    discountAmount: 0,
    orderNotes: 'طلب الصالة الأصلي'
  });

  const savedT1 = db.getTableCarts()[table1.id];
  assert(savedT1 && savedT1.cart && savedT1.cart.length === 1, 'Table 1 must have its cart saved');
  assert.strictEqual(savedT1.cart[0].qty, 2, 'Table 1 must have 2 coffees');
  console.log('✓ Table 1 has 2 coffees saved in SQLite table_carts');

  // =========================================================================
  // Test 2: Create Takeaway Order and ensure Table 1 is 100% untouched
  // =========================================================================
  console.log('\n--- Test 2: Create Takeaway Order (tableId: null) ---');
  const takeawayOrder = db.createOrder({
    items: [{ id: tea.id, name: tea.name, price: tea.price, qty: 3, sent_qty: 3 }],
    paymentMethod: 'cash',
    orderType: 'takeaway',
    tableId: null,
    customerName: 'عميل تيك أواي رقم 1',
    paidAmount: 45,
    user: shiftUser,
    clientOrderId: `tkw_${Date.now()}_1`
  });

  assert(takeawayOrder && takeawayOrder.success, 'Takeaway order must succeed');
  assert.strictEqual(takeawayOrder.order_type || takeawayOrder.orderType, 'takeaway');
  console.log('✓ Takeaway order created successfully (Invoice: ' + (takeawayOrder.invoice_no || takeawayOrder.invoiceNo) + ')');

  // Verify Table 1 cart is STILL intact and NOT wiped
  const checkT1AfterTakeaway = db.getTableCarts()[table1.id];
  assert(checkT1AfterTakeaway && checkT1AfterTakeaway.cart && checkT1AfterTakeaway.cart.length === 1, 'Table 1 cart MUST NOT be deleted after takeaway order');
  assert.strictEqual(checkT1AfterTakeaway.cart[0].name, 'قهوة عزل');
  assert.strictEqual(checkT1AfterTakeaway.cart[0].qty, 2);
  console.log('✓ Table 1 cart remains strictly preserved in SQLite');

  // =========================================================================
  // Test 3: Defense-in-depth: Even if buggy client sends tableId with takeaway
  // =========================================================================
  console.log('\n--- Test 3: Defense-in-Depth against tableId pollution in takeaway ---');
  const pollutedTakeaway = db.createOrder({
    items: [{ id: tea.id, name: tea.name, price: tea.price, qty: 1 }],
    paymentMethod: 'cash',
    orderType: 'takeaway',
    tableId: table1.id, // Mistakenly passed tableId
    customerName: 'عميل تيك أواي مع طاولة خاطئة',
    paidAmount: 15,
    user: shiftUser,
    clientOrderId: `tkw_polluted_${Date.now()}`
  });

  assert(pollutedTakeaway && pollutedTakeaway.success, 'Polluted order processed');
  
  // Table 1 MUST NOT be cleared because orderType is 'takeaway', not 'dine_in'!
  const checkT1AfterPolluted = db.getTableCarts()[table1.id];
  assert(checkT1AfterPolluted && checkT1AfterPolluted.cart && checkT1AfterPolluted.cart.length === 1, 'Table 1 cart MUST NOT be cleared by a takeaway order even if tableId was erroneously passed');
  assert.strictEqual(checkT1AfterPolluted.cart[0].name, 'قهوة عزل');
  console.log('✓ Defense-in-depth: Table 1 cart survived non-dine-in order with tableId');

  // =========================================================================
  // Test 4: Checkout Table 1 Dine-In Order cleanly
  // =========================================================================
  console.log('\n--- Test 4: Checkout Dine-In Order on Table 1 ---');
  const t1Rev = checkT1AfterPolluted._rev !== undefined ? checkT1AfterPolluted._rev : checkT1AfterPolluted.rev;
  const dineInOrder = db.createOrder({
    items: checkT1AfterPolluted.cart,
    paymentMethod: 'cash',
    orderType: 'dine_in',
    tableId: table1.id,
    expectedCartRev: t1Rev,
    customerName: checkT1AfterPolluted.customerName,
    paidAmount: 50,
    user: shiftUser,
    clientOrderId: `dine_in_${Date.now()}`
  });

  assert(dineInOrder && dineInOrder.success, 'Dine-in checkout must succeed: ' + JSON.stringify(dineInOrder));
  const checkT1AfterDineIn = db.getTableCarts()[table1.id];
  assert(!checkT1AfterDineIn || !checkT1AfterDineIn.cart || checkT1AfterDineIn.cart.length === 0, 'Table 1 cart must now be cleanly cleared after its own checkout');
  console.log('✓ Table 1 cart cleanly cleared upon legitimate dine-in checkout');

  // Cleanup
  console.log('\n✅ ALL ISOLATION TESTS PASSED 100%! ZERO STATE LEAKAGE GUARANTEED.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Isolation test failed:', err);
  process.exit(1);
});
