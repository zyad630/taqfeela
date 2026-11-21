const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  console.log('=== TEST ITEM 5: listOrders LIMIT 500 and 600+ Orders Validation ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-item5-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  let passed = 0;
  let failed = 0;

  try {
    const db = require('../electron/db');
    await db.init(testDbPath);
    console.log('[Test 5] DB initialized.');

    // Ensure we have a user and an open shift
    let adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
    if (!adminUser) {
      db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
      adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
    }
    const shift = db.openShift(adminUser.id, 'الشيفت الصباحي', 500);
    console.log('[Test 5] Shift opened with ID:', shift.id);

    // 1. Seed 650 invoices into the orders table
    console.log('[Test 5] Seeding 650 orders into the database...');
    const now = new Date();
    db.withTransaction(() => {
      for (let i = 1; i <= 650; i++) {
        const orderTime = new Date(now.getTime() - (650 - i) * 60000).toISOString();
        const total = 50 + (i % 50);
        db.runSql(`
          INSERT INTO orders (
            invoice_no, shift_id, user_id, cashier_name, order_type,
            status, payment_method, total, subtotal, discount,
            cash_amount, card_amount, wallet_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `INV-TEST-${i}`, shift.id, adminUser.id, adminUser.name, 'dine_in',
          'completed', 'cash', total, total, 0,
          total, 0, 0, orderTime
        ], { skipSave: true });
      }
    });

    const totalCountRow = db.queryGet('SELECT COUNT(*) AS c FROM orders');
    console.log('[Test 5] Total orders in SQLite table:', totalCountRow.c);
    if (totalCountRow.c !== 650) {
      throw new Error(`Expected 650 orders in DB, got ${totalCountRow.c}`);
    }

    // 2. Fetch using listOrders default limit
    const fetchedOrders = db.listOrders({ shiftId: shift.id });
    console.log('[Test 5] listOrders returned count:', fetchedOrders.length);

    if (fetchedOrders.length === 500) {
      console.log('✅ PASS: listOrders strictly respects LIMIT 500 cap on 650+ records.');
      passed++;
    } else {
      console.log(`❌ FAIL: listOrders returned ${fetchedOrders.length} instead of 500.`);
      failed++;
    }

    // 3. Verify OrdersTab.jsx has the LIMIT warning banner and does not mislead the user
    console.log('\n--- Checking OrdersTab.jsx for LIMIT 500 warning banner ---');
    const ordersTabPath = path.resolve(__dirname, '../src/components/tabs/OrdersTab.jsx');
    const tabCode = fs.readFileSync(ordersTabPath, 'utf8');

    const hasLimitWarning = tabCode.includes('500') && (tabCode.includes('تنبيه') || tabCode.includes('أحدث 500'));
    if (hasLimitWarning) {
      console.log('✅ PASS: OrdersTab.jsx contains explicit warning for 500 limit cap.');
      passed++;
    } else {
      console.log('❌ FAIL: OrdersTab.jsx does NOT contain explicit warning when ordersList reaches LIMIT 500!');
      failed++;
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nItem 5 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();
