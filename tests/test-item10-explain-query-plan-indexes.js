const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  console.log('=== TEST ITEM 10: Index Verification via EXPLAIN QUERY PLAN ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-test-item10-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  let passed = 0;
  let failed = 0;

  try {
    const db = require('../electron/db');
    await db.init(testDbPath);
    console.log('[Test 10] DB initialized.');

    // Queries that must use an index (no SCAN TABLE)
    const indexChecks = [
      {
        name: 'order_refunds by order_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM order_refunds WHERE order_id = 1',
        table: 'order_refunds'
      },
      {
        name: 'order_refunds by shift_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM order_refunds WHERE shift_id = 1',
        table: 'order_refunds'
      },
      {
        name: 'debt_payments by debt_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM debt_payments WHERE debt_id = 1',
        table: 'debt_payments'
      },
      {
        name: 'customer_debts by order_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM customer_debts WHERE order_id = 1',
        table: 'customer_debts'
      },
      {
        name: 'customer_debts by customer_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM customer_debts WHERE customer_id = 1',
        table: 'customer_debts'
      },
      {
        name: 'orders by shift_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM orders WHERE shift_id = 1',
        table: 'orders'
      },
      {
        name: 'orders by user_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM orders WHERE user_id = 1',
        table: 'orders'
      },
      {
        name: 'shifts by user_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM shifts WHERE user_id = 1',
        table: 'shifts'
      },
      {
        name: 'order_items by order_id',
        query: 'EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE order_id = 1',
        table: 'order_items'
      }
    ];

    for (const check of indexChecks) {
      const planRows = db.queryAll(check.query);
      const planDetail = planRows.map(r => r.detail || JSON.stringify(r)).join('; ');
      console.log(`[EXPLAIN] ${check.name} -> ${planDetail}`);

      const usesIndex = planDetail.includes('USING INDEX') || planDetail.includes('USING COVERING INDEX');
      const isScan = planDetail.includes(`SCAN ${check.table}`) || planDetail.includes(`SCAN TABLE ${check.table}`);

      if (usesIndex && !isScan) {
        console.log(`  ✅ PASS: ${check.name} uses index.`);
        passed++;
      } else {
        console.log(`  ❌ FAIL: ${check.name} does NOT use index (SCAN detected: ${planDetail})`);
        failed++;
      }
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nItem 10 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();

