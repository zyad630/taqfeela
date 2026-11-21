const fs = require('fs');
const path = require('path');
const os = require('os');
const { performance } = require('perf_hooks');

// Use D:/cafe-temp if available for abundant disk space
const baseTemp = fs.existsSync('D:/') ? 'D:/cafe-temp' : os.tmpdir();
if (!fs.existsSync(baseTemp)) {
  try { fs.mkdirSync(baseTemp, { recursive: true }); } catch (_) {}
}

const tempDir = fs.mkdtempSync(path.join(baseTemp, 'cafe-bench-savedb-'));
const testDbPath = path.join(tempDir, 'cafe-pos.db');

async function run() {
  console.log(`========================================================================`);
  console.log(` BENCHMARK saveDbAtomic (10MB / 50MB / 100MB) — Detailed Stage Profiling `);
  console.log(` Architecture: ${process.arch} | Node: ${process.versions.node} | Electron: ${process.versions.electron}`);
  console.log(`========================================================================\n`);

  const db = require('../electron/db');
  await db.init(testDbPath);

  // Setup admin & cashier & product
  db.setupInitialAdmin('AdminPass123!@#', 'مدير النظام');
  const adminUser = db.queryGet('SELECT id, name FROM users WHERE role = "admin" LIMIT 1');
  const prod = db.saveProduct({ name: 'قهوة اسبريسو ممتازة', price: 35, category_id: 1, stock_qty: 1000000 });
  const shift = db.openShift(1000, 'افتتاح وردية القياس', adminUser, 'وردية القياس');

  // Helper to measure atomic save stages with genuine data change
  function measureAtomicSaveDetailed(label, targetBytes) {
    console.log(`--- [Scale Target: ${label}] Growing database to target size... ---`);

    // Add padding rows if targetBytes > current size
    let stat = fs.statSync(testDbPath);
    let rowsAdded = 0;
    const paddingPayload = 'A'.repeat(8000); // 8KB per row

    if (stat.size < targetBytes) {
      db.runSql('BEGIN TRANSACTION');
      while (stat.size < targetBytes) {
        for (let k = 0; k < 400; k++) {
          db.runSql(
            `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
             VALUES ('SCALE_PAD', 'orders', ?, 1, 'Scaler', ?, datetime('now'))`,
            [++rowsAdded, paddingPayload],
            { skipSave: true }
          );
        }
        db.runSql('COMMIT');
        db.flushDb();
        db.runSql('BEGIN TRANSACTION');
        stat = fs.statSync(testDbPath);
      }
      db.runSql('COMMIT');
      db.flushDb();
    }

    stat = fs.statSync(testDbPath);
    const dbSizeMB = (stat.size / 1024 / 1024).toFixed(2);
    console.log(`[${label}] Base DB file size: ${dbSizeMB} MB`);

    // 1. GENUINELY CHANGE DATA by adding a real order
    const orderBeforeMem = process.memoryUsage();
    const orderRes = db.createOrder({
      shiftId: shift.id,
      items: [{ id: prod.id, name: prod.name, price: prod.price, qty: 2 }],
      total: 70,
      subtotal: 70,
      paymentMethod: 'cash',
      orderType: 'takeaway',
      amountPaid: 70,
      user: adminUser
    });

    if (!orderRes || !orderRes.id) {
      throw new Error(`Failed to create order at size ${label}`);
    }

    // At this point, db is dirty with genuine unsaved data!
    console.log(`[${label}] Created genuine Order #${orderRes.invoiceNo} (id: ${orderRes.id}) — DB is dirty.`);

    // 2. Measure stages of saveDbAtomic manually with high-resolution timers
    const memBeforeSave = process.memoryUsage();

    // Stage 1: Export (safeDbExport -> db.export() + foreign keys re-apply)
    const t0 = performance.now();
    const exportedData = db.safeDbExport();
    const t1 = performance.now();
    const exportTimeMs = t1 - t0;

    // Buffer preparation
    const buffer = Buffer.from(exportedData);
    const tmpPath = `${testDbPath}.bench-${Date.now()}`;

    // Stage 2: Write (fs.openSync + fs.writeSync)
    const fd = fs.openSync(tmpPath, 'w');
    const tWriteStart = performance.now();
    fs.writeSync(fd, buffer, 0, buffer.length, 0);
    const tWriteEnd = performance.now();
    const writeTimeMs = tWriteEnd - tWriteStart;

    // Stage 3: Fsync (fs.fsyncSync flush OS kernel cache to physical disk)
    const tFsyncStart = performance.now();
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    const tFsyncEnd = performance.now();
    const fsyncTimeMs = tFsyncEnd - tFsyncStart;

    // Stage 4: Atomic Rename (fs.renameSync replace target file)
    const tRenameStart = performance.now();
    fs.renameSync(tmpPath, testDbPath);
    const tRenameEnd = performance.now();
    const renameTimeMs = tRenameEnd - tRenameStart;

    const totalSaveMs = tRenameEnd - t0;
    const memAfterSave = process.memoryUsage();

    // Reset dirty flag
    db.flushDb();

    const result = {
      label,
      actualDbSizeMB: (fs.statSync(testDbPath).size / 1024 / 1024).toFixed(2),
      exportTimeMs: exportTimeMs.toFixed(2),
      writeTimeMs: writeTimeMs.toFixed(2),
      fsyncTimeMs: fsyncTimeMs.toFixed(2),
      renameTimeMs: renameTimeMs.toFixed(2),
      totalSaveMs: totalSaveMs.toFixed(2),
      rssMB: (memAfterSave.rss / 1024 / 1024).toFixed(2),
      heapUsedMB: (memAfterSave.heapUsed / 1024 / 1024).toFixed(2),
      wasmExportSizeMB: (exportedData.byteLength / 1024 / 1024).toFixed(2)
    };

    console.log(`[${label} Results]: Total: ${result.totalSaveMs}ms (Export: ${result.exportTimeMs}ms, Write: ${result.writeTimeMs}ms, Fsync: ${result.fsyncTimeMs}ms, Rename: ${result.renameTimeMs}ms) | RSS: ${result.rssMB}MB | Heap: ${result.heapUsedMB}MB\n`);
    return result;
  }

  const results = [];

  try {
    // 10 MB
    results.push(measureAtomicSaveDetailed('10MB', 10 * 1024 * 1024));

    // 50 MB
    results.push(measureAtomicSaveDetailed('50MB', 50 * 1024 * 1024));

    // 100 MB
    results.push(measureAtomicSaveDetailed('100MB', 100 * 1024 * 1024));

    console.log(`================ FINAL SUMMARY TABLE (${process.arch}) ================`);
    console.table(results);

    // Integrity check
    const integrity = db.queryGet('PRAGMA integrity_check');
    console.log(`SQLite Integrity Check (${process.arch}):`, integrity);

  } catch (err) {
    console.error(`❌ Benchmark failed on ${process.arch}:`, err.message);
    if (err.message && err.message.includes('out of memory')) {
      console.error(`[WASM CRITICAL] WebAssembly linear memory growth failed on ${process.arch}!`);
    }
    process.exit(1);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run();

