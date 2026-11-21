const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

async function test() {
  console.log('=== VERIFY SCENARIO B & APPEND_ITEMS IMMEDIATE DISK PERSISTENCE ===\n');

  const baseTemp = fs.existsSync('D:/') ? 'D:/cafe-temp' : os.tmpdir();
  const tempDir = fs.mkdtempSync(path.join(baseTemp, 'cafe-test-append-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');

  const db = require('../electron/db');
  await db.init(testDbPath);
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');

  const tables = db.listTables();
  const t1 = tables[0];
  const prod = db.saveProduct({ name: 'شاي تلقيمة', price: 15, stock_qty: 100 });

  // 1. Initial stat of DB file
  db.flushDb();
  const initialStat = fs.statSync(testDbPath);
  const initialMtime = initialStat.mtimeMs;
  console.log(`[Test] Initial DB size: ${initialStat.size} bytes, mtime: ${initialMtime}`);

  // Small delay to ensure mtime tick
  await new Promise(r => setTimeout(r, 50));

  // 2. Call appendItemsToTableCart
  console.log('[Test] Calling appendItemsToTableCart (QR / Waiter order)...');
  const res = db.appendItemsToTableCart(t1.id, [
    { id: prod.id, name: prod.name, price: prod.price, qty: 3 }
  ], { customerName: 'عميل الباركود' });

  assert.strictEqual(res.success, true);
  console.log('[Test] appendItemsToTableCart returned success: true, rev:', res.rev);

  // 3. Check DISK file immediately (WITHOUT calling flushDb!)
  const postStat = fs.statSync(testDbPath);
  const postMtime = postStat.mtimeMs;
  console.log(`[Test] Immediate disk file size: ${postStat.size} bytes, mtime: ${postMtime}`);

  // Did the file change on physical disk immediately?
  const fileChangedImmediately = postMtime > initialMtime || postStat.size !== initialStat.size;
  console.log('[Test] Did disk file update synchronously before returning to caller?', fileChangedImmediately);

  // 4. Verify reading from disk directly via a brand new sql.js connection (simulating crash reboot)
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const diskBuffer = fs.readFileSync(testDbPath);
  const crashDb = new SQL.Database(diskBuffer);
  const cartRow = crashDb.exec(`SELECT cart_data FROM table_carts WHERE table_id = ${t1.id}`);
  const cartJson = JSON.parse(cartRow[0].values[0][0]);

  console.log('[Test] Read directly from physical disk file after crash:', cartJson.cart);
  assert.strictEqual(cartJson.cart.length, 1);
  assert.strictEqual(cartJson.cart[0].qty, 3);
  assert.strictEqual(cartJson.customerName, 'عميل الباركود');
  console.log('✅ PASS: QR / Waiter orders are written synchronously to disk BEFORE replying to client (0ms loss window).');

  // Clean up
  crashDb.close();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
}

test().catch(err => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});

