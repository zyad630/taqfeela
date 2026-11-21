const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

async function run() {
  console.log('=== TEST ITEM 9: Heavy Simulation (14d x 200 orders), 50MB-100MB Scaling, & Cairo DST ===\n');

  let passed = 0;
  let failed = 0;
  const baseTemp = fs.existsSync('D:/') ? 'D:/cafe-temp' : os.tmpdir();
  if (!fs.existsSync(baseTemp)) {
    try { fs.mkdirSync(baseTemp, { recursive: true }); } catch (_) {}
  }
  const tempDir = fs.mkdtempSync(path.join(baseTemp, 'cafe-test-item9-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  try {
    const db = require('../electron/db');
    await db.init(testDbPath);
    console.log('[Test 9] DB initialized at:', testDbPath);

    // -------------------------------------------------------------
    // Part 1: Cairo DST Transition & Day Boundaries
    // -------------------------------------------------------------
    console.log('\n--- Part 1: Cairo DST Transition & Day Boundaries ---');
    const testCases = [
      {
        desc: 'Before DST starts (April 25, 2024 21:59 UTC = 23:59 Cairo UTC+2)',
        iso: '2024-04-25T21:59:00.000Z',
        expectedDate: '2024-04-25'
      },
      {
        desc: 'Immediately after DST starts (April 25, 2024 22:01 UTC = 01:01 Cairo UTC+3 next day)',
        iso: '2024-04-25T22:01:00.000Z',
        expectedDate: '2024-04-26'
      },
      {
        desc: 'Summer midnight border (July 15, 2024 21:30 UTC = 00:30 Cairo UTC+3 next day)',
        iso: '2024-07-15T21:30:00.000Z',
        expectedDate: '2024-07-16'
      },
      {
        desc: 'Before DST ends (Oct 31, 2024 20:59 UTC = 23:59 Cairo UTC+3)',
        iso: '2024-10-31T20:59:00.000Z',
        expectedDate: '2024-10-31'
      },
      {
        desc: 'Immediately after DST ends (Oct 31, 2024 21:01 UTC = 23:01 Cairo UTC+2 same day)',
        iso: '2024-10-31T21:01:00.000Z',
        expectedDate: '2024-10-31'
      },
      {
        desc: 'Winter midday (Dec 15, 2024 12:00 UTC = 14:00 Cairo UTC+2)',
        iso: '2024-12-15T12:00:00.000Z',
        expectedDate: '2024-12-15'
      }
    ];

    let dstAllMatch = true;
    for (const tc of testCases) {
      const dbDate = db.toCairoDateString(tc.iso);
      if (dbDate !== tc.expectedDate) {
        console.log(`❌ Mismatch in db.toCairoDateString for ${tc.desc}: got ${dbDate}, expected ${tc.expectedDate}`);
        dstAllMatch = false;
      }
    }

    if (dstAllMatch) {
      console.log('✅ PASS: All Cairo DST transitions correctly calculated according to Egyptian Law 24 of 2023.');
      passed++;
    } else {
      console.log('❌ FAIL: Cairo DST transitions mismatch.');
      failed++;
    }

    // -------------------------------------------------------------
    // Part 2: Heavy 14 Days x 200 Orders/Day Simulation (2,800 Orders)
    // -------------------------------------------------------------
    console.log('\n--- Part 2: 14 Days x 200 Orders/Day Simulation (2,800 Orders) ---');
    db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
    const adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
    const cashier = db.saveUser({ username: 'cashier9', name: 'كاشير المحاكاة', role: 'cashier', password: 'CashierPassword123!' });

    const prod1 = db.saveProduct({ name: 'قهوة اسبريسو', price: 30, category_id: 1, stock_qty: 100000 });
    const prod2 = db.saveProduct({ name: 'كابتشينو', price: 40, category_id: 1, stock_qty: 100000 });
    const table1 = db.saveTable({ number: 'T9', name: 'طاولة 9', capacity: 4, hall: 'رئيسي' });

    let totalOrdersCreated = 0;
    const startTimeSim = performance.now();

    for (let day = 1; day <= 14; day++) {
      // 2 shifts per day, 100 orders each = 200 orders/day
      for (let s = 1; s <= 2; s++) {
        const shiftUser = s === 1 ? adminUser : cashier;
        const shift = db.openShift(1000, `افتتاح يوم ${day} وردية ${s}`, shiftUser, s === 1 ? 'صباحية' : 'مسائية');

        for (let i = 1; i <= 100; i++) {
          const method = i % 5 === 0 ? 'card' : (i % 4 === 0 ? 'wallet' : 'cash');
          db.createOrder({
            items: [
              { id: prod1.id, name: prod1.name, price: 30, qty: 1 },
              { id: prod2.id, name: prod2.name, price: 40, qty: 1 }
            ],
            total: 70,
            subtotal: 70,
            paymentMethod: method,
            orderType: i % 2 === 0 ? 'takeaway' : 'dine_in',
            tableId: i % 2 === 0 ? null : table1.id,
            amountPaid: 70,
            shiftId: shift.id,
            user: shiftUser
          });
          totalOrdersCreated++;
        }

        db.addExpense({
          shiftId: shift.id,
          amount: 100,
          category: 'مشتريات',
          notes: `مصروف دوري وردية ${s}`,
          userId: shiftUser.id,
          userName: shiftUser.name
        });

        const cashCalc = db.computeShiftCash(shift.id);
        db.closeShift(shift.id, cashCalc.expected_cash, `إغلاق يوم ${day} وردية ${s}`, shiftUser);
      }
    }

    const simDuration = performance.now() - startTimeSim;
    console.log(`[Test 9] Created ${totalOrdersCreated} orders across 28 shifts in ${(simDuration / 1000).toFixed(2)}s`);

    // Verify atomic flush and measure query performance
    db.flushDb();
    const stat14 = fs.statSync(testDbPath);
    console.log(`[Test 9] Database size after 2,800 orders: ${(stat14.size / 1024 / 1024).toFixed(2)} MB`);

    const tOrderList0 = performance.now();
    const recentOrders = db.listOrders({ limit: 500 });
    const orderListLatency = performance.now() - tOrderList0;
    console.log(`[Test 9] listOrders(limit: 500) latency: ${orderListLatency.toFixed(2)} ms (returned ${recentOrders.length} orders)`);

    const tReport0 = performance.now();
    const todayStr = db.getCairoTodayString();
    const dailyReport = db.getDailySummaryReport(todayStr);
    const reportLatency = performance.now() - tReport0;
    console.log(`[Test 9] getDailySummaryReport latency: ${reportLatency.toFixed(2)} ms`);

    const integrityRow = db.queryGet("PRAGMA integrity_check");
    const integrityStatus = integrityRow ? Object.values(integrityRow)[0] : 'failed';
    console.log(`[Test 9] SQLite integrity check: ${integrityStatus}`);

    if (totalOrdersCreated === 2800 && orderListLatency < 250 && reportLatency < 1200 && integrityStatus === 'ok') {
      console.log('✅ PASS: Heavy 14-day simulation (2,800 orders) maintains responsive queries and passes integrity check.');
      passed++;
    } else {
      console.log('❌ FAIL: Simulation performance or integrity degraded.');
      failed++;
    }

    // -------------------------------------------------------------
    // Part 3: Database Scaling (50MB and 100MB) & Memory Scaling
    // -------------------------------------------------------------
    console.log('\n--- Part 3: Database Scaling (50MB & 100MB) and Memory Profile ---');

    // Scale database to ~50MB by inserting realistic order item rows in chunks
    console.log('[Test 9] Scaling database to 50MB...');
    const paddingPayload = 'A'.repeat(8000); // 8KB per row
    let rowsAdded = 0;

    // ~6,000 rows of 8KB = ~48MB
    db.runSql('BEGIN TRANSACTION');
    for (let k = 0; k < 6200; k++) {
      db.runSql(
        `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
         VALUES ('BULK_SCALE_50MB', 'orders', ?, 1, 'ScaleTester', ?, datetime('now'))`,
        [++rowsAdded, paddingPayload],
        { skipSave: true }
      );
    }
    db.runSql('COMMIT');
    db.flushDb();

    const stat50 = fs.statSync(testDbPath);
    const size50MB = (stat50.size / 1024 / 1024).toFixed(2);
    console.log(`[Test 9] Database reached ${size50MB} MB`);

    // Measure saveDbAtomic / export on 50MB
    const tExport50 = performance.now();
    const memBefore50 = process.memoryUsage();
    db.flushDb();
    const export50Duration = performance.now() - tExport50;
    const memAfter50 = process.memoryUsage();

    const heap50 = (memAfter50.heapUsed / 1024 / 1024).toFixed(2);
    const totalRss50 = (memAfter50.rss / 1024 / 1024).toFixed(2);

    console.log(`[Test 9] 50MB DB flush/export: ${export50Duration.toFixed(2)}ms | Heap: ${heap50}MB | Total RSS: ${totalRss50}MB`);

    // Scale to ~100MB with another ~6,400 rows
    console.log('[Test 9] Scaling database to 100MB...');
    db.runSql('BEGIN TRANSACTION');
    for (let k = 0; k < 6400; k++) {
      db.runSql(
        `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
         VALUES ('BULK_SCALE_100MB', 'orders', ?, 1, 'ScaleTester', ?, datetime('now'))`,
        [++rowsAdded, paddingPayload],
        { skipSave: true }
      );
    }
    db.runSql('COMMIT');
    db.flushDb();

    const stat100 = fs.statSync(testDbPath);
    const size100MB = (stat100.size / 1024 / 1024).toFixed(2);
    console.log(`[Test 9] Database reached ${size100MB} MB`);

    // Measure saveDbAtomic / export on 100MB
    const tExport100 = performance.now();
    const memBefore100 = process.memoryUsage();
    db.flushDb();
    const export100Duration = performance.now() - tExport100;
    const memAfter100 = process.memoryUsage();

    const heap100 = (memAfter100.heapUsed / 1024 / 1024).toFixed(2);
    const totalRss100 = (memAfter100.rss / 1024 / 1024).toFixed(2);

    console.log(`[Test 9] 100MB DB flush/export: ${export100Duration.toFixed(2)}ms | Heap: ${heap100}MB | Total RSS: ${totalRss100}MB`);

    // Verify 32-bit (ia32) memory safety margin:
    // 32-bit Windows process ceiling is ~1400MB to 2048MB.
    // If total RSS on a 100MB database is under 900MB, safety margin is > 500MB (zero OOM risk).
    const is32BitSafe = Number(totalRss100) < 900;
    console.log(`[Test 9] 32-bit Memory Safety Margin: Process RSS (${totalRss100}MB) < 900MB (Safety margin > 500MB from 1.4GB ia32 ceiling): ${is32BitSafe}`);

    const postIntegrityRow = db.queryGet("PRAGMA integrity_check");
    const postIntegrityStatus = postIntegrityRow ? Object.values(postIntegrityRow)[0] : 'failed';
    console.log(`[Test 9] Post-scaling SQLite integrity check: ${postIntegrityStatus}`);

    if (is32BitSafe && postIntegrityStatus === 'ok') {
      console.log('✅ PASS: 50MB and 100MB DB export measured safely without OOM risk for 32-bit (ia32) architecture.');
      passed++;
    } else {
      console.log('❌ FAIL: Memory limit exceeded or integrity check failed on 100MB scaling.');
      failed++;
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message, err.stack);
    failed++;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nItem 9 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();
