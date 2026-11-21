const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  console.log('=== TEST ITEM 9: Expanded Invariants (Refund, Merge, Split, Post-Close Cancel, Price Modification) ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-item9-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  let passed = 0;
  let failed = 0;

  try {
    const db = require('../electron/db');
    await db.init(testDbPath);
    console.log('[Test 9] DB initialized.');

    db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
    const adminUser = db.queryGet('SELECT id, name, role FROM users WHERE role = "admin" LIMIT 1');

    const prod1 = db.saveProduct({ name: 'كابتشينو', price: 30, category_id: 1, stock_qty: 100 });
    const prod2 = db.saveProduct({ name: 'كيك شوكولاتة', price: 40, category_id: 1, stock_qty: 50 });

    const table1 = db.saveTable({ number: 'T1', name: 'طاولة 1', capacity: 4, hall: 'أرضي' });
    const table2 = db.saveTable({ number: 'T2', name: 'طاولة 2', capacity: 4, hall: 'أرضي' });
    const table3 = db.saveTable({ number: 'T3', name: 'طاولة 3', capacity: 4, hall: 'أرضي' });

    // Open initial shift
    const shift1 = db.openShift(500, 'افتتاح وردية 1', adminUser, 'الشيفت الصباحي');

    // -------------------------------------------------------------
    // Invariant 1: Refund / Cancellation Invariants
    // -------------------------------------------------------------
    console.log('--- Invariant 1: Order Cancellation & Refund Invariants ---');
    const initialStock = db.queryGet('SELECT stock_qty FROM products WHERE id = ?', [prod1.id]).stock_qty;
    const order1 = db.createOrder({
      items: [{ id: prod1.id, name: prod1.name, price: 30, qty: 2 }],
      total: 60,
      subtotal: 60,
      paymentMethod: 'cash',
      amountPaid: 60,
      shiftId: shift1.id,
      user: adminUser
    });

    const stockAfterOrder = db.queryGet('SELECT stock_qty FROM products WHERE id = ?', [prod1.id]).stock_qty;
    if (stockAfterOrder !== initialStock - 2) {
      throw new Error(`Stock deduction failed: expected ${initialStock - 2}, got ${stockAfterOrder}`);
    }

    // Cancel order
    const cancelRes = db.cancelOrder(order1.id, 'طلب العميل المغادرة', adminUser, 'cash', true);
    if (!cancelRes.success) {
      throw new Error('cancelOrder failed: ' + cancelRes.error);
    }

    // Check invariants:
    // a. Stock restored exactly
    const stockAfterCancel = db.queryGet('SELECT stock_qty FROM products WHERE id = ?', [prod1.id]).stock_qty;
    // b. Refund entry created in order_refunds with matching amount
    const refundRow = db.queryGet('SELECT * FROM order_refunds WHERE order_id = ?', [order1.id]);
    // c. Order status is cancelled
    const updatedOrder = db.getOrder(order1.id);

    if (stockAfterCancel === initialStock && refundRow && Number(refundRow.refund_amount) === 60 && updatedOrder.status === 'cancelled') {
      console.log('✅ PASS: Invariant 1: Order cancellation properly restored stock, logged refund, and marked status cancelled.');
      passed++;
    } else {
      console.log('❌ FAIL: Invariant 1 violated:', { stockAfterCancel, refundRow, status: updatedOrder?.status });
      failed++;
    }

    // -------------------------------------------------------------
    // Invariant 2: Table Merge (transferTable) Cart Value Conservation
    // -------------------------------------------------------------
    console.log('\n--- Invariant 2: Table Merge Value Conservation ---');
    // Put items on Table 1: 2 * prod1 (30 EGP) = 60 EGP
    db.saveTableCart(table1.id, {
      cart: [{ id: prod1.id, name: prod1.name, price: 30, qty: 2 }],
      _rev: 0
    });
    // Put items on Table 2: 1 * prod2 (40 EGP) = 40 EGP
    db.saveTableCart(table2.id, {
      cart: [{ id: prod2.id, name: prod2.name, price: 40, qty: 1 }],
      _rev: 0
    });

    const beforeTotalT1 = 60;
    const beforeTotalT2 = 40;
    const expectedMergedTotal = beforeTotalT1 + beforeTotalT2; // 100 EGP

    // Merge Table 1 into Table 2
    const mergeRes = db.transferTable({ fromTableId: table1.id, toTableId: table2.id });
    if (!mergeRes.success) throw new Error('transferTable failed: ' + mergeRes.error);

    const cartsAfterMerge = db.getTableCarts();
    const t1Cart = cartsAfterMerge[table1.id];
    const t2Cart = cartsAfterMerge[table2.id];

    const t2Total = (t2Cart?.cart || []).reduce((sum, it) => sum + (it.price * it.qty), 0);
    const t1IsEmpty = !t1Cart || !t1Cart.cart || t1Cart.cart.length === 0;
    const t1TableStatus = db.queryGet('SELECT status FROM tables WHERE id = ?', [table1.id]).status;

    if (t2Total === expectedMergedTotal && t1IsEmpty && t1TableStatus === 'available') {
      console.log(`✅ PASS: Invariant 2: Merged table cart total conserved exactly (${t2Total} EGP), source table reset to available.`);
      passed++;
    } else {
      console.log('❌ FAIL: Invariant 2 violated:', { t2Total, expectedMergedTotal, t1IsEmpty, t1TableStatus });
      failed++;
    }

    // -------------------------------------------------------------
    // Invariant 3: Table Item Split (transferTableItem) Conservation
    // -------------------------------------------------------------
    console.log('\n--- Invariant 3: Table Item Split Conservation ---');
    // Table 2 currently has: 2 * prod1 (60 EGP) + 1 * prod2 (40 EGP) = 100 EGP
    // Split: move 1 * prod1 (30 EGP) to Table 3
    const splitRes = db.transferTableItem({ fromTableId: table2.id, toTableId: table3.id, itemId: prod1.id, qty: 1 });
    if (!splitRes.success) throw new Error('transferTableItem failed: ' + splitRes.error);

    const cartsAfterSplit = db.getTableCarts();
    const t2CartAfter = cartsAfterSplit[table2.id];
    const t3CartAfter = cartsAfterSplit[table3.id];

    const t2TotalAfter = (t2CartAfter?.cart || []).reduce((sum, it) => sum + (it.price * it.qty), 0);
    const t3TotalAfter = (t3CartAfter?.cart || []).reduce((sum, it) => sum + (it.price * it.qty), 0);
    const totalAcrossTables = t2TotalAfter + t3TotalAfter;

    console.log(`[Test 9] Split results: Table 2 = ${t2TotalAfter} EGP, Table 3 = ${t3TotalAfter} EGP, Sum = ${totalAcrossTables} EGP`);

    if (t2TotalAfter === 70 && t3TotalAfter === 30 && totalAcrossTables === 100) {
      console.log('✅ PASS: Invariant 3: Item split conserved total cart value across tables exactly (70 + 30 = 100 EGP).');
      passed++;
    } else {
      console.log('❌ FAIL: Invariant 3 violated:', { t2TotalAfter, t3TotalAfter, totalAcrossTables });
      failed++;
    }

    // Clear tables
    db.saveTableCart(table2.id, { cart: [] });
    db.saveTableCart(table3.id, { cart: [] });

    // -------------------------------------------------------------
    // Invariant 4: Cancellation After Shift Closing (Snapshot Immutability)
    // -------------------------------------------------------------
    console.log('\n--- Invariant 4: Post-Close Cancellation & Snapshot Immutability ---');
    // Create an order in Shift 1: 1 * prod1 (30 EGP)
    const orderToCancelLater = db.createOrder({
      items: [{ id: prod1.id, name: prod1.name, price: 30, qty: 1 }],
      total: 30,
      subtotal: 30,
      paymentMethod: 'cash',
      amountPaid: 30,
      shiftId: shift1.id,
      user: adminUser
    });

    // Close Shift 1
    const s1Comp = db.computeShiftCash(shift1.id);
    db.closeShift(shift1.id, s1Comp.expected_cash, 'إغلاق شيفت 1', adminUser);
    const shift1Snapshot = db.queryGet('SELECT closing_cash, actual_cash, cash_difference FROM shifts WHERE id = ?', [shift1.id]);
    console.log('[Test 9] Shift 1 Snapshot at close:', shift1Snapshot);

    // Now open Shift 2
    const shift2 = db.openShift(400, 'افتتاح وردية 2', adminUser, 'الشيفت المسائي');

    // Admin cancels the order belonging to closed Shift 1
    const postCloseCancel = db.cancelOrder(orderToCancelLater.id, 'إلغاء بأثر رجعي لطلب في وردية مغلقة', adminUser, 'cash', true);
    if (!postCloseCancel.success) {
      throw new Error('postCloseCancel failed: ' + postCloseCancel.error);
    }

    // Invariant: Shift 1's closed snapshot MUST NOT CHANGE
    const shift1After = db.queryGet('SELECT closing_cash, actual_cash, cash_difference FROM shifts WHERE id = ?', [shift1.id]);
    const snapshotPreserved = (
      shift1After.closing_cash === shift1Snapshot.closing_cash &&
      shift1After.actual_cash === shift1Snapshot.actual_cash &&
      shift1After.cash_difference === shift1Snapshot.cash_difference
    );

    // Invariant: Refund is attributed to current active shift (Shift 2) drawer
    const refundInShift2 = db.queryGet('SELECT * FROM order_refunds WHERE order_id = ?', [orderToCancelLater.id]);
    const refundAttributedToActiveShift = refundInShift2 && refundInShift2.shift_id === shift2.id;

    if (snapshotPreserved && refundAttributedToActiveShift) {
      console.log('✅ PASS: Invariant 4: Historical closed shift snapshot is 100% immutable; cash refund correctly debited from current active shift drawer.');
      passed++;
    } else {
      console.log('❌ FAIL: Invariant 4 violated:', { snapshotPreserved, refundInShift2, shift1After });
      failed++;
    }

    // -------------------------------------------------------------
    // Invariant 5: Historical Receipt Price Immutability After Price Change
    // -------------------------------------------------------------
    console.log('\n--- Invariant 5: Historical Receipt Price Immutability ---');
    // Product 1 current price is 30 EGP
    const historicalOrder = db.createOrder({
      items: [{ id: prod1.id, name: prod1.name, price: 30, qty: 3 }],
      total: 90,
      subtotal: 90,
      paymentMethod: 'cash',
      amountPaid: 90,
      shiftId: shift2.id,
      user: adminUser
    });

    console.log(`[Test 9] Created order #${historicalOrder.id} with unit price 30 EGP (total: 90 EGP)`);

    // Later, manager increases Product 1 price from 30 EGP to 85 EGP!
    db.saveProduct({ id: prod1.id, name: prod1.name, price: 85, category_id: 1, stock_qty: 100 });
    const currentProdPrice = db.queryGet('SELECT price FROM products WHERE id = ?', [prod1.id]).price;
    console.log(`[Test 9] Product 1 price updated in menu to: ${currentProdPrice} EGP`);

    // Re-fetch historical order
    const fetchedHistorical = db.getOrder(historicalOrder.id);
    const orderItems = fetchedHistorical.items || [];
    const itemInOrder = orderItems.find(it => Number(it.product_id) === Number(prod1.id));

    console.log(`[Test 9] Historical order #${historicalOrder.id} item unit price: ${itemInOrder?.unit_price} (expected 30), total: ${fetchedHistorical.total} (expected 90)`);

    if (itemInOrder && Number(itemInOrder.unit_price) === 30 && Number(fetchedHistorical.total) === 90) {
      console.log('✅ PASS: Invariant 5: Historical receipt price remained 30 EGP despite subsequent menu price increase to 85 EGP.');
      passed++;
    } else {
      console.log('❌ FAIL: Invariant 5 violated: Historical order prices retroactively changed!', itemInOrder);
      failed++;
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nItem 9 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();

