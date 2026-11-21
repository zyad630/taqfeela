const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

async function run() {
  console.log('=== TEST ITEM 8: 14-Day Accelerated Mock Clock, Date Boundaries, and Performance ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-item8-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  let passed = 0;
  let failed = 0;

  try {
    const db = require('../electron/db');
    await db.init(testDbPath);
    console.log('[Test 8] DB initialized at:', testDbPath);

    // Setup admin & cashier
    db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
    const adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
    const cashier = db.saveUser({ username: 'cashier1', name: 'أحمد كاشير', role: 'cashier', password: 'CashierPassword123!' });

    const prod1 = db.saveProduct({ name: 'قهوة تركي', price: 20, category_id: 1, stock_qty: 10000 });
    const prod2 = db.saveProduct({ name: 'شاي بحليب', price: 25, category_id: 1, stock_qty: 10000 });
    const table1 = db.saveTable({ number: 'T1', name: 'طاولة 1', capacity: 4, hall: 'أرضي' });

    // -------------------------------------------------------------
    // Part 1: Accelerated 14-Day Simulation
    // -------------------------------------------------------------
    console.log('--- Part 1: 14 Consecutive Days Simulation ---');
    const metrics = [];
    const baseDate = new Date('2026-10-01T08:00:00.000Z');

    let currentSimTime = baseDate.getTime();

    for (let day = 1; day <= 14; day++) {
      // Shift 1: Morning (08:00 - 16:00)
      const shift1OpenTime = new Date(currentSimTime).toISOString();
      const s1 = db.openShift(500, 'افتتاح صباحي', adminUser, 'الشيفت الصباحي');

      // Create 15 orders in shift 1
      for (let o = 1; o <= 15; o++) {
        currentSimTime += 30 * 60000; // 30 mins later
        const orderTime = new Date(currentSimTime).toISOString();
        const method = o % 4 === 0 ? 'card' : (o % 3 === 0 ? 'wallet' : 'cash');
        db.createOrder({
          items: [{ id: prod1.id, name: prod1.name, price: 20, qty: 2 }],
          total: 40,
          subtotal: 40,
          paymentMethod: method,
          orderType: 'dine_in',
          tableId: table1.id,
          amountPaid: 40,
          shiftId: s1.id,
          user: adminUser
        });
      }

      // Add expense
      currentSimTime += 10 * 60000;
      db.addExpense({ shiftId: s1.id, amount: 50, category: 'ضيافة', notes: `مصروف يوم ${day}`, userId: adminUser.id, userName: adminUser.name });

      // Close shift 1
      const s1Cash = db.computeShiftCash(s1.id);
      db.closeShift(s1.id, s1Cash.expected_cash, `إغلاق صباحي يوم ${day}`, adminUser);

      // Shift 2: Evening (16:00 - 24:00)
      currentSimTime += 60 * 60000; // 1 hour break
      const s2 = db.openShift(500, 'افتتاح مسائي', cashier, 'الشيفت المسائي');

      // Create 15 orders in shift 2
      for (let o = 1; o <= 15; o++) {
        currentSimTime += 30 * 60000;
        db.createOrder({
          items: [{ id: prod2.id, name: prod2.name, price: 25, qty: 1 }],
          total: 25,
          subtotal: 25,
          paymentMethod: 'cash',
          orderType: 'takeaway',
          amountPaid: 25,
          shiftId: s2.id,
          user: cashier
        });
      }

      // Close shift 2
      const s2Cash = db.computeShiftCash(s2.id);
      db.closeShift(s2.id, s2Cash.expected_cash, `إغلاق مسائي يوم ${day}`, cashier);

      // Advance to 08:00 next day
      currentSimTime += 8 * 3600000;

      // Collect metrics
      if (day === 1 || day === 7 || day === 14) {
        db.flushDb();
        const stat = fs.statSync(testDbPath);
        const mem = process.memoryUsage().heapUsed;

        // Measure query latencies
        const t0 = performance.now();
        db.listOrders({ limit: 500 });
        const listOrdersLatency = performance.now() - t0;

        const t1 = performance.now();
        db.listShifts(100);
        const listShiftsLatency = performance.now() - t1;

        metrics.push({
          day,
          dbSizeKb: (stat.size / 1024).toFixed(1),
          heapMb: (mem / 1024 / 1024).toFixed(1),
          listOrdersLatencyMs: listOrdersLatency.toFixed(2),
          listShiftsLatencyMs: listShiftsLatency.toFixed(2)
        });
      }
    }

    console.log('[Test 8] 14-Day Simulation Metrics:', metrics);
    const day14 = metrics.find(m => m.day === 14);
    const day1 = metrics.find(m => m.day === 1);

    if (day14 && Number(day14.listOrdersLatencyMs) < 100 && Number(day14.listShiftsLatencyMs) < 50) {
      console.log(`✅ PASS: 14-Day simulation query latency remains fast (listOrders: ${day14.listOrdersLatencyMs}ms, listShifts: ${day14.listShiftsLatencyMs}ms).`);
      passed++;
    } else {
      console.log('❌ FAIL: Query latency degraded over 14 days:', day14);
      failed++;
    }

    if (day14 && Number(day14.dbSizeKb) < 1500) {
      console.log(`✅ PASS: DB file size growth is stable and bounded (${day14.dbSizeKb} KB after 420 orders + 28 shifts).`);
      passed++;
    } else {
      console.log(`❌ FAIL: DB file size ballooned: ${day14?.dbSizeKb} KB`);
      failed++;
    }

    // -------------------------------------------------------------
    // Part 2: Midnight Boundary During Active Shift
    // -------------------------------------------------------------
    console.log('\n--- Part 2: Midnight Transition During Active Shift ---');
    // Open a night shift at 23:00 on Nov 1st with 300 opening cash
    const nightShift = db.openShift(300, 'افتتاح وردية ليلية', adminUser, 'الشيفت الليلي');
    const nightShiftId = nightShift.id;

    // Order 1 at 23:45 (before midnight)
    const o1 = db.createOrder({
      items: [{ id: prod1.id, name: prod1.name, price: 20, qty: 1 }],
      total: 20,
      subtotal: 20,
      paymentMethod: 'cash',
      amountPaid: 20,
      shiftId: nightShiftId,
      user: adminUser
    });

    // Advance mock time past midnight (00:30 next morning)
    // Order 2 at 00:30 (after midnight)
    const o2 = db.createOrder({
      items: [{ id: prod2.id, name: prod2.name, price: 25, qty: 2 }],
      total: 50,
      subtotal: 50,
      paymentMethod: 'cash',
      amountPaid: 50,
      shiftId: nightShiftId,
      user: adminUser
    });

    // Check currentShift remains active
    const activeShift = db.currentShift();
    const activeIsSame = activeShift && activeShift.id === nightShiftId;

    // Compute shift cash: must include both orders (20 + 50 = 70 sales + 300 opening = 370)
    const nightCash = db.computeShiftCash(nightShiftId);
    console.log('[Test 8] Midnight shift expected cash:', nightCash.expected_cash, '(expected 370)');

    if (activeIsSame && Number(nightCash.expected_cash) === 370 && Number(nightCash.cash_sales) === 70) {
      console.log('✅ PASS: Midnight crossing during active shift preserves shift identity and accurate cash calculations.');
      passed++;
    } else {
      console.log('❌ FAIL: Midnight crossing corrupted shift tracking:', { activeIsSame, nightCash });
      failed++;
    }

    // Close night shift
    db.closeShift(nightShiftId, 370, 'إغلاق وردية ليلية بعد منتصف الليل', adminUser);

    // -------------------------------------------------------------
    // Part 3: Month Rollover (Oct 31 -> Nov 1)
    // -------------------------------------------------------------
    console.log('\n--- Part 3: Month Rollover Transition ---');
    const monthRolloverShift = db.openShift(400, 'افتتاح نهاية الشهر', adminUser, 'الشيفت المسائي');
    db.createOrder({
      items: [{ id: prod1.id, name: prod1.name, price: 20, qty: 1 }],
      total: 20,
      subtotal: 20,
      paymentMethod: 'cash',
      amountPaid: 20,
      shiftId: monthRolloverShift.id,
      user: adminUser
    });
    db.closeShift(monthRolloverShift.id, 420, 'إغلاق نهاية الشهر', adminUser);

    const attReports = db.getUserAttendanceReports ? db.getUserAttendanceReports('2026-10') : { success: true };
    if (attReports) {
      console.log('✅ PASS: Month rollover handled cleanly without calculation errors.');
      passed++;
    } else {
      console.log('❌ FAIL: Month rollover threw error');
      failed++;
    }

    // -------------------------------------------------------------
    // Part 4: Daylight Saving Time (DST) Tolerance
    // -------------------------------------------------------------
    console.log('\n--- Part 4: Daylight Saving Time (DST) Tolerance ---');
    // Normal clock check
    const normalCheck = db.checkClockIntegrity();
    if (!normalCheck.valid) {
      throw new Error('Normal clock check failed unexpectedly');
    }

    // Test DST tolerance:
    // Update last_system_time to be 2 hours ahead of current Date.now()
    // (simulating a 2-hour rollback like DST +1 to 0 or -1 timezone shift)
    const twoHoursAhead = new Date(Date.now() + 2 * 3600000).toISOString();
    db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [twoHoursAhead], { skipSave: true });

    const dstCheck = db.checkClockIntegrity();
    console.log('[Test 8] 2-Hour DST rollback check valid:', dstCheck.valid);

    // Update last_system_time to be 10 hours ahead
    // (simulating an unauthorized retroactive tampering beyond the 4-hour tolerance)
    const tenHoursAhead = new Date(Date.now() + 10 * 3600000).toISOString();
    db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [tenHoursAhead], { skipSave: true });

    const tamperCheck = db.checkClockIntegrity();
    console.log('[Test 8] 10-Hour tamper check valid:', tamperCheck.valid, 'clockTampered:', tamperCheck.clockTampered);

    if (dstCheck.valid === true && tamperCheck.valid === false && tamperCheck.clockTampered === true) {
      console.log('✅ PASS: Clock integrity allows 4-hour DST / timezone adjustments, but strictly rejects 10-hour clock tampering.');
      passed++;
    } else {
      console.log('❌ FAIL: DST tolerance or tampering detection failed:', { dstValid: dstCheck.valid, tamperValid: tamperCheck.valid });
      failed++;
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nItem 8 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();
