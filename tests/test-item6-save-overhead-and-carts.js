const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  console.log('=== TEST ITEM 6: DB Save Overhead, Cart Debouncing, and Maintenance Verification ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-item6-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  let passed = 0;
  let failed = 0;

  try {
    const db = require('../electron/db');
    await db.init(testDbPath);
    console.log('[Test 6] DB initialized.');

    // Setup admin & open shift
    let adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
    if (!adminUser) {
      db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
      adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
    }
    const shift = db.openShift(adminUser.id, 'الشيفت الصباحي', 500);

    // Setup product & table
    const prod = db.saveProduct({ name: 'شاي أحمر', price: 15, category_id: 1, stock_qty: 100 });
    const table = db.saveTable({ number: 'T99', name: 'طاولة 99', capacity: 4, hall: 'أرضي' });

    // ---------------------------------------------------------
    // Sub-test 1: Measure saves per invoice creation
    // ---------------------------------------------------------
    console.log('\n--- Sub-test 1: Measure Atomic Saves Per Invoice Creation ---');
    db.resetAtomicSaveCount();
    const orderRes = db.createOrder({
      items: [{ id: prod.id, name: prod.name, price: 15, qty: 2 }],
      total: 30,
      subtotal: 30,
      paymentMethod: 'cash',
      orderType: 'takeaway',
      amountPaid: 30,
      shiftId: shift.id,
      user: adminUser
    });

    const savesPerOrder = db.getAtomicSaveCount();
    console.log(`[Test 6] Order created: ID=${orderRes.id}, atomicSaves=${savesPerOrder}`);
    if (savesPerOrder === 1) {
      console.log('✅ PASS: createOrder executes exactly 1 atomic save on transaction commit.');
      passed++;
    } else {
      console.log(`❌ FAIL: createOrder executed ${savesPerOrder} atomic saves (expected exactly 1)!`);
      failed++;
    }

    // ---------------------------------------------------------
    // Sub-test 2: Safe Debouncing for Table Carts
    // ---------------------------------------------------------
    console.log('\n--- Sub-test 2: Safe Cart Debouncing ---');
    db.resetAtomicSaveCount();
    // Perform 5 rapid cart updates (e.g. clicking items or typing notes) with debouncing
    for (let i = 1; i <= 5; i++) {
      db.saveTableCart(table.id, {
        cart: [{ id: prod.id, name: prod.name, price: 15, qty: i }],
        _rev: i - 1
      }, { debounce: true });
    }

    // In-memory SQLite state must be instantly updated for any query
    const cartsNow = db.getTableCarts();
    const tableCart = cartsNow[table.id];
    const inMemoryUpdated = tableCart && tableCart.cart && tableCart.cart[0].qty === 5;
    const savesImmediately = db.getAtomicSaveCount();
    console.log(`[Test 6] In-memory cart qty immediately: ${tableCart?.cart?.[0]?.qty} (expected 5)`);
    console.log(`[Test 6] Atomic saves immediately after 5 cart updates: ${savesImmediately}`);

    if (savesImmediately === 0 && inMemoryUpdated) {
      console.log('✅ PASS: Table cart writes are debounced (0 synchronous atomic saves during rapid clicks) while memory is updated instantly.');
      passed++;
    } else {
      console.log(`❌ FAIL: Table carts not properly debounced (atomic saves = ${savesImmediately}) or memory state lagging.`);
      failed++;
    }

    // Verify flushDb flushes the debounced cart to disk
    db.flushDb();
    const savesAfterFlush = db.getAtomicSaveCount();
    console.log(`[Test 6] Atomic saves after explicit flushDb(): ${savesAfterFlush}`);
    if (savesAfterFlush >= 1) {
      console.log('✅ PASS: flushDb() guarantees persisted cart on disk.');
      passed++;
    } else {
      console.log('❌ FAIL: flushDb() did not persist cart to disk!');
      failed++;
    }

    // ---------------------------------------------------------
    // Sub-test 3: runDatabaseMaintenance Verification
    // ---------------------------------------------------------
    console.log('\n--- Sub-test 3: runDatabaseMaintenance Verification ---');
    // Insert an orphaned table cart for an available table
    const availTable = db.saveTable({ number: 'T100', name: 'طاولة 100', capacity: 2, hall: 'أرضي' });
    const nowIso = new Date().toISOString();
    db.runSql('INSERT OR REPLACE INTO table_carts (table_id, cart_data, rev, updated_at) VALUES (?, ?, ?, ?)', [
      availTable.id, JSON.stringify({ cart: [{ id: prod.id, qty: 1 }] }), 1, nowIso
    ], { skipSave: true });

    // Insert an old routine audit log (> 90 days old)
    const oldDate = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
    db.runSql('INSERT INTO audit_log (action, entity_type, details, created_at) VALUES (?, ?, ?, ?)', [
      'routine_click', 'ui', 'old action', oldDate
    ], { skipSave: true });

    // Insert an old critical audit log (> 90 days old)
    db.runSql('INSERT INTO audit_log (action, entity_type, details, created_at) VALUES (?, ?, ?, ?)', [
      'RESET_ADMIN_PASSWORD', 'security', 'Critical admin reset', oldDate
    ], { skipSave: true });

    // Run maintenance
    db.runDatabaseMaintenance();

    // Verify orphaned cart is removed
    const orphanCheck = db.queryGet('SELECT * FROM table_carts WHERE table_id = ?', [availTable.id]);
    // Verify audit logs are PRESERVED 100% (never deleted to maintain cryptographic HMAC chain and accounting trail)
    const routineLogCheck = db.queryGet('SELECT * FROM audit_log WHERE action = ?', ['routine_click']);
    const criticalLogCheck = db.queryGet('SELECT * FROM audit_log WHERE action = ?', ['RESET_ADMIN_PASSWORD']);

    if (!orphanCheck && routineLogCheck && criticalLogCheck) {
      console.log('✅ PASS: runDatabaseMaintenance cleaned orphaned carts while 100% preserving all audit_log records (HMAC chain intact).');
      passed++;
    } else {
      console.log('❌ FAIL: runDatabaseMaintenance did not perform expected cleanup accurately:', {
        orphanRemaining: Boolean(orphanCheck),
        auditPreserved: Boolean(routineLogCheck && criticalLogCheck)
      });
      failed++;
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nItem 6 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();
