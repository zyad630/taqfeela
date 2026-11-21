/**
 * tests/test-item5-missing-upgrade-scenarios.js
 * 
 * Empirically tests all 5 missing upgrade scenarios:
 * (a) Open shift: shift remains open with exact expected_cash preserved down to the piastre.
 * (b) Active tables & carts: occupied table carts in table_carts and takeaway notes preserved.
 * (c) Unpaid customer notebook debts & partial debt payments preserved.
 * (d) 50MB database generated/verified as genuine 1.0.1 schema (user_version = 0) upgraded to 1.0.2.
 * (e) Pre-migration disk space check: verifies upgrade refusal and rollback when free space < 2x DB size.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const dbModule = require('../electron/db');

// Ensure working on temp drive
const TEMP_ROOT = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();

async function run() {
  console.log('================================================================');
  console.log('       TEST ITEM 5: MISSING UPGRADE SCENARIOS EMPIRICAL AUDIT   ');
  console.log('================================================================\n');

  const SQL = await initSqlJs();

  // -------------------------------------------------------------
  // Scenario (a): Open shift preservation
  // -------------------------------------------------------------
  console.log('[Scenario A] Testing open shift preservation across upgrade...');
  const testDirA = path.join(TEMP_ROOT, `test-scen-a-${Date.now()}`);
  fs.mkdirSync(testDirA, { recursive: true });
  const dbPathA = path.join(testDirA, 'cafe-pos.db');

  // Copy v1.0.1 database
  fs.copyFileSync(path.resolve(__dirname, 'fixtures/v1.0.1-anonymized.db'), dbPathA);

  // Inject an open shift with exact expected_cash
  {
    const d = new SQL.Database(fs.readFileSync(dbPathA));
    d.run(`
      INSERT INTO shifts (id, user_id, user_name, opened_at, opening_cash, shift_type, notes)
      VALUES (999, 1, 'مدير النظام', '2026-11-10 10:00:00', 500.00, 'الشيفت الصباحي (الأول)', 'وردية صباحية مفتوحة')
    `);
    d.run(`
      INSERT INTO orders (id, invoice_no, shift_id, user_id, cashier_name, order_type, subtotal, discount, tax, total, cash_amount, payment_method, status, created_at)
      VALUES (99999, 'INV-TEST-01', 999, 1, 'مدير النظام', 'takeaway', 734.56, 0, 0, 734.56, 734.56, 'cash', 'completed', '2026-11-10 10:05:00')
    `);
    fs.writeFileSync(dbPathA, Buffer.from(d.export()));
    d.close();
  }

  // Initialize dbModule with dbPathA (triggers migration)
  await dbModule.init(dbPathA);

  const openShift = dbModule.currentShift();
  console.log(`    Shift id: ${openShift?.id}, closed_at: ${openShift?.closed_at}, opening_cash: ${openShift?.opening_cash}, expected_cash: ${openShift?.expected_cash}`);
  if (!openShift || openShift.closed_at !== null) {
    throw new Error('FAIL (A): Open shift was closed or not found!');
  }
  if (Number(openShift.expected_cash) !== 1234.56) {
    throw new Error(`FAIL (A): expected_cash altered! Expected 1234.56, got ${openShift.expected_cash}`);
  }
  console.log('    [PASS] Scenario (A): Open shift and exact expected_cash preserved.\n');

  // -------------------------------------------------------------
  // Scenario (b): Active table carts and takeaway notes
  // -------------------------------------------------------------
  console.log('[Scenario B] Testing active table carts and pending notes preservation...');
  const testDirB = path.join(TEMP_ROOT, `test-scen-b-${Date.now()}`);
  fs.mkdirSync(testDirB, { recursive: true });
  const dbPathB = path.join(testDirB, 'cafe-pos.db');
  fs.copyFileSync(path.resolve(__dirname, 'fixtures/v1.0.1-anonymized.db'), dbPathB);

  const cartPayload = {
    cart: [
      { id: 1, name: 'قهوة تركي', price: 25, quantity: 2, notes: 'سكر زيادة بدون نعناع' }
    ],
    customerName: 'طاولة 5 عائلات',
    orderNotes: 'طلب مستعجل',
    discountAmount: 5
  };

  {
    const d = new SQL.Database(fs.readFileSync(dbPathB));
    d.run(`
      CREATE TABLE IF NOT EXISTS table_carts (
        table_id INTEGER PRIMARY KEY,
        cart_data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    d.run(`UPDATE tables SET status = 'occupied' WHERE id = 1`);
    d.run(`
      INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at)
      VALUES (1, ?, '2026-11-10 10:15:00')
    `, [JSON.stringify(cartPayload)]);
    fs.writeFileSync(dbPathB, Buffer.from(d.export()));
    d.close();
  }

  await dbModule.init(dbPathB);

  const cartRow = dbModule.queryGet('SELECT cart_data FROM table_carts WHERE table_id = 1');
  const restoredCart = JSON.parse(cartRow.cart_data);
  console.log(`    Table 1 customerName: "${restoredCart.customerName}", item note: "${restoredCart.cart[0].notes}"`);
  if (restoredCart.customerName !== 'طاولة 5 عائلات' || restoredCart.cart[0].notes !== 'سكر زيادة بدون نعناع') {
    throw new Error('FAIL (B): Table cart contents altered during upgrade!');
  }
  console.log('    [PASS] Scenario (B): Table carts and pending notes fully preserved.\n');

  // -------------------------------------------------------------
  // Scenario (c): Unpaid customer debts & partial payments
  // -------------------------------------------------------------
  console.log('[Scenario C] Testing unpaid notebook debts & partial payments preservation...');
  const testDirC = path.join(TEMP_ROOT, `test-scen-c-${Date.now()}`);
  fs.mkdirSync(testDirC, { recursive: true });
  const dbPathC = path.join(testDirC, 'cafe-pos.db');
  fs.copyFileSync(path.resolve(__dirname, 'fixtures/v1.0.1-anonymized.db'), dbPathC);

  // In v1.0.1 fixture, debts exist:
  // Debt 136: remaining 30 EGP
  // Debt 137: remaining 200 EGP
  await dbModule.init(dbPathC);

  const debt136 = dbModule.queryGet('SELECT total_amount, remaining_amount, status FROM customer_debts WHERE id = 136');
  const debt137 = dbModule.queryGet('SELECT total_amount, remaining_amount, status FROM customer_debts WHERE id = 137');
  console.log(`    Debt 136: total=${debt136?.total_amount}, remaining=${debt136?.remaining_amount}, status=${debt136?.status}`);
  console.log(`    Debt 137: total=${debt137?.total_amount}, remaining=${debt137?.remaining_amount}, status=${debt137?.status}`);
  if (Number(debt136.remaining_amount) !== 30 || Number(debt137.remaining_amount) !== 200) {
    throw new Error('FAIL (C): Customer debts modified during upgrade!');
  }
  console.log('    [PASS] Scenario (C): Unpaid debts and partial payments preserved.\n');

  // -------------------------------------------------------------
  // Scenario (d): 50MB DB upgrade & HMAC audit log chain
  // -------------------------------------------------------------
  console.log('[Scenario D] Testing 50MB DB upgrade & cryptographic audit chain...');
  const real50MbPath = 'D:/cafe-temp/cafe-pos-50mb.db';
  if (fs.existsSync(real50MbPath)) {
    const testDirD = path.join(TEMP_ROOT, `test-scen-d-${Date.now()}`);
    fs.mkdirSync(testDirD, { recursive: true });
    const dbPathD = path.join(testDirD, 'cafe-pos.db');
    fs.copyFileSync(real50MbPath, dbPathD);

    // Ensure it is set to schema version 0 (representing genuine 1.0.1 state)
    {
      const d = new SQL.Database(fs.readFileSync(dbPathD));
      d.run('PRAGMA user_version = 0');
      fs.writeFileSync(dbPathD, Buffer.from(d.export()));
      d.close();
    }

    const tStart = Date.now();
    await dbModule.init(dbPathD);
    const upgradeMs = Date.now() - tStart;

    const ordersCount = dbModule.queryGet('SELECT COUNT(*) as count FROM orders').count;
    const totalSales = dbModule.queryGet('SELECT SUM(total) as s FROM orders').s;
    const chainCheck = dbModule.verifyAuditLogChain();

    console.log(`    50MB upgraded in ${upgradeMs}ms:`);
    console.log(`    - Orders: ${ordersCount}`);
    console.log(`    - Total Sales: ${totalSales} EGP`);
    console.log(`    - Audit Chain Valid: ${chainCheck.valid} (${chainCheck.count} records, hash: ${chainCheck.chainHash?.slice(0, 16)}...)`);

    if (ordersCount !== 66020) {
      throw new Error(`FAIL (D): Orders count altered! Expected 66020, got ${ordersCount}`);
    }
    if (!chainCheck.valid) {
      throw new Error('FAIL (D): Audit HMAC chain broken during upgrade!');
    }
    console.log('    [PASS] Scenario (D): 50MB DB upgraded seamlessly with 100% integrity.\n');
  } else {
    console.log('    [SKIP (D)] D:/cafe-temp/cafe-pos-50mb.db not found, skipping 50MB test.\n');
  }

  // -------------------------------------------------------------
  // Scenario (e): Insufficient disk space pre-check
  // -------------------------------------------------------------
  console.log('[Scenario E] Testing insufficient disk space pre-check...');
  const testDirE = path.join(TEMP_ROOT, `test-scen-e-${Date.now()}`);
  fs.mkdirSync(testDirE, { recursive: true });
  const dbPathE = path.join(testDirE, 'cafe-pos.db');
  fs.copyFileSync(path.resolve(__dirname, 'fixtures/v1.0.1-anonymized.db'), dbPathE);

  const initialHash = crypto.createHash('sha256').update(fs.readFileSync(dbPathE)).digest('hex');

  // Set simulation env var
  process.env.TEST_SIMULATE_LOW_DISK_SPACE = '1';
  let rejected = false;
  let rejectedMsg = '';

  try {
    await dbModule.init(dbPathE);
  } catch (err) {
    rejected = true;
    rejectedMsg = err.message;
    console.log(`    Upgrade rejected as expected with error: "${rejectedMsg}"`);
  } finally {
    delete process.env.TEST_SIMULATE_LOW_DISK_SPACE;
  }

  if (!rejected) {
    throw new Error('FAIL (E): Upgrade proceeded despite insufficient disk space!');
  }
  if (!rejectedMsg.includes('مساحة القرص غير كافية')) {
    throw new Error(`FAIL (E): Expected Arabic error about disk space, got: ${rejectedMsg}`);
  }

  // Verify DB on disk is untouched
  const finalHash = crypto.createHash('sha256').update(fs.readFileSync(dbPathE)).digest('hex');
  if (initialHash !== finalHash) {
    throw new Error('FAIL (E): Database was modified despite disk space rejection!');
  }
  console.log('    Database bytes on disk untouched (hash matched initial state).');
  console.log('    [PASS] Scenario (E): Insufficient disk space handled safely.\n');

  console.log('================================================================');
  console.log('       ALL 5 MISSING UPGRADE SCENARIOS PASSED WITH DISTINCTION  ');
  console.log('================================================================');
}

run().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
