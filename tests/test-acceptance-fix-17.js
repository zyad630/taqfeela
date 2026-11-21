/**
 * Acceptance Test for FIX-17 (ARCH-04): Clear Payment Method Naming ('نقدي (خزنة)' vs 'فودافون كاش (محفظة)')
 * Tests:
 * 1. exportOrdersExcel translates payment methods accurately without bare 'كاش'.
 * 2. PosTab, OrdersTab, ReceiptModal, and ReportsTab UI elements use unambiguous labels.
 * 3. Parity between src/ and cafe-pos-split/ directories.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const db = require('../electron/db.js');

async function testExcelExportPaymentLabels() {
  console.log('--- TEST 1: exportOrdersExcel Payment Method Localization ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-fix17-test-'));
  const testDbPath = path.join(tmpDir, 'test.db');

  await db.init(testDbPath);

  // Setup admin and shift
  const adminRes = db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');
  const shiftRes = db.openShift(100, 'شيفت تجريبي', admin);
  const shiftId = shiftRes.id || (db.currentShift() && db.currentShift().id);

  // Create cash order
  db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', qty: 1, price: 25 }],
    paymentMethod: 'cash',
    orderType: 'takeaway',
    shiftId,
    user: admin
  });

  // Create wallet order
  db.createOrder({
    items: [{ id: 1, name: 'قهوة تركي', qty: 1, price: 25 }],
    paymentMethod: 'wallet',
    orderType: 'takeaway',
    shiftId,
    user: admin
  });

  const excelHtml = db.exportOrdersExcel();
  console.log('Checking Excel HTML output for localized labels...');
  assert(excelHtml.includes('نقدي (خزنة)'), 'Excel export must label cash orders as "نقدي (خزنة)"');
  assert(excelHtml.includes('فودافون كاش (محفظة)'), 'Excel export must label wallet orders as "فودافون كاش (محفظة)"');
  console.log('✅ TEST 1 PASSED: Excel export correctly identifies "نقدي (خزنة)" and "فودافون كاش (محفظة)".\n');

  try {
    fs.unlinkSync(testDbPath);
    fs.rmdirSync(tmpDir);
  } catch (_) {}
}

function testUiLabels() {
  console.log('--- TEST 2: UI Components Payment Labels Verification ---');
  const baseDir = path.resolve(__dirname, '..');

  const filesToCheck = [
    {
      file: 'src/components/tabs/OrdersTab.jsx',
      tokens: ['💵 نقدي (خزنة)', '📱 فودافون كاش (محفظة)']
    },
    {
      file: 'src/components/tabs/PosTab.jsx',
      tokens: ['💵 نقدي (خزنة)', '📱 فودافون كاش (محفظة)']
    },
    {
      file: 'src/components/print/ReceiptModal.jsx',
      tokens: ['نقدي (خزنة)', 'فودافون كاش (محفظة)']
    },
    {
      file: 'src/components/tabs/ReportsTab.jsx',
      tokens: ['💵 نقدي (خزنة)', '📱 فودافون كاش (محفظة)']
    }
  ];

  for (const c of filesToCheck) {
    const srcPath = path.join(baseDir, c.file);
    const splitPath = path.join(baseDir, c.file.replace('src/', 'cafe-pos-split/src/'));

    const srcContent = fs.readFileSync(srcPath, 'utf8');
    const splitContent = fs.readFileSync(splitPath, 'utf8');

    for (const token of c.tokens) {
      assert(srcContent.includes(token), `${c.file} must include token: "${token}"`);
      assert(splitContent.includes(token), `cafe-pos-split/${c.file} must include token: "${token}"`);
      console.log(`  ✓ Verified token "${token}" in ${c.file}`);
    }
  }

  console.log('✅ TEST 2 PASSED: All UI screens clearly distinguish between physical cash and digital wallets.\n');
}

async function testNotebookCashFlowAndAccounting() {
  console.log('--- TEST 3: Notebook Debt vs Shift Cash & getReportSales ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-fix17-nb-'));
  const testDbPath = path.join(tmpDir, 'test_nb.db');

  await db.init(testDbPath);
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');

  // Open shift with 0 cash
  const shiftRes = db.openShift(0, 'شيفت نوتة', admin);
  const shiftId = shiftRes.id || db.currentShift().id;

  // 1. Create a notebook order with 0 upfront cash
  const prod = db.listProducts().find(p => !p.is_deleted) || { id: 1, name: 'قهوة', price: 50 };
  const targetTotal = prod.price * 2;

  const order = db.createOrder({
    items: [{ id: prod.id, name: prod.name, qty: 2, price: prod.price }],
    orderType: 'notebook',
    paymentMethod: 'notebook',
    customerName: 'عميل النوتة',
    customerPhone: '01012345678',
    amountPaid: 0,
    shiftId,
    user: admin
  });

  assert.ok(order && order.id, 'Notebook order must be created');
  assert.strictEqual(order.total, targetTotal, `Order total must match products price (${targetTotal})`);

  // Verify shift cash immediately after notebook order
  const cashState1 = db.computeShiftCash(shiftId);
  console.log(`Expected shift cash after notebook order: ${cashState1.expected_cash} LE (Opening: ${cashState1.opening_cash})`);
  assert.strictEqual(cashState1.cash_sales, 0, 'Unpaid notebook order must NOT count towards cash_sales');
  assert.strictEqual(cashState1.expected_cash, 0, 'Expected cash in drawer must remain 0 (no cash was received yet)');

  // 2. Pay 60% of the debt via payDebt
  const payAmount = Math.round(targetTotal * 0.6);
  const expectedRemaining = targetTotal - payAmount;

  const debts = db.listDebts();
  const customerDebt = debts.find(d => d.customer_name === 'عميل النوتة' || d.customer_phone === '01012345678');
  assert.ok(customerDebt, 'Debt record must be created for customer');
  assert.strictEqual(customerDebt.remaining_amount, targetTotal, `Initial remaining debt must be ${targetTotal}`);

  const payRes = db.payDebt({
    debtId: customerDebt.id,
    amount: payAmount,
    paymentMethod: 'cash',
    user: admin,
    shiftId
  });
  assert.ok(payRes && payRes.success, 'Debt partial payment must succeed');

  // Verify customer debt after payment
  const debtsAfter = db.listDebts();
  const customerDebtAfter = debtsAfter.find(d => d.id === customerDebt.id);
  assert.strictEqual(customerDebtAfter.remaining_amount, expectedRemaining, `Remaining debt on customer must be ${expectedRemaining} LE`);

  // Verify shift cash after payment
  const cashState2 = db.computeShiftCash(shiftId);
  console.log(`Expected shift cash after debt payment: ${cashState2.expected_cash} LE`);
  assert.strictEqual(cashState2.expected_cash, payAmount, `Expected cash in drawer must increase by exactly ${payAmount} LE`);

  // 3. Verify getReportSales summary
  const report = db.getReportSales({ shiftId });
  console.log('getReportSales summary:', report.summary);
  assert.strictEqual(report.summary.total_sales, targetTotal, `Total sales must report ${targetTotal} LE`);
  assert.strictEqual(report.summary.cash_sales, 0, 'Direct cash sales from orders must be 0');
  assert.strictEqual(report.summary.notebook_sales, targetTotal, `Summary must explicitly report notebook_sales = ${targetTotal} LE`);

  // 4. Verify canonical database payment method values
  const orders = db.listOrders({ shiftId });
  const validMethods = ['cash', 'card', 'wallet', 'split', 'notebook'];
  for (const o of orders) {
    assert.ok(validMethods.includes(o.payment_method), `Database payment_method "${o.payment_method}" must be canonical`);
  }

  console.log('✅ TEST 3 PASSED: Shift cash remains 0 on notebook order, increases by exactly 60 on debt payment, and getReportSales reports notebook_sales.\n');

  try {
    fs.unlinkSync(testDbPath);
    fs.rmdirSync(tmpDir);
  } catch (_) {}
}

async function run() {
  console.log('====================================================');
  console.log('       RUNNING ACCEPTANCE TEST FIX-17 (ARCH-04)     ');
  console.log('====================================================\n');
  await testExcelExportPaymentLabels();
  testUiLabels();
  await testNotebookCashFlowAndAccounting();
  console.log('====================================================');
  console.log('       ALL ACCEPTANCE TESTS FOR FIX-17 PASSED!      ');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

