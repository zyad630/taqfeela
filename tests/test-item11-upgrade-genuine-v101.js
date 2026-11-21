const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  console.log('=== TEST ITEM 11: Upgrade with Genuine Installed v1.0.1 Database ===\n');

  const genuineSourcePath = path.join(process.env.APPDATA, 'cafe-pos', 'cafe-pos.db');
  if (!fs.existsSync(genuineSourcePath)) {
    console.error('❌ FAIL: Genuine v1.0.1 database not found at:', genuineSourcePath);
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-item11-genuine-'));
  const isolatedDbPath = path.join(tempDir, 'cafe-pos.db');

  let passed = 0;
  let failed = 0;

  try {
    // Copy genuine 1.0.1 file
    fs.copyFileSync(genuineSourcePath, isolatedDbPath);
    const sourceStat = fs.statSync(isolatedDbPath);
    console.log(`[Test 11] Copied genuine v1.0.1 DB: size = ${sourceStat.size} bytes from ${genuineSourcePath}`);

    // Pre-upgrade verification using raw sql.js
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const rawPreDb = new SQL.Database(fs.readFileSync(isolatedDbPath));
    rawPreDb.run('PRAGMA foreign_keys = ON;');
    const preFkViolations = rawPreDb.exec('PRAGMA foreign_key_check;');
    const preViolationCount = preFkViolations.length > 0 ? preFkViolations[0].values.length : 0;
    console.log(`[Test 11] Pre-upgrade FK violations on raw genuine 1.0.1 DB: ${preViolationCount} violations.`);
    rawPreDb.close();

    // Now run our modern db.init() to perform complete upgrade and migrations
    const db = require('../electron/db');
    await db.init(isolatedDbPath);
    console.log('[Test 11] Modern db.init() completed upgrade on genuine v1.0.1 database.');

    // 1. Verify PRAGMA foreign_key_check is completely clean (0 violations)
    const postFkViolations = db.queryAll('PRAGMA foreign_key_check;');
    console.log(`[Test 11] Post-upgrade FK violations: ${postFkViolations.length}`);
    if (postFkViolations.length === 0) {
      console.log('✅ PASS: healForeignKeyViolations() eliminated all FK violations non-destructively.');
      passed++;
    } else {
      console.log('❌ FAIL: FK violations remain after upgrade:', postFkViolations);
      failed++;
    }

    // 2. Verify zero historical financial records lost
    const postOrders = db.queryGet('SELECT count(*) AS c FROM orders').c;
    const postShifts = db.queryGet('SELECT count(*) AS c FROM shifts').c;
    const postProducts = db.queryGet('SELECT count(*) AS c FROM products').c;
    const postUsers = db.queryGet('SELECT count(*) AS c FROM users').c;
    const postExpenses = db.queryGet('SELECT count(*) AS c FROM expenses').c;

    console.log('[Test 11] Post-upgrade row counts:', {
      orders: postOrders,
      shifts: postShifts,
      products: postProducts,
      users: postUsers,
      expenses: postExpenses
    });

    if (postOrders === 38 && postShifts === 56 && postProducts >= 129 && postUsers === 6 && postExpenses === 60) {
      console.log('✅ PASS: Exactly zero historical records lost during genuine v1.0.1 upgrade (38 orders, 56 shifts, 129+ products, 6 users, 60 expenses).');
      passed++;
    } else {
      console.log('❌ FAIL: Record count mismatch post-upgrade!');
      failed++;
    }

    // 3. Verify new columns added cleanly (table_name, client_order_id, qr_token)
    const orderCols = db.queryAll('PRAGMA table_info(orders);').map(c => c.name);
    const hasClientOrderId = orderCols.includes('client_order_id');
    const hasTableName = orderCols.includes('table_name');
    const tableCols = db.queryAll('PRAGMA table_info(tables);').map(c => c.name);
    const hasQrToken = tableCols.includes('qr_token');

    if (hasClientOrderId && hasTableName && hasQrToken) {
      console.log('✅ PASS: Schema migrations applied all v1.0.2 columns (client_order_id, table_name, qr_token).');
      passed++;
    } else {
      console.log('❌ FAIL: Missing migrated columns:', { hasClientOrderId, hasTableName, hasQrToken });
      failed++;
    }

    // 4. Test operational execution: Create a new order on upgraded database
    const adminUser = db.queryGet('SELECT id, name, role FROM users WHERE role = "admin" LIMIT 1');
    const prod = db.queryGet('SELECT id, name, price FROM products LIMIT 1');
    let shift = db.currentShift();
    if (!shift) {
      shift = db.openShift(500, 'افتتاح بعد الترقية', adminUser, 'الشيفت الصباحي');
    }

    const newOrder = db.createOrder({
      items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 1 }],
      total: prod.price,
      subtotal: prod.price,
      paymentMethod: 'cash',
      amountPaid: prod.price,
      shiftId: shift.id,
      user: adminUser
    });

    console.log(`[Test 11] New order created on upgraded DB: ID = ${newOrder.id}, invoiceNo = ${newOrder.invoiceNo}`);
    if (newOrder.success && newOrder.id > 0) {
      console.log('✅ PASS: New order successfully processed on upgraded genuine v1.0.1 database without FK or constraint conflicts.');
      passed++;
    } else {
      console.log('❌ FAIL: Could not create order on upgraded database:', newOrder);
      failed++;
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nItem 11 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();

