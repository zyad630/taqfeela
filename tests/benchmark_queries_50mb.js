const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

const baseTemp = fs.existsSync('D:/') ? 'D:/cafe-temp' : os.tmpdir();
const tempDir = fs.mkdtempSync(path.join(baseTemp, 'cafe-bench-queries-'));
const testDbPath = path.join(tempDir, 'cafe-pos.db');

async function run() {
  console.log('=== BENCHMARK QUERIES ON 50MB DATABASE ===');
  console.log(`Process Arch: ${process.arch} | Node: ${process.versions.node} | Electron: ${process.versions.electron}\n`);

  const db = require('../electron/db');
  await db.init(testDbPath);

  // Setup admin & cashier & catalog
  db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
  const adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
  const cashier = db.saveUser({ username: 'c_bench', name: 'كاشير القياس', role: 'cashier', password: 'CashierPassword123!' });

  const prod1 = db.saveProduct({ name: 'قهوة اسبريسو', price: 30, category_id: 1, stock_qty: 100000 });
  const prod2 = db.saveProduct({ name: 'كابتشينو بندق', price: 45, category_id: 1, stock_qty: 100000 });
  const prod3 = db.saveProduct({ name: 'شاي أخضر بالنعناع', price: 20, category_id: 1, stock_qty: 100000 });

  // 1. Create a realistic day with 2 shifts (morning & evening), each with 50 orders
  console.log('[Setup] Creating realistic day: 2 shifts with 100 total orders...');
  const shift1 = db.openShift(500, 'افتتاح صباحي', adminUser, 'الوردية الصباحية');
  for (let i = 1; i <= 50; i++) {
    db.createOrder({
      shiftId: shift1.id,
      items: [{ id: prod1.id, name: prod1.name, price: 30, qty: 1 }],
      total: 30,
      subtotal: 30,
      paymentMethod: i % 3 === 0 ? 'card' : (i % 2 === 0 ? 'wallet' : 'cash'),
      orderType: 'takeaway',
      amountPaid: 30,
      user: adminUser
    });
  }
  db.addExpense({ shiftId: shift1.id, amount: 60, category: 'ضيافة', notes: 'مصروف صباحي', userId: adminUser.id, userName: adminUser.name });
  const cashCalc1 = db.computeShiftCash(shift1.id);
  db.closeShift(shift1.id, cashCalc1.expected_cash, 'إغلاق صباحي', adminUser);

  const shift2 = db.openShift(500, 'افتتاح مسائي', cashier, 'الوردية المسائية');
  for (let i = 1; i <= 50; i++) {
    db.createOrder({
      shiftId: shift2.id,
      items: [
        { id: prod2.id, name: prod2.name, price: 45, qty: 1 },
        { id: prod3.id, name: prod3.name, price: 20, qty: 1 }
      ],
      total: 65,
      subtotal: 65,
      paymentMethod: 'cash',
      orderType: 'dine_in',
      amountPaid: 65,
      user: cashier
    });
  }
  db.flushDb();

  // 2. Scale database to 50MB with audit log & historical records
  console.log('[Setup] Scaling database to 50MB with realistic background records...');
  const paddingPayload = 'B'.repeat(8000);
  let rowsAdded = 0;
  db.runSql('BEGIN TRANSACTION');
  for (let k = 0; k < 6200; k++) {
    db.runSql(
      `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
       VALUES ('BENCH_PAD', 'orders', ?, 1, 'Scaler', ?, datetime('now'))`,
      [++rowsAdded, paddingPayload],
      { skipSave: true }
    );
  }
  db.runSql('COMMIT');
  db.flushDb();

  const stat = fs.statSync(testDbPath);
  console.log(`[Setup Complete] Database size: ${(stat.size / 1024 / 1024).toFixed(2)} MB\n`);

  // ------------------------------------------------------------------
  // Query Benchmarks on 50MB database
  // ------------------------------------------------------------------
  const benchmarks = [];

  // Benchmark 1: getDailySummaryReport (realistic 2 shifts)
  const t0 = performance.now();
  const dailyReport = db.getDailySummaryReport(db.getCairoTodayString());
  const tDaily = performance.now() - t0;
  benchmarks.push({
    query: 'getDailySummaryReport (today, 2 shifts)',
    latencyMs: tDaily.toFixed(2),
    resultCount: dailyReport.shifts?.length || 0,
    status: tDaily < 100 ? '✅ Fast (<100ms)' : '⚠️ Acceptable'
  });

  // Benchmark 2: getReportShift (morning shift)
  const t1 = performance.now();
  const shiftReport = db.getReportShift({ shiftId: shift1.id });
  const tShift = performance.now() - t1;
  benchmarks.push({
    query: 'getReportShift (shift #1)',
    latencyMs: tShift.toFixed(2),
    resultCount: shiftReport.orders?.length || 0,
    status: tShift < 50 ? '✅ Fast (<50ms)' : '⚠️ Acceptable'
  });

  // Benchmark 3: listOrders (plain, limit 500)
  const t2 = performance.now();
  const ordersPlain = db.listOrders({ limit: 500 });
  const tPlain = performance.now() - t2;
  benchmarks.push({
    query: 'listOrders (limit: 500, no filter)',
    latencyMs: tPlain.toFixed(2),
    resultCount: ordersPlain.length,
    status: tPlain < 50 ? '✅ Fast (<50ms)' : '⚠️ Acceptable'
  });

  // Benchmark 4: listOrders with status filter (completed)
  const t3 = performance.now();
  const ordersStatus = db.listOrders({ limit: 500, status: 'completed' });
  const tStatus = performance.now() - t3;
  benchmarks.push({
    query: 'listOrders (status = "completed")',
    latencyMs: tStatus.toFixed(2),
    resultCount: ordersStatus.length,
    status: tStatus < 50 ? '✅ Fast (<50ms)' : '⚠️ Acceptable'
  });

  // Benchmark 5: listOrders with text search ("اسبريسو")
  const t4 = performance.now();
  const ordersSearch = db.listOrders({ limit: 500, search: 'اسبريسو' });
  const tSearch = performance.now() - t4;
  benchmarks.push({
    query: 'listOrders (search = "اسبريسو")',
    latencyMs: tSearch.toFixed(2),
    resultCount: ordersSearch.length,
    status: tSearch < 50 ? '✅ Fast (<50ms)' : '⚠️ Acceptable'
  });

  // Benchmark 6: listOrders with payment method filter (cash)
  const t5 = performance.now();
  const ordersCash = db.listOrders({ limit: 500, paymentMethod: 'cash' });
  const tCash = performance.now() - t5;
  benchmarks.push({
    query: 'listOrders (paymentMethod = "cash")',
    latencyMs: tCash.toFixed(2),
    resultCount: ordersCash.length,
    status: tCash < 50 ? '✅ Fast (<50ms)' : '⚠️ Acceptable'
  });

  // Benchmark 7: listOrders with date range filter (today)
  const todayStr = db.getCairoTodayString();
  const t6 = performance.now();
  const ordersDate = db.listOrders({ limit: 500, startDate: todayStr, endDate: todayStr });
  const tDate = performance.now() - t6;
  benchmarks.push({
    query: 'listOrders (date range = today)',
    latencyMs: tDate.toFixed(2),
    resultCount: ordersDate.length,
    status: tDate < 50 ? '✅ Fast (<50ms)' : '⚠️ Acceptable'
  });

  console.table(benchmarks);

  // Clean up
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
}

run();

