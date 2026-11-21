const assert = require('assert');
const initSqlJs = require('sql.js');

async function testFix02() {
  console.log('--- Acceptance Test FIX-02 (A7: Realistic 200,000 Orders Benchmark) ---');
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create schema
  db.run(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      shift_id INTEGER,
      customer_id INTEGER,
      invoice_no TEXT,
      created_at TEXT,
      total REAL,
      status TEXT DEFAULT 'completed'
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      product_id INTEGER,
      name TEXT,
      qty INTEGER,
      unit_price REAL,
      total_price REAL
    );
  `);

  const PERF_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)",
    "CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"
  ];
  for (const sql of PERF_INDEXES) {
    db.run(sql);
  }

  // 1. EXPLAIN QUERY PLAN verification
  const plan = db.exec("EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE order_id IN (1, 2, 3)");
  const planText = plan[0].values.map(row => row.join(' ')).join(' | ');
  console.log('1. Query Plan Details:', planText);

  assert.ok(
    planText.includes('idx_order_items_order_id') || planText.includes('SEARCH'),
    'Query plan MUST use index idx_order_items_order_id and SEARCH'
  );

  // 2. Insert 200,000 orders x 4 items = 800,000 items
  console.log('2. Inserting 200,000 test orders and 800,000 order_items into memory...');
  const tInsert0 = performance.now();
  db.run('BEGIN TRANSACTION;');
  const insertOrder = db.prepare('INSERT INTO orders (id, shift_id, customer_id, invoice_no, created_at, total) VALUES (?, ?, ?, ?, ?, ?)');
  const insertItem = db.prepare('INSERT INTO order_items (id, order_id, product_id, name, qty, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)');

  for (let i = 1; i <= 200000; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    insertOrder.run([i, (i % 200) + 1, (i % 500) + 1, `INV-${i}`, `2026-10-${day}T12:00:00Z`, 100]);
    for (let j = 1; j <= 4; j++) {
      const itmId = (i - 1) * 4 + j;
      insertItem.run([itmId, i, j, `صنف ${j}`, 1, 25, 25]);
    }
  }
  insertOrder.free();
  insertItem.free();
  db.run('COMMIT;');
  const tInsertElapsed = performance.now() - tInsert0;
  console.log(`✓ Inserted 200,000 orders + 800,000 items in ${(tInsertElapsed / 1000).toFixed(2)}s. Memory RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB.`);

  function runBenchmarkSuite() {
    // A) listOrders with date filter (500 orders + 2,000 items chunked by 250)
    const t0 = performance.now();
    const ordRes = db.exec("SELECT id FROM orders WHERE created_at >= '2026-10-25' ORDER BY id DESC LIMIT 500");
    const ordIds = ordRes[0] ? ordRes[0].values.map(v => v[0]) : [];
    let itmCount = 0;
    for (let i = 0; i < ordIds.length; i += 250) {
      const chunk = ordIds.slice(i, i + 250);
      const ph = chunk.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ph})`);
      stmt.bind(chunk);
      while (stmt.step()) { itmCount++; stmt.get(); }
      stmt.free();
    }
    const tListOrders = performance.now() - t0;

    // B) Shift Report (shift_id = 42: 1,000 orders + 4,000 items)
    const t1 = performance.now();
    const sOrdRes = db.exec("SELECT id FROM orders WHERE shift_id = 42");
    const sOrdIds = sOrdRes[0] ? sOrdRes[0].values.map(v => v[0]) : [];
    let sItmCount = 0;
    for (let i = 0; i < sOrdIds.length; i += 250) {
      const chunk = sOrdIds.slice(i, i + 250);
      const ph = chunk.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ph})`);
      stmt.bind(chunk);
      while (stmt.step()) { sItmCount++; stmt.get(); }
      stmt.free();
    }
    const tShiftReport = performance.now() - t1;

    // C) Customer Notebook Debts (customer_id = 75: 400 orders + 1,600 items)
    const t2 = performance.now();
    const cOrdRes = db.exec("SELECT id FROM orders WHERE customer_id = 75");
    const cOrdIds = cOrdRes[0] ? cOrdRes[0].values.map(v => v[0]) : [];
    let cItmCount = 0;
    for (let i = 0; i < cOrdIds.length; i += 250) {
      const chunk = cOrdIds.slice(i, i + 250);
      const ph = chunk.map(() => '?').join(',');
      const stmt = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${ph})`);
      stmt.bind(chunk);
      while (stmt.step()) { cItmCount++; stmt.get(); }
      stmt.free();
    }
    const tNotebook = performance.now() - t2;

    // D) Search single order (invoice_no = 'INV-189420' + 4 items)
    const t3 = performance.now();
    const findOrd = db.exec("SELECT id FROM orders WHERE invoice_no = 'INV-189420'");
    const fId = findOrd[0] ? findOrd[0].values[0][0] : null;
    let fItmCount = 0;
    if (fId) {
      const stmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
      stmt.bind([fId]);
      while (stmt.step()) { fItmCount++; stmt.get(); }
      stmt.free();
    }
    const tSearch = performance.now() - t3;

    return { tListOrders, tShiftReport, tNotebook, tSearch, ordCount: ordIds.length, itmCount, sItmCount, cItmCount, fItmCount };
  }

  // 3. Measure WITH Index
  console.log('\n3. Measuring query execution times WITH INDEX...');
  const withIdx = runBenchmarkSuite();
  console.log(`   - listOrders (500 orders, ${withIdx.itmCount} items): ${withIdx.tListOrders.toFixed(2)} ms`);
  console.log(`   - Shift Report (~1,000 orders, ${withIdx.sItmCount} items): ${withIdx.tShiftReport.toFixed(2)} ms`);
  console.log(`   - Customer Debts (~400 orders, ${withIdx.cItmCount} items): ${withIdx.tNotebook.toFixed(2)} ms`);
  console.log(`   - Order Search by invoice_no: ${withIdx.tSearch.toFixed(2)} ms`);

  // 4. Drop Index and Measure WITHOUT Index (Full Table Scan)
  console.log('\n4. Dropping indexes and measuring WITHOUT INDEX (Full Scan)...');
  db.run("DROP INDEX idx_orders_shift_id;");
  db.run("DROP INDEX idx_orders_created_at;");
  db.run("DROP INDEX idx_order_items_order_id;");

  const withoutIdx = runBenchmarkSuite();
  console.log(`   - listOrders (500 orders, ${withoutIdx.itmCount} items): ${withoutIdx.tListOrders.toFixed(2)} ms`);
  console.log(`   - Shift Report (~1,000 orders, ${withoutIdx.sItmCount} items): ${withoutIdx.tShiftReport.toFixed(2)} ms`);
  console.log(`   - Customer Debts (~400 orders, ${withoutIdx.cItmCount} items): ${withoutIdx.tNotebook.toFixed(2)} ms`);
  console.log(`   - Order Search by invoice_no: ${withoutIdx.tSearch.toFixed(2)} ms`);

  console.log('\n5. Performance Comparison Summary:');
  const speedupList = (withoutIdx.tListOrders / withIdx.tListOrders).toFixed(1);
  const speedupShift = (withoutIdx.tShiftReport / withIdx.tShiftReport).toFixed(1);
  const speedupNotebook = (withoutIdx.tNotebook / withIdx.tNotebook).toFixed(1);
  const speedupSearch = (withoutIdx.tSearch / withIdx.tSearch).toFixed(1);

  console.log(`   - listOrders: ${withIdx.tListOrders.toFixed(2)} ms vs ${withoutIdx.tListOrders.toFixed(2)} ms (${speedupList}x faster with index)`);
  console.log(`   - Shift Report: ${withIdx.tShiftReport.toFixed(2)} ms vs ${withoutIdx.tShiftReport.toFixed(2)} ms (${speedupShift}x faster with index)`);
  console.log(`   - Customer Debts: ${withIdx.tNotebook.toFixed(2)} ms vs ${withoutIdx.tNotebook.toFixed(2)} ms (${speedupNotebook}x faster with index)`);
  console.log(`   - Order Search: ${withIdx.tSearch.toFixed(2)} ms vs ${withoutIdx.tSearch.toFixed(2)} ms (${speedupSearch}x faster with index)`);

  assert.ok(withIdx.tListOrders < withoutIdx.tListOrders, 'listOrders with index must be faster than full table scan');
  assert.ok(withIdx.tShiftReport < withoutIdx.tShiftReport, 'Shift Report with index must be faster than full table scan');

  console.log('\n=== TEST-ACCEPTANCE-FIX-02 (A7) PASSED ===');
  db.close();
}

testFix02().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
