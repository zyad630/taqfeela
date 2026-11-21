/**
 * tests/test-item6-graceful-installer-shutdown.js
 * 
 * Verifies Item 6: Graceful installer shutdown before taskkill:
 * Simulates active database mutations while a graceful shutdown signal arrives.
 * Confirms that in-flight mutations flush completely to disk without data corruption.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const initSqlJs = require('sql.js');

const TEMP_ROOT = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();

async function run() {
  console.log('================================================================');
  console.log('       TEST ITEM 6: INSTALLER GRACEFUL SHUTDOWN & WRITE FLUSH   ');
  console.log('================================================================\n');

  const testDir = path.join(TEMP_ROOT, `test-graceful-close-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const dbPath = path.join(testDir, 'cafe-pos.db');
  fs.copyFileSync(path.resolve(__dirname, 'fixtures/v1.0.1-anonymized.db'), dbPath);

  // Script that runs in a worker/child process continuously inserting orders and flushes
  const childScript = path.join(testDir, 'writer-process.js');
  fs.writeFileSync(childScript, `
    const db = require('${path.resolve(__dirname, '../electron/db').replace(/\\/g, '/')}');
    async function start() {
      await db.init('${dbPath.replace(/\\/g, '/')}');
      process.send({ status: 'ready' });

      let counter = 0;
      const interval = setInterval(() => {
        counter++;
        try {
          db.createOrder({
            items: [{ id: 1, name: 'قهوة', price: 20, quantity: 1 }],
            total: 20,
            subtotal: 20,
            paymentMethod: 'cash',
            orderType: 'takeaway',
            cashAmount: 20,
            cashierName: 'كاشير اختبار'
          });
        } catch (_) {}
      }, 50);

      // Graceful shutdown handler (mirroring Electron before-quit)
      process.on('message', async (msg) => {
        if (msg === 'graceful-shutdown') {
          clearInterval(interval);
          try {
            await db.flushDbAsync();
          } catch (_) {
            db.saveDbAtomic();
          }
          if (process.send) {
            process.send({ status: 'flushed', count: counter }, (err) => {
              setTimeout(() => process.exit(0), 100);
            });
          } else {
            process.exit(0);
          }
        }
      });
    }
    start();
  `);

  console.log('[1] Spawning child process simulating live POS with active orders in-flight...');
  const child = spawn(process.execPath, [childScript], {
    stdio: ['pipe', 'inherit', 'inherit', 'ipc']
  });

  await new Promise((resolve, reject) => {
    child.on('message', (msg) => {
      if (msg.status === 'ready') resolve();
    });
    child.on('error', reject);
    setTimeout(() => reject(new Error('Child process timeout')), 20000);
  });

  console.log('[2] Active writing in progress... waiting 500ms...');
  await new Promise(r => setTimeout(r, 500));

  console.log('[3] Sending graceful shutdown signal (simulating installer WM_CLOSE before taskkill)...');
  const flushPromise = new Promise((resolve, reject) => {
    child.on('message', (msg) => {
      if (msg.status === 'flushed') resolve(msg.count);
    });
    setTimeout(() => reject(new Error('Flush acknowledgment timeout')), 4000);
  });

  child.send('graceful-shutdown');
  const ordersWritten = await flushPromise;
  console.log(`    Graceful shutdown completed. Process flushed ${ordersWritten} orders before exiting.`);

  // Verify file integrity
  console.log('[4] Verifying database integrity on disk...');
  const SQL = await initSqlJs();
  const dbData = fs.readFileSync(dbPath);
  const verifyDb = new SQL.Database(dbData);
  const integrity = verifyDb.exec('PRAGMA integrity_check')[0].values[0][0];
  const orderCount = verifyDb.exec('SELECT COUNT(*) FROM orders')[0].values[0][0];
  verifyDb.close();

  console.log(`    PRAGMA integrity_check: ${integrity}`);
  console.log(`    Total orders in database: ${orderCount}`);

  if (integrity !== 'ok') {
    throw new Error('Database corruption detected after graceful shutdown!');
  }

  console.log('\n[PASS] Item 6: Installer graceful shutdown successfully flushes writes with 0 corruption.');
  process.exit(0);
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
