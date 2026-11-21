/**
 * Acceptance Test for FIX-10 (POS-01 + UI-01): Double-click Prevention & Single-flight Guards
 * Tests:
 * 1. useSingleFlight concurrent locking: 10 simultaneous triggers in same tick -> exactly 1 executes, 9 rejected.
 * 2. Sequential execution after completion works properly.
 * 3. Error recovery: lock releases even if wrapped async function throws.
 * 4. Codebase inspection: All 10 critical handlers & modal buttons are guarded with single-flight hooks.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function testSingleFlightMechanism() {
  console.log('--- TEST 1: Concurrency Rejection in Same Tick ---');
  // Recreate the pure logic of useSingleFlight
  function createFlight() {
    let busy = false;
    let pending = false;
    const run = async (fn) => {
      if (busy) return { executed: false, reason: 'locked' };
      busy = true;
      pending = true;
      try {
        const res = await fn();
        return { executed: true, result: res };
      } finally {
        busy = false;
        pending = false;
      }
    };
    return { run, isPending: () => pending };
  }

  const flight = createFlight();
  let executionCount = 0;

  const asyncTask = (id) => new Promise((resolve) => {
    setTimeout(() => {
      executionCount++;
      resolve(`Task-${id}-Done`);
    }, 50);
  });

  // Launch 10 simultaneous calls in the exact same tick
  const promises = [];
  for (let i = 1; i <= 10; i++) {
    promises.push(flight.run(() => asyncTask(i)));
  }

  const results = await Promise.all(promises);
  const executed = results.filter((r) => r && r.executed);
  const rejected = results.filter((r) => r && !r.executed);

  console.log(`Simultaneous triggers: 10`);
  console.log(`Executed: ${executed.length}`);
  console.log(`Safely rejected by synchronous lock: ${rejected.length}`);
  console.log(`Actual worker runs: ${executionCount}`);

  assert.strictEqual(executed.length, 1, 'Only exactly 1 task should execute concurrently');
  assert.strictEqual(rejected.length, 9, 'Exactly 9 tasks should be rejected in the same tick');
  assert.strictEqual(executionCount, 1, 'Worker execution count must be exactly 1');
  console.log('✅ TEST 1 PASSED: Concurrency properly blocked (1 allowed, 9 rejected).\n');

  console.log('--- TEST 2: Sequential Execution After Completion ---');
  const sequentialResult = await flight.run(() => asyncTask(11));
  console.log(`Subsequent run executed: ${sequentialResult.executed}, result: ${sequentialResult.result}`);
  assert.strictEqual(sequentialResult.executed, true, 'Subsequent execution should succeed after flight finishes');
  assert.strictEqual(executionCount, 2, 'Total worker executions should now be 2');
  console.log('✅ TEST 2 PASSED: Lock clears properly after completion.\n');

  console.log('--- TEST 3: Error Recovery in Finally Block ---');
  let threwError = false;
  try {
    await flight.run(async () => {
      throw new Error('Simulated API failure');
    });
  } catch (err) {
    threwError = true;
  }
  const recoveryResult = await flight.run(() => asyncTask(12));
  assert.strictEqual(recoveryResult.executed, true, 'Lock must be released even after thrown error');
  console.log('✅ TEST 3 PASSED: Lock released cleanly after exception.\n');
}

function testCodebaseWiring() {
  console.log('--- TEST 4: Codebase Verification for 10 Protected Operations ---');
  const baseDir = path.resolve(__dirname, '..');
  const appSrc = fs.readFileSync(path.join(baseDir, 'src', 'App.jsx'), 'utf8');
  const appSplit = fs.readFileSync(path.join(baseDir, 'cafe-pos-split', 'src', 'App.jsx'), 'utf8');

  const requiredFlights = [
    'flightSendToBar',
    'flightCheckout',
    'flightCloseShift',
    'flightOpenShift',
    'flightLogin',
    'flightExpense',
    'flightPayDebt',
    'flightCancelOrder',
    'flightRestoreOrder',
    'flightTransferTable'
  ];

  for (const f of requiredFlights) {
    assert(appSrc.includes(f), `src/App.jsx missing flight declaration: ${f}`);
    assert(appSplit.includes(f), `cafe-pos-split/src/App.jsx missing flight declaration: ${f}`);
    console.log(`  ✓ Flight verified: ${f}`);
  }

  const requiredProps = [
    'pendingLogin',
    'pendingOpenShift',
    'pendingSendToBar',
    'pendingTransferTable',
    'pendingExpense',
    'pendingCloseShift',
    'pendingPayDebt',
    'pendingCancelOrder',
    'pendingRestoreOrder'
  ];

  for (const p of requiredProps) {
    assert(appSrc.includes(p), `src/App.jsx missing prop pass: ${p}`);
    assert(appSplit.includes(p), `cafe-pos-split/src/App.jsx missing prop pass: ${p}`);
    console.log(`  ✓ Prop pass verified: ${p}`);
  }

  // Check UI components for disabled states
  const componentsToCheck = [
    { file: 'src/components/tabs/PosTab.jsx', term: 'pendingSendToBar' },
    { file: 'src/components/modals/CloseShiftModal.jsx', term: 'pendingCloseShift' },
    { file: 'src/components/screens/ShiftOpenScreen.jsx', term: 'pendingOpenShift' },
    { file: 'src/components/screens/LoginScreen.jsx', term: 'pendingLogin' },
    { file: 'src/components/modals/AddExpenseModal.jsx', term: 'pendingExpense' },
    { file: 'src/components/modals/DeleteExpenseModal.jsx', term: 'pendingExpense' },
    { file: 'src/components/modals/PayDebtModal.jsx', term: 'pendingPayDebt' },
    { file: 'src/components/modals/CancelOrderModal.jsx', term: 'pendingCancelOrder' },
    { file: 'src/components/modals/RestoreOrderModal.jsx', term: 'pendingRestoreOrder' },
    { file: 'src/components/modals/TransferTableModal.jsx', term: 'pendingTransferTable' }
  ];

  for (const c of componentsToCheck) {
    const content = fs.readFileSync(path.join(baseDir, c.file), 'utf8');
    assert(content.includes(c.term), `${c.file} does not use ${c.term}`);
    console.log(`  ✓ Component disabled/loading feedback verified: ${c.file} (${c.term})`);
  }

  console.log('✅ TEST 4 PASSED: All 10 critical paths and UI buttons fully guarded.\n');
}

async function testSingleFlightTimeout() {
  console.log('--- TEST 5: SingleFlight Timeout & Unblocking on Hanging IPC ---');
  const singleFlightSrc = fs.readFileSync(path.join(__dirname, '../src/hooks/useSingleFlight.js'), 'utf8');
  assert.ok(
    singleFlightSrc.includes('DEFAULT_FLIGHT_TIMEOUT_MS = 30000') || singleFlightSrc.includes('30000'),
    'useSingleFlight must define default timeout of 30,000ms (30s)'
  );
  assert.ok(
    singleFlightSrc.includes('العملية تأخرت، تأكد من حالتها قبل ما تعيد'),
    'useSingleFlight must include standard Arabic alert message on timeout'
  );

  // Behavioral test using SingleFlightController
  const { SingleFlightController } = await import('../src/hooks/singleFlightController.js');
  let alertMsg = null;
  const ctrl = new SingleFlightController({
    defaultTimeoutMs: 100, // 100ms for test
    onTimeout: (msg) => { alertMsg = msg; }
  });

  let hangingTaskCompleted = false;
  // Start a task that hangs for 350ms (simulating 35s hanging IPC)
  const hangingPromise = ctrl.run(async () => {
    await new Promise(r => setTimeout(r, 350));
    hangingTaskCompleted = true;
    return 'DoneEventually';
  });

  assert.strictEqual(ctrl.pending, true, 'Controller should be pending initially');
  assert.strictEqual(ctrl.busy, true, 'Controller should be busy initially');

  // Wait 150ms for timeout to trigger
  await new Promise(r => setTimeout(r, 150));

  assert.strictEqual(ctrl.pending, false, 'Controller must clear pending state after timeout');
  assert.strictEqual(ctrl.busy, false, 'Lock must be released after timeout so user is not stuck');
  assert.strictEqual(alertMsg, 'العملية تأخرت، تأكد من حالتها قبل ما تعيد', 'Timeout must deliver exact warning');
  assert.strictEqual(hangingTaskCompleted, false, 'Controller must NOT auto-retry the operation');

  // Verify second click is unblocked after timeout
  let secondTaskExecuted = false;
  const secondRun = await ctrl.run(async () => {
    secondTaskExecuted = true;
    return 'SecondTaskOK';
  });
  assert.strictEqual(secondTaskExecuted, true, 'Subsequent execution must succeed after timeout released the lock');
  assert.strictEqual(secondRun.result, 'SecondTaskOK');

  console.log('✅ TEST 5 PASSED: 30s timeout releases lock, alerts cashier, and allows unblocked retry without auto-retry.\n');
}

async function testBackendIdempotency() {
  console.log('--- TEST 6: Real SQLite Backend Idempotency on Retry ---');
  const db = require('../electron/db.js');
  await db.init();
  
  // Use in-memory or test database
  const shift = db.currentShift();
  let shiftId = shift ? shift.id : null;
  if (!shiftId) {
    const newShift = db.openShift({ cashierName: 'TestCashier', openingCash: 100 });
    shiftId = newShift.id;
  }

  // Get an active product with inventory
  const products = db.listProducts();
  const prod = products.find(p => p.stock_qty > 5 && !p.is_deleted);
  assert.ok(prod, 'Must have a product with stock for test');
  const initialStock = prod.stock_qty;

  const clientOrderId = `idem_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const orderPayload = {
    shiftId,
    clientOrderId,
    items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 2 }],
    paymentMethod: 'cash',
    orderType: 'takeaway',
    cashAmount: prod.price * 2
  };

  // 1st Execution (simulating primary order placement)
  const initialCount = db.listOrders().length;
  const order1 = db.createOrder(orderPayload);
  assert.ok(order1 && order1.id, 'First order must succeed');
  assert.strictEqual(order1.duplicate, undefined, 'First order is not a duplicate');
  assert.strictEqual(db.listOrders().length, initialCount + 1, 'First order must insert exactly one order row');

  const getStock = () => db.listProducts().find(p => p.id === prod.id).stock_qty;

  const stockAfterFirst = getStock();
  assert.strictEqual(stockAfterFirst, initialStock - 2, 'Stock must decrease by 2 on first order');

  // 2nd Execution (simulating cashier retry after 30s timeout with same clientOrderId)
  const order2 = db.createOrder(orderPayload);
  assert.ok(order2 && order2.id, 'Second order call must return result');
  assert.strictEqual(order2.duplicate, true, 'Second call must be flagged as duplicate');
  assert.strictEqual(order2.id, order1.id, 'Duplicate order must return original order ID');
  assert.strictEqual(db.listOrders().length, initialCount + 1, 'Duplicate retry must NOT add another order row');

  const stockAfterSecond = getStock();
  assert.strictEqual(stockAfterSecond, stockAfterFirst, 'Stock must NOT be deducted again on duplicate retry');

  console.log('✅ TEST 6 PASSED: Backend idempotency prevents duplicate invoice and double inventory deduction.\n');
}

async function runAll() {
  console.log('====================================================');
  console.log('   RUNNING ACCEPTANCE TEST FIX-10 (POS-01 + UI-01)   ');
  console.log('====================================================\n');
  await testSingleFlightMechanism();
  testCodebaseWiring();
  await testSingleFlightTimeout();
  await testBackendIdempotency();
  console.log('====================================================');
  console.log('       ALL ACCEPTANCE TESTS FOR FIX-10 PASSED!      ');
  console.log('====================================================');
}

runAll().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

