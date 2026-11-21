/**
 * Test Item 1 (a): 200 SIGKILL Crash Iterations During Async Worker Thread Saves
 * Verifies PRAGMA integrity_check and accounting invariants after every kill.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const initSqlJs = require('sql.js');

async function checkDbIntegrityAndInvariants(SQL, dbPath) {
  if (!fs.existsSync(dbPath)) return { ok: false, error: 'Database file missing' };
  const buffer = fs.readFileSync(dbPath);
  if (buffer.length === 0) return { ok: false, error: 'Database file is 0 bytes' };

  let db;
  try {
    db = new SQL.Database(buffer);
  } catch (err) {
    return { ok: false, error: 'SQLite failed to open DB: ' + err.message };
  }

  try {
    // 1. PRAGMA integrity_check
    const integrityRes = db.exec('PRAGMA integrity_check;');
    const integrityValue = integrityRes[0]?.values[0]?.[0];
    if (integrityValue !== 'ok') {
      return { ok: false, error: `PRAGMA integrity_check returned: ${integrityValue}` };
    }

    // 2. Business Invariants on existing orders
    const ordersRes = db.exec('SELECT id, total, subtotal, discount, tax FROM orders;');
    if (ordersRes.length > 0 && ordersRes[0].values.length > 0) {
      const orderRows = ordersRes[0].values;
      for (const row of orderRows) {
        const [id, total, subtotal, discount, tax] = row;
        const expectedTotal = Math.round(((Number(subtotal) || 0) - (Number(discount) || 0) + (Number(tax) || 0)) * 100) / 100;
        if (Math.abs(Number(total) - expectedTotal) > 0.05) {
          return { ok: false, error: `Order #${id} invariant violation: total (${total}) != subtotal - discount + tax (${expectedTotal})` };
        }
      }

      // Check item sum matches subtotal for all orders
      const itemsSumRes = db.exec(`
        SELECT o.id, o.subtotal, COALESCE(SUM(oi.total_price), 0) AS items_sum
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id;
      `);
      if (itemsSumRes.length > 0) {
        for (const row of itemsSumRes[0].values) {
          const [id, subtotal, itemsSum] = row;
          if (Math.abs(Number(subtotal) - Number(itemsSum)) > 0.05) {
            return { ok: false, error: `Order #${id} items sum violation: subtotal (${subtotal}) != items sum (${itemsSum})` };
          }
        }
      }
    }

    return { ok: true };
  } finally {
    try { db.close(); } catch (_) {}
  }
}

async function run() {
  console.log('=== TEST ITEM 1 (a): 200 SIGKILL Crash Iterations During Async Worker Thread Saves ===\n');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-worker-sigkill-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  const SQL = await initSqlJs();
  const TOTAL_KILLS = 200;
  let passedKills = 0;
  let failedKills = 0;
  let failureDetails = null;

  console.log(`Starting ${TOTAL_KILLS} random SIGKILL cycles during Worker Thread execution...`);
  const startTime = Date.now();

  // Create baseline database first
  const dbModule = require('../electron/db');
  await dbModule.init(testDbPath);
  let adminUser = dbModule.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
  if (!adminUser) {
    dbModule.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
    adminUser = dbModule.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
  }
  dbModule.openShift(adminUser.id, 'الشيفت الصباحي', 500);
  dbModule.saveProduct({ name: 'شاي أحمر', price: 15, category_id: 1, stock_qty: 10000 });
  await dbModule.saveDbAtomicAsync();
  console.log('[Worker SIGKILL] Baseline database initialized on disk at:', testDbPath);

  for (let cycle = 1; cycle <= TOTAL_KILLS; cycle++) {
    const workerScript = path.resolve(__dirname, 'helpers/crash-worker-thread.js');
    const child = fork(workerScript, [testDbPath], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { ...process.env, CAFE_USER_DATA: tempDir, CAFE_TEST_AUTOMATION: '1', CAFE_QUICK_INIT: '1' }
    });

    await new Promise((resolve) => {
      let killed = false;
      function killWorker() {
        if (!killed) {
          killed = true;
          try { child.kill('SIGKILL'); } catch (_) {}
          resolve();
        }
      }

      child.once('message', (msg) => {
        if (msg === 'READY') {
          // Jitter delay between 1ms and 45ms to catch active worker postMessage, write, fsync, or rename
          const jitterMs = Math.floor(Math.random() * 45) + 1;
          setTimeout(killWorker, jitterMs);
        }
      });

      child.once('exit', () => {
        if (!killed) {
          killed = true;
          resolve();
        }
      });

      // Safety timeout in case child hangs
      setTimeout(killWorker, 1500);
    });

    // Verify DB integrity and invariants immediately after kill
    const check = await checkDbIntegrityAndInvariants(SQL, testDbPath);
    if (check.ok) {
      passedKills++;
    } else {
      failedKills++;
      failureDetails = `Cycle ${cycle}: ${check.error}`;
      console.error(`❌ SIGKILL Corruption detected on cycle ${cycle}: ${check.error}`);
      break;
    }

    if (cycle % 25 === 0 || cycle === TOTAL_KILLS) {
      console.log(`[Worker SIGKILL] Completed ${cycle}/${TOTAL_KILLS} cycles. Clean integrity: ${passedKills}/${cycle}`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n--- Completed 200 SIGKILL Worker Cycles in ${durationSec}s ---`);
  console.log(`Passed Integrity & Invariants: ${passedKills}/${TOTAL_KILLS}`);

  // Cleanup
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  if (failedKills > 0) {
    console.log(`❌ FAIL: Corruption or invariant failure: ${failureDetails}`);
    process.exit(1);
  } else {
    console.log('✅ PASS: All 200 SIGKILL Worker crash iterations survived with 100% database integrity and invariant consistency.');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal crash test error:', err);
  process.exit(1);
});
