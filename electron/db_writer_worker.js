'use strict';

const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

if (!parentPort) {
  throw new Error('db_writer_worker must be spawned as a Worker Thread.');
}

parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  const { id, buffer, dbPath, tmpPath } = msg;
  const t0 = performance.now();
  let writeTimeMs = 0;
  let fsyncTimeMs = 0;
  let renameTimeMs = 0;

  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert transferred Uint8Array/ArrayBuffer to a Node Buffer without copying if possible
    let nodeBuf;
    if (Buffer.isBuffer(buffer)) {
      nodeBuf = buffer;
    } else if (buffer instanceof Uint8Array) {
      nodeBuf = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else if (buffer instanceof ArrayBuffer) {
      nodeBuf = Buffer.from(buffer);
    } else {
      throw new Error('Unsupported buffer type passed to db_writer_worker');
    }

    // Stage 1: write to tmp file
    const tWriteStart = performance.now();
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeSync(fd, nodeBuf, 0, nodeBuf.length, 0);
      writeTimeMs = performance.now() - tWriteStart;

      // Stage 2: fsync to physical storage
      const tFsyncStart = performance.now();
      fs.fsyncSync(fd);
      fsyncTimeMs = performance.now() - tFsyncStart;
    } finally {
      fs.closeSync(fd);
    }

    // Stage 3: Atomic rename with Windows EBUSY retry loop
    const tRenameStart = performance.now();
    let saved = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tmpPath, dbPath);
        saved = true;
        break;
      } catch (err) {
        if (attempt === 4) {
          // Fallback: copyFileSync + unlinkSync
          try {
            fs.copyFileSync(tmpPath, dbPath);
            fs.unlinkSync(tmpPath);
            saved = true;
          } catch (copyErr) {
            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
            throw copyErr;
          }
        } else {
          // Atomics sleep 30ms without spinning CPU
          try {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
          } catch (_) {
            const start = Date.now();
            while (Date.now() - start < 30) {}
          }
        }
      }
    }

    renameTimeMs = performance.now() - tRenameStart;
    const totalWorkerMs = performance.now() - t0;

    let diskMtime = 0;
    let diskSize = 0;
    try {
      const st = fs.statSync(dbPath);
      diskMtime = st.mtimeMs;
      diskSize = st.size;
    } catch (_) {}

    parentPort.postMessage({
      id,
      success: true,
      writeTimeMs,
      fsyncTimeMs,
      renameTimeMs,
      totalWorkerMs,
      diskMtime,
      diskSize
    });
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {}

    parentPort.postMessage({
      id,
      success: false,
      error: err.message || String(err)
    });
  }
});
