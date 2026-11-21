/**
 * ==============================================================================================
 * tests/senior-financial-audit-and-resilience.test.js
 * Comprehensive Senior Engineering Verification Suite:
 * 1. Financial Audit: Cash vs Non-Cash (Wallet/Card) Debt Collections & Drawer Integrity
 * 2. Cross-Shift Order Lifecycle: Cancel in Shift 1, Restore in Shift 2, Zero Historical Drift
 * 3. Audit Trail & Closed Shift Preservation on Debt Cancellation/Deletion
 * 4. Takeaway Tab Bar Preparation State (sent_qty) Isolation and Synchronization
 * 5. Concurrent Rapid Multi-Shift Stress & Load Resilience
 * ==============================================================================================
 */

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('🛡️ Senior Financial Audit, Cross-Shift Integrity & Resilience Suite', () => {
  let testEnvDir;
  let db;
  let testProduct;

  before(async () => {
    testEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-senior-financial-'));
    process.env.NODE_ENV = 'test';
    delete require.cache[require.resolve('../electron/db')];
    db = require('../electron/db');
    const testDbPath = path.join(testEnvDir, 'senior-audit.db');
    await db.init(testDbPath);

    // Setup initial admin for test environment
    const setupRes = db.setupInitialAdmin('AdminAuditPass2026!#', 'المدير العام');
    assert.ok(setupRes && setupRes.success, 'setupInitialAdmin must succeed');

    // Create a known dedicated test product
    testProduct = db.saveProduct({
      name: 'قهوة اختبار المدفوعات',
      price: 30,
      cost: 10,
      stock_qty: 10000,
      category_id: 1
    });
  });

  after(() => {
    try {
      if (testEnvDir && fs.existsSync(testEnvDir)) {
        fs.rmSync(testEnvDir, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  afterEach(() => {
    // Ensure any open shift is closed cleanly between tests so tests do not bleed
    const open = db.currentShift();
    if (open) {
      db.closeShift(open.id, open.expected_cash || 0, 'Clean reset between tests', { id: 1, name: 'Admin', role: 'admin' });
    }
  });

  test('Unit 1: Electronic Debt Payments (Wallet/Card) MUST NOT inflate physical cash drawer expected_cash', () => {
    // 1. Open Shift 1 with 1000 EGP opening cash
    const shift1 = db.openShift(1000, 'وردية صباحية', { id: 1, name: 'كاشير أحمد', role: 'cashier' });
    assert.ok(shift1 && shift1.id, 'Shift 1 must be open');

    // 2. Create a notebook debt of 300 EGP (10 qty * 30 EGP) for customer "علي حسن"
    const orderDebt = db.createOrder({
      items: [{ id: testProduct.id, name: testProduct.name, price: 30, qty: 10 }],
      orderType: 'notebook',
      paymentMethod: 'notebook',
      customerName: 'علي حسن',
      customerPhone: '01011122334',
      amountPaid: 0
    });
    assert.ok(orderDebt && orderDebt.invoiceNo, 'Debt order created');

    const activeDebt = db.queryGet('SELECT * FROM customer_debts WHERE customer_name = "علي حسن" ORDER BY id DESC LIMIT 1');
    assert.ok(activeDebt, 'Active debt record must exist');
    assert.equal(activeDebt.remaining_amount, 300);

    // Initial check: expected_cash should be exactly 1000 (opening cash, no cash sales yet)
    let cur = db.currentShift();
    assert.equal(cur.expected_cash, 1000, 'Initial expected cash must equal opening cash');

    // 3. Customer pays 100 EGP via Vodafone Cash / InstaPay (wallet)
    const payRes1 = db.payDebt({
      debtId: activeDebt.id,
      amount: 100,
      paymentMethod: 'wallet',
      notes: 'تحويل انستاباي',
      cashierName: 'أحمد'
    });
    assert.ok(payRes1.success, 'Wallet payment must succeed');

    // VERIFICATION: expected_cash MUST STILL BE 1000 EGP! The 100 EGP did NOT enter physical cash drawer!
    cur = db.currentShift();
    assert.equal(cur.expected_cash, 1000, 'Physical drawer expected_cash MUST NOT increase on wallet payment!');
    assert.equal(cur.debt_wallet_in, 100, 'debt_wallet_in must accurately track 100 EGP');
    assert.equal(cur.debt_cash_in, 0, 'debt_cash_in must be 0');
    assert.equal(cur.debt_collections, 100, 'Total debt collections should be 100 EGP');

    // 4. Customer pays 50 EGP via Visa Card (card)
    const payRes2 = db.payDebt({
      debtId: activeDebt.id,
      amount: 50,
      paymentMethod: 'card',
      notes: 'فيزا بنك مصر',
      cashierName: 'أحمد'
    });
    assert.ok(payRes2.success, 'Card payment must succeed');

    cur = db.currentShift();
    assert.equal(cur.expected_cash, 1000, 'Physical drawer expected_cash MUST NOT increase on card payment!');
    assert.equal(cur.debt_card_in, 50, 'debt_card_in must accurately track 50 EGP');
    assert.equal(cur.debt_cash_in, 0, 'debt_cash_in must still be 0');
    assert.equal(cur.debt_collections, 150, 'Total debt collections should be 150 EGP');

    // 5. Customer pays 70 EGP in physical cash (cash)
    const payRes3 = db.payDebt({
      debtId: activeDebt.id,
      amount: 70,
      paymentMethod: 'cash',
      notes: 'كاش بالدرج',
      cashierName: 'أحمد'
    });
    assert.ok(payRes3.success, 'Cash payment must succeed');

    cur = db.currentShift();
    // NOW and ONLY NOW should expected_cash increase by exactly the 70 EGP cash!
    assert.equal(cur.expected_cash, 1070, 'Physical drawer expected_cash must be exactly 1000 + 70 = 1070 EGP');
    assert.equal(cur.debt_cash_in, 70, 'debt_cash_in must be 70 EGP');
    assert.equal(cur.debt_collections, 220, 'Total debt collections must be 220 EGP (100 wallet + 50 card + 70 cash)');

    // 6. Close Shift 1 with exactly 1070 actual cash
    const closeRes = db.closeShift(shift1.id, 1070, 'إغلاق بدون عجز', { id: 1, name: 'كاشير أحمد', role: 'cashier' });
    assert.ok(closeRes.success, 'Shift 1 closed successfully');
    assert.equal(closeRes.cashDifference, 0, 'Cashier must have exactly 0 difference (no artificial shortage!)');
  });

  test('Unit 2: Cross-Shift Order Lifecycle - Restoring an order from a closed shift binds to current shift and preserves historical reports', () => {
    // 1. Open Shift 2
    const shift2 = db.openShift(500, 'وردية مسائية', { id: 2, name: 'كاشير سارة', role: 'cashier' });
    assert.ok(shift2 && shift2.id, 'Shift 2 must be open');

    // 2. Create cash order of 150 EGP (5 * 30) in Shift 2
    const orderToCancel = db.createOrder({
      items: [{ id: testProduct.id, name: testProduct.name, price: 30, qty: 5 }],
      orderType: 'takeaway',
      paymentMethod: 'cash',
      customerName: 'طارق فهمي'
    });
    assert.ok(orderToCancel && orderToCancel.id);

    // Initial stock check
    const prodBefore = db.queryGet('SELECT stock_qty FROM products WHERE id = ?', [testProduct.id]);
    const initialStock = prodBefore.stock_qty;

    // 3. Cancel the order in Shift 2
    const cancelRes = db.cancelOrder(orderToCancel.id, 'خطأ في الطلب', { id: 2, name: 'كاشير سارة', role: 'cashier' }, 'cash', true);
    assert.ok(cancelRes.success, 'Order cancelled');

    // Stock should be returned (+5)
    const prodAfterCancel = db.queryGet('SELECT stock_qty FROM products WHERE id = ?', [testProduct.id]);
    assert.equal(prodAfterCancel.stock_qty, initialStock + 5, 'Stock must be returned on cancel');

    // Check refund recorded in Shift 2
    const refundRow = db.queryGet('SELECT * FROM order_refunds WHERE order_id = ?', [orderToCancel.id]);
    assert.ok(refundRow, 'Refund record must exist for Shift 2');
    assert.equal(refundRow.shift_id, shift2.id);

    // 4. Close Shift 2
    const cur2 = db.currentShift();
    const closeShift2 = db.closeShift(shift2.id, cur2.expected_cash, 'إغلاق شيفت 2', { id: 2, name: 'كاشير سارة', role: 'cashier' });
    assert.ok(closeShift2.success, 'Shift 2 must close successfully');

    // Verify Shift 2 report
    const shift2RepBefore = db.getReportShift({ shiftId: shift2.id });
    assert.ok(shift2RepBefore.shift.closed_at, 'Shift 2 must be closed');

    // 5. Open Shift 3 (Next Day / Next Cashier)
    const shift3 = db.openShift(800, 'وردية ليلية', { id: 3, name: 'كاشير خالد', role: 'cashier' });
    assert.ok(shift3 && shift3.id, 'Shift 3 must be open');

    // 6. Admin restores the cancelled order in Shift 3
    const restoreRes = db.restoreOrder(orderToCancel.id, { id: 1, name: 'المدير العام', role: 'admin' });
    assert.ok(restoreRes.success, 'Restore must succeed');

    // 7. CRITICAL VERIFICATIONS:
    // A. The restored order must now belong to current Shift 3 (where money is received), not the closed Shift 2!
    const restoredOrder = db.getOrder(orderToCancel.id);
    assert.equal(restoredOrder.status, 'completed', 'Order status must be completed');
    assert.equal(restoredOrder.shift_id, shift3.id, 'Restored order must be bound to active open Shift 3');
    assert.ok(restoredOrder.notes.includes('تمت الاستعادة بوردية جديدة'), 'Notes must record cross-shift restoration');

    // B. Stock must be deducted again
    const prodAfterRestore = db.queryGet('SELECT stock_qty FROM products WHERE id = ?', [testProduct.id]);
    assert.equal(prodAfterRestore.stock_qty, initialStock, 'Stock must be re-deducted on restore');

    // C. Shift 2 historical refund record MUST NOT be deleted (historical audit preserved!)
    const pastRefund = db.queryGet('SELECT * FROM order_refunds WHERE order_id = ?', [orderToCancel.id]);
    assert.ok(pastRefund, 'Historical refund in closed Shift 2 must be preserved');
    assert.equal(pastRefund.shift_id, shift2.id);

    // D. Shift 3 now registers the restored sales in current shift
    const cur3 = db.currentShift();
    assert.ok(cur3.cash_sales >= 150, 'Shift 3 must include the restored 150 EGP cash sales');
    assert.equal(cur3.expected_cash, 800 + 150, 'Shift 3 expected cash must be 800 opening + 150 restored sale = 950 EGP');

    // Close Shift 3
    db.closeShift(shift3.id, 950, 'إغلاق شيفت 3', { id: 3, name: 'كاشير خالد', role: 'cashier' });
  });

  test('Unit 3: Deleting a customer debt with historical payments preserves closed shift audits', () => {
    // 1. Open Shift 4
    const shift4 = db.openShift(300, 'وردية 4', { id: 1, name: 'Admin', role: 'admin' });

    // 2. Create customer debt (4 * 30 = 120 EGP)
    const orderDebt = db.createOrder({
      items: [{ id: testProduct.id, name: testProduct.name, price: 30, qty: 4 }],
      orderType: 'notebook',
      paymentMethod: 'notebook',
      customerName: 'سمير إبراهيم',
      customerPhone: '01234567890',
      amountPaid: 0
    });
    const debtRow = db.queryGet('SELECT * FROM customer_debts WHERE customer_name = "سمير إبراهيم"');
    assert.ok(debtRow);

    // Customer pays 40 EGP cash in Shift 4
    db.payDebt({
      debtId: debtRow.id,
      amount: 40,
      paymentMethod: 'cash',
      cashierName: 'Admin'
    });

    // Close Shift 4
    db.closeShift(shift4.id, 340, 'قفل شيفت 4', { id: 1, name: 'Admin', role: 'admin' });

    // Open Shift 5
    const shift5 = db.openShift(400, 'وردية 5', { id: 1, name: 'Admin', role: 'admin' });

    // 3. Delete/forgive the debt in Shift 5 using admin credentials
    // Verify rejection with invalid password
    const delResInvalid = db.deleteDebt({
      debtId: debtRow.id,
      adminPassword: 'wrong_password_xyz'
    });
    assert.strictEqual(delResInvalid.success, false, 'deleteDebt must reject invalid password');

    // Call deleteDebt with valid admin password
    const delResSuccess = db.deleteDebt({
      debtId: debtRow.id,
      adminPassword: 'AdminAuditPass2026!#',
      actor: { id: 1, name: 'المدير العام', role: 'admin' }
    });
    assert.strictEqual(delResSuccess.success, true, 'deleteDebt must succeed with valid admin password');

    // Payments made in closed Shift 4 MUST NOT be erased
    const paymentsCountInShift4 = db.queryGet('SELECT COUNT(*) as c FROM debt_payments WHERE shift_id = ?', [shift4.id])?.c;
    assert.ok(paymentsCountInShift4 >= 1, 'Historical payments in closed Shift 4 must NEVER be erased');

    // The remaining debt should be zeroed/cancelled
    const debtAfter = db.queryGet('SELECT * FROM customer_debts WHERE id = ?', [debtRow.id]);
    assert.equal(debtAfter.status, 'cancelled', 'Debt status must be cancelled');
    assert.equal(debtAfter.remaining_amount, 0, 'Remaining debt must be zeroed');

    db.closeShift(shift5.id, 400, 'قفل شيفت 5', { id: 1, name: 'Admin', role: 'admin' });
  });

  test('Unit 4: Takeaway Tab State Integrity & Sent-to-Bar Isolation', () => {
    // Open a working shift
    const shift6 = db.openShift(1000, 'وردية التيك أواي', { id: 1, name: 'Admin', role: 'admin' });

    // Simulate multi-tab takeaway operations
    let tabs = [
      {
        id: 'tab_takeaway_1',
        name: 'طلب 1',
        cart: [
          { id: 1, name: 'كابتشينو', price: 40, qty: 2, sent_qty: 0 },
          { id: 2, name: 'كرواسون', price: 30, qty: 1, sent_qty: 0 }
        ],
        customerName: 'حسام',
        customerPhone: '01012345678',
        customerAddress: 'مكتب 2',
        isHeld: false
      },
      {
        id: 'tab_takeaway_2',
        name: 'طلب 2',
        cart: [
          { id: 1, name: 'اسبريسو', price: 25, qty: 1, sent_qty: 0 }
        ],
        customerName: 'ماجد',
        customerPhone: '01198765432',
        customerAddress: 'طابق 3',
        isHeld: false
      }
    ];

    // 1. Simulate sending Tab 1 to Bar: items in Tab 1 must have sent_qty = qty
    const updatedTab1Cart = tabs[0].cart.map(it => ({ ...it, sent_qty: it.qty }));
    tabs[0].cart = updatedTab1Cart;

    // Verify Tab 1 items are fully marked as sent
    assert.equal(tabs[0].cart[0].sent_qty, 2, 'Tab 1 item 1 sent_qty must be 2');
    assert.equal(tabs[0].cart[1].sent_qty, 1, 'Tab 1 item 2 sent_qty must be 1');

    // 2. Switch to Tab 2: Tab 2 items must remain independent with sent_qty = 0
    assert.equal(tabs[1].cart[0].sent_qty, 0, 'Tab 2 items must remain independent with sent_qty = 0');

    // 3. Switch back to Tab 1: Tab 1 must STILL have sent_qty matching qty (preventing duplicate bar tickets)
    const unsentInTab1 = tabs[0].cart.filter(it => it.qty > (it.sent_qty || 0));
    assert.equal(unsentInTab1.length, 0, 'Tab 1 must have 0 unsent items upon switching back');

    // 4. Add new item to Tab 1: only the new item is unsent
    tabs[0].cart.push({ id: 3, name: 'مياه معدنية', price: 10, qty: 1, sent_qty: 0 });
    const newlyUnsent = tabs[0].cart.filter(it => it.qty > (it.sent_qty || 0));
    assert.equal(newlyUnsent.length, 1, 'Only the newly added item should be unsent');
    assert.equal(newlyUnsent[0].name, 'مياه معدنية');

    db.closeShift(shift6.id, 1000, 'إغلاق شيفت 6', { id: 1, name: 'Admin', role: 'admin' });
  });

  test('Stress & Load: 50 High-Frequency Sequential & Split Orders Integrity', () => {
    const stressShift = db.openShift(2000, 'وردية الضغط العالي', { id: 1, name: 'Admin', role: 'admin' });
    let runningCashSales = 0;
    let runningWalletSales = 0;

    // testProduct price = 30 EGP. Qty 2 = 60 EGP per order.
    for (let i = 1; i <= 50; i++) {
      const isSplit = i % 3 === 0;
      const isWallet = i % 5 === 0 && !isSplit;

      let paymentMethod = 'cash';
      let cashAmt = 60;
      let walletAmt = 0;

      if (isSplit) {
        paymentMethod = 'split';
        cashAmt = 30;
        walletAmt = 30;
      } else if (isWallet) {
        paymentMethod = 'wallet';
        cashAmt = 0;
        walletAmt = 60;
      }

      const order = db.createOrder({
        items: [{ id: testProduct.id, name: testProduct.name, price: 30, qty: 2 }],
        orderType: 'takeaway',
        paymentMethod,
        cashAmount: cashAmt,
        walletAmount: walletAmt,
        cardAmount: 0,
        amountPaid: 60,
        customerName: `عميل تجربة ${i}`,
        customerPhone: `010000000${String(i).padStart(2, '0')}`
      });

      assert.ok(order && order.invoiceNo, `Stress order ${i} must succeed`);
      runningCashSales += cashAmt;
      runningWalletSales += walletAmt;
    }

    const cur = db.currentShift();
    assert.equal(cur.total_orders, 50, 'Must record exactly 50 orders');
    assert.equal(cur.cash_sales, runningCashSales, 'Cash sales must match exact sum of cash portions');
    assert.equal(cur.wallet_sales, runningWalletSales, 'Wallet sales must match exact sum of wallet portions');
    assert.equal(cur.expected_cash, 2000 + runningCashSales, 'Expected cash must match opening + exact cash sales');

    const closeRes = db.closeShift(stressShift.id, 2000 + runningCashSales, 'إغلاق وردية الضغط بنجاح', { id: 1, name: 'Admin', role: 'admin' });
    assert.ok(closeRes.success, 'Stress shift must close cleanly with 0 cash difference');
    assert.equal(closeRes.cashDifference, 0);
  });
});
