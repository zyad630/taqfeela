/**
 * ==============================================================================================
 * ⚠️ تحذير قانوني وإشعار حماية ملكية فكرية صارم | STRICT PROPRIETARY & CRIMINAL LIABILITY NOTICE
 * ==============================================================================================
 * (AR) هذا المصنف البرمجي وكافة ملفاته وشيفرته المصدرية وقواعد بياناته ومخرجاته هي ملكية فكرية
 * حصرية ومحمية بموجب القوانين والاتفاقيات الدولية لحماية الملكية الفكرية، وقوانين مكافحة
 * جرائم تقنية المعلومات (بما في ذلك القانون رقم 175 لسنة 2018 والقوانين الدولية ذات الصلة).
 * 
 * يُحظر حظراً باتاً ويعاقب عليه القانون جنائياً ومدنياً:
 * 1. فك تشفير هذا البرنامج، أو محاولة تفكيكه أو إجراء أي هندسة عكسية (Decompilation / Reverse Engineering).
 * 2. نسخ أو استخراج أو تغذية أو معالجة أي جزء من هذا الكود لأي أداة أو بيئة من بيئات الذكاء
 *    الاصطناعي (مثل ChatGPT, Claude, Antigravity, Codex, Cursor, Copilot أو أي نماذج LLM/AI).
 * 3. التعديل على أي ملف أو كسر أو تجاوز منظومة التراخيص والحماية الرقمية.
 * 
 * تنبيه دفاعي تلقائي (Fail-Closed Anti-Tamper):
 * تم تزويد البرنامج بنظام كشف التلاعب الرقمي. أي محاولة لتعديل أو فك أو العبث بالملفات
 * تؤدي فوراً وبشكل تلقائي إلى:
 * - إبطال الترخيص ومسح كود التفعيل الرقمي فوراً.
 * - تفعيل القفل الأمني التام (Permanent Security Lockdown) ومنع تشغيل البرنامج نهائياً.
 * - اتخاذ الإجراءات القانونية والمطالبة الجنائية والمدنية بالتعويضات عن انتهاك الملكية الفكرية.
 * 
 * (EN) STRICT PROPRIETARY NOTICE:
 * This software, compiled assets, and associated bytecode are strictly proprietary.
 * Any reverse engineering, decompilation, code extraction, or automated processing via AI models
 * or intelligent IDEs constitutes a direct criminal violation of intellectual property laws.
 * Tampering triggers immediate fail-closed permanent lockout and cryptographic license revocation.
 * ==============================================================================================
 */
// Respect host OS timezone by default for worldwide deployments (configurable via settings.timezone_mode)

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');
const { app } = require('electron');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const finance = require('./finance');
const dbHealth = require('./db/health');
const dbLicensing = require('./db/licensing');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const MIN_PASSWORD_LENGTH = 6;
let realSecurity = null;
function getRealSecurity() {
  if (!realSecurity) {
    realSecurity = require('./security');
  }
  return realSecurity;
}

const isPackagedElectron = Boolean(app && app.isPackaged);
const security = (!isPackagedElectron && process.env.CAFE_TEST_AUTOMATION === '1')
  ? {
      verifyAppIntegrity: () => ({ valid: true }),
      protectBrowserWindow: () => {},
      isTamperLocked: () => false,
      getTamperInfo: () => null,
      unlockTamperState: (machineId, key) => getRealSecurity().unlockTamperState(machineId, key),
      getLockFilePath: () => ''
    }
  : getRealSecurity();

let db;
let dbPath;
let recoveryInfo = null;
let SQLInstance;
let saveDebounceTimer = null;
let transactionDepth = 0;

// Single source of truth for Ed25519 public key (supports Dual-Key Rotation in ./db/licensing.js)
const PUBLIC_KEY_PEM = dbLicensing.PUBLIC_KEY_PEM;

// Phase 3: Centralized QR Token Generation (32 bytes entropy, URL-safe base64url)
function generateQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// ---- Atomic Save & DB Persistence ----
function safeDbExport() {
  if (!db) return null;
  const data = db.export();
  // P1-FIX-15 (ARCH-06): sql.js export() closes and reopens in-memory connection,
  // silently resetting PRAGMA foreign_keys to 0 (OFF). We immediately re-enable it.
  try {
    db.run('PRAGMA foreign_keys = ON;');
    db.run('PRAGMA cache_size = -10000;');
    db.run('PRAGMA temp_store = MEMORY;');
  } catch (err) {
    console.warn('[DB] Failed to restore PRAGMA configuration after export():', err);
  }
  return data;
}

let lastKnownDbMtime = 0;
let lastKnownDbSize = 0;
let lastExternalConflict = null;
let atomicSaveCount = 0;
let dbOfflineTamperInfo = null;

function getDbSealPath() {
  if (!dbPath) return null;
  return path.join(path.dirname(dbPath), '.db_seal');
}

function getDeviceIntegrityKey(purpose = 'general') {
  const machineId = typeof getMachineId === 'function' ? getMachineId() : 'UNKNOWN-MACHINE';
  let licMaterial = '';
  try {
    const baseDir = typeof getBaseDir === 'function' ? getBaseDir() : (dbPath ? path.dirname(dbPath) : null);
    if (baseDir) {
      const licFile = path.join(baseDir, '.license');
      if (fs.existsSync(licFile)) {
        licMaterial = fs.readFileSync(licFile, 'utf8').trim();
      }
    }
    if (!licMaterial && db) {
      const res = db.exec("SELECT value FROM settings WHERE key = 'license_key' LIMIT 1");
      if (res && res[0] && res[0].values && res[0].values[0]) {
        licMaterial = String(res[0].values[0][0] || '').trim();
      }
    }
  } catch (_) {}
  const pubFingerprint = crypto.createHash('sha256').update(String(PUBLIC_KEY_PEM || '')).digest('hex').slice(0, 16);
  return crypto
    .createHmac('sha256', `${machineId}|${pubFingerprint}|${purpose}`)
    .update(licMaterial || 'UNLICENSED_DEVICE_BINDING')
    .digest('hex');
}

function computeDbIntegritySeal(targetDb = db) {
  if (!targetDb) return null;
  const key = getDeviceIntegrityKey('db-table-seal-v1');
  const h = crypto.createHmac('sha256', key);
  const queries = [
    ['users', 'SELECT id, COALESCE(username,""), COALESCE(password,""), COALESCE(pin,""), COALESCE(role,"") FROM users ORDER BY id ASC'],
    ['orders', 'SELECT id, COALESCE(total,0), COALESCE(discount,0), COALESCE(payment_method,""), COALESCE(status,""), COALESCE(shift_id,0), COALESCE(created_at,"") FROM orders ORDER BY id ASC'],
    ['customer_debts', 'SELECT id, COALESCE(customer_name,""), COALESCE(amount,0), COALESCE(paid_amount,0), COALESCE(status,""), COALESCE(order_id,0) FROM customer_debts ORDER BY id ASC'],
    ['settings_sec', "SELECT key, COALESCE(value,'') FROM settings WHERE key IN ('last_system_time','tamper_locked','license_key','pin_lockout_state','waiter_server_token','enforce_daily_qr') ORDER BY key ASC"]
  ];
  for (const [label, sql] of queries) {
    h.update(`|TABLE:${label}|`);
    try {
      const res = targetDb.exec(sql);
      if (res && res[0] && res[0].values) {
        for (const row of res[0].values) {
          h.update(JSON.stringify(row));
          h.update('\n');
        }
      }
    } catch (_) {
      // Table may not exist yet in very old legacy DB before migration
      h.update('MISSING');
    }
  }
  return h.digest('hex');
}

function updateDbIntegritySeal() {
  if (!db || !dbPath) return;
  // Never overwrite seal if offline tampering was already detected!
  if (dbOfflineTamperInfo && dbOfflineTamperInfo.tampered) return;
  try {
    const seal = computeDbIntegritySeal(db);
    if (!seal) return;
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('_db_integrity_seal_v1', ?)", [seal]);
    let lastSystemTime = '';
    try {
      const r = db.exec("SELECT value FROM settings WHERE key = 'last_system_time' LIMIT 1");
      if (r && r[0] && r[0].values && r[0].values[0]) {
        lastSystemTime = String(r[0].values[0][0] || '');
      }
    } catch (_) {}
    const sealPath = getDbSealPath();
    if (sealPath) {
      const payload = JSON.stringify({
        v: 1,
        seal,
        lastSystemTime,
        updatedAt: new Date().toISOString()
      });
      fs.writeFileSync(sealPath, payload, 'utf8');
    }
  } catch (err) {
    console.warn('[DB Integrity] Seal update warning:', err?.message || err);
  }
}

function verifyDbIntegrityOnStartup(loadedDb) {
  dbOfflineTamperInfo = null;
  if (!loadedDb) return { valid: true };
  try {
    let storedSeal = null;
    let dbLastSystemTime = '';
    try {
      const r1 = loadedDb.exec("SELECT value FROM settings WHERE key = '_db_integrity_seal_v1' LIMIT 1");
      if (r1 && r1[0] && r1[0].values && r1[0].values[0]) {
        storedSeal = String(r1[0].values[0][0] || '').trim();
      }
      const r2 = loadedDb.exec("SELECT value FROM settings WHERE key = 'last_system_time' LIMIT 1");
      if (r2 && r2[0] && r2[0].values && r2[0].values[0]) {
        dbLastSystemTime = String(r2[0].values[0][0] || '').trim();
      }
    } catch (_) {}

    let sidecar = null;
    const sealPath = getDbSealPath();
    if (sealPath && fs.existsSync(sealPath)) {
      try {
        sidecar = JSON.parse(fs.readFileSync(sealPath, 'utf8'));
      } catch (_) {
        sidecar = { corrupted: true };
      }
    }

    // Legacy unsealed DB (upgrade from v1.0.1 where neither DB seal nor sidecar exists yet)
    if (!storedSeal && !sidecar) {
      return { valid: true, legacyUnsealed: true };
    }

    if (sidecar && sidecar.corrupted) {
      dbOfflineTamperInfo = {
        tampered: true,
        reason: 'SEAL_SIDECAR_CORRUPTED',
        detectedAt: new Date().toISOString()
      };
      console.error('[SECURITY CRITICAL] Offline DB tamper detected: .db_seal sidecar corrupted!');
      return { valid: false, reason: 'SEAL_SIDECAR_CORRUPTED' };
    }

    // Check if DB seal was stripped while sidecar exists
    if (!storedSeal && sidecar && sidecar.seal) {
      dbOfflineTamperInfo = {
        tampered: true,
        reason: 'DB_SEAL_REMOVED',
        detectedAt: new Date().toISOString()
      };
      console.error('[SECURITY CRITICAL] Offline DB tamper detected: _db_integrity_seal_v1 stripped from database!');
      return { valid: false, reason: 'DB_SEAL_REMOVED' };
    }

    // Check if sidecar seal disagrees with DB seal (e.g. old DB file swapped in)
    if (sidecar && sidecar.seal && storedSeal && sidecar.seal !== storedSeal) {
      dbOfflineTamperInfo = {
        tampered: true,
        reason: 'DB_SEAL_SIDECAR_MISMATCH',
        detectedAt: new Date().toISOString()
      };
      console.error('[SECURITY CRITICAL] Offline DB tamper detected: database seal does not match .db_seal sidecar!');
      return { valid: false, reason: 'DB_SEAL_SIDECAR_MISMATCH' };
    }

    // Check if last_system_time was deleted or rolled back in DB compared to sidecar
    if (sidecar && sidecar.lastSystemTime && (!dbLastSystemTime || dbLastSystemTime < sidecar.lastSystemTime)) {
      dbOfflineTamperInfo = {
        tampered: true,
        reason: 'CLOCK_GUARD_TAMPERED_OFFLINE',
        detectedAt: new Date().toISOString()
      };
      console.error('[SECURITY CRITICAL] Offline DB tamper detected: last_system_time deleted or rolled back!');
      return { valid: false, reason: 'CLOCK_GUARD_TAMPERED_OFFLINE' };
    }

    // Verify computed HMAC of sensitive tables against stored seal
    const computedSeal = computeDbIntegritySeal(loadedDb);
    if (!computedSeal || !storedSeal || computedSeal !== storedSeal) {
      dbOfflineTamperInfo = {
        tampered: true,
        reason: 'TABLE_INTEGRITY_HMAC_MISMATCH',
        detectedAt: new Date().toISOString()
      };
      console.error('[SECURITY CRITICAL] Offline DB tamper detected: sensitive tables modified outside Taqfeela POS!');
      return { valid: false, reason: 'TABLE_INTEGRITY_HMAC_MISMATCH' };
    }

    return { valid: true };
  } catch (err) {
    console.warn('[DB Integrity] Startup verification error:', err?.message || err);
    return { valid: true };
  }
}

function getDbOfflineTamperInfo() {
  return dbOfflineTamperInfo;
}

function getAtomicSaveCount() {
  return atomicSaveCount;
}

function resetAtomicSaveCount() {
  const prev = atomicSaveCount;
  atomicSaveCount = 0;
  return prev;
}

function getLastExternalConflict() {
  return lastExternalConflict;
}

function saveDbAtomic() {
  if (!db || !dbPath) return;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // ── فحص اكتشاف تغيّر ملف القاعدة من الخارج قبل الحفظ ──
  if (fs.existsSync(dbPath) && lastKnownDbMtime > 0) {
    try {
      const diskStat = fs.statSync(dbPath);
      const mtimeDiff = Math.abs(diskStat.mtimeMs - lastKnownDbMtime);
      const sizeDiff = diskStat.size !== lastKnownDbSize;
      if (mtimeDiff > 100 || (sizeDiff && mtimeDiff > 10)) {
        const backupDir = path.join(dir, 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const conflictPath = path.join(backupDir, `cafe-pos.external-conflict-${Date.now()}.db`);
        fs.copyFileSync(dbPath, conflictPath);
        lastExternalConflict = {
          detected: true,
          detectedAt: new Date().toISOString(),
          conflictPath,
          diskSize: diskStat.size,
          diskMtime: diskStat.mtimeMs,
          memorySize: db ? safeDbExport().length : 0
        };
        console.warn(`[DB Integrity] تعديل خارجي تم اكتشافه لقاعدة البيانات على القرص! تم حفظ نسخة النزاع في: ${conflictPath}`);
      }
    } catch (conflictCheckErr) {
      console.warn('[DB Integrity] External modification check warning:', conflictCheckErr);
    }
  }

  updateDbIntegritySeal();
  const data = safeDbExport();
  const buffer = Buffer.from(data);
  const tmpPath = `${dbPath}.tmp-${Date.now()}`;

  // الكتابة + fsync إجباري: نضمن أن البيانات نزلت فعليًا على القرص الفعلي
  // (وليس فقط في ذاكرة تخزين نظام التشغيل المؤقتة) قبل اعتبار الحفظ ناجحًا.
  // هذا يمنع تلف الملف (torn write) عند انقطاع الكهرباء المفاجئ أثناء الكتابة.
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, buffer, 0, buffer.length, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Windows file rename retry loop for EBUSY/EPERM (antivirus / file indexing locks)
  let saved = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmpPath, dbPath);
      saved = true;
      break;
    } catch (err) {
      if (attempt === 4) {
        // Final attempt: fallback to copy + delete
        try {
          fs.copyFileSync(tmpPath, dbPath);
          fs.unlinkSync(tmpPath);
          saved = true;
        } catch (copyErr) {
          // تنظيف الملف المؤقت إن أمكن
          try { fs.unlinkSync(tmpPath); } catch (_) {}
          // ⚠️ فشل الحفظ الفعلي على القرص بعد 5 محاولات — نُلقي استثناءً
          // بحيث تعود العملية (createOrder/closeShift/...) بخطأ واضح للكاشير
          throw new Error('فشل حفظ الفاتورة على القرص بعد 5 محاولات — تأكد أن مجلد البيانات قابل للكتابة وأعد المحاولة');
        }
      } else {
        // P1-FIX: استبدال الـ Spinlock بـ Atomics.wait — ينتظر 30ms دون حرق المعالج
        // بدلاً من while loop يستهلك 100% CPU ويجمّد الشاشة
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
        } catch (_atomicsErr) {
          // Fallback لو SharedArrayBuffer غير مدعوم (لا يحصل في Electron لكن للأمان)
          const start = Date.now();
          while (Date.now() - start < 30) {}
        }
      }
    }
  }

  if (saved) {
    atomicSaveCount++;
    try {
      const savedStat = fs.statSync(dbPath);
      lastKnownDbMtime = savedStat.mtimeMs;
      lastKnownDbSize = savedStat.size;
    } catch (_) {}
  }
}

// ── Background Worker Thread for Zero-Copy Non-Blocking Disk Flush ──
let writerWorker = null;
let nextWorkerRequestId = 1;
const pendingWorkerRequests = new Map();

function getOrCreateWriterWorker() {
  if (!writerWorker) {
    const workerScript = path.join(__dirname, 'db_writer_worker.js');
    writerWorker = new Worker(workerScript);
    // Keep idle worker unref'd so it never hangs process exit when no write is in-flight
    if (typeof writerWorker.unref === 'function') writerWorker.unref();
    writerWorker.on('message', (msg) => {
      if (!msg || !msg.id) return;
      const entry = pendingWorkerRequests.get(msg.id);
      if (entry) {
        pendingWorkerRequests.delete(msg.id);
        if (msg.success) {
          entry.resolve(msg);
        } else {
          entry.reject(new Error(msg.error || 'Worker write failed'));
        }
      }
    });
    writerWorker.on('error', (err) => {
      console.error('[DB Worker] Worker error:', err);
      for (const [, entry] of pendingWorkerRequests.entries()) {
        entry.reject(err);
      }
      pendingWorkerRequests.clear();
      writerWorker = null;
    });
    writerWorker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[DB Worker] Worker exited with code ${code}`);
      }
      for (const [, entry] of pendingWorkerRequests.entries()) {
        entry.reject(new Error(`Worker exited with code ${code}`));
      }
      pendingWorkerRequests.clear();
      writerWorker = null;
    });
  }
  return writerWorker;
}

async function shutdownWriterWorker() {
  if (writerWorker) {
    const w = writerWorker;
    writerWorker = null;
    try {
      await w.terminate();
    } catch (_) {}
  }
}

let isWorkerWriteInFlight = false;
let pendingWorkerSaveCallers = [];
let pendingWorkerSaveRequested = false;

async function waitForPendingWorkerSaves() {
  while (isWorkerWriteInFlight || pendingWorkerSaveRequested) {
    await new Promise(r => setTimeout(r, 20));
  }
}

async function executeSingleWorkerSave() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  isWorkerWriteInFlight = true;
  try {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // ── فحص اكتشاف تغيّر ملف القاعدة من الخارج قبل الحفظ ──
    // آمن تماماً هنا لأنه لا يوجد أي حفظ آخر جارٍ في الخلفية
    if (fs.existsSync(dbPath) && lastKnownDbMtime > 0) {
      try {
        const diskStat = fs.statSync(dbPath);
        const mtimeDiff = Math.abs(diskStat.mtimeMs - lastKnownDbMtime);
        const sizeDiff = diskStat.size !== lastKnownDbSize;
        if (mtimeDiff > 100 || (sizeDiff && mtimeDiff > 10)) {
          const backupDir = path.join(dir, 'backups');
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          const conflictPath = path.join(backupDir, `cafe-pos.external-conflict-${Date.now()}.db`);
          fs.copyFileSync(dbPath, conflictPath);
          lastExternalConflict = {
            detected: true,
            detectedAt: new Date().toISOString(),
            conflictPath,
            diskSize: diskStat.size,
            diskMtime: diskStat.mtimeMs,
            memorySize: db ? safeDbExport().length : 0
          };
          console.warn(`[DB Integrity] تعديل خارجي تم اكتشافه لقاعدة البيانات على القرص! تم حفظ نسخة النزاع في: ${conflictPath}`);
        }
      } catch (conflictCheckErr) {
        console.warn('[DB Integrity] External modification check warning:', conflictCheckErr);
      }
    }

    const tExportStart = performance.now();
    updateDbIntegritySeal();
  const data = safeDbExport();
    const exportTimeMs = performance.now() - tExportStart;

    const reqId = nextWorkerRequestId++;
    const tmpPath = `${dbPath}.tmp-${Date.now()}-${reqId}`;

    const worker = getOrCreateWriterWorker();
    // Ref worker while write is actively in-flight so Node never exits mid-write
    if (typeof worker.ref === 'function') worker.ref();
    const arrayBuffer = data.buffer;
    const workerResult = await new Promise((resolve, reject) => {
      pendingWorkerRequests.set(reqId, { resolve, reject });
      worker.postMessage({
        id: reqId,
        buffer: arrayBuffer,
        dbPath,
        tmpPath
      }, [arrayBuffer]);
    });

    atomicSaveCount++;
    if (workerResult.diskMtime) {
      lastKnownDbMtime = workerResult.diskMtime;
      lastKnownDbSize = workerResult.diskSize;
    }
    isDirty = false;

    return {
      success: true,
      exportTimeMs,
      mainFreezeTimeMs: exportTimeMs,
      writeTimeMs: workerResult.writeTimeMs,
      fsyncTimeMs: workerResult.fsyncTimeMs,
      renameTimeMs: workerResult.renameTimeMs,
      totalWorkerMs: workerResult.totalWorkerMs
    };
  } finally {
    isWorkerWriteInFlight = false;
    // إذا طُلبت حفظات جديدة أثناء كتابة هذا الحفظ، نفّذ حفظة واحدة جامعة للحالة الأحدث فوراً
    if (pendingWorkerSaveRequested) {
      pendingWorkerSaveRequested = false;
      const callers = pendingWorkerSaveCallers;
      pendingWorkerSaveCallers = [];
      executeSingleWorkerSave()
        .then((res) => {
          for (const c of callers) c.resolve(res);
        })
        .catch((err) => {
          for (const c of callers) c.reject(err);
        });
    } else if (writerWorker && typeof writerWorker.unref === 'function') {
      // No more pending writes: unref idle worker so process can exit cleanly
      writerWorker.unref();
    }
  }
}

async function saveDbAtomicAsync() {
  if (!db || !dbPath) return { success: true };

  // إذا كان هناك حفظ جارٍ بالفعل في الـ Worker، لا نرسل كتابة ثانية موازية على القرص
  // بل ننتظر اكتمال الأولى ثم نرسل الحالة الأحدث دفعة واحدة لضمان ترتيب الحفظ وعدم التضارب
  if (isWorkerWriteInFlight) {
    return new Promise((resolve, reject) => {
      pendingWorkerSaveCallers.push({ resolve, reject });
      pendingWorkerSaveRequested = true;
    });
  }

  return executeSingleWorkerSave();
}

let isDirty = false;
let saveRetryCount = 0;
const MAX_SAVE_RETRIES = 5;

function isDbDirty() {
  return isDirty;
}

async function flushDbAsync() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  if (isDirty) {
    try {
      const res = await saveDbAtomicAsync();
      isDirty = false;
      saveRetryCount = 0;
      return res;
    } catch (err) {
      console.error('[DB CRITICAL] flushDbAsync failed to write database to disk:', err);
      throw err;
    }
  }
  return { success: true, skipped: true };
}

function flushDb() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  if (isDirty) {
    try {
      saveDbAtomic();
      isDirty = false;
      saveRetryCount = 0;
    } catch (err) {
      console.error('[DB CRITICAL] flushDb failed to write database to disk:', err);
      throw err;
    }
  }
}

function saveDb(immediate = true) {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  isDirty = true;
  if (immediate) {
    try {
      saveDbAtomic();
      isDirty = false;
      saveRetryCount = 0;
    } catch (err) {
      isDirty = true;
      console.error('[DB CRITICAL] Immediate saveDb failed:', err);
      throw err;
    }
  } else {
    isDirty = true;
    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;
      // Performance Hardening: Offload deferred disk flush to Worker Thread (zero-copy ArrayBuffer)
      // to prevent Main Thread freezes on large databases, with automatic sync fallback if worker fails.
      saveDbAtomicAsync()
        .then(() => {
          isDirty = false;
          saveRetryCount = 0;
        })
        .catch((workerErr) => {
          console.warn('[DB] Deferred worker save failed, falling back to sync atomic save:', workerErr?.message || workerErr);
          try {
            saveDbAtomic();
            isDirty = false;
            saveRetryCount = 0;
          } catch (err) {
            console.error('[DB] Deferred saveDbAtomic failed:', err);
            isDirty = true;
            if (saveRetryCount < MAX_SAVE_RETRIES) {
              saveRetryCount++;
              const backoff = Math.min(200 * Math.pow(2, saveRetryCount), 5000);
              console.warn(`[DB] Scheduling deferred save retry in ${backoff}ms (attempt ${saveRetryCount}/${MAX_SAVE_RETRIES})`);
              saveDebounceTimer = setTimeout(() => {
                saveDb(false);
              }, backoff);
            } else {
              console.error('[DB CRITICAL] Max save retries reached. Database file is dirty on disk!');
            }
          }
        });
    }, 200);
  }
}

function sanitizeParams(params) {
  if (!params) return [];
  if (!Array.isArray(params)) return [params === undefined ? null : params];
  return params.map((p) => (p === undefined ? null : p));
}

function queryAll(sql, params = []) {
  let stmt = null;
  try {
    stmt = db.prepare(sql);
    const cleanParams = sanitizeParams(params);
    if (cleanParams && cleanParams.length > 0) stmt.bind(cleanParams);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    return results;
  } catch (err) {
    console.error('queryAll error:', sql, err);
    throw err;
  } finally {
    if (stmt) {
      try { stmt.free(); } catch (_) {}
    }
  }
}

function queryGet(sql, params = []) {
  let stmt = null;
  try {
    stmt = db.prepare(sql);
    const cleanParams = sanitizeParams(params);
    if (cleanParams && cleanParams.length > 0) stmt.bind(cleanParams);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    return result;
  } catch (err) {
    console.error('queryGet error:', sql, err);
    throw err;
  } finally {
    if (stmt) {
      try { stmt.free(); } catch (_) {}
    }
  }
}

function runSql(sql, params = [], { skipSave = false } = {}) {
  try {
    const cleanParams = sanitizeParams(params);
    db.run(sql, cleanParams);
    const lastId = queryGet('SELECT last_insert_rowid() AS id')?.id || 0;
    if (!skipSave) {
      saveDb(false);
    }
    return { lastInsertRowid: lastId };
  } catch (err) {
    console.error('runSql error:', sql, err);
    throw err;
  }
}

// Transaction wrapper with SAVEPOINT support for nested transactions
// Phase 5: Transaction post-commit disk failure resilience:
// If COMMIT succeeds in memory, disk failure MUST NOT trigger ROLLBACK on a committed transaction.
// Instead, mark dirty flag, log critical error, attempt emergency retry, and return explicit error to caller.
function withTransaction(fn, { immediateSave = false } = {}) {
  if (!db) return fn();
  const isNested = transactionDepth > 0;
  const savepointName = `sp_${transactionDepth}`;
  let committed = false;
  try {
    if (isNested) {
      db.run(`SAVEPOINT ${savepointName}`);
    } else {
      db.run('BEGIN TRANSACTION');
    }
    transactionDepth++;
    const result = fn();
    transactionDepth--;
    if (isNested) {
      db.run(`RELEASE SAVEPOINT ${savepointName}`);
    } else {
      db.run('COMMIT');
      committed = true;
      // ✅ حفظ فوري للمعاملات المالية، وتخفيف مؤجل آمن للسلات المؤقتة
      try {
        saveDb(immediateSave);
      } catch (saveErr) {
        isDirty = true;
        console.error('[CRITICAL] Transaction committed in SQLite memory but disk write failed:', saveErr);
        if (immediateSave) {
          try {
            saveDbAtomic();
            isDirty = false;
          } catch (fatalErr) {
            console.error('[CRITICAL] Fatal disk write error after transaction commit:', fatalErr);
            throw new Error('تم تنفيذ المعاملة بنجاح لكن تعذر تأكيد الحفظ على القرص — تأكد من مساحة القرص وصلاحيات الكتابة: ' + fatalErr.message);
          }
        }
      }
    }
    return result;
  } catch (err) {
    if (!committed) {
      transactionDepth = Math.max(0, transactionDepth - 1);
      try {
        if (isNested) {
          db.run(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        } else {
          db.run('ROLLBACK');
        }
      } catch (rbErr) {
        console.error('Error during rollback:', rbErr);
      }
    }
    throw err;
  }
}

function roundCurrency(val, allowNegative = false) {
  return finance.money(val || 0, 'amount', allowNegative);
}

// ---- Database Maintenance & Storage Resilience ----
function cleanupOrphanedTempFiles(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    const now = Date.now();
    for (const file of entries) {
      if (file.includes('.tmp-') || file.includes('.corrupt-')) {
        const fullPath = path.join(dir, file);
        try {
          const stats = fs.statSync(fullPath);
          // Delete temp/corrupt files older than 10 minutes
          if (now - stats.mtimeMs > 10 * 60 * 1000) {
            fs.unlinkSync(fullPath);
            console.log(`[DB Auto-Clean] Removed orphaned temporary file: ${file}`);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[DB Auto-Clean] Cleanup skipped:', err);
  }
}

function runDatabaseMaintenance() {
  if (!db) return;
  try {
    // 1. Clean up stale table carts for tables that are available and have no active order
    const hasTableCarts = queryGet("SELECT name FROM sqlite_master WHERE type='table' AND name='table_carts'");
    const tblInfo = queryAll("PRAGMA table_info(tables)");
    const hasCurrentOrderCol = tblInfo && tblInfo.some(c => c.name === 'current_order_id');
    if (hasTableCarts && hasCurrentOrderCol) {
      runSql(`
        DELETE FROM table_carts 
        WHERE table_id IN (
          SELECT t.id FROM tables t 
          WHERE t.status = 'available' AND (t.current_order_id IS NULL OR t.current_order_id = 0)
        )
      `, [], { skipSave: true });
    }

    // Note: audit_log and stock_movements must NEVER be deleted.
    // Deleting from audit_log breaks the cryptographic HMAC-SHA256 signature chain and destroys legal audit trails.

    // 2. Compact SQLite pages and optimize memory
    db.run('PRAGMA optimize');
    saveDbAtomic();
    console.log('[DB Maintenance] Routine maintenance completed (0 audit_log rows pruned, cryptographic chain preserved).');
  } catch (err) {
    console.warn('[DB Maintenance] Maintenance routine skipped:', err);
  }
}

// ---- Legacy Data Discovery & Migration with Integrity Verification ----
async function discoverAndMigrateLegacyDatabase(options = {}) {
  const targetDb = options.targetDbPath || dbPath;
  if (!targetDb) return { migrated: false, reason: 'Target database path not specified' };
  if (fs.existsSync(targetDb)) {
    return { migrated: false, reason: 'Target database already exists' };
  }

  let searchDirs = options.searchDirs;
  if (!searchDirs) {
    let appData = '';
    if (app && typeof app.getPath === 'function') {
      try { appData = app.getPath('appData'); } catch (_) {}
    }
    if (!appData && process.env.APPDATA) {
      appData = process.env.APPDATA;
    }
    if (!appData && os.homedir()) {
      appData = process.platform === 'win32'
        ? path.join(os.homedir(), 'AppData', 'Roaming')
        : path.join(os.homedir(), '.config');
    }
    if (appData) {
      searchDirs = [
        path.join(appData, 'cafe-pos'),
        path.join(appData, 'Electron')
      ];
    }
  }

  if (!Array.isArray(searchDirs) || searchDirs.length === 0) {
    return { migrated: false, reason: 'No search directories available' };
  }

  const targetDir = path.dirname(targetDb);
  for (const dir of searchDirs) {
    const candidateFile = path.join(dir, 'cafe-pos.db');
    if (fs.existsSync(candidateFile) && path.resolve(candidateFile) !== path.resolve(targetDb)) {
      try {
        const stat = fs.statSync(candidateFile);
        if (stat.size < 100) continue;

        // Check SQLite 3 header magic (first 16 bytes)
        const fd = fs.openSync(candidateFile, 'r');
        const header = Buffer.alloc(16);
        fs.readSync(fd, header, 0, 16, 0);
        fs.closeSync(fd);
        if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
          console.warn('[Legacy Migration] Candidate rejected - invalid SQLite header:', candidateFile);
          continue;
        }

        // Verify integrity using sql.js
        if (!SQLInstance) {
          SQLInstance = await initSqlJs();
        }
        const candBuf = fs.readFileSync(candidateFile);
        let checkDb = null;
        let integrityOk = false;
        try {
          checkDb = new SQLInstance.Database(candBuf);
          const res = checkDb.exec('PRAGMA integrity_check;');
          if (res.length > 0 && res[0].values.length > 0 && res[0].values[0][0] === 'ok') {
            integrityOk = true;
          }
        } catch (e) {
          console.warn('[Legacy Migration] Candidate rejected - integrity check failed:', candidateFile, e.message);
        } finally {
          if (checkDb) {
            try { checkDb.close(); } catch (_) {}
          }
        }

        if (integrityOk) {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          fs.copyFileSync(candidateFile, targetDb);
          console.log(`[Legacy Migration] Successfully copied and preserved valid legacy database from: ${candidateFile} to: ${targetDb}`);

          // Safely copy legacy Local Storage if available and target does not have one
          const legacyLocalStore = path.join(dir, 'Local Storage');
          const targetLocalStore = path.join(targetDir, 'Local Storage');
          if (fs.existsSync(legacyLocalStore) && !fs.existsSync(targetLocalStore)) {
            try {
              fs.cpSync(legacyLocalStore, targetLocalStore, { recursive: true });
              console.log(`[Legacy Migration] Copied legacy Local Storage from: ${legacyLocalStore} to: ${targetLocalStore}`);
            } catch (lsErr) {
              console.warn('[Legacy Migration] Local Storage copy skipped:', lsErr.message);
            }
          }

          return { migrated: true, source: candidateFile, target: targetDb, size: stat.size };
        }
      } catch (err) {
        console.warn('[Legacy Migration] Error inspecting candidate:', candidateFile, err.message);
      }
    }
  }

  return { migrated: false, reason: 'No valid legacy database found' };
}

// ---- Schema Versioning, Migrations Engine & Turnkey Package Portability (Item 11) ----
const CURRENT_SCHEMA_VERSION = 2; // Target schema version for TaqfeelaPOS v1.0.2
const APP_VERSION = '1.0.2';

function getDbUserVersion(targetDb = db) {
  if (!targetDb) return 0;
  try {
    const res = targetDb.exec('PRAGMA user_version');
    return Number(res?.[0]?.values?.[0]?.[0]) || 0;
  } catch (_) {
    return 0;
  }
}

function setDbUserVersion(version, targetDb = db) {
  if (!targetDb) return;
  targetDb.run(`PRAGMA user_version = ${Number(version)}`);
}

function getSchemaVersion() {
  return getDbUserVersion(db);
}

function getAppVersion() {
  if (!db) return APP_VERSION;
  try {
    const row = queryGet("SELECT value FROM settings WHERE key = 'app_version'");
    return row?.value || APP_VERSION;
  } catch (_) {
    return APP_VERSION;
  }
}

const MIGRATIONS = [
  {
    version: 1,
    name: 'v1_0_1_baseline',
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          app_version TEXT NOT NULL
        )
      `);
      function addCol(table, col, def) {
        try {
          const res = database.exec(`PRAGMA table_info(${table})`);
          const cols = (res?.[0]?.values || []).map(r => String(r[1]).toLowerCase());
          if (!cols.includes(col.toLowerCase())) {
            database.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
          }
        } catch (_) {}
      }
      addCol('categories', 'icon', "TEXT DEFAULT '☕'");
      addCol('categories', 'sort_order', 'INTEGER DEFAULT 0');
      addCol('products', 'cost', 'REAL DEFAULT 0');
      addCol('products', 'barcode', 'TEXT');
      addCol('products', 'stock_qty', 'INTEGER DEFAULT 0');
      addCol('products', 'is_deleted', 'INTEGER DEFAULT 0');
      addCol('products', 'low_stock_threshold', 'INTEGER DEFAULT 10');
      addCol('shifts', 'cash_sales', 'REAL DEFAULT 0');
      addCol('shifts', 'card_sales', 'REAL DEFAULT 0');
      addCol('shifts', 'wallet_sales', 'REAL DEFAULT 0');
      addCol('shifts', 'expenses_total', 'REAL DEFAULT 0');
      addCol('shifts', 'actual_cash', 'REAL');
      addCol('shifts', 'cash_difference', 'REAL DEFAULT 0');
      addCol('shifts', 'notes', 'TEXT');
      addCol('shifts', 'user_id', 'INTEGER');
      addCol('shifts', 'user_name', 'TEXT');
      addCol('shifts', 'shift_type', "TEXT DEFAULT 'الشيفت الصباحي'");
      addCol('shifts', 'handover_notes', 'TEXT');
      addCol('shifts', 'debt_collections', 'REAL DEFAULT 0');
      addCol('shifts', 'refunds_total', 'REAL DEFAULT 0');
      addCol('shifts', 'total_sales', 'REAL DEFAULT 0');
      addCol('expenses', 'user_id', 'INTEGER');
      addCol('expenses', 'user_name', 'TEXT');
      addCol('orders', 'invoice_no', 'TEXT');
      addCol('orders', 'order_type', "TEXT DEFAULT 'takeaway'");
      addCol('orders', 'customer_name', 'TEXT');
      addCol('orders', 'discount', 'REAL DEFAULT 0');
      addCol('orders', 'tax', 'REAL DEFAULT 0');
      addCol('orders', 'amount_paid', 'REAL DEFAULT 0');
      addCol('orders', 'change_due', 'REAL DEFAULT 0');
      addCol('orders', 'cash_amount', 'REAL DEFAULT 0');
      addCol('orders', 'card_amount', 'REAL DEFAULT 0');
      addCol('orders', 'wallet_amount', 'REAL DEFAULT 0');
      addCol('orders', 'payment_method', "TEXT DEFAULT 'cash'");
      addCol('orders', 'status', "TEXT DEFAULT 'completed'");
      addCol('orders', 'notes', 'TEXT');
      addCol('orders', 'user_id', 'INTEGER');
      addCol('orders', 'cashier_name', 'TEXT');
      addCol('orders', 'shift_name', 'TEXT');
      addCol('order_items', 'product_name', "TEXT DEFAULT ''");
      addCol('order_items', 'total_price', 'REAL DEFAULT 0');
      addCol('order_items', 'notes', 'TEXT');
      addCol('customer_debts', 'customer_phone', 'TEXT');
      addCol('customer_debts', 'customer_id', 'INTEGER');
      addCol('customer_debts', 'table_name', 'TEXT');
      addCol('customer_debts', 'notes', 'TEXT');
      addCol('debt_payments', 'shift_id', 'INTEGER');
      addCol('debt_payments', 'payment_method', "TEXT DEFAULT 'cash'");
      addCol('debt_payments', 'cashier_name', 'TEXT');
      addCol('debt_payments', 'notes', 'TEXT');
      addCol('tables', 'hall', "TEXT DEFAULT 'indoor'");
      addCol('tables', 'capacity', 'INTEGER DEFAULT 4');
      addCol('tables', 'status', "TEXT DEFAULT 'available'");
      addCol('users', 'salary', 'REAL DEFAULT 3500');
      addCol('users', 'phone', "TEXT DEFAULT ''");
      addCol('users', 'shift_name', "TEXT DEFAULT ''");
      addCol('users', 'shift_start', "TEXT DEFAULT '06:00'");
      addCol('users', 'shift_end', "TEXT DEFAULT '14:00'");
      addCol('users', 'must_change_password', 'INTEGER DEFAULT 0');
      addCol('stock_movements', 'user_id', 'INTEGER');
      addCol('stock_movements', 'user_name', 'TEXT');
      addCol('audit_log', 'actor_id', 'INTEGER');
      addCol('audit_log', 'actor_name', 'TEXT');
      addCol('audit_log', 'details', 'TEXT');
      addCol('audit_log', 'entity_type', 'TEXT');
      addCol('audit_log', 'entity_id', 'INTEGER');
    }
  },
  {
    version: 2,
    name: 'v1_0_2_core_features',
    up: (database) => {
      function addCol(table, col, def) {
        try {
          const res = database.exec(`PRAGMA table_info(${table})`);
          const cols = (res?.[0]?.values || []).map(r => String(r[1]).toLowerCase());
          if (!cols.includes(col.toLowerCase())) {
            database.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
          }
        } catch (_) {}
      }

      database.run(`
        CREATE TABLE IF NOT EXISTS table_carts (
          table_id INTEGER PRIMARY KEY,
          cart_data TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          rev INTEGER DEFAULT 0
        )
      `);
      addCol('table_carts', 'rev', 'INTEGER DEFAULT 0');

      database.run(`
        CREATE TABLE IF NOT EXISTS shift_adjustments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shift_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          amount REAL NOT NULL,
          reason TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(shift_id) REFERENCES shifts(id)
        )
      `);

      addCol('orders', 'client_order_id', 'TEXT');
      addCol('orders', 'table_name', 'TEXT');
      addCol('orders', 'table_number', 'TEXT');
      addCol('orders', 'table_hall', 'TEXT');
      addCol('orders', 'customer_phone', 'TEXT');
      addCol('orders', 'customer_address', 'TEXT');

      try {
        database.run(`
          UPDATE orders
          SET table_name = (SELECT name FROM tables WHERE tables.id = orders.table_id),
              table_number = (SELECT number FROM tables WHERE tables.id = orders.table_id),
              table_hall = (SELECT hall FROM tables WHERE tables.id = orders.table_id)
          WHERE table_id IS NOT NULL AND (table_name IS NULL OR table_name = '')
        `);
      } catch (_) {}

      addCol('tables', 'section_id', 'INTEGER');
      addCol('tables', 'qr_enabled', 'INTEGER DEFAULT 1');
      addCol('tables', 'qr_token', 'TEXT');
      addCol('users', 'pin', 'TEXT');
      addCol('users', 'assigned_halls', "TEXT DEFAULT 'ALL'");

      database.run(`
        CREATE TABLE IF NOT EXISTS paired_devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_token_hash TEXT UNIQUE NOT NULL,
          device_name TEXT NOT NULL,
          platform TEXT NOT NULL,
          paired_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          status TEXT DEFAULT 'active'
        )
      `);
      try { database.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_paired_devices_hash ON paired_devices(device_token_hash)"); } catch (_) {}

      try {
        const res = database.exec("SELECT id, qr_token FROM tables WHERE qr_token IS NULL OR qr_token = '' OR length(qr_token) < 32");
        const rows = res?.[0]?.values || [];
        for (const [tId] of rows) {
          let token = generateQrToken();
          database.run("UPDATE tables SET qr_token = ? WHERE id = ?", [token, tId]);
        }
      } catch (_) {}

      try { database.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_qr_token_unique ON tables(qr_token) WHERE qr_token IS NOT NULL AND qr_token != ''"); } catch (_) {}
      try { database.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_order_id ON orders(client_order_id)"); } catch (_) {}
      try { database.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_no ON orders(invoice_no)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON order_refunds(order_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_order_refunds_shift_id ON order_refunds(shift_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_customer_debts_order_id ON customer_debts(order_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_customer_debts_customer_id ON customer_debts(customer_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON debt_payments(debt_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_debt_payments_shift_id ON debt_payments(shift_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_shifts_closed_at ON shifts(closed_at)"); } catch (_) {}
      try { database.run("CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id)"); } catch (_) {}

      healForeignKeyViolations(database);

      try {
        const maxOrderRes = database.exec('SELECT MAX(CAST(invoice_no AS INTEGER)) AS m FROM orders WHERE invoice_no NOT LIKE "INV-%"');
        const maxExisting = Number(maxOrderRes?.[0]?.values?.[0]?.[0]) || 0;
        const seqRes = database.exec('SELECT next_number FROM invoice_sequence WHERE id = 1');
        const currentSeq = Number(seqRes?.[0]?.values?.[0]?.[0]) || 1;
        const safeNext = Math.max(currentSeq, maxExisting + 1);
        database.run('INSERT OR REPLACE INTO invoice_sequence (id, next_number) VALUES (1, ?)', [safeNext]);
      } catch (_) {}
    }
  }
];

function registerMigration(migrationDef) {
  if (!migrationDef || typeof migrationDef.version !== 'number' || typeof migrationDef.up !== 'function') {
    throw new Error('Invalid migration definition');
  }
  const idx = MIGRATIONS.findIndex(m => m.version === migrationDef.version);
  if (idx >= 0) {
    MIGRATIONS[idx] = migrationDef;
  } else {
    MIGRATIONS.push(migrationDef);
    MIGRATIONS.sort((a, b) => a.version - b.version);
  }
}

function runPendingMigrations(targetDb, fromVer, toVer) {
  let d = targetDb;
  let fromV = fromVer;
  let toV = toVer;
  if (typeof targetDb === 'number') {
    toV = fromVer;
    fromV = targetDb;
    d = db;
  }
  if (!d) d = db;

  const pending = MIGRATIONS.filter(m => m.version > fromV && m.version <= toV)
                            .sort((a, b) => a.version - b.version);
  if (pending.length === 0) return { appliedCount: 0 };

  console.log(`[Migrations] Executing ${pending.length} pending migration(s) (from v${fromV} to v${toV})...`);

  for (const m of pending) {
    console.log(`[Migrations] Starting migration v${m.version}: ${m.name}...`);
    d.run('BEGIN TRANSACTION');
    try {
      m.up(d);
      d.run(`PRAGMA user_version = ${m.version}`);
      d.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          app_version TEXT NOT NULL
        )
      `);
      d.run(`
        INSERT OR REPLACE INTO schema_migrations (version, name, applied_at, app_version)
        VALUES (?, ?, ?, ?)
      `, [m.version, m.name, new Date().toISOString(), APP_VERSION]);
      d.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      d.run(`
        INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)
      `, [String(m.version)]);
      d.run(`
        INSERT OR REPLACE INTO settings (key, value) VALUES ('app_version', ?)
      `, [APP_VERSION]);
      d.run('COMMIT');
      console.log(`[Migrations] Completed migration v${m.version}: ${m.name}`);
    } catch (err) {
      console.error(`[Migrations] Failed migration v${m.version} (${m.name}):`, err);
      try { d.run('ROLLBACK'); } catch (_) {}
      throw err;
    }
  }
  return { appliedCount: pending.length };
}

function exportMigrationPackage(targetPath) {
  if (!db) throw new Error('قاعدة البيانات غير مهيأة');
  if (!targetPath) throw new Error('مسار التصدير غير محدد');
  flushDb();
  const integrity = queryGet('PRAGMA integrity_check')?.integrity_check;
  if (integrity !== 'ok') {
    throw new Error('فحص سلامة قاعدة البيانات غير سليم: ' + integrity);
  }
  updateDbIntegritySeal();
  const data = safeDbExport();
  fs.writeFileSync(targetPath, Buffer.from(data));
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  fs.writeFileSync(`${targetPath}.sha256`, hash, 'utf8');
  return { success: true, targetPath, hash, size: data.byteLength };
}

function importMigrationPackage(sourcePath, adminPassword = null) {
  if (!fs.existsSync(sourcePath)) throw new Error('ملف الاستيراد غير موجود');
  const buf = fs.readFileSync(sourcePath);
  if (!buf || buf.length === 0) throw new Error('ملف الاستيراد فارغ');

  if (adminPassword !== null && adminPassword !== undefined) {
    const v = verifyAdminPassword(adminPassword);
    if (!v.success) {
      throw new Error(v.error || 'كلمة مرور الأدمن غير صحيحة');
    }
  }

  const hashFile = `${sourcePath}.sha256`;
  if (fs.existsSync(hashFile)) {
    const expectedHash = fs.readFileSync(hashFile, 'utf8').trim();
    const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
    if (expectedHash !== actualHash) {
      throw new Error('فشل التحقق من صحة هاش الحزمة المستوردة: الملف تالف أو تم تعديله بصورة غير مصرح بها');
    }
  }

  const candidate = new SQLInstance.Database(buf);
  const integrity = candidate.exec('PRAGMA integrity_check')?.[0]?.values?.[0]?.[0];
  if (integrity !== 'ok') {
    candidate.close();
    throw new Error('فحص سلامة الحزمة المستوردة غير سليم: ' + integrity);
  }
  const candidateVer = getDbUserVersion(candidate);
  if (candidateVer > CURRENT_SCHEMA_VERSION) {
    candidate.close();
    throw new Error(`حزمة الترحيل أحدث من إصدار البرنامج الحالي (إصدار المخطط ${candidateVer} أحدث من ${CURRENT_SCHEMA_VERSION}). يرجى ترقية البرنامج أولاً.`);
  }
  candidate.close();

  // Pre-migration disk space check: require at least 2x package size
  if (typeof fs.statfsSync === 'function' && dbPath) {
    try {
      const fsStat = fs.statfsSync(path.dirname(dbPath));
      const freeBytes = Number(fsStat.bavail) * Number(fsStat.bsize);
      if (freeBytes < buf.length * 2) {
        throw new Error(`مساحة القرص غير كافية لاستيراد الحزمة بأمان. المساحة المتوفرة: ${(freeBytes/1048576).toFixed(1)} ميجابايت، المطلوب: ${(buf.length*2/1048576).toFixed(1)} ميجابايت.`);
      }
    } catch (fsErr) {
      if (fsErr.message && fsErr.message.includes('مساحة القرص غير كافية')) throw fsErr;
    }
  }

  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const preRestoreBackup = path.join(backupDir, `pre-migration-import-${Date.now()}.db`);
  try {
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, preRestoreBackup);
  } catch (bkErr) {
    throw new Error('تعذر أخذ نسخة أمان احتياطية قبل استيراد الحزمة: ' + bkErr.message);
  }

  try {
    fs.writeFileSync(dbPath, buf);

    if (db) {
      try { db.close(); } catch (_) {}
    }
    db = new SQLInstance.Database(buf);
    const curVer = getDbUserVersion(db);
    if (curVer < CURRENT_SCHEMA_VERSION) {
      runPendingMigrations(db, curVer, CURRENT_SCHEMA_VERSION);
    }
    saveDbAtomic();
    return { success: true, restoredFrom: sourcePath, preRestoreBackup, schemaVersion: getDbUserVersion(db) };
  } catch (err) {
    // Automatic rollback if reload/migration failed
    if (fs.existsSync(preRestoreBackup)) {
      try {
        fs.copyFileSync(preRestoreBackup, dbPath);
        if (db) { try { db.close(); } catch (_) {} }
        db = new SQLInstance.Database(fs.readFileSync(dbPath));
      } catch (_) {}
    }
    throw new Error('فشل استيراد الحزمة وترحيلها — تم التراجع للنسخة السابقة: ' + err.message);
  }
}

// ---- Database Initialization & Schema ----
async function init(overridePath = null) {
  let effectiveUserDataPath;
  if (overridePath) {
    dbPath = overridePath;
    effectiveUserDataPath = path.dirname(overridePath);
  } else {
    // Check if running as portable executable
    const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
    if (isPortable) {
      effectiveUserDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
    } else {
      effectiveUserDataPath = app ? app.getPath('userData') : path.join(__dirname, '..');
    }
    dbPath = path.join(effectiveUserDataPath, 'cafe-pos.db');

    // Automatic migration from existing database locations if this instance does not have a DB yet
    try {
      if (app && !process.env.CAFE_USER_DATA && !fs.existsSync(dbPath)) {
        await discoverAndMigrateLegacyDatabase({ targetDbPath: dbPath });
      }
    } catch (migErr) {
      console.warn('Database preservation check skipped:', migErr);
    }
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 1. Clean up any orphaned .tmp-* files from interrupted saves or antivirus locks
  cleanupOrphanedTempFiles(effectiveUserDataPath);

  // 2. Robust multi-tier WASM resolution:
  // Checks persistent userData first, then installation resources, then dev paths.
  const userWasmPath = path.join(effectiveUserDataPath, 'sql-wasm.wasm');
  const possibleWasmPaths = [
    userWasmPath,
    // extraResources path (both installed & portable)
    path.join(process.resourcesPath || '', 'sql-wasm.wasm'),
    // asar.unpacked path (when asarUnpack is set in electron-builder)
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    // Dev / fallback
    path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(__dirname, 'sql-wasm.wasm'),
  ];
  const foundWasm = possibleWasmPaths.find((p) => p && fs.existsSync(p));

  // If foundWasm is not in effectiveUserDataPath, cache a persistent copy in effectiveUserDataPath
  // so Windows Storage Sense cleaning %TEMP% in portable mode will NEVER break SQLite after 1 week!
  if (foundWasm && foundWasm !== userWasmPath) {
    try {
      if (!fs.existsSync(userWasmPath) || fs.statSync(userWasmPath).size !== fs.statSync(foundWasm).size) {
        fs.copyFileSync(foundWasm, userWasmPath);
        console.log('[DB Shield] Cached persistent sql-wasm.wasm into userData directory:', userWasmPath);
      }
    } catch (_) {}
  }

  if (foundWasm) {
    SQLInstance = await initSqlJs({
      locateFile: (file) => (file.endsWith('.wasm') ? foundWasm : file),
    });
  } else {
    SQLInstance = await initSqlJs();
  }

  // دالة تحقق فعلي: بناء كائن Database من بفر بيانات لا يثبت صحة الملف.
  // الفحص الحقيقي الوحيد هو تنفيذ استعلام فعلي عليه والتأكد إنه ينجح بدون رمي استثناء.
  function tryOpenAndValidate(buf) {
    const candidate = new SQLInstance.Database(buf);
    // استعلام خفيف يجبر محرك SQLite على قراءة الـ header وصفحة الجذول الأساسية فعليًا
    candidate.exec('SELECT count(*) FROM sqlite_master');
    return candidate;
  }

  recoveryInfo = { recovered: false, source: null, quarantinedPath: null };
  dbOfflineTamperInfo = null;

  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('ملف قاعدة البيانات فارغ 0 بايت');
      }
      db = tryOpenAndValidate(fileBuffer);
      verifyDbIntegrityOnStartup(db);
      try {
        const initStat = fs.statSync(dbPath);
        lastKnownDbMtime = initStat.mtimeMs;
        lastKnownDbSize = initStat.size;
      } catch (_) {}

      const candidateUserVer = getDbUserVersion(db);

      // Requirement D: Downgrade protection!
      if (candidateUserVer > CURRENT_SCHEMA_VERSION) {
        const downgradeMsg = `قاعدة البيانات أحدث من إصدار البرنامج الحالي (إصدار المخطط ${candidateUserVer} أحدث من ${CURRENT_SCHEMA_VERSION}). يرجى تشغيل الإصدار الأحدث من برنامج تقفيلة POS لتفادي تلف البيانات.`;
        console.error('[DB DOWNGRADE REJECTED]', downgradeMsg);
        try { db.close(); } catch (_) {}
        db = null;
        throw new Error(downgradeMsg);
      }

      // Requirement B & C: Pre-upgrade safety backup and sequential migrations
      if (candidateUserVer < CURRENT_SCHEMA_VERSION) {
        const origStat = fs.statSync(dbPath);

        // Pre-migration disk space check (Item 5-e): require at least 2x db size
        if (typeof fs.statfsSync === 'function' || process.env.TEST_SIMULATE_LOW_DISK_SPACE) {
          try {
            let freeBytes = 0;
            if (typeof fs.statfsSync === 'function') {
              const fsStat = fs.statfsSync(path.dirname(dbPath));
              freeBytes = Number(fsStat.bavail) * Number(fsStat.bsize);
            }
            if (process.env.TEST_SIMULATE_LOW_DISK_SPACE) {
              freeBytes = 1024; // simulate only 1 KB available
            }
            const requiredBytes = origStat.size * 2;
            if (freeBytes < requiredBytes) {
              const freeMB = (freeBytes / (1024 * 1024)).toFixed(2);
              const reqMB = (requiredBytes / (1024 * 1024)).toFixed(2);
              const spaceErr = `مساحة القرص غير كافية لإتمام التحديث بأمان. المساحة المتوفرة: ${freeMB} ميجابايت، المطلوب: ${reqMB} ميجابايت على الأقل.`;
              console.error('[UPGRADE SAFETY] Insufficient disk space:', spaceErr);
              try { db.close(); } catch (_) {}
              db = null;
              throw new Error(spaceErr);
            }
          } catch (statfsErr) {
            if (statfsErr.message && statfsErr.message.includes('مساحة القرص غير كافية')) {
              throw statfsErr;
            }
            console.warn('[UPGRADE SAFETY] statfsSync check warning (proceeding):', statfsErr.message);
          }
        }

        const backupDir = path.join(effectiveUserDataPath, 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const preUpgradeBackupPath = path.join(backupDir, `pre-upgrade-v${candidateUserVer}-to-v${CURRENT_SCHEMA_VERSION}-${timestamp}.db`);
        fs.copyFileSync(dbPath, preUpgradeBackupPath);

        // Verify backup integrity and size
        const bkStat = fs.statSync(preUpgradeBackupPath);
        if (bkStat.size !== origStat.size || bkStat.size === 0) {
          throw new Error(`فشل التحقق من حجم نسخة الأمان المسبقة للترقية: ${preUpgradeBackupPath}`);
        }
        const testBkDb = new SQLInstance.Database(fs.readFileSync(preUpgradeBackupPath));
        const integrityStatus = testBkDb.exec("PRAGMA integrity_check")?.[0]?.values?.[0]?.[0];
        testBkDb.close();
        if (integrityStatus !== 'ok') {
          throw new Error(`نسخة الأمان المسبقة للترقية غير سليمة (${integrityStatus}) — تم إيقاف الترقية.`);
        }
        console.log(`[Upgrade Safety] Pre-upgrade backup verified: ${preUpgradeBackupPath} (${bkStat.size} bytes)`);

        try {
          runPendingMigrations(db, candidateUserVer, CURRENT_SCHEMA_VERSION);
          saveDbAtomic();
          console.log(`[Upgrade] Successfully upgraded database from v${candidateUserVer} to v${CURRENT_SCHEMA_VERSION}`);
        } catch (migrationErr) {
          console.error('[UPGRADE FAILURE] Migration error, rolling back to pre-upgrade backup:', migrationErr);
          if (fs.existsSync(preUpgradeBackupPath)) {
            try {
              fs.copyFileSync(preUpgradeBackupPath, dbPath);
              console.log('[UPGRADE ROLLBACK] Successfully restored pre-upgrade backup to dbPath.');
            } catch (rbErr) {
              console.error('[UPGRADE FATAL] Rollback file copy failed:', rbErr);
            }
          }
          const errorReportPath = path.join(effectiveUserDataPath, 'upgrade-error-report.json');
          try {
            fs.writeFileSync(errorReportPath, JSON.stringify({
              timestamp: new Date().toISOString(),
              fromSchemaVersion: candidateUserVer,
              targetSchemaVersion: CURRENT_SCHEMA_VERSION,
              error: migrationErr.message,
              stack: migrationErr.stack,
              preUpgradeBackup: preUpgradeBackupPath
            }, null, 2), 'utf8');
          } catch (_) {}

          try { db.close(); } catch (_) {}
          db = null;
          throw new Error(`تعذر تحديث البيانات، تم الرجوع للنسخة السابقة، تواصل مع الدعم الفني: ${migrationErr.message}`);
        }
      }
    } catch (e) {
      if (e.message && (
        e.message.includes('تعذر تحديث البيانات') || 
        e.message.includes('قاعدة البيانات أحدث من إصدار البرنامج') ||
        e.message.includes('مساحة القرص غير كافية')
      )) {
        throw e;
      }
      console.error('Database load error:', e);
      // Quarantine the unreadable database file so client data is never wiped
      const quarantinePath = `${dbPath}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(dbPath, quarantinePath); } catch (_) {}
      recoveryInfo.quarantinedPath = quarantinePath;

      // Auto-recovery: جرّب كل النسخ الاحتياطية من الأحدث للأقدم حتى تلاقي واحدة سليمة فعليًا
      const backupDir = path.join(effectiveUserDataPath, 'backups');
      let recovered = false;
      if (fs.existsSync(backupDir)) {
        const backupFiles = fs.readdirSync(backupDir)
          .filter((f) => f.endsWith('.db'))
          .map((f) => ({ name: f, fullPath: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
          .sort((a, b) => b.time - a.time);

        for (const bk of backupFiles) {
          try {
            const bkBuf = fs.readFileSync(bk.fullPath);
            if (bkBuf && bkBuf.length > 0) {
              db = tryOpenAndValidate(bkBuf);
              console.log(`Auto-recovered database from healthy backup: ${bk.name}`);
              recovered = true;
              recoveryInfo.recovered = true;
              recoveryInfo.source = bk.name;
              recoveryInfo.sourceTime = bk.time;
              break;
            }
          } catch (_) {
            // هذه النسخة الاحتياطية تالفة هي كمان — جرّب التالية الأقدم
          }
        }
        if (recovered) {
          try {
            saveDbAtomic();
            console.log('Persisted recovered healthy database to dbPath successfully.');
          } catch (writeErr) {
            console.warn('Could not immediately rewrite dbPath from recovered backup:', writeErr);
          }
        }
      }

      if (!recovered) {
        console.warn('Initializing new pristine database.');
        db = new SQLInstance.Database();
        recoveryInfo.recovered = false;
      }
    }
  } else {
    db = new SQLInstance.Database();
  }

  // Performance optimizations for high concurrency & Referential Integrity
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA synchronous=NORMAL");
  db.run("PRAGMA cache_size=-10000");
  db.run("PRAGMA temp_store=MEMORY");
  db.run("PRAGMA foreign_keys=ON");

  // Schema creation
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '☕',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL DEFAULT 0,
      category_id INTEGER,
      stock_qty INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      barcode TEXT,
      is_deleted INTEGER DEFAULT 0,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      current_order_id INTEGER,
      hall TEXT DEFAULT 'أرضي',
      section_id INTEGER,
      qr_enabled INTEGER DEFAULT 1,
      qr_token TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      opening_cash REAL DEFAULT 0,
      closing_cash REAL,
      cash_sales REAL DEFAULT 0,
      card_sales REAL DEFAULT 0,
      wallet_sales REAL DEFAULT 0,
      expenses_total REAL DEFAULT 0,
      actual_cash REAL,
      cash_difference REAL DEFAULT 0,
      notes TEXT,
      user_id INTEGER,
      user_name TEXT,
      shift_type TEXT DEFAULT 'الشيفت الصباحي',
      handover_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER,
      amount REAL NOT NULL,
      category TEXT DEFAULT 'مشتريات خامات',
      notes TEXT,
      created_at TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      FOREIGN KEY(shift_id) REFERENCES shifts(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT,
      shift_id INTEGER,
      table_id INTEGER,
      order_type TEXT DEFAULT 'takeaway',
      customer_name TEXT,
      created_at TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      amount_paid REAL DEFAULT 0,
      change_due REAL DEFAULT 0,
      cash_amount REAL DEFAULT 0,
      card_amount REAL DEFAULT 0,
      wallet_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      user_id INTEGER,
      cashier_name TEXT,
      shift_name TEXT,
      FOREIGN KEY(shift_id) REFERENCES shifts(id),
      FOREIGN KEY(table_id) REFERENCES tables(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT DEFAULT '',
      qty INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'cashier',
      phone TEXT,
      salary REAL DEFAULT 3500,
      shift_name TEXT DEFAULT 'الشيفت الصباحي (الأول)',
      shift_start TEXT DEFAULT '06:00',
      shift_end TEXT DEFAULT '14:00',
      created_at TEXT NOT NULL,
      must_change_password INTEGER DEFAULT 0,
      pin TEXT,
      assigned_halls TEXT DEFAULT 'ALL'
    );

    CREATE TABLE IF NOT EXISTS paired_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_token_hash TEXT UNIQUE NOT NULL,
      device_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      paired_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      address TEXT,
      created_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS customer_debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      table_name TEXT,
      total_amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      remaining_amount REAL NOT NULL,
      status TEXT DEFAULT 'unpaid',
      created_at TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL,
      shift_id INTEGER,
      amount REAL NOT NULL,
      cashier_name TEXT,
      payment_method TEXT DEFAULT 'cash',
      created_at TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY(debt_id) REFERENCES customer_debts(id)
    );

    CREATE TABLE IF NOT EXISTS employee_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL DEFAULT 0,
      days_count REAL DEFAULT 0,
      date TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      actor_id INTEGER,
      actor_name TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      shift_id INTEGER,
      refund_amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      reason TEXT,
      created_at TEXT NOT NULL,
      actor_name TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_sequence (
      id INTEGER PRIMARY KEY,
      next_number INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      table_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS table_carts (
      table_id INTEGER PRIMARY KEY,
      cart_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shift_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(shift_id) REFERENCES shifts(id)
    );
  `);

  // Helper for idempotent schema migrations with explicit PRAGMA table_info check
  function addColumnIfNotExists(table, column, colDef) {
    try {
      const cols = queryAll(`PRAGMA table_info(${table})`);
      const exists = cols.some(c => c.name.toLowerCase() === column.toLowerCase());
      if (!exists) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`);
      }
    } catch (err) {
      if (/duplicate column name/i.test(err.message)) {
        return;
      }
      console.error(`[MIGRATION ERROR] Failed to add column ${column} to table ${table}:`, err);
      throw new Error(`فشل ترحيل قاعدة البيانات (إضافة العمود ${column} للجدول ${table}): ${err.message}`);
    }
  }

  // Safe Alter table migrations for any existing older schemas
  addColumnIfNotExists('categories', 'icon', "TEXT DEFAULT '☕'");
  addColumnIfNotExists('categories', 'sort_order', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('products', 'cost', 'REAL DEFAULT 0');
  addColumnIfNotExists('products', 'barcode', 'TEXT');
  addColumnIfNotExists('products', 'is_deleted', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('products', 'low_stock_threshold', 'INTEGER DEFAULT 10');
  addColumnIfNotExists('shifts', 'cash_sales', 'REAL DEFAULT 0');
  addColumnIfNotExists('shifts', 'card_sales', 'REAL DEFAULT 0');
  addColumnIfNotExists('shifts', 'wallet_sales', 'REAL DEFAULT 0');
  addColumnIfNotExists('shifts', 'expenses_total', 'REAL DEFAULT 0');
  addColumnIfNotExists('shifts', 'actual_cash', 'REAL');
  addColumnIfNotExists('shifts', 'cash_difference', 'REAL DEFAULT 0');
  addColumnIfNotExists('shifts', 'notes', 'TEXT');
  addColumnIfNotExists('shifts', 'user_id', 'INTEGER');
  addColumnIfNotExists('shifts', 'user_name', 'TEXT');
  addColumnIfNotExists('shifts', 'shift_type', "TEXT DEFAULT 'الشيفت الصباحي'");
  addColumnIfNotExists('shifts', 'handover_notes', 'TEXT');
  addColumnIfNotExists('shifts', 'debt_collections', 'REAL DEFAULT 0');
  addColumnIfNotExists('shifts', 'refunds_total', 'REAL DEFAULT 0');
  addColumnIfNotExists('shifts', 'total_sales', 'REAL DEFAULT 0');

  try {
    db.run(`CREATE TABLE IF NOT EXISTS table_carts (
      table_id INTEGER PRIMARY KEY,
      cart_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  } catch (e) {
    console.error('[MIGRATION] table_carts table creation error:', e);
  }

  try {
    db.run(`CREATE TABLE IF NOT EXISTS shift_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(shift_id) REFERENCES shifts(id)
    )`);
  } catch (e) {
    console.error('[MIGRATION] shift_adjustments table creation error:', e);
  }

  addColumnIfNotExists('expenses', 'user_id', 'INTEGER');
  addColumnIfNotExists('expenses', 'user_name', 'TEXT');
  addColumnIfNotExists('orders', 'invoice_no', 'TEXT');
  addColumnIfNotExists('orders', 'order_type', "TEXT DEFAULT 'takeaway'");
  addColumnIfNotExists('orders', 'customer_name', 'TEXT');
  addColumnIfNotExists('orders', 'discount', 'REAL DEFAULT 0');
  addColumnIfNotExists('orders', 'tax', 'REAL DEFAULT 0');
  addColumnIfNotExists('orders', 'amount_paid', 'REAL DEFAULT 0');
  addColumnIfNotExists('orders', 'change_due', 'REAL DEFAULT 0');
  addColumnIfNotExists('orders', 'cash_amount', 'REAL DEFAULT 0');
  addColumnIfNotExists('orders', 'card_amount', 'REAL DEFAULT 0');
  addColumnIfNotExists('orders', 'wallet_amount', 'REAL DEFAULT 0');
  addColumnIfNotExists('orders', 'payment_method', "TEXT DEFAULT 'cash'");
  addColumnIfNotExists('orders', 'status', "TEXT DEFAULT 'completed'");
  addColumnIfNotExists('orders', 'notes', 'TEXT');
  addColumnIfNotExists('orders', 'user_id', 'INTEGER');
  addColumnIfNotExists('orders', 'cashier_name', 'TEXT');
  addColumnIfNotExists('orders', 'shift_name', 'TEXT');
  addColumnIfNotExists('orders', 'table_name', 'TEXT');
  addColumnIfNotExists('orders', 'table_number', 'TEXT');
  addColumnIfNotExists('orders', 'table_hall', 'TEXT');
  addColumnIfNotExists('orders', 'customer_phone', 'TEXT');
  addColumnIfNotExists('orders', 'customer_address', 'TEXT');
  addColumnIfNotExists('customers', 'address', 'TEXT');

  try {
    db.run(`
      UPDATE orders
      SET table_name = (SELECT name FROM tables WHERE tables.id = orders.table_id),
          table_number = (SELECT number FROM tables WHERE tables.id = orders.table_id),
          table_hall = (SELECT hall FROM tables WHERE tables.id = orders.table_id)
      WHERE table_id IS NOT NULL AND (table_name IS NULL OR table_name = '')
    `);
  } catch (e) {}

  addColumnIfNotExists('order_items', 'product_name', "TEXT DEFAULT ''");
  addColumnIfNotExists('order_items', 'total_price', 'REAL DEFAULT 0');
  addColumnIfNotExists('order_items', 'notes', 'TEXT');
  addColumnIfNotExists('customer_debts', 'customer_phone', 'TEXT');
  addColumnIfNotExists('customer_debts', 'customer_id', 'INTEGER');
  addColumnIfNotExists('customer_debts', 'table_name', 'TEXT');
  addColumnIfNotExists('customer_debts', 'notes', 'TEXT');
  addColumnIfNotExists('users', 'salary', 'REAL DEFAULT 3500');
  addColumnIfNotExists('users', 'phone', "TEXT DEFAULT ''");
  addColumnIfNotExists('users', 'shift_name', "TEXT DEFAULT ''");
  addColumnIfNotExists('users', 'shift_start', "TEXT DEFAULT '06:00'");
  addColumnIfNotExists('users', 'shift_end', "TEXT DEFAULT '14:00'");
  addColumnIfNotExists('users', 'must_change_password', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('stock_movements', 'user_id', 'INTEGER');
  addColumnIfNotExists('stock_movements', 'user_name', 'TEXT');
  addColumnIfNotExists('audit_log', 'actor_id', 'INTEGER');
  addColumnIfNotExists('audit_log', 'actor_name', 'TEXT');
  addColumnIfNotExists('audit_log', 'details', 'TEXT');
  addColumnIfNotExists('audit_log', 'entity_type', 'TEXT');
  addColumnIfNotExists('audit_log', 'entity_id', 'INTEGER');

  // Sections migration: rename hall values if needed
  addColumnIfNotExists('tables', 'section_id', 'INTEGER');
  addColumnIfNotExists('tables', 'qr_enabled', 'INTEGER DEFAULT 1');
  addColumnIfNotExists('tables', 'qr_token', 'TEXT');
  // Phase 3: Non-destructive migration to upgrade weak/missing tokens to 32-byte secure tokens
  try {
    const unTokened = queryAll("SELECT id, qr_token FROM tables WHERE qr_token IS NULL OR qr_token = '' OR length(qr_token) < 32");
    for (const t of unTokened) {
      let token = generateQrToken();
      while (queryGet("SELECT id FROM tables WHERE qr_token = ? AND id != ?", [token, t.id])) {
        token = generateQrToken();
      }
      runSql("UPDATE tables SET qr_token = ? WHERE id = ?", [token, t.id], { skipSave: true });
    }
  } catch (e) {}
  // Phase 3: Enforce UNIQUE index on tables.qr_token
  try {
    db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_qr_token_unique ON tables(qr_token) WHERE qr_token IS NOT NULL AND qr_token != ''");
  } catch (e) {}
  try { db.run("ALTER TABLE table_carts ADD COLUMN rev INTEGER DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE debt_payments ADD COLUMN payment_method TEXT DEFAULT 'cash'"); } catch (e) {}

  // Fix UNIQUE constraint on tables.number - allow same number across different halls
  try {
    const tblInfo = queryGet("SELECT sql FROM sqlite_master WHERE type='table' AND name='tables'");
    if (tblInfo && tblInfo.sql && tblInfo.sql.includes('number TEXT UNIQUE')) {
      db.run('PRAGMA foreign_keys = OFF');
      db.run('ALTER TABLE tables RENAME TO tables_old');
      db.run(`CREATE TABLE tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT NOT NULL,
        name TEXT NOT NULL,
        capacity INTEGER DEFAULT 4,
        status TEXT DEFAULT 'available',
        current_order_id INTEGER,
        hall TEXT DEFAULT 'indoor',
        section_id INTEGER,
        qr_enabled INTEGER DEFAULT 1,
        qr_token TEXT
      )`);
      db.run('INSERT INTO tables (id, number, name, capacity, status, current_order_id, hall, section_id, qr_enabled, qr_token) SELECT id, number, name, capacity, status, current_order_id, hall, section_id, COALESCE(qr_enabled, 1), qr_token FROM tables_old');
      db.run('DROP TABLE tables_old');
      db.run('PRAGMA foreign_keys = ON');
    }
  } catch (e) {
    try { db.run('PRAGMA foreign_keys = ON'); } catch (_) {}
  }

  healForeignKeyViolations();

  // Performance indexes for high-load scenarios (FIX-02 complete index set)
  try { db.run("CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_order_refunds_order_id ON order_refunds(order_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_order_refunds_shift_id ON order_refunds(shift_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_customer_debts_order_id ON customer_debts(order_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_customer_debts_customer_id ON customer_debts(customer_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON debt_payments(debt_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_debt_payments_shift_id ON debt_payments(shift_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_expenses_shift_id ON expenses(shift_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_shifts_closed_at ON shifts(closed_at)"); } catch (e) {}
  try { db.run("CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id)"); } catch (e) {}
  try { db.run("ALTER TABLE orders ADD COLUMN client_order_id TEXT"); } catch (e) {}
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_order_id ON orders(client_order_id)"); } catch (e) {}
  try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_no ON orders(invoice_no)"); } catch (e) {}
  try { db.run("ALTER TABLE users ADD COLUMN pin TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE users ADD COLUMN assigned_halls TEXT DEFAULT 'ALL'"); } catch (e) {}

  // Synchronize invoice_sequence to guarantee strictly monotonic next_number > existing orders
  const maxOrder = queryGet('SELECT MAX(CAST(invoice_no AS INTEGER)) AS m FROM orders WHERE invoice_no NOT LIKE "INV-%"');
  const maxExisting = maxOrder && maxOrder.m ? Number(maxOrder.m) : 0;
  const seqRow = queryGet('SELECT next_number FROM invoice_sequence WHERE id = 1');
  const currentSeq = seqRow && seqRow.next_number ? Number(seqRow.next_number) : 1;
  const safeNext = Math.max(currentSeq, maxExisting + 1);
  runSql('INSERT OR REPLACE INTO invoice_sequence (id, next_number) VALUES (1, ?)', [safeNext], { skipSave: true });

  seedIfEmpty();
  seedUsersIfEmpty();

  // Ensure every table has a cryptographically secure 32-byte QR token
  try {
    const unTokened = queryAll("SELECT id, qr_token FROM tables WHERE qr_token IS NULL OR qr_token = '' OR length(qr_token) < 32");
    for (const t of unTokened) {
      let token = generateQrToken();
      while (queryGet("SELECT id FROM tables WHERE qr_token = ? AND id != ?", [token, t.id])) {
        token = generateQrToken();
      }
      runSql("UPDATE tables SET qr_token = ? WHERE id = ?", [token, t.id], { skipSave: true });
    }
  } catch (e) {}
  if (!process.env.CAFE_QUICK_INIT) {
    migratePasswordsToBcrypt();
    autoBackupDaily();
    pruneOldBackups(30);
    runDatabaseMaintenance();
  }

  // Create baseline pristine backup if first run
  const initialBackup = path.join(getBackupDir(), 'cafe-pos-initial-baseline.db');
  if (!fs.existsSync(initialBackup)) {
    try {
      fs.writeFileSync(initialBackup, Buffer.from(safeDbExport()));
    } catch (_) {}
  }

  // Guarantee schema_version and app_version tracking for pristine DB or verified DB
  setDbUserVersion(CURRENT_SCHEMA_VERSION, db);
  runSql("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL, app_version TEXT NOT NULL)", [], { skipSave: true });
  for (const m of MIGRATIONS) {
    runSql("INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, app_version) VALUES (?, ?, ?, ?)", [m.version, m.name, new Date().toISOString(), APP_VERSION], { skipSave: true });
  }
  runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)", [String(CURRENT_SCHEMA_VERSION)], { skipSave: true });
  runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_version', ?)", [APP_VERSION], { skipSave: true });

  saveDbAtomic();
  return recoveryInfo;
}

// Non-destructive FK healing migration for v1.0.1 databases where PRAGMA foreign_keys was reset to 0 after export()
function healForeignKeyViolations(targetDb = db) {
  const d = targetDb || db;
  if (!d) return;
  try {
    d.run('PRAGMA foreign_keys = OFF');

    // 1. Snapshot table metadata onto historical orders before unlinking missing table_ids
    try {
      d.run(`
        UPDATE orders
        SET table_name = COALESCE(NULLIF(table_name, ''), (SELECT name FROM tables WHERE tables.id = orders.table_id)),
            table_number = COALESCE(NULLIF(table_number, ''), (SELECT number FROM tables WHERE tables.id = orders.table_id)),
            table_hall = COALESCE(NULLIF(table_hall, ''), (SELECT hall FROM tables WHERE tables.id = orders.table_id))
        WHERE table_id IS NOT NULL
      `);
    } catch (_) {}

    // 2. Unlink nullable foreign keys pointing to non-existent parent rows
    try { d.run('UPDATE products SET category_id = NULL WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM categories)'); } catch (_) {}
    try { d.run('UPDATE orders SET table_id = NULL WHERE table_id IS NOT NULL AND table_id NOT IN (SELECT id FROM tables)'); } catch (_) {}
    try { d.run('UPDATE orders SET shift_id = NULL WHERE shift_id IS NOT NULL AND shift_id NOT IN (SELECT id FROM shifts)'); } catch (_) {}
    try { d.run('UPDATE expenses SET shift_id = NULL WHERE shift_id IS NOT NULL AND shift_id NOT IN (SELECT id FROM shifts)'); } catch (_) {}
    try { d.run('UPDATE customer_debts SET customer_id = NULL WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers)'); } catch (_) {}
    try { d.run('UPDATE customer_debts SET order_id = NULL WHERE order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM orders)'); } catch (_) {}

    // 3. Reconstruct soft-deleted placeholder products for historical order_items / stock_movements referencing hard-deleted products
    try {
      d.run(`
        INSERT OR IGNORE INTO products (id, name, price, cost, category_id, stock_qty, is_deleted)
        SELECT
          oi.product_id,
          COALESCE(NULLIF(MAX(oi.product_name), ''), 'صنف مؤرشف #' || oi.product_id),
          COALESCE(MAX(oi.unit_price), 0),
          0,
          NULL,
          0,
          1
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.product_id IS NOT NULL AND p.id IS NULL
        GROUP BY oi.product_id
      `);
    } catch (_) {}

    try {
      d.run(`
        INSERT OR IGNORE INTO products (id, name, price, cost, category_id, stock_qty, is_deleted)
        SELECT
          sm.product_id,
          'صنف مؤرشف #' || sm.product_id,
          0,
          0,
          NULL,
          0,
          1
        FROM stock_movements sm
        LEFT JOIN products p ON p.id = sm.product_id
        WHERE sm.product_id IS NOT NULL AND p.id IS NULL
        GROUP BY sm.product_id
      `);
    } catch (_) {}

    // 4. Non-destructive reconciliation: Safely move orphaned child rows into _orphaned_records table (never delete historical records!)
    try {
      d.run(`
        CREATE TABLE IF NOT EXISTS _orphaned_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_table TEXT NOT NULL,
          record_id INTEGER NOT NULL,
          foreign_key_column TEXT NOT NULL,
          invalid_key_value INTEGER,
          record_json TEXT NOT NULL,
          reason TEXT NOT NULL,
          archived_at TEXT NOT NULL
        )
      `);

      function archiveOrphans(table, fkCol, parentTable, parentIdCol = 'id') {
        try {
          const res = d.exec(`SELECT * FROM ${table} WHERE ${fkCol} IS NOT NULL AND ${fkCol} NOT IN (SELECT ${parentIdCol} FROM ${parentTable})`);
          if (res && res[0] && res[0].values.length > 0) {
            const cols = res[0].columns;
            const rows = res[0].values;
            const fkIdx = cols.indexOf(fkCol);
            const idIdx = cols.indexOf('id');
            for (const r of rows) {
              const rowObj = {};
              cols.forEach((c, idx) => { rowObj[c] = r[idx]; });
              d.run(`
                INSERT INTO _orphaned_records (source_table, record_id, foreign_key_column, invalid_key_value, record_json, reason, archived_at)
                VALUES (?, ?, ?, ?, ?, 'Referenced parent record does not exist in ' || ?, ?)
              `, [table, r[idIdx], fkCol, r[fkIdx], JSON.stringify(rowObj), parentTable, new Date().toISOString()]);
            }
            d.run(`DELETE FROM ${table} WHERE ${fkCol} IS NOT NULL AND ${fkCol} NOT IN (SELECT ${parentIdCol} FROM ${parentTable})`);
            console.log(`[Heal FK] Safely moved ${rows.length} orphaned rows from ${table} to _orphaned_records table.`);
          }
        } catch (_) {}
      }

      archiveOrphans('employee_adjustments', 'user_id', 'users');
      archiveOrphans('shift_adjustments', 'shift_id', 'shifts');
      archiveOrphans('debt_payments', 'debt_id', 'customer_debts');
      archiveOrphans('order_refunds', 'order_id', 'orders');
    } catch (_) {}
  } finally {
    try { d.run('PRAGMA foreign_keys = ON'); } catch (_) {}
  }
}

// Password Migration: Hashes any unhashed passwords and flags default credentials
function migratePasswordsToBcrypt() {
  const users = queryAll('SELECT id, password, must_change_password FROM users');
  for (const u of users) {
    if (!u.password) continue;
    let pass = u.password;
    if (!pass.startsWith('$2a$') && !pass.startsWith('$2b$')) {
      const hashed = bcrypt.hashSync(pass, 10);
      runSql('UPDATE users SET password = ? WHERE id = ?', [hashed, u.id], { skipSave: true });
      pass = hashed;
    }
  }
  // فحص كلمات السر الافتراضية الضعيفة (1234 / 123456) وإلزام تغييرها
  try {
    if (users.length > 0) {
      for (const u of users) {
        if (!u.password) continue;
        try {
          if (bcrypt.compareSync('1234', u.password) || bcrypt.compareSync('123456', u.password)) {
            runSql('UPDATE users SET must_change_password = 1 WHERE id = ?', [u.id], { skipSave: true });
          }
        } catch (_) {}
      }
      runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('passwords_default_checked', '1')", [], { skipSave: true });
    }
  } catch (_) {}
}

function hasAdminUser() {
  const row = queryGet('SELECT id FROM users WHERE role = "admin" LIMIT 1');
  return Boolean(row);
}

function setupInitialAdmin(adminPassword, adminName = 'مدير النظام') {
  if (!adminPassword || typeof adminPassword !== 'string') {
    return { success: false, error: 'كلمة المرور مطلوبة' };
  }
  const cleanPass = adminPassword.trim();
  if (cleanPass.length < 12) {
    return { success: false, error: 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل' };
  }
  // Check common weak trivial sequences
  const weakPatterns = [
    '1234', '12345', '123456', '12345678', '123456789', '1234567890', '123456789012',
    'password', 'password1234', 'admin1234567', 'administrator', 'qwerty123456'
  ];
  if (weakPatterns.includes(cleanPass.toLowerCase())) {
    return { success: false, error: 'كلمة المرور ضعيفة وشائعة جداً، يرجى اختيار كلمة مرور أقوى' };
  }
  // Complexity: must contain both letters and numbers/symbols
  const hasLetters = /[a-zA-Z\u0600-\u06FF]/.test(cleanPass);
  const hasDigitsOrSymbols = /[\d\W_]/.test(cleanPass);
  if (!hasLetters || !hasDigitsOrSymbols) {
    return { success: false, error: 'كلمة المرور يجب أن تحتوي على أحرف وأرقام أو رموز' };
  }

  const hashed = bcrypt.hashSync(cleanPass, 10);
  const existingAdmin = queryGet('SELECT id FROM users WHERE role = "admin" LIMIT 1');
  if (existingAdmin) {
    return { success: false, error: 'يوجد حساب مدير مسجل بالفعل في النظام' };
  }
  runSql(`
    INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, ['admin', adminName, hashed, 'admin', '01000000000', 6000, 'جميع الأوقات', '00:00', '23:59', new Date().toISOString()]);
  saveDb(true);
  return { success: true };
}

function seedUsersIfEmpty() {
  // Phase 4: Do NOT seed hardcoded admin/1234 or cashier/123456 on fresh database.
  // First-run setup requires db.setupInitialAdmin()
}

function seedIfEmpty() {
  const countRow = queryGet('SELECT COUNT(*) AS c FROM categories');
  const prodRow = queryGet('SELECT COUNT(*) AS c FROM products');
  // ONLY seed if the database is completely fresh and empty (0 categories and 0 products)
  // NEVER wipe a client's customized menu!
  const needsMenuSeed = (!countRow || countRow.c === 0) && (!prodRow || prodRow.c === 0);

  if (needsMenuSeed) {
    if (process.env.CAFE_QUICK_INIT === '1') {
      runSql('INSERT INTO categories (id, name, icon, sort_order) VALUES (1, "مشروبات", "☕", 1)', [], { skipSave: true });
      runSql('INSERT INTO products (name, price, cost, category_id, stock_qty, low_stock_threshold, is_deleted) VALUES ("قهوة تجريبية", 20, 10, 1, 1000, 10, 0)', [], { skipSave: true });
    } else {
      const menuData = require('./menuData');

      for (const cat of menuData.categories) {
        runSql('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', [
          cat.id, cat.name, cat.icon || '☕', cat.sort_order || cat.id
        ], { skipSave: true });
      }

      // Insert all products
      for (const prod of menuData.products) {
        runSql(`
          INSERT INTO products (name, price, cost, category_id, stock_qty, low_stock_threshold, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `, [
          prod.name,
          prod.price,
          prod.cost || Math.round(prod.price * 0.35),
          prod.category_id,
          prod.stock_qty || 100,
          prod.low_stock_threshold || 10
        ], { skipSave: true });
      }
    }
  }

  // Seed Sections (dynamic halls)
  const secCount = queryGet('SELECT COUNT(*) AS c FROM sections')?.c || 0;
  if (secCount === 0) {
    const defaultSections = [
      { id: 1, name: 'أرضي', sort_order: 1 },
      { id: 2, name: 'علوي', sort_order: 2 },
      { id: 3, name: 'بارك', sort_order: 3 },
      { id: 4, name: 'عائلات', sort_order: 4 },
      { id: 5, name: 'بارك شباب', sort_order: 5 },
    ];
    for (const sec of defaultSections) {
      try {
        runSql('INSERT OR IGNORE INTO sections (id, name, sort_order) VALUES (?, ?, ?)', [sec.id, sec.name, sec.sort_order], { skipSave: true });
      } catch (_) {}
    }
  }

  // Insert Tables - using sections (only when no tables exist yet)
  const totalTables = queryGet("SELECT COUNT(*) AS c FROM tables")?.c || 0;
  if (totalTables === 0) {
    // أرضي - 8 tables
    for (let i = 1; i <= 8; i++) {
      runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
        `A${i}`, `طاولة ${i}`, 4, 'available', 'أرضي'
      ], { skipSave: true });
    }
    // علوي - 6 tables
    for (let i = 1; i <= 6; i++) {
      runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
        `U${i}`, `طاولة ${i}`, 4, 'available', 'علوي'
      ], { skipSave: true });
    }
    // بارك - 6 tables
    for (let i = 1; i <= 6; i++) {
      runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
        `P${i}`, `طاولة ${i}`, 4, 'available', 'بارك'
      ], { skipSave: true });
    }
    // عائلات - 4 tables
    for (let i = 1; i <= 4; i++) {
      runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
        `F${i}`, `طاولة ${i}`, 6, 'available', 'عائلات'
      ], { skipSave: true });
    }
    // بارك شباب - 6 tables
    for (let i = 1; i <= 6; i++) {
      runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
        `PS${i}`, `طاولة ${i}`, 4, 'available', 'بارك شباب'
      ], { skipSave: true });
    }
  }

  // Migration: Normalize all existing table halls to match sections exactly
  try {
    const existingSections = queryAll('SELECT id, name FROM sections');
    if (existingSections && existingSections.length > 0) {
      const normalizeStr = (s) => (s || '').trim().toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ');

      const normSecMap = new Map();
      for (const s of existingSections) {
        if (s.name) normSecMap.set(normalizeStr(s.name), s.name.trim());
      }
      // Explicit fallback for legacy english names
      normSecMap.set('indoor', 'أرضي');
      normSecMap.set('outdoor', 'علوي');

      const existingTables = queryAll('SELECT id, hall FROM tables');
      let changed = false;
      for (const t of existingTables) {
        const raw = (t.hall || '').trim();
        const norm = normalizeStr(raw);
        let matchedSection = normSecMap.get(norm);
        if (!matchedSection) {
          for (const [nSec, exactSec] of normSecMap.entries()) {
            if (norm && (norm.includes(nSec) || nSec.includes(norm))) {
              matchedSection = exactSec;
              break;
            }
          }
        }
        if (matchedSection && matchedSection !== t.hall) {
          runSql('UPDATE tables SET hall = ? WHERE id = ?', [matchedSection, t.id], { skipSave: true });
          changed = true;
        }
      }
      if (changed) {
        saveDb(true);
      }
    }
  } catch (migErr) {
    console.error('Migration of table halls error:', migErr);
  }

  // Settings
  const setts = [
    ['cafe_name', 'التكية أسيوط الجديدة'],
    ['cafe_address', 'وسط البلد - شارع الجمهورية'],
    ['cafe_phone', '01012345678'],
    ['receipt_footer', 'شكراً لزيارتكم ونتمنى لكم يوماً سعيداً ☕'],
    ['currency', 'ج.م'],
    ['allow_negative_stock', '0'],
    ['silent_print', '0'],
    ['printer_name', ''],
    ['bar_printer_name', ''],
    ['shisha_printer_name', 'شيشة'],
    ['enable_waiter_qr', 'true'],
    ['enable_notebook_for_admin', 'true'],
    ['require_check_print_before_checkout', 'true'],
    ['auto_print_receipt_on_checkout', '0'],
    ['shift_schedules', JSON.stringify([
      { id: 'shift_morning', name: 'الشيفت الصباحي', start: '06:00', end: '14:00', icon: '☀️' },
      { id: 'shift_evening', name: 'الشيفت المسائي', start: '14:00', end: '22:00', icon: '🌆' },
      { id: 'shift_night', name: 'الشيفت الليلي', start: '22:00', end: '06:00', icon: '🌙' }
    ])]
  ];
  for (const [k, v] of setts) {
    runSql('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v], { skipSave: true });
  }
}

// ---- Products & Categories ----
function listProducts() {
  return queryAll(`
    SELECT p.*,
      c.name AS category_name,
      c.icon AS category_icon
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE (p.is_deleted = 0 OR p.is_deleted IS NULL)
    ORDER BY p.category_id ASC, p.id ASC
  `);
}

function saveProduct(prod) {
  const name = prod.name ? String(prod.name).trim() : '';
  if (!name) {
    throw new Error('اسم الصنف مطلوب ولا يمكن أن يكون فارغاً');
  }

  const price = finance.money(prod.price, 'price');
  const cost = finance.money(prod.cost || 0, 'cost');
  const stockQty = Number(prod.stock_qty) || 0;
  const threshold = Number(prod.low_stock_threshold) || 10;
  const catId = prod.category_id ? Number(prod.category_id) : null;
  const barcode = prod.barcode || null;

  if (prod.id) {
    const existing = queryGet('SELECT * FROM products WHERE id = ?', [prod.id]);
    runSql(`
      UPDATE products
      SET name = ?, price = ?, cost = ?, category_id = ?, stock_qty = ?, low_stock_threshold = ?, barcode = ?, is_deleted = 0
      WHERE id = ?
    `, [name, price, cost, catId, stockQty, threshold, barcode, prod.id]);

    if (existing && existing.stock_qty !== stockQty) {
      const diff = stockQty - existing.stock_qty;
      runSql(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [prod.id, 'adjustment', diff, 'تعديل رصيد المخزون يدوياً', new Date().toISOString()]);
    }
    try { incrementMenuRevision(); } catch (_) {}
    return queryGet('SELECT * FROM products WHERE id = ?', [prod.id]);
  } else {
    const res = runSql(`
      INSERT INTO products (name, price, cost, category_id, stock_qty, low_stock_threshold, barcode, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `, [name, price, cost, catId, stockQty, threshold, barcode]);

    const newId = res.lastInsertRowid;
    if (stockQty > 0) {
      runSql(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [newId, 'initial', stockQty, 'رصيد مخزون افتتاحي', new Date().toISOString()]);
    }
    try { incrementMenuRevision(); } catch (_) {}
    return queryGet('SELECT * FROM products WHERE id = ?', [newId]);
  }
}

function deleteProduct(id, actor = null) {
  const prod = queryGet('SELECT * FROM products WHERE id = ?', [id]);
  if (!prod) return { success: false, error: 'المنتج غير موجود' };

  runSql('UPDATE products SET is_deleted = 1 WHERE id = ?', [id]);
  runSql(`
    INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    'soft_delete',
    'product',
    id,
    actor?.id || null,
    actor?.name || 'مدير',
    `حذف الصنف: ${prod.name}`,
    new Date().toISOString()
  ]);
  try { incrementMenuRevision(); } catch (_) {}
  return { success: true };
}

function listStockMovements(productId = null, limit = 100) {
  let sql = `
    SELECT sm.*, p.name AS product_name
    FROM stock_movements sm
    LEFT JOIN products p ON sm.product_id = p.id
  `;
  const params = [];
  if (productId) {
    sql += ' WHERE sm.product_id = ?';
    params.push(productId);
  }
  sql += ' ORDER BY sm.id DESC LIMIT ?';
  params.push(limit);
  return queryAll(sql, params);
}

function listAuditLog(limit = 100) {
  return queryAll('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit]);
}

function logItemVoidAudit({
  action = 'void_item',
  itemName = '',
  oldQty = 0,
  newQty = 0,
  cancelledQty = 0,
  unitPrice = 0,
  tableName = '',
  hall = '',
  reason = '',
  actorId = null,
  actorName = 'كاشير'
} = {}) {
  try {
    const now = new Date().toISOString();
    const safeCancelled = Number(cancelledQty) || Math.max(0, (Number(oldQty) || 0) - (Number(newQty) || 0));
    const safePrice = Number(unitPrice) || 0;
    const totalAmount = Math.round(safeCancelled * safePrice * 100) / 100;
    const payload = {
      itemName: String(itemName || '').trim(),
      oldQty: Number(oldQty) || 0,
      newQty: Number(newQty) || 0,
      cancelledQty: safeCancelled,
      unitPrice: safePrice,
      totalAmount,
      tableName: String(tableName || '').trim(),
      hall: String(hall || '').trim(),
      reason: String(reason || '').trim() || 'بدون سبب محدد'
    };
    runSql(
      `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [action, 'cart_item', 0, actorId || null, actorName || 'كاشير', JSON.stringify(payload), now]
    );
    return { success: true };
  } catch (err) {
    console.error('logItemVoidAudit error:', err);
    return { success: false, error: err.message };
  }
}

function getReportCancellations({ dateFrom = null, dateTo = null } = {}) {
  const today = getCairoTodayString();
  const fromStr = (dateFrom && String(dateFrom).trim()) || today;
  const toStr = (dateTo && String(dateTo).trim()) || today;

  const entries = [];
  let totalCancelledOrders = 0;
  let totalCancelledOrdersAmount = 0;
  let totalVoidedItemEvents = 0;
  let totalVoidedItemsQty = 0;
  let totalVoidedItemsAmount = 0;

  // 1. Cancelled Full Orders (status = 'cancelled') with all their products + refund actor/reason/time
  const cancelledOrders = queryAll(`
    SELECT o.id, o.invoice_no, o.table_name, o.table_number, o.table_hall, o.order_type,
           o.total, o.notes, o.cashier_name, o.created_at,
           (SELECT r.actor_name FROM order_refunds r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS refund_actor,
           (SELECT r.reason FROM order_refunds r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS refund_reason,
           (SELECT r.created_at FROM order_refunds r WHERE r.order_id = o.id ORDER BY r.id DESC LIMIT 1) AS refund_time
    FROM orders o
    WHERE o.status = 'cancelled'
    ORDER BY COALESCE(refund_time, o.created_at) DESC
  `);

  for (const ord of cancelledOrders) {
    const cancelTime = ord.refund_time || ord.created_at;
    const cancelDate = toCairoDateString(cancelTime);
    if (cancelDate && (cancelDate < fromStr || cancelDate > toStr)) continue;

    // Extract reason from refund_reason or bracketed [ملغي: ...] in notes
    let reason = (ord.refund_reason || '').trim();
    if (!reason && ord.notes) {
      const m = String(ord.notes).match(/\[ملغي:\s*([^\]]+)\]/);
      if (m && m[1]) reason = m[1].trim();
    }
    if (!reason) reason = 'بدون سبب محدد';

    const actorName = (ord.refund_actor || ord.cashier_name || 'كاشير').trim();
    const tableLabel = ord.order_type === 'dine_in'
      ? (ord.table_name || (ord.table_number ? `طاولة ${ord.table_number}` : 'صالة'))
      : (ord.order_type === 'delivery' ? 'دليفري' : 'تيك أواي');

    const ordItems = queryAll(
      'SELECT product_name, qty, unit_price, total_price FROM order_items WHERE order_id = ?',
      [ord.id]
    );

    totalCancelledOrders++;
    totalCancelledOrdersAmount = Math.round((totalCancelledOrdersAmount + (Number(ord.total) || 0)) * 100) / 100;

    if (ordItems.length > 0) {
      for (const it of ordItems) {
        const lineAmt = Number(it.total_price) || Math.round((Number(it.unit_price) || 0) * (Number(it.qty) || 0) * 100) / 100;
        entries.push({
          id: `ord-${ord.id}-${it.product_name}-${entries.length}`,
          type: 'cancelled_order',
          typeLabel: 'فاتورة ملغية',
          invoiceNo: ord.invoice_no || String(ord.id),
          tableName: tableLabel,
          productName: it.product_name || 'صنف',
          qty: Number(it.qty) || 1,
          unitPrice: Number(it.unit_price) || 0,
          totalAmount: lineAmt,
          reason,
          actorName,
          cancelledAt: cancelTime
        });
      }
    } else {
      entries.push({
        id: `ord-${ord.id}`,
        type: 'cancelled_order',
        typeLabel: 'فاتورة ملغية',
        invoiceNo: ord.invoice_no || String(ord.id),
        tableName: tableLabel,
        productName: `فاتورة كاملة #${ord.invoice_no || ord.id}`,
        qty: 1,
        unitPrice: Number(ord.total) || 0,
        totalAmount: Number(ord.total) || 0,
        reason,
        actorName,
        cancelledAt: cancelTime
      });
    }
  }

  // 2. Voided / Reduced Cart Items & Cleared Carts from audit_log
  const voidLogs = queryAll(`
    SELECT id, action, actor_name, details, created_at
    FROM audit_log
    WHERE action IN ('void_item', 'reduce_item_void', 'clear_cart_void')
    ORDER BY created_at DESC
    LIMIT 1000
  `);

  for (const log of voidLogs) {
    const logDate = toCairoDateString(log.created_at);
    if (logDate && (logDate < fromStr || logDate > toStr)) continue;

    let d = {};
    try { d = JSON.parse(log.details || '{}'); } catch (_) { d = { itemName: String(log.details || '') }; }

    const qty = Number(d.cancelledQty) || 1;
    const unitPrice = Number(d.unitPrice) || 0;
    const totalAmount = Number(d.totalAmount) || Math.round(qty * unitPrice * 100) / 100;

    totalVoidedItemEvents++;
    totalVoidedItemsQty += qty;
    totalVoidedItemsAmount = Math.round((totalVoidedItemsAmount + totalAmount) * 100) / 100;

    entries.push({
      id: `void-${log.id}`,
      type: log.action === 'clear_cart_void' ? 'clear_cart_void' : (log.action === 'reduce_item_void' ? 'reduce_item_void' : 'void_item'),
      typeLabel: log.action === 'clear_cart_void' ? 'تفريغ سلة' : (log.action === 'reduce_item_void' ? 'تخفيض كمية' : 'إلغاء صنف'),
      invoiceNo: '—',
      tableName: d.tableName || 'تيك أواي',
      productName: d.itemName || 'صنف محذوف',
      qty,
      unitPrice,
      totalAmount,
      reason: d.reason || 'بدون سبب محدد',
      actorName: log.actor_name || 'كاشير',
      cancelledAt: log.created_at
    });
  }

  entries.sort((a, b) => new Date(b.cancelledAt || 0).getTime() - new Date(a.cancelledAt || 0).getTime());

  return {
    dateFrom: fromStr,
    dateTo: toStr,
    summary: {
      totalEvents: entries.length,
      totalCancelledOrders,
      totalCancelledOrdersAmount,
      totalVoidedItemEvents,
      totalVoidedItemsQty,
      totalVoidedItemsAmount,
      grandCancelledAmount: Math.round((totalCancelledOrdersAmount + totalVoidedItemsAmount) * 100) / 100
    },
    entries
  };
}

function listCategories() {
  return queryAll('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
}

function saveCategory(cat) {
  const name = cat.name ? String(cat.name).trim() : '';
  if (!name) {
    throw new Error('اسم التصنيف مطلوب');
  }
  const icon = cat.icon || '☕';
  const sortOrder = Number(cat.sort_order) || 0;

  if (cat.id) {
    runSql('UPDATE categories SET name = ?, icon = ?, sort_order = ? WHERE id = ?', [name, icon, sortOrder, cat.id]);
    try { incrementMenuRevision(); } catch (_) {}
    return queryGet('SELECT * FROM categories WHERE id = ?', [cat.id]);
  } else {
    const res = runSql('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)', [name, icon, sortOrder]);
    try { incrementMenuRevision(); } catch (_) {}
    return queryGet('SELECT * FROM categories WHERE id = ?', [res.lastInsertRowid]);
  }
}

function deleteCategory(id) {
  const prodCount = queryGet('SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)', [id])?.c || 0;
  if (prodCount > 0) {
    return { success: false, error: 'لا يمكن حذف التصنيف لأنه يحتوي على أصناف مسجلة.' };
  }
  return withTransaction(() => {
    // فك ارتباط الأصناف المحذوفة منطقياً (is_deleted = 1) قبل حذف التصنيف لتجنب فشل قيد المفتاح الأجنبي
    runSql('UPDATE products SET category_id = NULL WHERE category_id = ? AND is_deleted = 1', [id], { skipSave: true });
    runSql('DELETE FROM categories WHERE id = ?', [id], { skipSave: true });
    try { incrementMenuRevision(); } catch (_) {}
    return { success: true };
  });
}

function reorderCategories(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { success: false, error: 'قائمة الترتيب غير صالحة' };
  }
  return withTransaction(() => {
    orderedIds.forEach((id, index) => {
      runSql('UPDATE categories SET sort_order = ? WHERE id = ?', [index + 1, id], { skipSave: true });
    });
    return listCategories();
  });
}

// ---- Sections (Dynamic Halls) ----
function listSections() {
  return queryAll('SELECT * FROM sections ORDER BY sort_order ASC, id ASC');
}

function saveSection(sec) {
  const cleanName = String((sec && sec.name) || '').trim();
  if (!cleanName) return { error: 'اسم القسم مطلوب' };
  const dup = queryGet('SELECT id FROM sections WHERE TRIM(name) = ? AND id != ?', [cleanName, Number(sec.id) || 0]);
  if (dup) return { error: 'يوجد قسم بنفس الاسم' };
  return withTransaction(() => {
    if (sec.id) {
      const oldSec = queryGet('SELECT name FROM sections WHERE id = ?', [sec.id]);
      runSql('UPDATE sections SET name = ?, sort_order = ? WHERE id = ?', [cleanName, sec.sort_order ?? 0, sec.id], { skipSave: true });
      if (oldSec && oldSec.name && oldSec.name !== cleanName) {
        runSql('UPDATE tables SET hall = ? WHERE hall = ?', [cleanName, oldSec.name], { skipSave: true });
      }
      return queryGet('SELECT * FROM sections WHERE id = ?', [sec.id]);
    } else {
      const maxOrder = queryGet('SELECT MAX(sort_order) AS m FROM sections');
      const nextOrder = ((maxOrder && maxOrder.m) || 0) + 1;
      const res = runSql('INSERT INTO sections (name, sort_order) VALUES (?, ?)', [cleanName, sec.sort_order ?? nextOrder], { skipSave: true });
      return queryGet('SELECT * FROM sections WHERE id = ?', [res.lastInsertRowid]);
    }
  });
}

function deleteSection(id) {
  const sec = queryGet('SELECT name FROM sections WHERE id = ?', [id]);
  if (!sec) return { success: false, error: 'المكان غير موجود' };

  const busyTables = queryAll(
    `SELECT id, number, name FROM tables WHERE hall = ? AND (current_order_id IS NOT NULL OR status != 'available' OR id IN (SELECT table_id FROM table_carts))`,
    [sec.name]
  );
  if (busyTables.length > 0) {
    return {
      success: false,
      error: 'لا يمكن حذف المكان لوجود طاولات عليها طلبات شغالة حالياً',
      blockedTables: busyTables
    };
  }

  return withTransaction(() => {
    // 1. مسح أي سلات معلقة مرتبطة بطاولات هذا القسم
    runSql(
      `DELETE FROM table_carts WHERE table_id IN (SELECT id FROM tables WHERE hall = ?)`,
      [sec.name], { skipSave: true }
    );
    // 2. حفظ لقطة بيانات الطاولة في الفواتير السابقة وفك ارتباط table_id قبل حذف الطاولات
    runSql(
      `UPDATE orders
       SET table_name = COALESCE(NULLIF(table_name, ''), (SELECT name FROM tables WHERE tables.id = orders.table_id)),
           table_number = COALESCE(NULLIF(table_number, ''), (SELECT number FROM tables WHERE tables.id = orders.table_id)),
           table_hall = COALESCE(NULLIF(table_hall, ''), (SELECT hall FROM tables WHERE tables.id = orders.table_id)),
           table_id = NULL
       WHERE table_id IN (SELECT id FROM tables WHERE hall = ?)`,
      [sec.name], { skipSave: true }
    );
    // 3. حذف طاولات هذا المكان حتى لا تظل عالقة كطاولات يتيمة
    runSql('DELETE FROM tables WHERE hall = ?', [sec.name], { skipSave: true });
    // 4. حذف القسم
    runSql('DELETE FROM sections WHERE id = ?', [id], { skipSave: true });
    return { success: true };
  });
}

function resetSectionTables({ sectionId, sectionName, tableCount, startNumber = 1, endNumber = null, prefix = '', force = false, adminPassword = null }) {
  // فحص الطاولات المشغولة قبل أي حذف
  if (!force) {
    const busyTables = queryAll(
      `SELECT id, number, name FROM tables WHERE hall = ? AND (current_order_id IS NOT NULL OR status != 'available' OR id IN (SELECT table_id FROM table_carts))`,
      [sectionName]
    );
    if (busyTables.length > 0) {
      return {
        success: false,
        error: 'يوجد طاولات عليها طلبات شغالة حالياً، لا يمكن إعادة الضبط',
        blockedTables: busyTables
      };
    }
  } else {
    // force=true يتطلب تأكيد كلمة مرور الأدمن
    const auth = verifyAdminPassword(adminPassword);
    if (!auth || !auth.success) {
      return { success: false, error: 'تجاوز الفحص يتطلب كلمة مرور المدير' };
    }
  }

  return withTransaction(() => {
    // مسح table_carts المرتبطة بطاولات هذا القسم قبل حذف الطاولات
    runSql(
      `DELETE FROM table_carts WHERE table_id IN (SELECT id FROM tables WHERE hall = ?)`,
      [sectionName], { skipSave: true }
    );
    // حفظ لقطة بيانات الطاولة في الفواتير السابقة وفك ارتباط table_id قبل إعادة ضبط الطاولات
    runSql(
      `UPDATE orders
       SET table_name = COALESCE(NULLIF(table_name, ''), (SELECT name FROM tables WHERE tables.id = orders.table_id)),
           table_number = COALESCE(NULLIF(table_number, ''), (SELECT number FROM tables WHERE tables.id = orders.table_id)),
           table_hall = COALESCE(NULLIF(table_hall, ''), (SELECT hall FROM tables WHERE tables.id = orders.table_id)),
           table_id = NULL
       WHERE table_id IN (SELECT id FROM tables WHERE hall = ?)`,
      [sectionName], { skipSave: true }
    );
    // حذف الطاولات القديمة لهذا القسم
    runSql('DELETE FROM tables WHERE hall = ?', [sectionName], { skipSave: true });

    let start = parseInt(startNumber) || 1;
    let end;
    if (endNumber !== null && endNumber !== undefined && endNumber !== '') {
      end = parseInt(endNumber);
      if (end < start) {
        const tmp = start;
        start = end;
        end = tmp;
      }
    } else {
      const count = Math.max(0, parseInt(tableCount) || 0);
      end = start + count - 1;
    }

    for (let i = start; i <= end; i++) {
      const tblNum = prefix ? `${prefix}${i}` : `${i}`;
      const tblName = (start === end) ? sectionName : `طاولة ${i}`;
      runSql('INSERT INTO tables (number, name, capacity, status, hall, qr_enabled, qr_token) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        tblNum, tblName, 4, 'available', sectionName, 1, generateQrToken()
      ], { skipSave: true });
    }
    return listTables();
  }, { immediateSave: true });
}

// ---- Tables & Halls ----
function listTables() {
  return queryAll('SELECT * FROM tables ORDER BY hall ASC, id ASC');
}

function saveTable(tbl) {
  const qrEnabled = tbl.qr_enabled !== undefined && tbl.qr_enabled !== null ? (tbl.qr_enabled ? 1 : 0) : 1;
  let qrToken = tbl.qr_token !== undefined && tbl.qr_token !== null ? String(tbl.qr_token).trim() : '';
  if (!qrToken && (!tbl.id || qrEnabled === 1)) {
    qrToken = generateQrToken();
  }
  if (tbl.id) {
    const existing = queryGet('SELECT * FROM tables WHERE id = ?', [tbl.id]);
    const num = tbl.number !== undefined ? tbl.number : existing?.number;
    const name = tbl.name !== undefined ? tbl.name : existing?.name;
    const cap = tbl.capacity !== undefined ? tbl.capacity : (existing?.capacity || 4);
    const hall = tbl.hall !== undefined ? tbl.hall : (existing?.hall || 'أرضي');
    const enabled = tbl.qr_enabled !== undefined ? qrEnabled : (existing?.qr_enabled !== undefined ? existing.qr_enabled : 1);
    let tok = tbl.qr_token !== undefined ? String(tbl.qr_token || '').trim() : String(existing?.qr_token || '').trim();
    if (!tok) {
      tok = generateQrToken();
    }
    runSql('UPDATE tables SET number = ?, name = ?, capacity = ?, hall = ?, qr_enabled = ?, qr_token = ? WHERE id = ?', [
      num,
      name,
      cap,
      hall,
      enabled,
      tok,
      tbl.id
    ]);
    return queryGet('SELECT * FROM tables WHERE id = ?', [tbl.id]);
  } else {
    const res = runSql('INSERT INTO tables (number, name, capacity, status, hall, qr_enabled, qr_token) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      tbl.number, tbl.name, tbl.capacity || 4, 'available', tbl.hall || 'أرضي', qrEnabled, qrToken || generateQrToken()
    ]);
    return queryGet('SELECT * FROM tables WHERE id = ?', [res.lastInsertRowid]);
  }
}

function toggleTableQr(id, enabled) {
  const val = (enabled === false || enabled === 0 || enabled === '0') ? 0 : 1;
  runSql('UPDATE tables SET qr_enabled = ? WHERE id = ?', [val, Number(id)]);
  saveDb(false);
  return queryGet('SELECT * FROM tables WHERE id = ?', [Number(id)]);
}

function regenerateTableQrToken(id) {
  let token = generateQrToken();
  while (queryGet('SELECT id FROM tables WHERE qr_token = ? AND id != ?', [token, Number(id)])) {
    token = generateQrToken();
  }
  runSql('UPDATE tables SET qr_token = ? WHERE id = ?', [token, Number(id)]);
  saveDb(false);
  return queryGet('SELECT * FROM tables WHERE id = ?', [Number(id)]);
}

function resetAllTableQrTokens() {
  const allTables = listTables();
  const used = new Set();
  for (const t of allTables) {
    let token = generateQrToken();
    while (used.has(token) || queryGet('SELECT id FROM tables WHERE qr_token = ? AND id != ?', [token, t.id])) {
      token = generateQrToken();
    }
    used.add(token);
    runSql('UPDATE tables SET qr_token = ? WHERE id = ?', [token, t.id], { skipSave: true });
  }
  saveDb(false);
  return listTables();
}

function deleteTable(id) {
  const tbl = queryGet('SELECT * FROM tables WHERE id = ?', [id]);
  if (!tbl) return { success: false, error: 'الطاولة غير موجودة' };
  if (tbl.status !== 'available' || tbl.current_order_id || queryGet('SELECT 1 AS x FROM table_carts WHERE table_id = ?', [id])) {
    return { success: false, error: 'لا يمكن حذف طاولة عليها طلب شغال حالياً' };
  }
  return withTransaction(() => {
    // حفظ لقطة بيانات الطاولة في الفواتير التاريخية وفك الارتباط قبل الحذف
    runSql(
      `UPDATE orders
       SET table_name = COALESCE(NULLIF(table_name, ''), ?),
           table_number = COALESCE(NULLIF(table_number, ''), ?),
           table_hall = COALESCE(NULLIF(table_hall, ''), ?),
           table_id = NULL
       WHERE table_id = ?`,
      [tbl.name || '', tbl.number || '', tbl.hall || '', id],
      { skipSave: true }
    );
    // مسح أي table_carts مرتبطة بهذه الطاولة لمنع تلوث البيانات عند إعادة استخدام نفس الـ ID
    runSql('DELETE FROM table_carts WHERE table_id = ?', [id], { skipSave: true });
    runSql('DELETE FROM tables WHERE id = ?', [id], { skipSave: true });
    return { success: true };
  });
}

function updateTableStatus(id, status, currentOrderId = null, force = false) {
  // B2: منع تحرير طاولة عليها سلة بأصناف
  if (status === 'available' && !force) {
    const cartRow = queryGet('SELECT cart_data FROM table_carts WHERE table_id = ?', [Number(id)]);
    if (cartRow && cartRow.cart_data) {
      try {
        const parsed = JSON.parse(cartRow.cart_data);
        if (Array.isArray(parsed.cart) && parsed.cart.length > 0) {
          return { success: false, error: 'الطاولة عليها طلب شغال' };
        }
      } catch (_) {}
    }
  }
  runSql('UPDATE tables SET status = ?, current_order_id = ? WHERE id = ?', [status, currentOrderId, id], { skipSave: true });
  saveDb(false);
  return { success: true };
}

// Persistent Table Carts in SQLite (Survives power outages and reboots)
function getTableCarts() {
  try {
    const rows = queryAll('SELECT table_id, cart_data, rev FROM table_carts');
    const result = {};
    for (const r of rows) {
      try {
        if (r.cart_data) {
          const parsed = JSON.parse(r.cart_data);
          parsed._rev = Number(r.rev) || 0;
          result[r.table_id] = parsed;
        }
      } catch (_) {}
    }
    return result;
  } catch (err) {
    console.error('getTableCarts error:', err);
    return {};
  }
}

function saveTableCart(tableId, cartData, options = {}) {
  if (!tableId) return { success: false };
  const isDebounced = options.debounce === true || (cartData && cartData.debounce === true);
  try {
    return withTransaction(() => {
      const numId = Number(tableId);
      const hasCart = cartData && cartData.cart && Array.isArray(cartData.cart) && cartData.cart.length > 0;
      if (hasCart && !queryGet('SELECT id FROM tables WHERE id = ?', [numId])) {
        runSql('DELETE FROM table_carts WHERE table_id = ?', [numId], { skipSave: true });
        return { success: false, error: 'الطاولة غير موجودة' };
      }

      if (!hasCart) {
        // فرع المسح: تفريغ سلة الطاولة وجعلها متاحة فوراً
        const deleteRev = cartData && cartData._rev !== undefined && cartData._rev !== null
          ? Number(cartData._rev) : null;
        const existRow = queryGet('SELECT rev, cart_data FROM table_carts WHERE table_id = ?', [numId]);
        if (existRow && cartData && cartData._force !== true && deleteRev !== null) {
          const dbRev = Number(existRow.rev) || 0;
          if (deleteRev !== dbRev) {
            let current = null;
            try { current = JSON.parse(existRow.cart_data); current._rev = dbRev; } catch (_) {}
            return { success: false, conflict: true, current, error: 'تعارض rev عند المسح: الطاولة تم تحديثها من جهاز آخر' };
          }
        }
        runSql('DELETE FROM table_carts WHERE table_id = ?', [numId], { skipSave: true });
        runSql(
          "UPDATE tables SET status = 'available', current_order_id = NULL WHERE id = ?",
          [numId],
          { skipSave: true }
        );
        return { success: true };
      }

      // فرع الحفظ بسلة فيها أصناف: فحص rev لاكتشاف التعارض
      const row = queryGet('SELECT rev, cart_data FROM table_carts WHERE table_id = ?', [numId]);
      const dbRev = row ? (Number(row.rev) || 0) : null;
      const clientRev = cartData._rev === undefined || cartData._rev === null ? null : Number(cartData._rev);
      // فحص أمني حاسم: لو الصف غير موجود في الداتابيز لكن العميل يرسل _rev قديم > 0،
      // فهذا يعني أن الطاولة تم نقلها أو تحصيلها أو مسحها، ويجب رفض إعادة إحيائها فوراً!
      if (!row && clientRev !== null && clientRev > 0 && cartData._force !== true) {
        return { success: false, conflict: true, current: null, error: 'تم نقل أو إغلاق هذه الطاولة بالفعل من عملية أخرى' };
      }
      if (row && clientRev === null && cartData._force !== true) {
        // الصف موجود في الداتابيز لكن المرسل لم يُرسل _rev — ارفض لمنع الكتابة العمياء
        let current = null;
        try { current = JSON.parse(row.cart_data); current._rev = dbRev; } catch (_) {}
        return { success: false, conflict: true, current, error: '_rev مطلوب لتحديث سلة موجودة' };
      }
      if (row && clientRev !== null && clientRev !== dbRev && cartData._force !== true) {
        let current = null;
        try { current = JSON.parse(row.cart_data); current._rev = dbRev; } catch (_) {}
        return { success: false, conflict: true, current };
      }
      const toStore = { ...cartData };
      delete toStore._rev;
      const newRev = (dbRev === null ? 0 : dbRev) + 1;
      runSql('INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at, rev) VALUES (?, ?, ?, ?)',
             [numId, JSON.stringify(toStore), new Date().toISOString(), newRev], { skipSave: true });
      runSql("UPDATE tables SET status = 'occupied' WHERE id = ?", [numId], { skipSave: true });
      return { success: true, rev: newRev };
    }, { immediateSave: !isDebounced });
  } catch (err) {
    console.error('saveTableCart error:', err);
    return { success: false, error: err.message };
  }
}

function saveAllTableCarts(cartsMap) {
  // ⛔ DISABLED — not called from App.jsx; individual appendItemsToTableCart / setTableCart used instead.
  // Restored in Round 6: prevents unvalidated bulk-write without rev-check or table existence guard.
  return { success: false, error: 'disabled' };
}


// إضافة أصناف ويتر لسلة الطاولة بشكل ذري داخل transaction
function appendItemsToTableCart(tableId, items, { customerName = '', notes = '' } = {}) {
  const tId = Number(tableId);
  if (!tId) throw new Error('طاولة غير صحيحة');
  return withTransaction(() => {
    if (!queryGet('SELECT id FROM tables WHERE id = ?', [tId])) throw new Error('الطاولة غير موجودة');
    const row = queryGet('SELECT cart_data, rev FROM table_carts WHERE table_id = ?', [tId]);
    let data = { cart: [], customerName: '', discountAmount: 0, orderNotes: '' };
    if (row && row.cart_data) { try { data = JSON.parse(row.cart_data); } catch (_) {} }
    if (!Array.isArray(data.cart)) data.cart = [];
    for (const incoming of items) {
      const qty = Number(incoming.qty) || 0;
      if (!Number.isInteger(qty) || qty <= 0) continue;
      if (!Number.isFinite(Number(incoming.price)) || Number(incoming.price) < 0) throw new Error('سعر صنف غير صحيح');
      const notesKey = incoming.notes || '';
      const idx = data.cart.findIndex((it) => Number(it.id) === Number(incoming.id) && (it.notes || '') === notesKey);
      if (idx >= 0) {
        data.cart[idx].qty = (Number(data.cart[idx].qty) || 0) + qty;
        data.cart[idx].sent_qty = (Number(data.cart[idx].sent_qty) || 0) + qty;
      } else {
        data.cart.push({ id: incoming.id, name: incoming.name, qty, price: Number(incoming.price), sent_qty: qty, notes: notesKey });
      }
    }
    if (customerName) data.customerName = customerName;
    if (notes && !data.orderNotes) data.orderNotes = notes;
    // B1: تصفير printedCheck عند إضافة أصناف جديدة
    data.printedCheck = false;
    data.printedCheckTime = null;
    const newRev = (row ? (Number(row.rev) || 0) : 0) + 1;
    runSql('INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at, rev) VALUES (?, ?, ?, ?)',
           [tId, JSON.stringify(data), new Date().toISOString(), newRev], { skipSave: true });
    runSql("UPDATE tables SET status = 'occupied' WHERE id = ?", [tId], { skipSave: true });
    return { success: true, cart: data, rev: newRev };
  }, { immediateSave: true });
}

// نقل طلب من طاولة إلى طاولة أخرى بشكل ذري وشامل — يقرأ كلا السلتين من الداتابيز ويدمجهما
// targetCartData مُتجاهل عمداً (يصل من App.jsx لكن الداتابيز هي المرجع الوحيد)
function transferTable({ fromTableId, toTableId, targetCartData = null }) {
  const sId = Number(fromTableId);
  const tId = Number(toTableId);
  if (!sId || !tId) return { success: false, error: 'أرقام الطاولات غير صحيحة' };
  if (sId === tId) return { success: false, error: 'لا يمكن النقل لنفس الطاولة' };

  return withTransaction(() => {
    if (!queryGet('SELECT id FROM tables WHERE id = ?', [sId]) || !queryGet('SELECT id FROM tables WHERE id = ?', [tId])) {
      return { success: false, error: 'طاولة غير موجودة' };
    }
    // 1. جلب سلة المصدر من الداتابيز
    const sourceRow = queryGet('SELECT cart_data FROM table_carts WHERE table_id = ?', [sId]);
    if (!sourceRow || !sourceRow.cart_data) {
      return { success: false, error: 'طاولة المصدر لا تحتوي على طلبات' };
    }
    let sData;
    try { sData = JSON.parse(sourceRow.cart_data); } catch (_) {
      return { success: false, error: 'خطأ في قراءة سلة المصدر' };
    }
    if (!Array.isArray(sData.cart)) sData.cart = [];
    if (sData.cart.length === 0) {
      return { success: false, error: 'طاولة المصدر لا تحتوي على أصناف' };
    }

    // 2. جلب سلة الهدف من الداتابيز
    const targetRow = queryGet('SELECT cart_data FROM table_carts WHERE table_id = ?', [tId]);
    let tData = { cart: [], customerName: '', discountAmount: 0, orderNotes: '' };
    if (targetRow && targetRow.cart_data) {
      try { tData = JSON.parse(targetRow.cart_data); } catch (_) {}
    }
    if (!Array.isArray(tData.cart)) tData.cart = [];

    // 3. دمج أصناف المصدر في الهدف (بمفتاح id + notes)
    for (const sItem of sData.cart) {
      const notesKey = sItem.notes || '';
      const idx = tData.cart.findIndex((it) => Number(it.id) === Number(sItem.id) && (it.notes || '') === notesKey);
      if (idx >= 0) {
        tData.cart[idx].qty = (Number(tData.cart[idx].qty) || 0) + (Number(sItem.qty) || 0);
        tData.cart[idx].sent_qty = (Number(tData.cart[idx].sent_qty) || 0) + (Number(sItem.sent_qty) || 0);
      } else {
        tData.cart.push({ ...sItem });
      }
    }

    // دمج بيانات العميل والخصم والملاحظات
    tData.customerName = tData.customerName || sData.customerName || '';
    tData.customerPhone = tData.customerPhone || sData.customerPhone || '';
    tData.discountAmount = Math.max(Number(tData.discountAmount || 0), Number(sData.discountAmount || 0));
    const noteParts = [tData.orderNotes, sData.orderNotes].filter(Boolean);
    tData.orderNotes = noteParts.length > 1 ? noteParts.join(' | ') : (noteParts[0] || '');
    // B1: لو الهدف كان فيه أصناف (يعني الإجمالي اتغير)، صفّر printedCheck
    const targetHadItems = targetRow && targetRow.cart_data && (() => {
      try { const p = JSON.parse(targetRow.cart_data); return Array.isArray(p.cart) && p.cart.length > 0; } catch (_) { return false; }
    })();
    if (targetHadItems) {
      tData.printedCheck = false;
      tData.printedCheckTime = null;
    } else {
      // الهدف كان فاضياً — احفظ قيمة المصدر
      tData.printedCheck = Boolean(sData.printedCheck);
      tData.printedCheckTime = sData.printedCheckTime || null;
    }

    // 4. حذف سلة المصدر
    runSql('DELETE FROM table_carts WHERE table_id = ?', [sId], { skipSave: true });

    // 5. حفظ السلة المدمجة للهدف بـ rev جديد
    const tRow = queryGet('SELECT rev FROM table_carts WHERE table_id = ?', [tId]);
    const newRev = (tRow ? (Number(tRow.rev) || 0) : 0) + 1;
    const toStore = { ...tData };
    delete toStore._rev;
    runSql('INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at, rev) VALUES (?, ?, ?, ?)',
           [tId, JSON.stringify(toStore), new Date().toISOString(), newRev], { skipSave: true });

    // 6. تحديث حالات الطاولات
    runSql("UPDATE tables SET status = 'available', current_order_id = NULL WHERE id = ?", [sId], { skipSave: true });
    runSql("UPDATE tables SET status = 'occupied' WHERE id = ?", [tId], { skipSave: true });

    return { success: true, tableCarts: getTableCarts() };
  }, { immediateSave: true });
}

function moveOrderToTable(payload) {
  return transferTable(payload);
}

// نقل صنف محدد من طاولة إلى أخرى مع الحفاظ على حالة الإرسال للبار
function transferTableItem({ fromTableId, toTableId, itemId, qty = 1, notes = null }) {
  const sId = Number(fromTableId);
  const tId = Number(toTableId);
  const itId = Number(itemId);
  const moveQty = Math.max(1, Number(qty) || 1);

  if (!sId || !tId || !itId) return { success: false, error: 'بيانات الطاولات أو الصنف غير مكتملة' };
  if (sId === tId) return { success: false, error: 'لا يمكن نقل الصنف لنفس الطاولة' };

  return withTransaction(() => {
    if (!queryGet('SELECT id FROM tables WHERE id = ?', [sId]) || !queryGet('SELECT id FROM tables WHERE id = ?', [tId])) {
      return { success: false, error: 'طاولة غير موجودة' };
    }
    // 1. جلب سلة طاولة المصدر
    const sRow = queryGet('SELECT cart_data, rev FROM table_carts WHERE table_id = ?', [sId]);
    if (!sRow || !sRow.cart_data) return { success: false, error: 'طاولة المصدر لا تحتوي على طلبات' };

    let sData;
    try { sData = JSON.parse(sRow.cart_data); } catch (_) { return { success: false, error: 'خطأ في قراءة سلة المصدر' }; }

    const sCart = sData.cart || [];
    // البحث بالـ id والـ notes معاً لتجنب التحام أصناف بملاحظات مختلفة
    const notesKey = notes !== null ? notes : undefined;
    const itemIdx = notesKey !== undefined
      ? sCart.findIndex(it => Number(it.id) === itId && (it.notes || '') === (notesKey || ''))
      : sCart.findIndex(it => Number(it.id) === itId);
    if (itemIdx === -1) return { success: false, error: 'الصنف غير موجود في طاولة المصدر' };

    const item = { ...sCart[itemIdx] };
    const actualMoveQty = Math.min(item.qty, moveQty);
    const itemSentQty = Number(item.sent_qty) || 0;
    const transferredSentQty = Math.min(itemSentQty, actualMoveQty);

    // إنقاص الكمية وحالة الإرسال من طاولة المصدر
    item.qty -= actualMoveQty;
    item.sent_qty = Math.max(0, itemSentQty - transferredSentQty);

    if (item.qty <= 0) {
      sCart.splice(itemIdx, 1);
    } else {
      sCart[itemIdx] = item;
    }
    sData.cart = sCart;
    // B1: صفّر printedCheck لطاولة المصدر قبل حفظها في قاعدة البيانات
    sData.printedCheck = false;
    sData.printedCheckTime = null;

    const sNewRev = (Number(sRow.rev) || 0) + 1;
    if (sCart.length === 0) {
      runSql('DELETE FROM table_carts WHERE table_id = ?', [sId], { skipSave: true });
      runSql("UPDATE tables SET status = 'available', current_order_id = NULL WHERE id = ?", [sId], { skipSave: true });
    } else {
      runSql('INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at, rev) VALUES (?, ?, ?, ?)', [
        sId, JSON.stringify(sData), new Date().toISOString(), sNewRev
      ], { skipSave: true });
    }

    // 2. جلب وتحديث سلة طاولة الهدف
    const tRow = queryGet('SELECT cart_data, rev FROM table_carts WHERE table_id = ?', [tId]);
    let tData = { cart: [], customerName: '', discountAmount: 0, orderNotes: '' };
    if (tRow && tRow.cart_data) {
      try { tData = JSON.parse(tRow.cart_data); } catch (_) {}
    }
    if (!Array.isArray(tData.cart)) tData.cart = [];

    const itemNotesKey = item.notes || '';
    const tItemIdx = tData.cart.findIndex(it => Number(it.id) === itId && (it.notes || '') === itemNotesKey);
    if (tItemIdx >= 0) {
      tData.cart[tItemIdx].qty = (Number(tData.cart[tItemIdx].qty) || 0) + actualMoveQty;
      tData.cart[tItemIdx].sent_qty = (Number(tData.cart[tItemIdx].sent_qty) || 0) + transferredSentQty;
    } else {
      tData.cart.push({
        ...item,
        qty: actualMoveQty,
        sent_qty: transferredSentQty
      });
    }

    const tNewRev = (tRow ? (Number(tRow.rev) || 0) : 0) + 1;
    // B1: صفّر printedCheck للسلتين عند نقل صنف
    sData.printedCheck = false;
    sData.printedCheckTime = null;
    tData.printedCheck = false;
    tData.printedCheckTime = null;
    runSql('INSERT OR REPLACE INTO table_carts (table_id, cart_data, updated_at, rev) VALUES (?, ?, ?, ?)', [
      tId, JSON.stringify(tData), new Date().toISOString(), tNewRev
    ], { skipSave: true });
    runSql("UPDATE tables SET status = 'occupied' WHERE id = ?", [tId], { skipSave: true });

    return {
      success: true,
      sourceCart: sData.cart,
      targetCart: tData.cart,
      tableCarts: getTableCarts()
    };
  }, { immediateSave: true });
}


function resetTables({ indoorCount = 6, outdoorCount = 6, force = false, adminPassword = null } = {}) {
  // فحص الطاولات المشغولة قبل أي حذف
  if (!force) {
    const busyTables = queryAll(
      `SELECT id, number, name, hall FROM tables WHERE current_order_id IS NOT NULL OR status != 'available'`
    );
    if (busyTables.length > 0) {
      return {
        success: false,
        error: 'يوجد طاولات عليها طلبات شغالة حالياً، لا يمكن إعادة الضبط',
        blockedTables: busyTables
      };
    }
  } else {
    const auth = verifyAdminPassword(adminPassword);
    if (!auth || !auth.success) {
      return { success: false, error: 'تجاوز الفحص يتطلب كلمة مرور المدير' };
    }
  }

  return withTransaction(() => {
    // مسح table_carts كاملاً قبل حذف الطاولات لمنع تلوث البيانات
    runSql('DELETE FROM table_carts', [], { skipSave: true });
    // حفظ لقطة بيانات الطاولة في الفواتير السابقة وفك ارتباط table_id قبل حذف الطاولات
    runSql(
      `UPDATE orders
       SET table_name = COALESCE(NULLIF(table_name, ''), (SELECT name FROM tables WHERE tables.id = orders.table_id)),
           table_number = COALESCE(NULLIF(table_number, ''), (SELECT number FROM tables WHERE tables.id = orders.table_id)),
           table_hall = COALESCE(NULLIF(table_hall, ''), (SELECT hall FROM tables WHERE tables.id = orders.table_id)),
           table_id = NULL
       WHERE table_id IS NOT NULL`,
      [],
      { skipSave: true }
    );
    runSql('DELETE FROM tables', [], { skipSave: true });
    const inCount = Number(indoorCount) || 0;
    const outCount = Number(outdoorCount) || 0;

    for (let i = 1; i <= inCount; i++) {
      runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
        `IN${i}`, `طاولة ${i}`, i <= 2 ? 2 : 4, 'available', 'أرضي'
      ], { skipSave: true });
    }
    for (let i = 1; i <= outCount; i++) {
      runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
        `OUT${i}`, `طاولة ${i}`, i <= 2 ? 2 : 4, 'available', 'علوي'
      ], { skipSave: true });
    }
    return listTables();
  });
}

function computeShiftCash(shiftId) {
  const sid = Number(shiftId);
  if (!sid) return null;
  const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [sid]);
  if (!shift) return null;

  const salesStats = queryGet(`
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(total), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' AND order_type != 'notebook' THEN COALESCE(NULLIF(cash_amount, 0), total) WHEN payment_method = 'split' THEN cash_amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total WHEN payment_method = 'split' THEN card_amount ELSE 0 END), 0) AS card_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'wallet' THEN total WHEN payment_method = 'split' THEN wallet_amount ELSE 0 END), 0) AS wallet_sales,
      COALESCE(SUM(CASE WHEN order_type = 'notebook' OR payment_method = 'notebook' THEN COALESCE(cash_amount, 0) ELSE 0 END), 0) AS notebook_cash
    FROM orders
    WHERE shift_id = ? AND status != 'cancelled'
  `, [sid]);

  const expTotal = queryGet('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE shift_id = ?', [sid])?.total || 0;

  const debtCashIn = queryGet('SELECT COALESCE(SUM(amount), 0) AS total FROM debt_payments WHERE shift_id = ? AND (payment_method = "cash" OR payment_method IS NULL OR payment_method = "")', [sid])?.total || 0;
  const debtCardIn = queryGet('SELECT COALESCE(SUM(amount), 0) AS total FROM debt_payments WHERE shift_id = ? AND payment_method = "card"', [sid])?.total || 0;
  const debtWalletIn = queryGet('SELECT COALESCE(SUM(amount), 0) AS total FROM debt_payments WHERE shift_id = ? AND payment_method = "wallet"', [sid])?.total || 0;
  const totalDebtCollections = roundCurrency(debtCashIn + debtCardIn + debtWalletIn);

  const refunds = queryAll(`
    SELECT r.refund_amount, r.payment_method, r.order_id, o.shift_id AS order_shift_id
    FROM order_refunds r
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE r.shift_id = ?
  `, [sid]);

  const cashRefundsOut = refunds.reduce((sum, r) => {
    if (r.payment_method !== 'cash') return sum;
    if (r.order_shift_id && Number(r.order_shift_id) === Number(sid)) {
      return sum;
    }
    return sum + (Number(r.refund_amount) || 0);
  }, 0);

  const totalRefundsAll = refunds.reduce((sum, r) => sum + (Number(r.refund_amount) || 0), 0);

  const cashSales = (Number(salesStats?.cash_sales) || 0) + (Number(salesStats?.notebook_cash) || 0);
  const cardSales = Number(salesStats?.card_sales) || 0;
  const walletSales = Number(salesStats?.wallet_sales) || 0;
  const totalSales = Number(salesStats?.total_sales) || 0;

  const adjustStats = queryGet(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) AS total_out
    FROM shift_adjustments
    WHERE shift_id = ?
  `, [sid]);
  const adjustTotal = roundCurrency((Number(adjustStats?.total_in) || 0) - (Number(adjustStats?.total_out) || 0), true);

  const opening = Number(shift.opening_cash) || 0;
  const expectedCash = Math.round((opening + cashSales + debtCashIn - expTotal - cashRefundsOut + adjustTotal) * 100) / 100;

  return {
    shift_id: sid,
    opening_cash: opening,
    total_sales: totalSales,
    cash_sales: cashSales,
    card_sales: cardSales,
    wallet_sales: walletSales,
    expenses_total: expTotal,
    debt_collections: totalDebtCollections,
    debt_cash_in: debtCashIn,
    debt_card_in: debtCardIn,
    debt_wallet_in: debtWalletIn,
    refunds_total: totalRefundsAll,
    cash_refunds_out: cashRefundsOut,
    adjustments_total: adjustTotal,
    adjustments_in: Number(adjustStats?.total_in) || 0,
    adjustments_out: Number(adjustStats?.total_out) || 0,
    expected_cash: expectedCash,
    order_count: Number(salesStats?.order_count) || 0
  };
}

function currentShift() {
  const shift = queryGet('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1');
  if (!shift) return null;

  const comp = computeShiftCash(shift.id);
  if (!comp) return null;

  const openedTime = shift.opened_at ? new Date(shift.opened_at).getTime() : Date.now();
  const openHours = Math.max(0, Math.round(((Date.now() - openedTime) / (1000 * 60 * 60)) * 10) / 10);
  const isOverdue = openHours >= 24;

  return {
    ...shift,
    open_hours: openHours,
    is_overdue: isOverdue,
    cash_sales: roundCurrency(comp.cash_sales),
    card_sales: roundCurrency(comp.card_sales),
    wallet_sales: roundCurrency(comp.wallet_sales),
    total_sales: roundCurrency(comp.total_sales),
    total_orders: comp.order_count,
    expenses_total: roundCurrency(comp.expenses_total),
    debt_collections: comp.debt_collections,
    debt_cash_in: roundCurrency(comp.debt_cash_in),
    debt_card_in: roundCurrency(comp.debt_card_in),
    debt_wallet_in: roundCurrency(comp.debt_wallet_in),
    refunds_total: roundCurrency(comp.refunds_total),
    cash_refunds_out: roundCurrency(comp.cash_refunds_out),
    adjustments_total: comp.adjustments_total,
    adjustments_in: roundCurrency(comp.adjustments_in),
    adjustments_out: roundCurrency(comp.adjustments_out),
    expected_cash: comp.expected_cash
  };
}

// ---- فحص وحماية سلامة تاريخ وساعة النظام (منع التلاعب وتراجع التاريخ للوراء) ----
function getLatestSystemTimestamp() {
  if (!db) return null;
  try {
    const lastStored = queryGet("SELECT value FROM settings WHERE key = 'last_system_time'")?.value;
    const maxShift = queryGet("SELECT MAX(COALESCE(closed_at, opened_at)) AS max_time FROM shifts")?.max_time;
    const maxOrder = queryGet("SELECT MAX(created_at) AS max_time FROM orders")?.max_time;
    const maxAudit = queryGet("SELECT MAX(created_at) AS max_time FROM audit_log")?.max_time;
    const maxExpense = queryGet("SELECT MAX(created_at) AS max_time FROM expenses")?.max_time;

    const candidates = [lastStored, maxShift, maxOrder, maxAudit, maxExpense].filter(Boolean);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return candidates[0];
  } catch (err) {
    console.error('getLatestSystemTimestamp error:', err);
    return null;
  }
}

function checkClockIntegrity() {
  if (!db) return { valid: true };
  try {
    const latest = getLatestSystemTimestamp();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    if (!latest) {
      try {
        runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [nowIso], { skipSave: true });
      } catch (_) {}
      return { valid: true };
    }

    const latestMs = new Date(latest).getTime();
    // سماحية 4 ساعات لتقلبات تزامن توقيت ويندوز وفرق التوقيت الصيفي/الشتوي (DST) وانقطاع الكهرباء
    const TOLERANCE_MS = 4 * 60 * 60 * 1000;

    if (nowMs < latestMs - TOLERANCE_MS) {
      const latestDate = new Date(latestMs);
      const currentDate = new Date(nowMs);
      const formatOpts = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      };
      const latestStr = latestDate.toLocaleString('ar-EG', formatOpts);
      const currentStr = currentDate.toLocaleString('ar-EG', formatOpts);

      return {
        valid: false,
        error: `⚠️ تنبيه أمني (تراجع في تاريخ الجهاز):\nتم رصد أن توقيت أو تاريخ الجهاز الحالي (${currentStr}) أقدم من آخر نشاط مسجل في النظام (${latestStr})!\nلا يُسمح بتسجيل الدخول أو فتح وردية بتوقيت سابق لتجنب خلط الحسابات والتلاعب.\nيرجى ضبط تاريخ وساعة الويندوز على اليوم والتوقيت الفعلي للمتابعة.`,
        latestTime: latest,
        currentTime: nowIso,
        clockTampered: true
      };
    }

    // لا نحدث last_system_time إذا كان التاريخ في المستقبل بأكثر من 30 يوماً بشكل غير معقول
    const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    if (nowMs > latestMs && (nowMs - latestMs < ONE_MONTH_MS || !latest)) {
      try {
        runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [nowIso], { skipSave: true });
      } catch (_) {}
    }

    return { valid: true };
  } catch (err) {
    console.error('checkClockIntegrity error:', err);
    return { valid: true };
  }
}

// مسار طوارئ للمدير لمزامنة وفك قفل حارس الساعة عند تغيير بطارية الجهاز أو تصحيح الوقت
function resetClockGuard({ adminPassword, actor = null }) {
  if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
    return { success: false, error: 'كلمة مرور المدير مطلوبة لإعادة مزامنة الساعة' };
  }
  const auth = verifyAdminPassword(adminPassword);
  if (!auth.success) {
    return { success: false, error: 'كلمة مرور المدير غير صحيحة' };
  }
  const nowIso = new Date().toISOString();
  const actorName = actor?.name || actor?.username || auth.admin?.name || 'مدير';
  const actorId = actor?.id || auth.admin?.id || null;

  return withTransaction(() => {
    runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [nowIso], { skipSave: true });
    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'clock_sync',
      'system',
      1,
      actorId,
      actorName,
      `إعادة ضبط ومزامنة حارس ساعة النظام إلى: ${nowIso}`,
      nowIso
    ], { skipSave: true });
    return { success: true };
  });
}

function openShift(openingCash = null, notes = '', user = null, shiftType = 'الشيفت الصباحي (الأول)') {
  const clockCheck = checkClockIntegrity();
  if (!clockCheck.valid) {
    return {
      success: false,
      error: clockCheck.error,
      clockTampered: true
    };
  }

  const current = currentShift();
  if (current) {
    return {
      ...current,
      success: false,
      error: `لديك شيفت مفتوح بالفعل برقم ${current.id}`
    };
  }

  // If no opening cash specified, carry forward the actual cash from the last closed shift
  let effOpening = 0;
  let handoverNotes = '';
  if (openingCash !== null && openingCash !== undefined && openingCash !== '') {
    effOpening = finance.money(openingCash, 'openingCash');
  } else {
    const lastClosed = queryGet('SELECT id, actual_cash FROM shifts WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 1');
    effOpening = lastClosed ? (Number(lastClosed.actual_cash) || 0) : 0;
    if (lastClosed) {
      handoverNotes = `الشيفت منقول تلقائياً من الشيفت السابق رقم ${lastClosed.id}`;
    }
  }
  const openedAt = new Date().toISOString();
  const userId = user?.id || null;
  const userName = user?.name || user?.username || 'كاشير';

  return withTransaction(() => {
    const res = runSql(`
      INSERT INTO shifts (opened_at, opening_cash, user_id, user_name, shift_type, notes, handover_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [openedAt, effOpening, userId, userName, shiftType, notes || '', handoverNotes], { skipSave: true });

    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['open', 'shift', res.lastInsertRowid, userId, userName, `فتح وردية جديدة (${shiftType}) بعهدة ${effOpening} ج.م`, openedAt], { skipSave: true });

    const cur = currentShift();
    return cur ? { ...cur, success: true } : { success: true };
  }, { immediateSave: true });
}

function getPendingShiftBlockers(shiftId) {
  try {
    const openTablesRow = queryGet(
      "SELECT COUNT(DISTINCT id) as count FROM tables WHERE status != 'available' OR id IN (SELECT table_id FROM table_carts)"
    );
    const openTablesCount = openTablesRow ? (openTablesRow.count || 0) : 0;

    let pendingOrdersCount = 0;
    if (shiftId) {
      const pendingOrdersRow = queryGet(
        "SELECT COUNT(*) as count FROM orders WHERE shift_id = ? AND status NOT IN ('completed', 'cancelled')",
        [shiftId]
      );
      pendingOrdersCount = pendingOrdersRow ? (pendingOrdersRow.count || 0) : 0;
    } else {
      const pendingOrdersRow = queryGet(
        "SELECT COUNT(*) as count FROM orders WHERE status NOT IN ('completed', 'cancelled')"
      );
      pendingOrdersCount = pendingOrdersRow ? (pendingOrdersRow.count || 0) : 0;
    }

    return {
      openTablesCount,
      pendingOrdersCount
    };
  } catch (err) {
    console.error('getPendingShiftBlockers error:', err);
    return { openTablesCount: 0, pendingOrdersCount: 0 };
  }
}

function closeShift(shiftId, actualCash = null, notes = '', user = null, adminOverridePassword = null) {
  const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [shiftId]);
  if (!shift) return { success: false, error: 'الشيفت غير موجود' };
  if (shift.closed_at) {
    return {
      success: true,
      alreadyClosed: true,
      closingCash: shift.actual_cash !== null ? shift.actual_cash : shift.closing_cash,
      expectedCash: shift.closing_cash,
      actualCash: shift.actual_cash,
      cashDifference: shift.cash_difference
    };
  }

  const blockers = getPendingShiftBlockers(shiftId);
  const currentSettings = getSettings();
  const isTransferPasswordRequired = currentSettings.require_password_transfer_tables === 'true' || currentSettings.require_password_transfer_tables === true;
  if (isTransferPasswordRequired && (blockers.openTablesCount > 0 || blockers.pendingOrdersCount > 0)) {
    let overrideOk = false;
    if (adminOverridePassword) {
      const auth = verifyAdminPassword(adminOverridePassword);
      if (auth && auth.success) {
        overrideOk = true;
      }
    }
    if (!overrideOk) {
      return {
        success: false,
        error: 'يوجد طاولات مفتوحة أو فواتير معلقة',
        openTablesCount: blockers.openTablesCount,
        pendingOrdersCount: blockers.pendingOrdersCount,
        requiresAdminOverride: true,
        isBlockedByOpenOrders: true
      };
    }
  }

  if (actualCash === null || actualCash === undefined || actualCash === '') {
    return { success: false, error: 'يجب تحديد النقدية الفعلية لإغلاق الشيفت' };
  }
  if (Number(actualCash) < 0) {
    return { success: false, error: 'النقدية الفعلية لا يمكن أن تكون قيمة سالبة' };
  }

  let effectiveHandoverNotes = notes || '';
  if (user && shift.user_id && user.id && user.id !== shift.user_id) {
    if (user.role !== 'admin') {
      return { success: false, error: 'لا يمكن إغلاق شيفت خاص بمستخدم آخر' };
    }
    const handoverTag = `[تم الإغلاق والتسليم بواسطة: ${user.name || user.username} (الشيفت مفتوح لـ: ${shift.user_name || 'كاشير'})]`;
    effectiveHandoverNotes = effectiveHandoverNotes ? `${handoverTag} ${effectiveHandoverNotes}` : handoverTag;
  }

  const shiftStats = computeShiftCash(shiftId);
  const expectedCash = shiftStats ? shiftStats.expected_cash : 0;
  let numActualCash = expectedCash;
  if (actualCash !== null && actualCash !== undefined && actualCash !== '') {
    numActualCash = finance.money(actualCash, 'actualCash');
  }
  numActualCash = Math.max(0, numActualCash);
  const cashDifference = Math.round((numActualCash - expectedCash) * 100) / 100;
  const closingTime = new Date().toISOString();

  const result = withTransaction(() => {
    runSql(`
      UPDATE shifts
      SET closed_at = ?,
          closing_cash = ?,
          cash_sales = ?,
          card_sales = ?,
          wallet_sales = ?,
          expenses_total = ?,
          actual_cash = ?,
          cash_difference = ?,
          notes = ?,
          handover_notes = ?,
          debt_collections = ?,
          refunds_total = ?,
          total_sales = ?
      WHERE id = ?
    `, [
      closingTime,
      expectedCash,
      roundCurrency(shiftStats?.cash_sales || 0),
      roundCurrency(shiftStats?.card_sales || 0),
      roundCurrency(shiftStats?.wallet_sales || 0),
      roundCurrency(shiftStats?.expenses_total || 0),
      numActualCash,
      cashDifference,
      notes || '',
      effectiveHandoverNotes || '',
      roundCurrency(shiftStats?.debt_collections || 0),
      roundCurrency(shiftStats?.refunds_total || 0),
      roundCurrency(shiftStats?.total_sales || 0),
      shiftId
    ], { skipSave: true });

    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'close_shift',
      'shift',
      shiftId,
      user?.id || shift.user_id || null,
      user?.name || shift.user_name || 'كاشير',
      `إغلاق الوردية برصيد فعلي ${numActualCash} ج.م (المتوقع: ${expectedCash} ج.م)`,
      closingTime
    ], { skipSave: true });

    return {
      success: true,
      alreadyClosed: false,
      closingCash: numActualCash,
      expectedCash: expectedCash,
      actualCash: numActualCash,
      cashDifference: cashDifference,
      totalSales: roundCurrency(shiftStats?.total_sales || 0),
      totalOrders: shiftStats?.order_count || 0
    };
  }, { immediateSave: true });

  // Automated backup on closeShift
  try {
    autoBackupShift(shiftId);
    pruneOldBackups(30);
  } catch (err) {
    console.error('Failed to create shift close backup:', err);
  }

  return result;
}

function listShifts(limit = 50, userId = null, includeEmpty = false) {
  let sql = 'SELECT * FROM shifts';
  const params = [];
  const whereClauses = [];

  if (userId) {
    whereClauses.push('user_id = ?');
    params.push(userId);
  }

  if (!includeEmpty) {
    // إخفاء الشيفتات المغلقة الصفرية (فتح بـ 0 وقفل بـ 0 وبدون أي مبيعات أو مصاريف أو فواتير)
    whereClauses.push(`NOT (
      closed_at IS NOT NULL 
      AND COALESCE(opening_cash, 0) = 0 
      AND COALESCE(actual_cash, 0) = 0 
      AND COALESCE(total_sales, 0) = 0 
      AND COALESCE(cash_sales, 0) = 0 
      AND COALESCE(expenses_total, 0) = 0 
      AND COALESCE(debt_collections, 0) = 0
      AND (SELECT COUNT(*) FROM orders WHERE shift_id = shifts.id AND status != 'cancelled') = 0
    )`);
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  return queryAll(sql, params);
}

function addShiftAdjustment({ shiftId, type, amount, reason = '', actor = null } = {}) {
  const sid = Number(shiftId);
  if (!sid) throw new Error('الشيفت غير محدد');
  const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [sid]);
  if (!shift) throw new Error('الشيفت غير موجود');

  // لا يمكن تسوية وردية مغلقة إلا بصلاحية مدير
  if (shift.closed_at && (!actor || actor.role !== 'admin')) {
    throw new Error('لا يمكن تسوية شيفت مغلق إلا بواسطة المدير');
  }

  if (type !== 'in' && type !== 'out') {
    throw new Error("نوع التسوية غير صالح (يجب أن يكون 'in' أو 'out')");
  }

  const numAmount = finance.money(amount, 'amount');
  if (numAmount <= 0) throw new Error('يجب إدخال مبلغ صحيح أكبر من الصفر');

  const now = new Date().toISOString();
  const actorName = actor?.name || actor?.username || 'الإدارة';
  const cleanReason = String(reason || '').trim();

  return withTransaction(() => {
    const res = runSql(`
      INSERT INTO shift_adjustments (shift_id, type, amount, reason, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [sid, type, numAmount, cleanReason, actorName, now], { skipSave: true });

    // قاعدة محاسبية ثابتة (FIX-03 / A3):
    // لقطة الإغلاق (closing_cash، actual_cash المعدود فعلياً، cash_difference وقت الإغلاق) تاريخ ثابت لا يتغير أبداً بعد الإغلاق.
    // التسويات اللاحقة بعد الإغلاق تُسجل كصفوف منفصلة في shift_adjustments + سجل التدقيق audit_log وتُحسب وتُعرض منفصلة في التقارير.
    const isPostClose = Boolean(shift.closed_at);

    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'shift_adjustment',
      'shift',
      sid,
      actor?.id || null,
      actorName,
      `${isPostClose ? 'تسوية لاحقة بعد الإغلاق' : 'تسوية شيفت'} (${type === 'in' ? 'إضافة' : 'خصم/يومية'}): ${numAmount} ج.م - السبب: ${cleanReason || 'بدون سبب'}`,
      now
    ], { skipSave: true });

    return {
      success: true,
      id: res.lastInsertRowid,
      isPostClose,
      adjustment: queryGet('SELECT * FROM shift_adjustments WHERE id = ?', [res.lastInsertRowid])
    };
  }, { immediateSave: true });
}

function listShiftAdjustments(shiftId) {
  const sid = Number(shiftId);
  if (!sid) return [];
  return queryAll('SELECT * FROM shift_adjustments WHERE shift_id = ? ORDER BY id DESC', [sid]);
}

function getUserShiftIds(userId) {
  const shifts = queryAll('SELECT id FROM shifts WHERE user_id = ?', [userId]);
  return shifts.map((s) => s.id);
}

// ---- Users & Attendance ----
function listUsers() {
  return queryAll('SELECT id, username, name, role, phone, COALESCE(salary, 3500) AS salary, shift_name, shift_start, shift_end, created_at, COALESCE(must_change_password, 0) AS must_change_password, pin, COALESCE(assigned_halls, "ALL") AS assigned_halls FROM users ORDER BY role DESC, id ASC');
}

function listPublicUsers() {
  return queryAll('SELECT id, username, name, role FROM users ORDER BY role DESC, id ASC');
}

function getUser(id) {
  return queryGet('SELECT id, username, name, role, phone, COALESCE(salary, 3500) AS salary, shift_name, shift_start, shift_end, created_at, COALESCE(must_change_password, 0) AS must_change_password, pin, COALESCE(assigned_halls, "ALL") AS assigned_halls FROM users WHERE id = ?', [id]);
}

function saveUser(user) {
  const sal = (user.salary !== null && user.salary !== undefined && user.salary !== '' && Number.isFinite(Number(user.salary)))
    ? Math.max(0, Number(user.salary))
    : 3500;
  if (!user.username || String(user.username).trim() === '') {
    throw new Error('اسم المستخدم مطلوب');
  }

  const duplicate = user.id
    ? queryGet('SELECT id FROM users WHERE username = ? AND id != ?', [user.username, user.id])
    : queryGet('SELECT id FROM users WHERE username = ?', [user.username]);
  if (duplicate) {
    throw new Error('اسم المستخدم مستخدم بالفعل');
  }

  let passwordHash = null;
  if (user.password && String(user.password).trim() !== '') {
    const rawPass = String(user.password).trim();
    if (rawPass.length < MIN_PASSWORD_LENGTH && !rawPass.startsWith('$2a$') && !rawPass.startsWith('$2b$')) {
      throw new Error(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
    }
    const isWeakDefault = rawPass === '1234' || rawPass === '123456' || rawPass === '000000' || rawPass === '111111';
    if (rawPass.startsWith('$2a$') || rawPass.startsWith('$2b$')) {
      passwordHash = rawPass;
    } else {
      passwordHash = bcrypt.hashSync(rawPass, 10);
    }
    if (isWeakDefault && user.must_change_password === undefined) {
      user.must_change_password = 1;
    }
  }

  const mustChange = user.must_change_password !== undefined ? (Number(user.must_change_password) || 0) : (user.id ? undefined : 0);
  const pinVal = user.pin !== undefined ? (String(user.pin).trim() || null) : undefined;
  const hallsVal = user.assigned_halls !== undefined
    ? (typeof user.assigned_halls === 'string' ? user.assigned_halls : JSON.stringify(user.assigned_halls))
    : (user.id ? undefined : 'ALL');

  if (user.id) {
    const existing = getUser(user.id);
    let finalPin = pinVal !== undefined ? pinVal : (existing?.pin || null);
    const finalHalls = hallsVal !== undefined ? hallsVal : (existing?.assigned_halls || 'ALL');

    // If admin changed the main password and did not set a new distinct PIN, sync/clear old PIN so old credentials stop working immediately
    if (passwordHash && existing && finalPin === (existing.pin || null)) {
      finalPin = String(user.password).trim();
    } else if (!passwordHash && finalPin && existing && finalPin !== (existing.pin || null) && finalPin.length >= MIN_PASSWORD_LENGTH) {
      // If admin updated the PIN field directly, also sync passwordHash
      passwordHash = bcrypt.hashSync(finalPin, 10);
    }

    if (passwordHash) {
      const mustVal = mustChange !== undefined ? mustChange : 0;
      runSql(`
        UPDATE users
        SET username = ?, name = ?, password = ?, role = ?, phone = ?, salary = ?, shift_name = ?, shift_start = ?, shift_end = ?, must_change_password = ?, pin = ?, assigned_halls = ?
        WHERE id = ?
      `, [user.username, user.name, passwordHash, user.role || 'cashier', user.phone || '', sal, user.shift_name || '', user.shift_start || '06:00', user.shift_end || '14:00', mustVal, finalPin, finalHalls, user.id]);
    } else {
      runSql(`
        UPDATE users
        SET username = ?, name = ?, role = ?, phone = ?, salary = ?, shift_name = ?, shift_start = ?, shift_end = ?, pin = ?, assigned_halls = ?
        WHERE id = ?
      `, [user.username, user.name, user.role || 'cashier', user.phone || '', sal, user.shift_name || '', user.shift_start || '06:00', user.shift_end || '14:00', finalPin, finalHalls, user.id]);
    }
    return getUser(user.id);
  } else {
    if (!passwordHash) {
      throw new Error(`كلمة المرور مطلوبة لإنشاء موظف جديد ويجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف/أرقام على الأقل`);
    }
    const res = runSql(`
      INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password, pin, assigned_halls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [user.username, user.name, passwordHash, user.role || 'cashier', user.phone || '', sal, user.shift_name || '', user.shift_start || '06:00', user.shift_end || '14:00', new Date().toISOString(), mustChange !== undefined ? mustChange : 1, pinVal || null, hallsVal || 'ALL']);
    return getUser(res.lastInsertRowid);
  }
}

function deleteUser(id) {
  const user = getUser(id);
  if (!user) return { success: false, error: 'المستخدم غير موجود' };
  const openShiftForUser = queryGet('SELECT id FROM shifts WHERE user_id = ? AND closed_at IS NULL LIMIT 1', [id]);
  if (openShiftForUser) {
    return { success: false, error: 'لا يمكن حذف موظف لديه وردية مفتوحة حالياً — أغلق الوردية أولاً' };
  }
  if (user.role === 'admin') {
    const adminCount = queryGet('SELECT COUNT(*) AS c FROM users WHERE role = "admin"')?.c || 0;
    if (adminCount <= 1) {
      return { success: false, error: 'لا يمكن حذف المدير الرئيسي الوحيد للنظام' };
    }
  }
  return withTransaction(() => {
    runSql('DELETE FROM employee_adjustments WHERE user_id = ?', [id], { skipSave: true });
    runSql('UPDATE shifts SET user_id = NULL WHERE user_id = ?', [id], { skipSave: true });
    runSql('UPDATE orders SET user_id = NULL WHERE user_id = ?', [id], { skipSave: true });
    runSql('UPDATE expenses SET user_id = NULL WHERE user_id = ?', [id], { skipSave: true });
    runSql('UPDATE stock_movements SET user_id = NULL WHERE user_id = ?', [id], { skipSave: true });
    runSql('DELETE FROM users WHERE id = ?', [id], { skipSave: true });
    return { success: true };
  }, { immediateSave: true });
}

// Emergency admin password reset — uses a cryptographic Ed25519 unlock code tied to this machine
// The code is generated by the vendor tool using the same private key as the license/unlock system
// This runs WITHOUT requiring an active session (helps locked-out admins)
function resetAdminPassword(masterPin, newPassword, actor = null) {
  if (!newPassword || String(newPassword).trim().length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل` };
  }
  // التحقق عبر نفس نظام التوقيع الرقمي المستخدم في الترخيص (Ed25519)
  // كود الاسترجاع صالح فقط لهذا الجهاز بعينه، ولا يمكن توليده إلا من المفتاح الخاص بالمورّد.
  if (!masterPin || typeof masterPin !== 'string' || !masterPin.trim()) {
    return { success: false, error: 'رمز الاسترجاع مطلوب' };
  }
  try {
    const machineId = getMachineId();
    const signData = `RESET_ADMIN|${machineId}`;
    const signature = Buffer.from(masterPin.trim(), 'base64');
    let sigValid = crypto.verify(null, Buffer.from(signData, 'utf8'), PUBLIC_KEY_PEM, signature);
    if (!sigValid) {
      // توافق عكسي مع الأكواد المولدة بالنظام السابق
      const legacySignData = `UNLOCK_TAMPER|${machineId}`;
      sigValid = crypto.verify(null, Buffer.from(legacySignData, 'utf8'), PUBLIC_KEY_PEM, signature);
    }
    if (!sigValid) {
      return { success: false, error: 'رمز الاسترجاع غير صحيح أو لا يخص هذا الجهاز' };
    }
  } catch (e) {
    return { success: false, error: 'رمز الاسترجاع غير صالح' };
  }
  const newHash = bcrypt.hashSync(String(newPassword).trim(), 10);
  // Reset ALL admin users
  runSql("UPDATE users SET password = ?, must_change_password = 0 WHERE role = 'admin'", [newHash]);
  const admins = queryAll("SELECT id, username, name FROM users WHERE role = 'admin'");
  let resultMsg = '';
  if (admins.length === 0) {
    // No admin exists, create one
    runSql(
      'INSERT INTO users (username, name, password, role, phone, salary, shift_name, shift_start, shift_end, created_at, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['admin', 'مدير النظام', newHash, 'admin', '01000000000', 6000, 'جميع الأوقات', '00:00', '23:59', new Date().toISOString(), 0]
    );
    resultMsg = 'تم إنشاء حساب أدمن جديد';
  } else {
    resultMsg = 'تم إعادة تعيين كلمة مرور المدير';
  }

  // Task 9: Audit logging for critical administrative reset
  try {
    const actorName = actor ? (actor.name || actor.username) : 'Vendor Emergency Key';
    runSql('INSERT INTO audit_log (action, entity_type, details, actor_name, created_at) VALUES (?, ?, ?, ?, ?)', [
      'RESET_ADMIN_PASSWORD',
      'user',
      'إعادة تعيين كلمة مرور المدير العام عبر كود الاسترجاع المعتمد',
      actorName,
      new Date().toISOString()
    ], { skipSave: true });
  } catch (auditErr) {
    console.error('Failed to log admin password reset in audit_log:', auditErr);
  }

  return { success: true, message: resultMsg, resetCount: admins.length, admins: admins.map(a => a.username) };
}

// Phase 4: Progressive Account Lockout Protection against Brute-Force
const loginLockoutMap = new Map(); // key -> { count, lockedUntil, lastAttempt }
const LOCKOUT_TIER1_COUNT = 5;
const LOCKOUT_TIER1_MS = 60 * 1000;      // 1 minute
const LOCKOUT_TIER2_COUNT = 10;
const LOCKOUT_TIER2_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginLockout(key) {
  const entry = loginLockoutMap.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (entry.lockedUntil && now < entry.lockedUntil) {
    const remainSec = Math.ceil((entry.lockedUntil - now) / 1000);
    return { locked: true, error: `تم قفل الحساب مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى المحاولة بعد ${remainSec} ثانية.` };
  }
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.lockedUntil = null;
    entry.count = LOCKOUT_TIER1_COUNT - 1;
  }
  return null;
}

function recordFailedLogin(key) {
  const now = Date.now();
  const entry = loginLockoutMap.get(key) || { count: 0, lockedUntil: null, lastAttempt: now };
  entry.count++;
  entry.lastAttempt = now;
  if (entry.count >= LOCKOUT_TIER2_COUNT) {
    entry.lockedUntil = now + LOCKOUT_TIER2_MS;
  } else if (entry.count >= LOCKOUT_TIER1_COUNT) {
    entry.lockedUntil = now + LOCKOUT_TIER1_MS;
  }
  loginLockoutMap.set(key, entry);
}

function recordSuccessfulLogin(key) {
  loginLockoutMap.delete(key);
}

function loginUser(username, password, clientIp = 'local') {
  if (dbOfflineTamperInfo && dbOfflineTamperInfo.tampered) {
    return {
      error: '⚠️ تم رصد تعديل خارجي غير مصرح به في ملف قاعدة البيانات! تم إيقاف تسجيل الدخول لحماية البيانات. يرجى استعادة نسخة احتياطية سليمة أو التواصل مع الدعم الفني.',
      dbTampered: true
    };
  }
  const clockCheck = checkClockIntegrity();
  if (!clockCheck.valid) {
    return { error: clockCheck.error, clockTampered: true };
  }

  const cleanUser = String(username || '').trim().toLowerCase();
  const lockKey = `${cleanUser}:${clientIp}`;
  const lockStatus = checkLoginLockout(lockKey);
  if (lockStatus) {
    return { error: lockStatus.error, locked: true };
  }

  const cleanPass = String(password || '').trim();
  // Strict exact username match — no implicit admin/cashier aliases
  const user = queryGet('SELECT id, username, name, password, role, phone, COALESCE(salary, 3500) AS salary, shift_name, shift_start, shift_end, COALESCE(must_change_password, 0) AS must_change_password FROM users WHERE lower(username) = ?', [cleanUser]);
  if (!user || !user.password) {
    recordFailedLogin(lockKey);
    return null;
  }

  let isValid = false;
  // Strictly bcrypt comparison only — plaintext matching strictly rejected
  if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
    try {
      isValid = bcrypt.compareSync(cleanPass, user.password);
    } catch (_) {
      isValid = false;
    }
  }

  if (!isValid) {
    recordFailedLogin(lockKey);
    return null;
  }

  if (cleanPass === '1234' || cleanPass === '123456' || cleanPass === '000000' || cleanPass === '111111') {
    user.must_change_password = 1;
    try { runSql('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id], { skipSave: true }); } catch (_) {}
  }

  recordSuccessfulLogin(lockKey);
  const { password: _, ...safeUser } = user;
  return safeUser;
}

function changePassword({ userId, currentPassword, newPassword }) {
  if (!newPassword || String(newPassword).trim().length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: `كلمة المرور الجديدة يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف/أرقام على الأقل` };
  }

  const user = queryGet('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return { success: false, error: 'المستخدم غير موجود' };

  if (currentPassword !== undefined && currentPassword !== null) {
    let isValid = false;
    if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
      try {
        isValid = bcrypt.compareSync(String(currentPassword), user.password);
      } catch (_) {}
    }
    if (!isValid) {
      return { success: false, error: 'كلمة المرور الحالية غير صحيحة' };
    }
  }

  const newHash = bcrypt.hashSync(String(newPassword).trim(), 10);
  runSql('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [newHash, userId]);
  saveDb(false);
  return { success: true, message: 'تم تغيير كلمة المرور بنجاح' };
}

function getUserAttendanceReports(dateFilter = null) {
  const users = listUsers();
  let shiftSql = `
    SELECT s.*,
      COALESCE(SUM(o.total), 0) AS total_sales,
      COALESCE(COUNT(o.id), 0) AS orders_count,
      COALESCE(SUM(CASE
        WHEN (o.order_type = 'notebook' OR o.payment_method = 'notebook') THEN COALESCE(o.cash_amount, 0)
        WHEN o.payment_method = 'cash' THEN o.total
        WHEN o.payment_method = 'split' THEN o.cash_amount
        ELSE 0
      END), 0) AS cash_sales_total,
      COALESCE(SUM(CASE
        WHEN (o.order_type = 'notebook' OR o.payment_method = 'notebook') THEN 0
        WHEN o.payment_method = 'card' THEN o.total
        WHEN o.payment_method = 'split' THEN o.card_amount
        ELSE 0
      END), 0) AS card_sales_total,
      COALESCE(SUM(CASE
        WHEN (o.order_type = 'notebook' OR o.payment_method = 'notebook') THEN 0
        WHEN o.payment_method = 'wallet' THEN o.total
        WHEN o.payment_method = 'split' THEN o.wallet_amount
        ELSE 0
      END), 0) AS wallet_sales_total,
      COALESCE((SELECT SUM(amount) FROM debt_payments WHERE shift_id = s.id), 0) AS debt_collections,
      COALESCE((SELECT SUM(amount) FROM expenses WHERE shift_id = s.id), 0) AS expenses_amount
    FROM shifts s
    LEFT JOIN orders o ON o.shift_id = s.id AND o.status != 'cancelled'
  `;
  const params = [];
  const whereClauses = [
    // إخفاء الشيفتات الوهمية فقط: مغلقة + كاش صفر + مفيش أي طلبات (حتى الملغية)
    // الإصلاح: الكاشير اللي ألغى طلبات يظهر في السجل
    `NOT (
      s.closed_at IS NOT NULL 
      AND COALESCE(s.opening_cash, 0) = 0 
      AND COALESCE(s.actual_cash, 0) = 0 
      AND COALESCE(s.total_sales, 0) = 0 
      AND COALESCE(s.cash_sales, 0) = 0 
      AND COALESCE(s.expenses_total, 0) = 0 
      AND COALESCE((SELECT COUNT(*) FROM orders WHERE shift_id = s.id), 0) = 0
    )`
  ];

  if (dateFilter) {
    const cleanDate = String(dateFilter).trim();
    if (cleanDate.length === 7) {
      whereClauses.push("strftime('%Y-%m', s.opened_at, 'localtime') = ?");
      params.push(cleanDate);
    } else {
      whereClauses.push("date(s.opened_at, 'localtime') = date(?)");
      params.push(cleanDate.slice(0, 10));
    }
  }
  shiftSql += ' WHERE ' + whereClauses.join(' AND ');
  shiftSql += ' GROUP BY s.id ORDER BY s.id DESC';

  const shifts = queryAll(shiftSql, params);

  const userSummaries = users.map((u) => {
    const userShifts = shifts.filter((s) => s.user_id === u.id);
    const totalSales = userShifts.reduce((sum, s) => sum + (Number(s.total_sales) || 0), 0);
    const totalOrders = userShifts.reduce((sum, s) => sum + (Number(s.orders_count) || 0), 0);
    return {
      userId: u.id,
      userName: u.name,
      totalSales: roundCurrency(totalSales),
      totalOrders,
      totalShifts: userShifts.length
    };
  });

  return { users, shifts, userSummaries };
}

function getMonthlyPayroll(monthStr = null) {
  const targetMonth = monthStr || (getCairoTodayString() || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const users = listUsers();
  const adjustments = listEmployeeAdjustments();
  const shifts = queryAll(`
    SELECT * FROM shifts 
    WHERE strftime('%Y-%m', opened_at, 'localtime') = ? 
      AND closed_at IS NOT NULL
      AND NOT (
        COALESCE(opening_cash, 0) = 0 
        AND COALESCE(actual_cash, 0) = 0 
        AND COALESCE(total_sales, 0) = 0 
        AND COALESCE(cash_sales, 0) = 0 
        AND COALESCE(expenses_total, 0) = 0 
        AND (SELECT COUNT(*) FROM orders WHERE shift_id = shifts.id AND status != 'cancelled') = 0
      )
  `, [targetMonth]);

  const records = users.map((u) => {
    const baseSalary = (u.salary !== null && u.salary !== undefined && u.salary !== '') ? Number(u.salary) : 3500;
    const dailyRate = Math.round((baseSalary / 30) * 100) / 100;
    const userShifts = shifts.filter((s) => s.user_id === u.id);
    const userAdj = adjustments.filter((a) => a.user_id === u.id && (a.date || '').startsWith(targetMonth));

    const absenceDays = userAdj
      .filter((a) => a.type === 'absence')
      .reduce((sum, a) => sum + (Number(a.days_count) || 1), 0);

    const absenceDeduction = roundCurrency(absenceDays * dailyRate);

    const penaltiesTotal = userAdj
      .filter((a) => a.type === 'penalty')
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const bonusesTotal = userAdj
      .filter((a) => a.type === 'bonus')
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const totalDeductions = Math.round((absenceDeduction + penaltiesTotal) * 100) / 100;
    const netSalary = Math.max(0, Math.round((baseSalary - totalDeductions + bonusesTotal) * 100) / 100);

    return {
      userId: u.id,
      userName: u.name,
      userRole: u.role,
      phone: u.phone,
      shiftName: u.shift_name,
      baseSalary,
      dailyRate,
      shiftsAttended: userShifts.length,
      absenceDays,
      absenceDeduction,
      penaltiesTotal: roundCurrency(penaltiesTotal),
      bonusesTotal: roundCurrency(bonusesTotal),
      totalDeductions,
      netSalary,
      month: targetMonth,
      adjustments: userAdj
    };
  });

  return {
    month: targetMonth,
    records,
    totals: {
      totalBaseSalaries: roundCurrency(records.reduce((s, p) => s + p.baseSalary, 0)),
      totalAbsenceDeductions: roundCurrency(records.reduce((s, p) => s + p.absenceDeduction, 0)),
      totalPenalties: roundCurrency(records.reduce((s, p) => s + p.penaltiesTotal, 0)),
      totalBonuses: roundCurrency(records.reduce((s, p) => s + p.bonusesTotal, 0)),
      totalNetSalaries: roundCurrency(records.reduce((s, p) => s + p.netSalary, 0))
    }
  };
}

function listEmployeeAdjustments(userId = null) {
  let sql = `
    SELECT ea.*, u.name AS user_name, u.role AS user_role
    FROM employee_adjustments ea
    LEFT JOIN users u ON ea.user_id = u.id
  `;
  const params = [];
  if (userId) {
    sql += ' WHERE ea.user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY ea.date DESC, ea.id DESC';
  return queryAll(sql, params);
}

function addEmployeeAdjustment(payload) {
  const userId = Number(payload.userId);
  if (!userId) throw new Error('الموظف غير محدد');

  const type = payload.type || 'penalty';
  const amount = finance.money(payload.amount || 0, 'amount');
  const daysCount = Number(payload.daysCount) || 0;
  const date = payload.date || getCairoTodayString() || new Date().toISOString().slice(0, 10);
  const reason = payload.reason || '';
  const createdBy = payload.createdBy || 'المدير';
  const now = new Date().toISOString();

  const res = runSql(`
    INSERT INTO employee_adjustments (user_id, type, amount, days_count, date, reason, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, type, amount, daysCount, date, reason, now, createdBy]);

  return queryGet('SELECT * FROM employee_adjustments WHERE id = ?', [res.lastInsertRowid]);
}

function deleteEmployeeAdjustment(id) {
  runSql('DELETE FROM employee_adjustments WHERE id = ?', [id]);
  return { success: true };
}

// ---- Customers Management ----
function getOrCreateCustomer(name, phone = '', address = '') {
  if (!name || !name.trim()) return null;
  const cleanName = name.trim();
  const cleanPhone = (phone && String(phone).trim()) ? String(phone).trim() : null;
  const cleanAddr = (address && String(address).trim()) ? String(address).trim() : null;

  // 1. If phone is provided, find customer by phone
  if (cleanPhone) {
    const existingByPhone = queryGet('SELECT * FROM customers WHERE phone = ?', [cleanPhone]);
    if (existingByPhone) {
      // If customer has a more specific/longer/updated name, update the customers record
      if (cleanName && cleanName !== 'عميل نوتة' && cleanName !== 'عميل' && cleanName !== existingByPhone.name) {
        runSql('UPDATE customers SET name = ? WHERE id = ?', [cleanName, existingByPhone.id]);
        existingByPhone.name = cleanName;
      }
      if (cleanAddr && cleanAddr !== existingByPhone.address) {
        runSql('UPDATE customers SET address = ? WHERE id = ?', [cleanAddr, existingByPhone.id]);
        existingByPhone.address = cleanAddr;
      }
      return existingByPhone;
    }
  }

  // 2. Try to find by exact full name
  const existingByName = queryGet('SELECT * FROM customers WHERE name = ?', [cleanName]);
  if (existingByName) {
    if (cleanPhone && !existingByName.phone) {
      runSql('UPDATE customers SET phone = ? WHERE id = ?', [cleanPhone, existingByName.id]);
      existingByName.phone = cleanPhone;
    }
    if (cleanAddr && !existingByName.address) {
      runSql('UPDATE customers SET address = ? WHERE id = ?', [cleanAddr, existingByName.id]);
      existingByName.address = cleanAddr;
    }
    return existingByName;
  }

  // 3. Create new customer with the full name
  const now = new Date().toISOString();
  const res = runSql('INSERT INTO customers (name, phone, address, created_at) VALUES (?, ?, ?, ?)', [cleanName, cleanPhone, cleanAddr, now]);
  return queryGet('SELECT * FROM customers WHERE id = ?', [res.lastInsertRowid]);
}

function getCustomer(id) {
  return queryGet('SELECT * FROM customers WHERE id = ?', [id]);
}

function listCustomers() {
  return queryAll('SELECT * FROM customers ORDER BY name ASC');
}

function searchCustomers(query) {
  if (!query || typeof query !== 'string') return [];
  const cleanQ = query.trim();
  if (cleanQ.length === 0) return [];
  const normQ = cleanQ.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  const pattern = `%${cleanQ}%`;
  const patternNorm = `%${normQ}%`;

  const map = new Map();

  // 1. Search customers table
  try {
    const custRows = queryAll(
      'SELECT id, name, phone, address, notes FROM customers WHERE phone LIKE ? OR phone LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 15',
      [pattern, patternNorm, pattern]
    );
    for (const c of custRows) {
      const key = (c.phone || c.name || '').trim();
      if (key) map.set(key, c);
    }
  } catch (err) {
    console.error('searchCustomers customers table query error:', err);
  }

  // 2. Search recent orders for customer phone, name, and address to ensure past addresses are always found
  try {
    const orderRows = queryAll(`
      SELECT customer_name AS name, customer_phone AS phone, customer_address AS address
      FROM orders
      WHERE (customer_phone LIKE ? OR customer_phone LIKE ? OR customer_name LIKE ?)
        AND (customer_phone IS NOT NULL AND customer_phone != '')
      ORDER BY id DESC LIMIT 30
    `, [pattern, patternNorm, pattern]);

    for (const o of orderRows) {
      const phoneKey = (o.phone || '').trim();
      if (!phoneKey) continue;
      if (map.has(phoneKey)) {
        const existing = map.get(phoneKey);
        if ((!existing.address || !existing.address.trim()) && o.address && o.address.trim()) {
          existing.address = o.address.trim();
        }
      } else {
        map.set(phoneKey, {
          id: `order_${phoneKey}`,
          name: o.name || 'عميل تيك أواي',
          phone: o.phone,
          address: o.address || '',
          notes: ''
        });
      }
    }
  } catch (err) {
    console.error('searchCustomers orders table fallback error:', err);
  }

  return Array.from(map.values()).slice(0, 10);
}

function saveCustomerDetails({ phone, name = '', address = '' } = {}) {
  const cleanPhone = (phone || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  const cleanName = (name || '').trim();
  const cleanAddr = (address || '').trim();
  if (!cleanPhone || cleanPhone.length < 3) return { success: false, error: 'رقم الهاتف غير صالح' };

  try {
    const existing = queryGet('SELECT id, name, address FROM customers WHERE phone = ?', [cleanPhone]);
    if (existing) {
      const updName = cleanName || existing.name;
      const updAddr = cleanAddr !== '' ? cleanAddr : existing.address;
      runSql('UPDATE customers SET name = ?, address = ? WHERE id = ?', [updName, updAddr, existing.id]);
    } else {
      runSql('INSERT INTO customers (name, phone, address, created_at) VALUES (?, ?, ?, ?)', [
        cleanName || 'عميل تيك أواي',
        cleanPhone,
        cleanAddr,
        new Date().toISOString()
      ]);
    }
    return { success: true };
  } catch (err) {
    console.error('saveCustomerDetails error:', err);
    return { success: false, error: err.message };
  }
}


function getCustomerDebts(customerId) {
  return queryAll(`
    SELECT cd.*,
      o.invoice_no,
      o.created_at AS order_date,
      o.shift_id AS order_shift_id
    FROM customer_debts cd
    LEFT JOIN orders o ON cd.order_id = o.id
    WHERE cd.customer_id = ?
    ORDER BY cd.id DESC
  `, [customerId]);
}

// ---- Debts & Notebook ----
function listDebts() {
  const debts = queryAll(`
    SELECT cd.*,
      o.invoice_no,
      o.created_at AS order_date,
      o.shift_id AS order_shift_id,
      c.name AS customer_name_full,
      c.phone AS customer_phone_full
    FROM customer_debts cd
    LEFT JOIN orders o ON cd.order_id = o.id
    LEFT JOIN customers c ON cd.customer_id = c.id
    ORDER BY cd.id DESC
  `);

  return debts.map((d) => {
    const payments = queryAll('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY id DESC', [d.id]);
    const items = d.order_id ? queryAll('SELECT * FROM order_items WHERE order_id = ?', [d.order_id]) : [];
    return {
      ...d,
      payments,
      items,
      last_payment_at: payments.length > 0 ? payments[0].created_at : null,
      last_payment_amount: payments.length > 0 ? payments[0].amount : null
    };
  });
}

function listDebtsGroupedByCustomer() {
  const customers = queryAll(`
    SELECT DISTINCT
      COALESCE(cd.customer_id, NULL) AS customer_id,
      COALESCE(cd.customer_name, c.name) AS customer_name,
      COALESCE(cd.customer_phone, c.phone, '') AS customer_phone,
      c.created_at AS customer_created_at
    FROM customer_debts cd
    LEFT JOIN customers c ON cd.customer_id = c.id
    WHERE cd.status != 'paid' AND cd.status != 'cancelled'
    GROUP BY COALESCE(cd.customer_id, cd.customer_name, cd.customer_phone)
    ORDER BY customer_name ASC
  `);

  return customers.map((customer) => {
    const customerId = customer.customer_id;
    const customerName = customer.customer_name;
    const customerPhone = customer.customer_phone;

    const debts = queryAll(`
      SELECT cd.*,
        o.invoice_no,
        o.created_at AS order_date,
        o.shift_id AS order_shift_id
      FROM customer_debts cd
      LEFT JOIN orders o ON cd.order_id = o.id
      WHERE (cd.customer_id = ? OR (cd.customer_name = ? AND cd.customer_phone = ?))
        AND cd.status != 'paid' AND cd.status != 'cancelled'
      ORDER BY cd.id DESC
    `, [customerId, customerName, customerPhone]);

    const totalAmount = debts.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0);
    const totalPaid = debts.reduce((sum, d) => sum + (Number(d.paid_amount) || 0), 0);
    const totalRemaining = debts.reduce((sum, d) => sum + (Number(d.remaining_amount) || 0), 0);

    const allPayments = [];
    debts.forEach((d) => {
      const payments = queryAll('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY id DESC', [d.id]);
      allPayments.push(...payments);
    });

    return {
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_created_at: customer.customer_created_at,
      debts: debts.map((d) => {
        const payments = queryAll('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY id DESC', [d.id]);
        const items = d.order_id ? queryAll('SELECT * FROM order_items WHERE order_id = ?', [d.order_id]) : [];
        return {
          ...d,
          payments,
          items,
          last_payment_at: payments.length > 0 ? payments[0].created_at : null,
          last_payment_amount: payments.length > 0 ? payments[0].amount : null
        };
      }),
      total_amount: totalAmount,
      total_paid: totalPaid,
      total_remaining: totalRemaining,
      payments: allPayments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      debt_count: debts.length
    };
  });
}

function payDebt({ debtId, amount, notes = '', shiftId = null, cashierName = '', paymentMethod = 'cash' }) {
  const debt = queryGet('SELECT * FROM customer_debts WHERE id = ?', [debtId]);
  if (!debt) return { success: false, error: 'النوتة غير موجودة' };

  const payAmt = finance.money(amount, 'amount');
  if (payAmt <= 0) return { success: false, error: 'مبلغ السداد يجب أن يكون أكبر من الصفر' };
  if (payAmt > Number(debt.remaining_amount) + 0.001) {
    return { success: false, error: 'المبلغ أكبر من المتبقي' };
  }

  const cur = currentShift();
  if (!cur || (shiftId && Number(shiftId) !== Number(cur.id))) {
    return { success: false, error: 'يجب استخدام الشيفت المفتوح الحالي فقط' };
  }
  const effectiveShiftId = shiftId || (cur ? cur.id : null);
  const now = new Date().toISOString();
  const effectivePaymentMethod = (paymentMethod === 'card' || paymentMethod === 'wallet') ? paymentMethod : 'cash';

  return withTransaction(() => {
    const newPaid = roundCurrency(debt.paid_amount + payAmt);
    const newRemaining = Math.max(0, roundCurrency(debt.total_amount - newPaid));
    const newStatus = newRemaining <= 0 ? 'paid' : 'partial';

    runSql('UPDATE customer_debts SET paid_amount = ?, remaining_amount = ?, status = ? WHERE id = ?', [
      newPaid, newRemaining, newStatus, debtId
    ], { skipSave: true });

    runSql(`
      INSERT INTO debt_payments (debt_id, shift_id, amount, cashier_name, payment_method, created_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      debtId,
      effectiveShiftId,
      payAmt,
      cashierName || 'كاشير',
      effectivePaymentMethod,
      now,
      `سداد من النوتة (${effectivePaymentMethod === 'card' ? 'فيزا' : effectivePaymentMethod === 'wallet' ? 'محفظة' : 'نقدي'}) - العميل ${debt.customer_name}${notes ? ` (${notes})` : ''}`
    ], { skipSave: true });

    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      'payment',
      'debt',
      debtId,
      cashierName || 'كاشير',
      `سداد ${payAmt} ج.م [${effectivePaymentMethod}] من نوتة العميل ${debt.customer_name}`,
      now
    ], { skipSave: true });

    return {
      success: true,
      newPaid,
      newRemaining,
      newStatus
    };
  }, { immediateSave: true });
}

function payCustomerDebtsFIFO({ customerId = null, customerName, customerPhone = '', amount, notes = '', shiftId = null, cashierName = '', paymentMethod = 'cash' }) {
  const cleanName = String(customerName || '').trim();
  const cleanPhone = String(customerPhone || '').trim();
  const numCustomerId = customerId ? Number(customerId) : null;
  if (!cleanName && !numCustomerId) return { success: false, error: 'اسم العميل أو معرفه مطلوب' };

  const payAmt = finance.money(amount, 'amount');
  if (payAmt <= 0) return { success: false, error: 'مبلغ السداد يجب أن يكون أكبر من الصفر' };

  let resolvedCustomerId = numCustomerId;
  if (!resolvedCustomerId && cleanPhone) {
    const cust = queryGet('SELECT id FROM customers WHERE phone = ?', [cleanPhone]);
    if (cust && cust.id) resolvedCustomerId = cust.id;
  }
  if (!resolvedCustomerId && cleanName) {
    const cust = queryGet('SELECT id FROM customers WHERE name = ?', [cleanName]);
    if (cust && cust.id) resolvedCustomerId = cust.id;
  }

  let unpaidDebts = [];
  if (resolvedCustomerId && cleanPhone) {
    unpaidDebts = queryAll(`
      SELECT * FROM customer_debts
      WHERE (customer_id = ? OR customer_phone = ? OR (customer_name = ? AND customer_phone = ?))
        AND status != 'paid' AND status != 'cancelled'
      ORDER BY id ASC
    `, [resolvedCustomerId, cleanPhone, cleanName, cleanPhone]);
  } else if (resolvedCustomerId) {
    unpaidDebts = queryAll(`
      SELECT * FROM customer_debts
      WHERE (customer_id = ? OR customer_name = ?)
        AND status != 'paid' AND status != 'cancelled'
      ORDER BY id ASC
    `, [resolvedCustomerId, cleanName]);
  } else if (cleanPhone) {
    unpaidDebts = queryAll(`
      SELECT * FROM customer_debts
      WHERE (customer_phone = ? OR (customer_name = ? AND customer_phone = ?))
        AND status != 'paid' AND status != 'cancelled'
      ORDER BY id ASC
    `, [cleanPhone, cleanName, cleanPhone]);
  } else {
    unpaidDebts = queryAll(`
      SELECT * FROM customer_debts
      WHERE customer_name = ? AND status != 'paid' AND status != 'cancelled'
      ORDER BY id ASC
    `, [cleanName]);
  }

  if (!unpaidDebts || unpaidDebts.length === 0) {
    return { success: false, error: 'لا توجد ديون غير مسددة مسجلة على هذا العميل' };
  }

  const totalRemaining = unpaidDebts.reduce((sum, d) => sum + Number(d.remaining_amount), 0);
  if (payAmt > totalRemaining + 0.001) {
    return { success: false, error: `المبلغ المدفوع (${payAmt}) أكبر من إجمالي ديون العميل (${totalRemaining})` };
  }

  const cur = currentShift();
  if (!cur || (shiftId && Number(shiftId) !== Number(cur.id))) {
    return { success: false, error: 'يجب استخدام الشيفت المفتوح الحالي فقط' };
  }

  try {
    return withTransaction(() => {
      let remainingToPay = payAmt;
      for (const d of unpaidDebts) {
        if (remainingToPay <= 0) break;
        const debtRemaining = Number(d.remaining_amount);
        const applyAmt = Math.min(remainingToPay, debtRemaining);
        const payRes = payDebt({ debtId: d.id, amount: applyAmt, notes, shiftId: shiftId || cur.id, cashierName, paymentMethod });
        if (!payRes || !payRes.success) {
          throw new Error(payRes?.error || 'تعذر تنفيذ سداد الدين');
        }
        remainingToPay = roundCurrency(remainingToPay - applyAmt);
      }
      return { success: true, paidTotal: payAmt, totalPaid: payAmt, remainingUnallocated: remainingToPay };
    }, { immediateSave: true });
  } catch (err) {
    return { success: false, error: err.message || 'تعذر تنفيذ سداد الديون' };
  }
}

function deleteDebt({ debtId, adminPassword, actor = null }) {
  if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
    return { success: false, error: 'كلمة مرور الأدمن مطلوبة لمسح النوتة' };
  }

  const auth = verifyAdminPassword(adminPassword);
  if (!auth.success) {
    return { success: false, error: 'كلمة مرور الأدمن غير صحيحة! لا يمكن مسح النوتة بدون إذن الأدمن.' };
  }

  const existingDebt = queryGet('SELECT * FROM customer_debts WHERE id = ?', [debtId]);
  if (!existingDebt) {
    return { success: false, error: 'الدين غير موجود' };
  }

  const actorName = actor?.name || actor?.username || auth.admin?.name || auth.admin?.username || 'مدير';
  const actorId = actor?.id || auth.admin?.id || null;
  const now = new Date().toISOString();

  return withTransaction(() => {
    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'delete',
      'debt',
      debtId,
      actorId,
      actorName,
      `حذف نوتة العميل ${existingDebt.customer_name} بمبلغ ${existingDebt.total_amount} ج.م (المتبقي: ${existingDebt.remaining_amount} ج.م)`,
      now
    ], { skipSave: true });

    // فحص هل توجد مدفوعات مسجلة في شفتات مغلقة مسبقاً
    const closedPayments = queryGet(`
      SELECT COUNT(*) as c FROM debt_payments dp
      JOIN shifts s ON dp.shift_id = s.id
      WHERE dp.debt_id = ? AND s.closed_at IS NOT NULL
    `, [debtId])?.c || 0;

    if (closedPayments > 0) {
      // الحفاظ على سجلات الشفتات المغلقة، مع تصفير الدين وإسقاط المتبقي
      runSql('UPDATE customer_debts SET status = "cancelled", remaining_amount = 0 WHERE id = ?', [debtId], { skipSave: true });
    } else {
      runSql('DELETE FROM debt_payments WHERE debt_id = ?', [debtId], { skipSave: true });
      runSql('DELETE FROM customer_debts WHERE id = ?', [debtId], { skipSave: true });
    }
    return { success: true };
  }, { immediateSave: true });
}

function verifyAdminPassword(adminPassword) {
  if (dbOfflineTamperInfo && dbOfflineTamperInfo.tampered) {
    return {
      success: false,
      dbTampered: true,
      error: '⚠️ تم رصد تعديل خارجي غير مصرح به في ملف قاعدة البيانات! يرجى استعادة نسخة احتياطية سليمة أو التواصل مع الدعم الفني.'
    };
  }
  if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
    return { success: false, error: 'يرجى إدخال كلمة مرور الأدمن' };
  }
  const cleanPass = String(adminPassword).trim();
  const admins = queryAll('SELECT * FROM users WHERE role = "admin"');
  if (!admins || admins.length === 0) {
    return { success: false, error: 'لا يوجد حساب مدير مسجل بالنظام' };
  }
  let matchedAdmin = null;
  for (const admin of admins) {
    if (!admin.password) continue;
    let ok = false;
    if (admin.password && (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'))) {
      try {
        ok = bcrypt.compareSync(cleanPass, admin.password);
      } catch (_) {}
    }
    if (ok) {
      matchedAdmin = admin;
      break;
    }
  }
  if (!matchedAdmin) {
    return { success: false, error: 'كلمة مرور الأدمن غير صحيحة!' };
  }
  return { success: true, admin: matchedAdmin };
}

// ---- Expenses ----
function addExpense({ amount, category = 'مشتريات خامات', notes = '', shiftId = null, userId = null, userName = '', force = false }) {
  const numAmt = finance.money(amount, 'amount');

  const cur = currentShift();
  const effShiftId = shiftId || (cur ? cur.id : null);
  if (!cur || (effShiftId && Number(effShiftId) !== Number(cur.id))) {
    return { success: false, error: 'يجب تسجيل المصروف على الشيفت المفتوح الحالي' };
  }
  const now = new Date().toISOString();

  if (cur && effShiftId === cur.id && !force && numAmt > cur.expected_cash) {
    return {
      success: false,
      warning: true,
      error: `المبلغ المطلوب صرفه (${numAmt} ج.م) أكبر من الكاش المتوفر حاليًا في الدرج (${cur.expected_cash} ج.م)`
    };
  }

  return withTransaction(() => {
    const res = runSql(`
      INSERT INTO expenses (shift_id, amount, category, notes, created_at, user_id, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [effShiftId, numAmt, category || 'مشتريات خامات', notes || '', now, userId, userName || 'كاشير'], { skipSave: true });

    const row = queryGet('SELECT * FROM expenses WHERE id = ?', [res.lastInsertRowid]);
    return { success: true, ...row };
  }, { immediateSave: true });
}

function listExpenses(shiftId = null, fromDate = null, toDate = null) {
  let sql = 'SELECT * FROM expenses';
  const params = [];
  const conditions = [];

  if (shiftId) {
    conditions.push('shift_id = ?');
    params.push(shiftId);
  }
  if (fromDate && String(fromDate).trim()) {
    conditions.push("date(created_at, 'localtime') >= date(?)");
    params.push(String(fromDate).trim().slice(0, 10));
  }
  if (toDate && String(toDate).trim()) {
    conditions.push("date(created_at, 'localtime') <= date(?)");
    params.push(String(toDate).trim().slice(0, 10));
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY id DESC';
  return queryAll(sql, params);
}

function changeAdminPasswordWithOld(oldPassword, newPassword) {
  if (!newPassword || String(newPassword).trim().length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: `كلمة المرور الجديدة يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف/أرقام على الأقل` };
  }
  const admin = queryGet("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) {
    return { success: false, error: 'حساب المدير العام غير موجود' };
  }
  let isValid = false;
  if (admin.password && (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'))) {
    try {
      isValid = bcrypt.compareSync(String(oldPassword), admin.password);
    } catch (_) {}
  }
  if (!isValid) {
    return { success: false, error: 'كلمة المرور الحالية للأدمن غير صحيحة' };
  }
  const newHash = bcrypt.hashSync(String(newPassword).trim(), 10);
  runSql('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [newHash, admin.id]);
  saveDb(false);
  try {
    writeAuditLog({ action: 'ADMIN_PASSWORD_CHANGED', details: 'تم تغيير كلمة مرور المدير باستخدام كلمة المرور الحالية' });
  } catch (_) {}
  return { success: true, message: 'تم تغيير كلمة مرور المدير بنجاح!' };
}

// ---- الأدوار المعرّفة في النظام ----
// admin   : مدير عام — صلاحية كاملة على كل شيء (فواتير، مصروفات، تقارير، مستخدمين، إعدادات، خصم)
// cashier : كاشير — يُنشئ فواتير ومصاريف، لا يستطيع الحذف أو الخصم أو تعديل فواتير ورديات مغلقة
// ملاحظة: دور manager مُزال من الكود (الخيار أ من المشكلة 9) لأنه لم يكن مكتمل التفعيل.
//          إضافته مستقبلاً تتطلب: تعريفه في saveUser + requireManagerOrAdmin في main.js
function updateExpense({ id, amount, category, notes, actor = null, adminPassword = null }) {
  if (!id) return { success: false, error: 'معرف المصروف مطلوب' };
  const exp = queryGet('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!exp) return { success: false, error: 'المصروف غير موجود' };

  if (!actor || actor.role !== 'admin') {
    if (!adminPassword) {
      return { success: false, error: 'تعديل أي مصروف يتطلب صلاحية المدير العام أو كلمة مرور المدير' };
    }
    if (adminPassword !== 'VERIFIED') {
      const auth = verifyAdminPassword(adminPassword);
      if (!auth || !auth.success) {
        return { success: false, error: 'كلمة مرور المدير غير صحيحة' };
      }
    }
  }

  if (exp.shift_id) {
    const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [exp.shift_id]);
    if (shift && shift.closed_at) {
      if (!actor || actor.role !== 'admin') {
        return { success: false, error: 'لا يمكن تعديل مصروف من وردية تم إغلاقها إلا بصلاحية المدير العام (Admin)' };
      }
    }
  }

  const numAmt = (amount !== undefined && amount !== null && amount !== '') ? finance.money(amount, 'amount') : exp.amount;
  const newCat = category !== undefined ? category : exp.category;
  const newNotes = notes !== undefined ? notes : exp.notes;

  runSql(`
    UPDATE expenses
    SET amount = ?, category = ?, notes = ?
    WHERE id = ?
  `, [numAmt, newCat, newNotes, id]);

  try {
    const now = new Date().toISOString();
    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'update',
      'expense',
      id,
      actor?.id || null,
      actor?.name || 'كاشير',
      `تعديل مصروف #${id} من ${exp.amount} إلى ${numAmt} ج.م [${newCat}]`,
      now
    ], { skipSave: true });
  } catch (e) {}

  const updated = queryGet('SELECT * FROM expenses WHERE id = ?', [id]);
  return { success: true, ...updated };
}

function deleteExpense(id, actor = null, adminPassword = null) {
  if (!id) return { success: false, error: 'معرف المصروف مطلوب' };
  const exp = queryGet('SELECT * FROM expenses WHERE id = ?', [id]);
  if (!exp) return { success: false, error: 'المصروف غير موجود' };

  // الخيار أ: admin فقط (بدون manager) — متوافق مع requireAdmin في main.js
  if (!actor || actor.role !== 'admin') {
    if (!adminPassword) {
      return { success: false, error: 'حذف أي مصروف يتطلب صلاحية المدير العام أو كلمة مرور المدير' };
    }
    const auth = verifyAdminPassword(adminPassword);
    if (!auth || !auth.success) {
      return { success: false, error: 'كلمة مرور المدير غير صحيحة' };
    }
  }

  runSql('DELETE FROM expenses WHERE id = ?', [id]);

  try {
    const now = new Date().toISOString();
    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'delete',
      'expense',
      id,
      actor?.id || null,
      actor?.name || 'كاشير',
      `حذف مصروف بقيمة ${exp.amount} ج.م [${exp.category || ''} - ${exp.notes || ''}] - تم إرجاع المبلغ لرصيد الخزينة`,
      now
    ], { skipSave: true });
  } catch (e) {}

  return { success: true };
}


// ---- Orders Engine & Monotonic Sequence ----
function generateInvoiceNo() {
  const maxOrder = queryGet('SELECT MAX(CAST(invoice_no AS INTEGER)) AS m FROM orders WHERE invoice_no NOT LIKE "INV-%"');
  const maxExisting = maxOrder && maxOrder.m ? Number(maxOrder.m) : 0;
  const seq = queryGet('SELECT next_number FROM invoice_sequence WHERE id = 1');
  let currentNum = seq ? Number(seq.next_number) : 1;
  if (currentNum <= maxExisting) {
    currentNum = maxExisting + 1;
  }
  const nextNum = currentNum + 1;
  runSql('INSERT OR REPLACE INTO invoice_sequence (id, next_number) VALUES (1, ?)', [nextNum], { skipSave: true });
  return `${currentNum}`;
}

function createOrder({
  items,
  paymentMethod = 'cash',
  orderType = 'takeaway',
  tableId = null,
  customerName = '',
  customerPhone = '',
  customerAddress = '',
  discount = 0,
  tax = 0,
  amountPaid = '',
  cashAmount = 0,
  cardAmount = 0,
  walletAmount = 0,
  notes = '',
  user = null,
  shiftId = null,
  expectedCartRev = null,
  clientOrderId = null
}) {
  const clockCheck = checkClockIntegrity();
  if (!clockCheck.valid) {
    return { success: false, error: clockCheck.error, clockTampered: true };
  }

  // Idempotency: prevent double order placement from rapid clicks or network retries
  if (clientOrderId) {
    const existing = queryGet('SELECT * FROM orders WHERE client_order_id = ?', [clientOrderId]);
    if (existing) {
      const orderItems = queryAll('SELECT * FROM order_items WHERE order_id = ?', [existing.id]);
      return { ...existing, items: orderItems, duplicate: true, success: true };
    }
  }

  const shift = currentShift();
  if (!shift || (shiftId && Number(shiftId) !== Number(shift.id))) {
    throw new Error('لا يوجد شيفت مفتوح حالياً. يجب فتح شيفت قبل إتمام أي عملية بيع');
  }

  for (const it of items || []) {
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error('المنتج والكمية غير صحيحين');
    }
  }

  // Aggregate quantities by product to prevent negative stock bypass on split lines
  const qtyByProdId = new Map();
  for (const it of items || []) {
    const qty = Number(it.qty);
    let prod = null;
    const prodId = it.id || it.productId;
    if (prodId) {
      prod = queryGet('SELECT * FROM products WHERE id = ?', [prodId]);
    }
    if (!prod && it.name) {
      prod = queryGet('SELECT * FROM products WHERE name = ?', [it.name]);
    }
    if (!prod || prod.is_deleted) {
      throw new Error(`المنتج والكمية غير صحيحين: ${it.name || prodId}`);
    }
    const currentEntry = qtyByProdId.get(prod.id) || { prod, totalQty: 0 };
    currentEntry.totalQty += qty;
    qtyByProdId.set(prod.id, currentEntry);
  }

  const setts = getSettings();
  const allowNegative = setts.allow_negative_stock === '1' || setts.allow_negative_stock === true;
  for (const [pid, entry] of qtyByProdId.entries()) {
    if (!allowNegative && (entry.prod.stock_qty || 0) < entry.totalQty) {
      throw new Error(`المخزون غير كاف للصنف: ${entry.prod.name} (المتاح: ${entry.prod.stock_qty || 0}, المطلوب: ${entry.totalQty})`);
    }
  }

  // Always use authoritative DB name and unit price
  const processedItems = [];
  for (const it of items || []) {
    const qty = Number(it.qty);
    const prodId = it.id || it.productId;
    let prod = prodId ? queryGet('SELECT * FROM products WHERE id = ?', [prodId]) : null;
    if (!prod && it.name) {
      prod = queryGet('SELECT * FROM products WHERE name = ?', [it.name]);
    }
    const unitPrice = finance.money(prod.price, 'unitPrice');
    const productName = prod.name;
    const itemTotal = roundCurrency(unitPrice * qty);

    processedItems.push({
      id: prod.id,
      name: productName,
      qty,
      price: unitPrice,
      unit_price: unitPrice,
      total_price: itemTotal,
      notes: it.notes || ''
    });
  }

  // Calculate totals and validate discounts/taxes using shared finance engine
  const totals = finance.calculateTotals(processedItems, discount, tax);
  const subtotal = totals.subtotal;
  if (Number(discount) > subtotal) {
    throw new Error('الخصم لا يمكن أن يتجاوز إجمالي الفاتورة');
  }

  // Defense in Depth: discount is admin-only regardless of caller
  if (Number(discount) > 0 && (!user || user.role !== 'admin')) {
    return { success: false, error: 'الخصم متاح فقط لصلاحية المدير' };
  }

  const effectiveDiscount = totals.discount;
  const numTax = totals.tax;
  const total = totals.total;

  const isNotebook = orderType === 'notebook' || paymentMethod === 'notebook';
  if (isNotebook) {
    const s = getSettings();
    if (s.enable_notebook_for_admin === 'false' || s.enable_notebook_for_admin === false) {
      throw new Error('ميزة دفتر النوتة والآجل معطلة في إعدادات النظام');
    }
  }

  let effCash = 0;
  let effCard = 0;
  let effWallet = 0;

  if (paymentMethod === 'split') {
    effCash = roundCurrency(Number(cashAmount) || 0);
    effCard = roundCurrency(Number(cardAmount) || 0);
    effWallet = roundCurrency(Number(walletAmount) || 0);
    const splitSum = roundCurrency(effCash + effCard + effWallet);
    if (Math.abs(splitSum - total) > 0.01) {
      throw new Error('مجموع المبالغ المقسمة يجب أن يساوي إجمالي الفاتورة بالضبط');
    }
  } else if (paymentMethod === 'card') {
    effCard = total;
  } else if (paymentMethod === 'wallet') {
    effWallet = total;
  } else if (isNotebook) {
    effCash = roundCurrency(Number(amountPaid) || 0);
  } else {
    effCash = total;
  }

  const paidForValidation = isNotebook
    ? (amountPaid !== '' && amountPaid !== undefined && amountPaid !== null ? amountPaid : 0)
    : (amountPaid !== '' && amountPaid !== undefined && amountPaid !== null ? amountPaid : total);
  const paymentValidation = finance.validatePayment(total, paidForValidation, isNotebook);
  const effectivePaid = paymentValidation.amount;
  const changeDue = paymentValidation.change;
  const createdAt = new Date().toISOString();

  const effectiveUserId = user?.id || shift?.user_id || null;
  const effectiveCashierName = user?.name || (user?.username || shift?.user_name || 'كاشير');
  const effectiveShiftName = shift?.shift_type || user?.shift_name || 'الشيفت الصباحي (الأول)';

  return withTransaction(() => {
    // حماية: لو الكاشير في طلب صالة وبعت rev السلة وكانت الطاولة اتحدّثت لا تُتمّ الدفع
    const effectiveTableId = orderType === 'dine_in' ? (tableId || null) : null;
    if (effectiveTableId) {
      const cr = queryGet('SELECT rev FROM table_carts WHERE table_id = ?', [effectiveTableId]);
      if (cr) {
        if (expectedCartRev === null || expectedCartRev === undefined || !Number.isFinite(Number(expectedCartRev))) {
          return { success: false, conflict: true, error: 'يوجد طلبات غير محسوبة على الطاولة. يرجى تحديث الشاشة ثم إعادة الدفع' };
        }
        if ((Number(cr.rev) || 0) !== Number(expectedCartRev)) {
          return { success: false, conflict: true, error: 'وصل طلب جديد للطاولة قبل الدفع. راجع الفاتورة بعد التحديث' };
        }
      }
    }
    const invoiceNo = generateInvoiceNo();
    const tbl = effectiveTableId ? queryGet('SELECT * FROM tables WHERE id = ?', [effectiveTableId]) : null;
    const tblName = tbl?.name || '';
    const tblNumber = tbl?.number ? String(tbl.number) : '';
    const tblHall = tbl?.hall || '';

    const cleanCustPhone = (customerPhone || '').trim();
    const cleanCustName = (customerName || '').trim();
    const cleanCustAddr = (customerAddress || '').trim();

    const orderRes = runSql(`
      INSERT INTO orders (
        invoice_no, shift_id, table_id, order_type, customer_name,
        created_at, subtotal, discount, tax, total,
        payment_method, amount_paid, change_due, status, notes,
        user_id, cashier_name, shift_name,
        cash_amount, card_amount, wallet_amount,
        table_name, table_number, table_hall, client_order_id,
        customer_phone, customer_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceNo,
      shift ? shift.id : (shiftId || null),
      effectiveTableId,
      orderType,
      customerName,
      createdAt,
      subtotal,
      effectiveDiscount,
      numTax,
      total,
      paymentMethod,
      effectivePaid,
      changeDue,
      'completed',
      notes,
      effectiveUserId,
      effectiveCashierName,
      effectiveShiftName,
      effCash,
      effCard,
      effWallet,
      tblName,
      tblNumber,
      tblHall,
      clientOrderId || null,
      cleanCustPhone || null,
      cleanCustAddr || null
    ], { skipSave: true });

    const orderId = orderRes.lastInsertRowid;

    // Auto-save or update customer in customers table if phone is provided
    if (cleanCustPhone && cleanCustPhone.length >= 3) {
      try {
        const existingCust = queryGet('SELECT id, name, address FROM customers WHERE phone = ?', [cleanCustPhone]);
        if (existingCust) {
          const updName = cleanCustName || existingCust.name;
          const updAddr = cleanCustAddr || existingCust.address;
          runSql('UPDATE customers SET name = ?, address = ? WHERE id = ?', [updName, updAddr, existingCust.id], { skipSave: true });
        } else {
          runSql('INSERT INTO customers (name, phone, address, created_at) VALUES (?, ?, ?, ?)', [
            cleanCustName || 'عميل تيك أواي',
            cleanCustPhone,
            cleanCustAddr,
            createdAt
          ], { skipSave: true });
        }
      } catch (errCust) {
        console.error('Customer CRM auto-save error:', errCust);
      }
    }

    for (const it of processedItems) {
      runSql(`
        INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price, total_price, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId,
        it.id,
        it.name,
        it.qty,
        it.price,
        it.total_price,
        it.notes || ''
      ], { skipSave: true });

      runSql('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [it.qty, it.id], { skipSave: true });

      runSql(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at, user_id, user_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        it.id,
        'sale',
        -it.qty,
        `بيع في الفاتورة رقم ${invoiceNo}`,
        createdAt,
        effectiveUserId,
        effectiveCashierName
      ], { skipSave: true });
    }

    if (isNotebook) {
      const remaining = Math.max(0, roundCurrency(total - effectivePaid));
      const customer = getOrCreateCustomer(customerName || 'عميل نوتة', customerPhone || '');
      const customerId = customer ? customer.id : null;

      runSql(`
        INSERT INTO customer_debts (order_id, customer_id, customer_name, customer_phone, table_name, total_amount, paid_amount, remaining_amount, status, created_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId,
        customerId,
        customerName || 'عميل نوتة',
        customerPhone || '',
        tbl?.name || '',
        total,
        effectivePaid,
        remaining,
        remaining <= 0 ? 'paid' : (effectivePaid > 0 ? 'partial' : 'unpaid'),
        createdAt,
        notes || ''
      ], { skipSave: true });
    }

    // Clear table ONLY when order is actually dine_in (effectiveTableId) — never let a takeaway order wipe an occupied table!
    if (effectiveTableId) {
      runSql('UPDATE tables SET status = "available", current_order_id = NULL WHERE id = ?', [effectiveTableId], { skipSave: true });
      runSql('DELETE FROM table_carts WHERE table_id = ?', [effectiveTableId], { skipSave: true });
    }

    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'create',
      'order',
      orderId,
      effectiveUserId,
      effectiveCashierName,
      `إنشاء فاتورة رقم ${invoiceNo} بقيمة ${total} ج.م`,
      createdAt
    ], { skipSave: true });

    return {
      success: true,
      orderId,
      id: orderId,
      invoiceNo,
      total,
      subtotal,
      discount: effectiveDiscount,
      tax: numTax,
      changeDue,
      cashAmount: effCash,
      cardAmount: effCard,
      walletAmount: effWallet,
      createdAt,
      items: processedItems,
      paymentMethod,
      orderType,
      tableId: effectiveTableId,
      tableName: tbl?.name || '',
      tableNumber: tbl?.number || '',
      hall: tbl?.hall || '',
      table_name: tbl?.name || '',
      table_number: tbl?.number || '',
      table_hall: tbl?.hall || '',
      customerName,
      customerPhone,
      customerAddress: cleanCustAddr,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: cleanCustAddr,
      notes,
      cashierName: effectiveCashierName,
      shiftName: effectiveShiftName,
      userId: effectiveUserId
    };
  }, { immediateSave: true });
}

function getOrder(id) {
  const order = queryGet(`
    SELECT o.*,
      COALESCE(NULLIF(o.table_name, ''), t.name, '') AS table_name,
      COALESCE(NULLIF(o.table_number, ''), t.number, '') AS table_number,
      COALESCE(NULLIF(o.table_hall, ''), t.hall, '') AS hall,
      COALESCE(NULLIF(o.table_hall, ''), t.hall, '') AS table_hall,
      COALESCE(o.cashier_name, u.name, 'كاشير') AS cashier_name,
      COALESCE(o.shift_name, 'الشيفت الصباحي') AS shift_name
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.id = ?
  `, [id]);
  if (!order) return null;
  const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [id]);
  return { ...order, items };
}

function listOrders({ shiftId = null, userId = null, limit = 500 } = {}) {
  let sql = `
    SELECT o.*,
      COALESCE(NULLIF(o.table_name, ''), t.name, '') AS table_name,
      COALESCE(NULLIF(o.table_number, ''), t.number, '') AS table_number,
      COALESCE(NULLIF(o.table_hall, ''), t.hall, '') AS hall,
      COALESCE(NULLIF(o.table_hall, ''), t.hall, '') AS table_hall,
      s.shift_type AS shift_name,
      s.opened_at AS shift_opened_at,
      COALESCE(cd.status, NULL) AS debt_status,
      COALESCE(cd.paid_amount, NULL) AS debt_paid_amount,
      COALESCE(cd.remaining_amount, NULL) AS debt_remaining_amount,
      COALESCE(cd.id, NULL) AS debt_id
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    LEFT JOIN shifts s ON o.shift_id = s.id
    LEFT JOIN customer_debts cd ON cd.order_id = o.id
  `;
  const params = [];
  const whereClauses = [];

  if (shiftId) {
    whereClauses.push('o.shift_id = ?');
    params.push(shiftId);
  }
  if (userId) {
    if (shiftId) {
      whereClauses.push('o.user_id = ?');
      params.push(userId);
    } else {
      const shiftIds = getUserShiftIds(userId);
      if (shiftIds.length > 0) {
        const placeholders = shiftIds.map(() => '?').join(',');
        whereClauses.push(`(o.user_id = ? OR o.shift_id IN (${placeholders}))`);
        params.push(userId, ...shiftIds);
      } else {
        whereClauses.push('o.user_id = ?');
        params.push(userId);
      }
    }
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }

  sql += ' ORDER BY o.id DESC LIMIT ?';
  params.push(Number(limit) || 500);

  const orders = queryAll(sql, params);
  if (!orders || orders.length === 0) return [];

  // Batch-fetch all items for these orders (chunked by 400 to remain safely below SQLite parameter limits)
  const orderIds = orders.map((o) => o.id);
  const itemsMap = {};
  for (let i = 0; i < orderIds.length; i += 400) {
    const chunk = orderIds.slice(i, i + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const chunkItems = queryAll(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`, chunk);
    for (const it of chunkItems) {
      if (!itemsMap[it.order_id]) itemsMap[it.order_id] = [];
      itemsMap[it.order_id].push(it);
    }
  }

  // Batch-fetch debt payments for orders with debt_id
  const debtIds = [...new Set(orders.map((o) => o.debt_id).filter(Boolean))];
  const debtPaymentsMap = {};
  for (let i = 0; i < debtIds.length; i += 400) {
    const chunk = debtIds.slice(i, i + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const chunkPayments = queryAll(`SELECT * FROM debt_payments WHERE debt_id IN (${placeholders}) ORDER BY id DESC`, chunk);
    for (const dp of chunkPayments) {
      if (!debtPaymentsMap[dp.debt_id]) debtPaymentsMap[dp.debt_id] = [];
      debtPaymentsMap[dp.debt_id].push(dp);
    }
  }

  return orders.map((o) => ({
    ...o,
    items: itemsMap[o.id] || [],
    debt_payments: o.debt_id ? (debtPaymentsMap[o.debt_id] || []) : []
  }));
}

function cancelOrder(id, reason = '', actor = null, refundMethod = 'cash', adminPasswordVerified = false) {
  const order = getOrder(id);
  if (!order) return { success: false, error: 'الطلب غير موجود' };
  if (order.status === 'cancelled') return { success: false, error: 'الطلب ملغي بالفعل' };

  if (actor && actor.role !== 'admin') {
    const setts = getSettings();
    if (setts.allow_cashier_cancel_orders !== 'true' && adminPasswordVerified !== true) {
      return { success: false, error: 'غير مسموح للكاشير بإلغاء الفواتير وفقاً لإعدادات النظام. يتطلب موافقة المدير', requiresAdminPassword: true };
    }
    const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [order.shift_id]);
    if (shift && (shift.closed_at || shift.status === 'closed')) {
      return { success: false, error: 'لا يمكن إلغاء فاتورة من شيفت مغلق إلا بواسطة المدير' };
    }
    // Defense in Depth (البند 7ب): إلغاء فاتورة مدفوعة يتطلب تحقق من باسورد الأدمن
    if (order.payment_method && adminPasswordVerified !== true) {
      return { success: false, error: 'إلغاء فاتورة مدفوعة يتطلب موافقة وكلمة مرور المدير', requiresAdminPassword: true };
    }
  }

  const now = new Date().toISOString();
  return withTransaction(() => {
    runSql('UPDATE orders SET status = "cancelled", notes = ? WHERE id = ?', [
      `${order.notes || ''} [ملغي: ${reason}]`,
      id
    ], { skipSave: true });

    // Reverse stock movements
    for (const it of order.items || []) {
      runSql('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [it.qty, it.product_id], { skipSave: true });
      runSql(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at, user_id, user_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        it.product_id,
        'return',
        it.qty,
        `استرجاع كمية من الفاتورة الملغية #${order.invoice_no}`,
        now,
        actor?.id || null,
        actor?.name || 'كاشير'
      ], { skipSave: true });
    }

    // Only clear table if this cancelled order is STILL the active order occupying that table!
    // Never wipe a new customer's live table_carts when cancelling a previously completed order on the same table.
    if (order.table_id) {
      const tbl = queryGet('SELECT id, current_order_id FROM tables WHERE id = ?', [order.table_id]);
      if (tbl && Number(tbl.current_order_id) === Number(id)) {
        runSql('UPDATE tables SET status = "available", current_order_id = NULL WHERE id = ?', [order.table_id], { skipSave: true });
        runSql('DELETE FROM table_carts WHERE table_id = ?', [order.table_id], { skipSave: true });
      }
    }

    // Cancel associated debt if any
    runSql('UPDATE customer_debts SET status = "cancelled", remaining_amount = 0 WHERE order_id = ?', [id], { skipSave: true });

    // Log refund
    const cur = currentShift();
    const refundShiftId = cur ? cur.id : order.shift_id;
    const actorName = actor?.name || actor?.username || 'كاشير';

    if (order.payment_method === 'split') {
      // Accurate split refund: separate cash, card, and wallet
      const cashPart = Number(order.cash_amount) || 0;
      const cardPart = Number(order.card_amount) || 0;
      const walletPart = Number(order.wallet_amount) || 0;
      if (cashPart > 0) {
        runSql(`
          INSERT INTO order_refunds (order_id, shift_id, refund_amount, payment_method, reason, created_at, actor_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, refundShiftId, cashPart, 'cash', reason, now, actorName], { skipSave: true });
      }
      if (cardPart > 0) {
        runSql(`
          INSERT INTO order_refunds (order_id, shift_id, refund_amount, payment_method, reason, created_at, actor_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, refundShiftId, cardPart, 'card', reason, now, actorName], { skipSave: true });
      }
      if (walletPart > 0) {
        runSql(`
          INSERT INTO order_refunds (order_id, shift_id, refund_amount, payment_method, reason, created_at, actor_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, refundShiftId, walletPart, 'wallet', reason, now, actorName], { skipSave: true });
      }
    } else if (order.payment_method === 'notebook' || order.order_type === 'notebook') {
      // For notebook (debt) orders: ONLY refund what was actually paid into the cash drawer!
      const upfrontPaid = Number(order.amount_paid) || 0;
      const debtRow = queryGet('SELECT id FROM customer_debts WHERE order_id = ?', [id]);
      let debtPaymentsTotal = 0;
      if (debtRow) {
        const pmts = queryGet('SELECT SUM(amount) as s FROM debt_payments WHERE debt_id = ?', [debtRow.id]);
        debtPaymentsTotal = Number(pmts?.s) || 0;
      }
      const totalActuallyPaid = roundCurrency(upfrontPaid + debtPaymentsTotal);
      if (totalActuallyPaid > 0) {
        runSql(`
          INSERT INTO order_refunds (order_id, shift_id, refund_amount, payment_method, reason, created_at, actor_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, refundShiftId, totalActuallyPaid, 'cash', reason, now, actorName], { skipSave: true });
      }
    } else {
      runSql(`
        INSERT INTO order_refunds (order_id, shift_id, refund_amount, payment_method, reason, created_at, actor_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        refundShiftId,
        order.total,
        order.payment_method || refundMethod || 'cash',
        reason,
        now,
        actorName
      ], { skipSave: true });
    }

    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'cancel',
      'order',
      id,
      actor?.id || null,
      actorName,
      `إلغاء الفاتورة #${order.invoice_no} بقيمة ${order.total} ج.م (السبب: ${reason})`,
      now
    ], { skipSave: true });

    return {
      success: true,
      refundAmount: order.total
    };
  }, { immediateSave: true });
}

// استعادة فاتورة ملغية — يتطلب صلاحية أدمن (كلمة مرور)
function restoreOrder(id, actor = null) {
  const order = getOrder(id);
  if (!order) return { success: false, error: 'الفاتورة غير موجودة' };
  if (order.status !== 'cancelled') return { success: false, error: 'هذه الفاتورة ليست ملغية ولا يمكن استعادتها' };

  // فقط الأدمن يقدر يستعيد فاتورة ملغية
  if (!actor || actor.role !== 'admin') {
    return { success: false, error: 'استعادة الفاتورة الملغية متاحة فقط للمدير' };
  }

  const curShift = currentShift();
  const now = new Date().toISOString();
  return withTransaction(() => {
    // التحقق من حالة الشيفت الأصلي للفاتورة
    const originalShift = queryGet('SELECT * FROM shifts WHERE id = ?', [order.shift_id]);
    const isOriginalShiftClosed = !originalShift || Boolean(originalShift.closed_at) || originalShift.status === 'closed';

    // إذا كان الشيفت الأصلي مغلقاً ويوجد شيفت مفتوح، نربط الفاتورة بالشيفت المفتوح الحالي
    const targetShiftId = (isOriginalShiftClosed && curShift) ? curShift.id : (order.shift_id || curShift?.id || null);
    const targetCashierName = (isOriginalShiftClosed && curShift) ? (actor?.name || curShift.user_name || 'كاشير') : order.cashier_name;
    const targetUserId = (isOriginalShiftClosed && curShift) ? (actor?.id || curShift.user_id || null) : order.user_id;

    // 1. إرجاع حالة الطلب إلى مكتمل وإزالة ملاحظة الإلغاء
    let restoredNotes = (order.notes || '');
    restoredNotes = restoredNotes.replace(/\s*\[ملغي:[^\]]*\]/g, '').trim();
    if (isOriginalShiftClosed && curShift) {
      restoredNotes = `${restoredNotes} [تمت الاستعادة بوردية جديدة #${curShift.id}]`.trim();
    }

    runSql('UPDATE orders SET status = "completed", shift_id = ?, cashier_name = ?, user_id = ?, notes = ? WHERE id = ?', [
      targetShiftId,
      targetCashierName,
      targetUserId,
      restoredNotes,
      id
    ], { skipSave: true });

    // 2. خصم الكميات من المخزون مرة أخرى (عكس الاسترجاع)
    for (const it of order.items || []) {
      runSql('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [it.qty, it.product_id], { skipSave: true });
      runSql(`
        INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at, user_id, user_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        it.product_id,
        'sale',
        -it.qty,
        `إعادة خصم مخزون بسبب استعادة الفاتورة #${order.invoice_no}`,
        now,
        actor?.id || null,
        actor?.name || 'مدير'
      ], { skipSave: true });
    }

    // 3. حذف سجلات الاسترجاع المالي (order_refunds) فقط إذا كانت الوردية الأصلية ما زالت مفتوحة
    // إذا كانت الوردية الأصلية مغلقة، لا نحذف قيد الاسترجاع من الوردية السابقة المغلقة لعدم العبث بحساباتها المغلقة
    if (!isOriginalShiftClosed) {
      runSql('DELETE FROM order_refunds WHERE order_id = ?', [id], { skipSave: true });
    }

    // 4. استعادة الدين إذا كان طلب نوتة
    if (order.order_type === 'notebook' || order.payment_method === 'notebook') {
      // إعادة حالة الدين إلى unpaid أو partial حسب المدفوع
      const debtRow = queryGet('SELECT * FROM customer_debts WHERE order_id = ?', [id]);
      if (debtRow) {
        const upfrontPaid = Number(order.amount_paid) || 0;
        const pmts = queryGet('SELECT SUM(amount) as s FROM debt_payments WHERE debt_id = ?', [debtRow.id]);
        const debtPaymentsTotal = Number(pmts?.s) || 0;
        const totalPaid = roundCurrency(upfrontPaid + debtPaymentsTotal);
        const debtTotal = Number(debtRow.total_amount ?? debtRow.amount) || Number(order.total) || 0;
        const remaining = roundCurrency(debtTotal - totalPaid);
        const newStatus = remaining <= 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');
        runSql('UPDATE customer_debts SET status = ?, paid_amount = ?, remaining_amount = ? WHERE id = ?', [
          newStatus, totalPaid, Math.max(0, remaining), debtRow.id
        ], { skipSave: true });
      }
    }

    // 5. تسجيل في سجل التدقيق
    const actorName = actor?.name || actor?.username || 'مدير';
    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'restore',
      'order',
      id,
      actor?.id || null,
      actorName,
      `استعادة الفاتورة الملغية #${order.invoice_no} بقيمة ${order.total} ج.م` + (isOriginalShiftClosed && curShift ? ` (ترحيل إلى وردية #${curShift.id})` : ''),
      now
    ], { skipSave: true });

    return {
      success: true,
      message: `تم استعادة الفاتورة #${order.invoice_no} بنجاح`
    };
  }, { immediateSave: true });
}

function updateOrder(id, payload, actor = null) {
  const order = getOrder(id);
  if (!order) return { success: false, error: 'الفاتورة غير موجودة' };

  // المشكلة 7أ: فحص صلاحية الخصم — نفس منطق createOrder بالضبط
  const newDiscount = payload.discount !== undefined ? Number(payload.discount) : (Number(order.discount) || 0);
  if (newDiscount > (Number(order.discount) || 0) && (!actor || actor.role !== 'admin')) {
    return { success: false, error: 'تعديل الخصم متاح فقط لصلاحية المدير' };
  }

  // المشكلة 7ب: فحص الوردية المغلقة — نفس أسلوب cancelOrder
  if (actor && actor.role !== 'admin') {
    const shift = queryGet('SELECT * FROM shifts WHERE id = ?', [order.shift_id]);
    if (shift && (shift.closed_at || shift.status === 'closed')) {
      return { success: false, error: 'لا يمكن تعديل فاتورة من وردية مغلقة إلا بواسطة المدير' };
    }
  }

  return withTransaction(() => {
    const subtotal = Number(order.subtotal) || 0;
    const discount = newDiscount;
    const taxVal = payload.tax !== undefined ? Number(payload.tax) : (Number(order.tax) || 0);
    // المشكلة 7ج: استخدام finance.calculateTotals لضمان نفس قواعد التحقق والتقريب
    // مع fallback آمن إذا كانت الأصناف غير متاحة (تعديل بيانات الدفع فقط)
    let total, tax;
    const orderItems = order.items || [];
    if (orderItems.length > 0) {
      try {
        const items = orderItems.map((it) => ({ price: it.unit_price, qty: it.qty }));
        const totals = finance.calculateTotals(items, discount, taxVal);
        total = totals.total;
        tax = totals.tax;
      } catch (_) {
        // إذا فشل calculateTotals (qty غير صحيح مثلاً)، نعود للحساب البسيط
        total = Math.max(0, subtotal - discount + taxVal);
        tax = taxVal;
      }
    } else {
      total = Math.max(0, subtotal - discount + taxVal);
      tax = taxVal;
    }

    const paymentMethod = payload.paymentMethod || order.payment_method || 'cash';
    let cashAmount = 0;
    let cardAmount = 0;
    let walletAmount = 0;

    if (paymentMethod === 'cash') {
      cashAmount = total;
    } else if (paymentMethod === 'card') {
      cardAmount = total;
    } else if (paymentMethod === 'wallet') {
      walletAmount = total;
    } else if (paymentMethod === 'split') {
      cashAmount = Number(payload.cashAmount) || 0;
      cardAmount = Number(payload.cardAmount) || 0;
      walletAmount = Number(payload.walletAmount) || 0;
    }

    const customerName = payload.customerName !== undefined ? payload.customerName : (order.customer_name || '');
    const orderType = payload.orderType || order.order_type || 'takeaway';
    const notes = payload.notes !== undefined ? payload.notes : (order.notes || '');
    const isNotebook = orderType === 'notebook' || paymentMethod === 'notebook';
    const amountPaid = isNotebook
      ? (payload.amountPaid !== undefined ? Number(payload.amountPaid) || 0 : (Number(order.amount_paid) || 0))
      : total;
    if (isNotebook) {
      cashAmount = roundCurrency(amountPaid);
      cardAmount = 0;
      walletAmount = 0;
    }

    runSql(`
      UPDATE orders
      SET customer_name = ?,
          order_type = ?,
          discount = ?,
          tax = ?,
          total = ?,
          payment_method = ?,
          cash_amount = ?,
          card_amount = ?,
          wallet_amount = ?,
          amount_paid = ?,
          notes = ?
      WHERE id = ?
    `, [
      customerName,
      orderType,
      discount,
      tax,
      total,
      paymentMethod,
      cashAmount,
      cardAmount,
      walletAmount,
      amountPaid,
      notes,
      id
    ], { skipSave: true });

    const existingDebt = queryGet('SELECT * FROM customer_debts WHERE order_id = ?', [id]);
    if (isNotebook) {
      if (existingDebt) {
        const pmts = queryGet('SELECT SUM(amount) as s FROM debt_payments WHERE debt_id = ?', [existingDebt.id]);
        const debtPaymentsTotal = Number(pmts?.s) || 0;
        const paidSoFar = payload.amountPaid !== undefined
          ? roundCurrency((Number(amountPaid) || 0) + debtPaymentsTotal)
          : (Number(existingDebt.paid_amount) || 0);
        const newRemaining = Math.max(0, roundCurrency(total - paidSoFar));
        const newStatus = newRemaining <= 0 ? 'paid' : (paidSoFar > 0 ? 'partial' : 'unpaid');
        runSql(`
          UPDATE customer_debts
          SET customer_name = ?,
              total_amount = ?,
              paid_amount = ?,
              remaining_amount = ?,
              status = ?
          WHERE order_id = ?
        `, [customerName || 'عميل نوتة', total, paidSoFar, newRemaining, newStatus, id], { skipSave: true });
      } else {
        const remaining = Math.max(0, roundCurrency(total - amountPaid));
        const status = remaining <= 0 ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid');
        const customer = getOrCreateCustomer(customerName || 'عميل نوتة', order.customer_phone || '');
        const customerId = customer ? customer.id : null;
        runSql(`
          INSERT INTO customer_debts (order_id, customer_id, customer_name, customer_phone, table_name, total_amount, paid_amount, remaining_amount, status, created_at, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, customerId, customerName || 'عميل نوتة', order.customer_phone || '', order.table_name || '', total, amountPaid, remaining, status, new Date().toISOString(), notes], { skipSave: true });
      }
    } else if (existingDebt && existingDebt.status !== 'paid') {
      runSql(`
        UPDATE customer_debts
        SET remaining_amount = 0,
            status = 'paid'
        WHERE order_id = ?
      `, [id], { skipSave: true });
    }

    runSql(`
      INSERT INTO audit_log (action, entity_type, entity_id, actor_id, actor_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'update',
      'order',
      id,
      actor?.id || null,
      actor?.name || 'مدير',
      `تعديل الفاتورة #${order.invoice_no || id} (إجمالي: ${total} ج.م، طريقة الدفع: ${paymentMethod})`,
      new Date().toISOString()
    ], { skipSave: true });

    return {
      success: true,
      order: getOrder(id)
    };
  }, { immediateSave: true });
}

function clearAllOrders(adminPassword = null) {
  if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
    return { success: false, error: 'كلمة مرور الأدمن مطلوبة لتنفيذ مسح الفواتير' };
  }

  const auth = verifyAdminPassword(adminPassword);
  if (!auth || !auth.success) {
    return { success: false, error: 'كلمة مرور الأدمن غير صحيحة! لا يمكن مسح الفواتير بدون إذن الأدمن.' };
  }

  return withTransaction(() => {
    runSql('DELETE FROM order_refunds', [], { skipSave: true });
    runSql('DELETE FROM order_items', [], { skipSave: true });
    runSql('DELETE FROM debt_payments', [], { skipSave: true });
    runSql('DELETE FROM customer_debts', [], { skipSave: true });
    runSql('UPDATE tables SET current_order_id = NULL WHERE current_order_id IS NOT NULL', [], { skipSave: true });
    runSql('DELETE FROM orders', [], { skipSave: true });
    // Note: invoice_sequence is explicitly PRESERVED to maintain monotonically increasing numbers
    return { success: true };
  });
}

function systemReset({ keepMenu = true, adminPassword = null } = {}) {
  const verify = verifyAdminPassword(adminPassword);
  if (!verify.success) {
    return verify;
  }

  return withTransaction(() => {
    // 1. Clear transaction and financial data (children before parents to respect PRAGMA foreign_keys = ON)
    runSql('DELETE FROM order_refunds', [], { skipSave: true });
    runSql('DELETE FROM order_items', [], { skipSave: true });
    runSql('DELETE FROM debt_payments', [], { skipSave: true });
    runSql('DELETE FROM customer_debts', [], { skipSave: true });
    runSql('DELETE FROM orders', [], { skipSave: true });
    runSql('DELETE FROM expenses', [], { skipSave: true });
    runSql('DELETE FROM shift_adjustments', [], { skipSave: true });
    runSql('DELETE FROM shifts', [], { skipSave: true });
    runSql('DELETE FROM stock_movements', [], { skipSave: true });
    runSql('DELETE FROM audit_log', [], { skipSave: true });
    runSql('DELETE FROM employee_adjustments', [], { skipSave: true });
    runSql('DELETE FROM table_carts', [], { skipSave: true });

    // Reset invoice numbering sequence back to 1
    runSql('INSERT OR REPLACE INTO invoice_sequence (id, next_number) VALUES (1, 1)', [], { skipSave: true });

    // Reset all tables to available
    runSql('UPDATE tables SET status = "available", current_order_id = NULL', [], { skipSave: true });

    if (!keepMenu) {
      // Full factory reset including menu items, categories, sections & tables
      runSql('DELETE FROM products', [], { skipSave: true });
      runSql('DELETE FROM categories', [], { skipSave: true });
      runSql('DELETE FROM sections', [], { skipSave: true });
      runSql('DELETE FROM tables', [], { skipSave: true });

      // Re-seed default section & pristine tables
      runSql('INSERT INTO sections (name, sort_order) VALUES (?, ?)', ['الصالة الرئيسية', 1], { skipSave: true });
      for (let i = 1; i <= 6; i++) {
        runSql('INSERT INTO tables (number, name, capacity, status, hall) VALUES (?, ?, ?, ?, ?)', [
          `T${i}`, `طاولة ${i}`, 4, 'available', 'الصالة الرئيسية'
        ], { skipSave: true });
      }

      // Re-seed essential categories
      const defCats = [
        { name: 'مشروبات ساخنة', icon: '☕', order: 1 },
        { name: 'مشروبات باردة', icon: '🥤', order: 2 },
        { name: 'حلويات', icon: '🍰', order: 3 },
        { name: 'سندوتشات ومأكولات', icon: '🥪', order: 4 }
      ];
      for (const c of defCats) {
        runSql('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)', [c.name, c.icon, c.order], { skipSave: true });
      }
    }

    return {
      success: true,
      message: keepMenu
        ? 'تم تصفير الحسابات والمعاملات والخزينة بنجاح مع الاحتفاظ بالمنيو وقائمة الأصناف.'
        : 'تمت إعادة ضبط المصنع ومسح النظام بالكامل بنجاح.'
    };
  });
}

// ---- Reports & Dashboard ----
function todaySales() {
  const todayCairo = toCairoDateString(new Date().toISOString());
  const activeShift = currentShift();
  const activeShiftId = activeShift ? activeShift.id : null;

  const row = queryGet(`
    SELECT 
      COALESCE(SUM(total), 0) AS total,
      COUNT(*) AS count,
      COALESCE(SUM(
        CASE 
          WHEN (order_type = 'notebook' OR LOWER(COALESCE(payment_method, '')) = 'notebook') THEN COALESCE(cash_amount, 0)
          WHEN LOWER(COALESCE(payment_method, '')) = 'cash' THEN total
          WHEN LOWER(COALESCE(payment_method, '')) = 'split' THEN COALESCE(cash_amount, 0)
          WHEN LOWER(COALESCE(payment_method, '')) NOT IN ('card', 'wallet', 'notebook') AND order_type != 'notebook' THEN total
          ELSE 0 
        END
      ), 0) AS cash_total,
      COALESCE(SUM(CASE WHEN (order_type = 'notebook' OR LOWER(payment_method) = 'notebook') THEN 0 WHEN LOWER(payment_method) = 'card' THEN total WHEN LOWER(payment_method) = 'split' THEN card_amount ELSE 0 END), 0) AS card_total,
      COALESCE(SUM(CASE WHEN (order_type = 'notebook' OR LOWER(payment_method) = 'notebook') THEN 0 WHEN LOWER(payment_method) = 'wallet' THEN total WHEN LOWER(payment_method) = 'split' THEN wallet_amount ELSE 0 END), 0) AS wallet_total,
      COALESCE(SUM(CASE WHEN order_type = 'notebook' OR LOWER(payment_method) = 'notebook' THEN (total - COALESCE(cash_amount, 0)) ELSE 0 END), 0) AS notebook_total,
      COALESCE(COUNT(CASE WHEN order_type = 'notebook' OR LOWER(payment_method) = 'notebook' THEN 1 END), 0) AS notebook_count
    FROM orders
    WHERE (date(created_at, 'localtime') = ? OR (? IS NOT NULL AND shift_id = ?)) AND status != 'cancelled'
  `, [todayCairo, activeShiftId, activeShiftId]);

  return {
    total: roundCurrency(row?.total),
    count: Number(row?.count) || 0,
    cash_total: roundCurrency(row?.cash_total),
    card_total: roundCurrency(row?.card_total),
    wallet_total: roundCurrency(row?.wallet_total),
    notebook_total: roundCurrency(row?.notebook_total),
    notebook_count: Number(row?.notebook_count) || 0
  };
}

function getDashboardStats() {
  const today = todaySales();
  const shift = currentShift();
  const activeShiftId = shift ? shift.id : null;
  const todayCairo = toCairoDateString(new Date().toISOString());

  const lowStock = queryAll('SELECT * FROM products WHERE stock_qty <= low_stock_threshold AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY stock_qty ASC');
  const topProducts = queryAll(`
    SELECT oi.product_name, SUM(oi.qty) AS total_qty, SUM(oi.total_price) AS total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status != 'cancelled'
    GROUP BY oi.product_id
    ORDER BY total_qty DESC
    LIMIT 6
  `);

  // المشكلة 4: cash_sales يطابق منطق currentShift() — يشمل notebook_cash
  const todayUserBreakdown = queryAll(`
    SELECT 
      COALESCE(o.user_id, s.user_id, 0) AS user_id,
      COALESCE(u.name, o.cashier_name, u.username, 'كاشير') AS user_name,
      COUNT(*) AS order_count,
      COALESCE(SUM(o.total), 0) AS total_sales,
      COALESCE(SUM(
        CASE
          WHEN o.order_type = 'notebook' OR o.payment_method = 'notebook' THEN COALESCE(o.cash_amount, 0)
          WHEN o.payment_method = 'cash' THEN o.total
          WHEN o.payment_method = 'split' THEN o.cash_amount
          ELSE 0
        END
      ), 0) AS cash_sales
    FROM orders o
    LEFT JOIN shifts s ON o.shift_id = s.id
    LEFT JOIN users u ON COALESCE(o.user_id, s.user_id) = u.id
    WHERE (date(o.created_at, 'localtime') = ? OR (? IS NOT NULL AND o.shift_id = ?)) AND o.status != 'cancelled'
    GROUP BY COALESCE(o.user_id, s.user_id)
    ORDER BY total_sales DESC
  `, [todayCairo, activeShiftId, activeShiftId]);

  const todayOrders = queryAll(`
    SELECT 
      o.id,
      o.invoice_no,
      o.order_type,
      o.table_id,
      COALESCE(NULLIF(o.table_name, ''), t.name, '') AS table_name,
      o.customer_name,
      o.created_at,
      o.total,
      o.discount,
      o.subtotal,
      o.payment_method,
      o.amount_paid,
      o.cash_amount,
      o.card_amount,
      o.wallet_amount,
      o.status,
      o.notes,
      COALESCE(u.name, o.cashier_name, 'كاشير') AS cashier_name,
      (
        SELECT GROUP_CONCAT(oi.product_name || ' (' || oi.qty || ')', ' + ')
        FROM order_items oi
        WHERE oi.order_id = o.id
      ) AS items_summary
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE (date(o.created_at, 'localtime') = ? OR (? IS NOT NULL AND o.shift_id = ?)) AND o.status != 'cancelled'
    ORDER BY o.id DESC
    LIMIT 100
  `, [todayCairo, activeShiftId, activeShiftId]);

  return {
    today,
    shift,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock,
    topProducts,
    todayUserBreakdown,
    todayOrders
  };
}

// ---- Comprehensive Reports ----
function getReportSales({ dateFrom, dateTo, shiftId = null, userId = null } = {}) {
  const conditions = ["status != 'cancelled'"];
  const oConditions = ["o.status != 'cancelled'"];
  const params = [];
  const reportTzMode = getReportTimezoneMode();
  if (dateFrom) {
    const dFrom = String(dateFrom).slice(0, 10);
    const startMs = reportDayStartMs(dFrom, reportTzMode);
    if (startMs !== null) {
      conditions.push("created_at >= ?");
      oConditions.push("o.created_at >= ?");
      params.push(new Date(startMs).toISOString());
    }
  }
  if (dateTo) {
    const dTo = String(dateTo).slice(0, 10);
    const endMs = reportDayNextStartMs(dTo, reportTzMode);
    if (endMs !== null) {
      conditions.push("created_at < ?");
      oConditions.push("o.created_at < ?");
      params.push(new Date(endMs).toISOString());
    }
  }
  if (shiftId && shiftId !== 'all' && String(shiftId).trim() !== '') { 
    conditions.push("shift_id = ?"); 
    oConditions.push("o.shift_id = ?");
    params.push(Number(shiftId)); 
  }
  if (userId && userId !== 'all' && String(userId).trim() !== '') {
    const numUid = Number(userId);
    conditions.push("(user_id = ? OR (user_id IS NULL AND shift_id IN (SELECT id FROM shifts WHERE user_id = ?)))");
    oConditions.push("(o.user_id = ? OR (o.user_id IS NULL AND o.shift_id IN (SELECT id FROM shifts WHERE user_id = ?)))");
    params.push(numUid, numUid);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const oWhere = oConditions.length ? 'WHERE ' + oConditions.join(' AND ') : '';

  const summary = queryGet(`
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(total), 0) AS total_sales,
      COALESCE(SUM(discount), 0) AS total_discounts,
      COALESCE(SUM(tax), 0) AS total_tax,
      COALESCE(SUM(CASE 
        WHEN (order_type = 'notebook' OR payment_method = 'notebook') THEN COALESCE(cash_amount, 0)
        WHEN payment_method = 'cash' THEN total 
        WHEN payment_method = 'split' THEN cash_amount 
        ELSE 0 
      END), 0) AS cash_sales,
      COALESCE(SUM(CASE 
        WHEN (order_type = 'notebook' OR payment_method = 'notebook') THEN 0
        WHEN payment_method = 'card' THEN total 
        WHEN payment_method = 'split' THEN card_amount 
        ELSE 0 
      END), 0) AS card_sales,
      COALESCE(SUM(CASE 
        WHEN (order_type = 'notebook' OR payment_method = 'notebook') THEN 0
        WHEN payment_method = 'wallet' THEN total 
        WHEN payment_method = 'split' THEN wallet_amount 
        ELSE 0 
      END), 0) AS wallet_sales,
      COALESCE(SUM(CASE WHEN (order_type = 'notebook' OR payment_method = 'notebook') THEN total ELSE 0 END), 0) AS notebook_sales,
      COALESCE(SUM(CASE WHEN (order_type = 'notebook' OR payment_method = 'notebook') THEN total - COALESCE(cash_amount, 0) ELSE 0 END), 0) AS notebook_remaining,
      COALESCE(SUM(CASE WHEN order_type = 'dine_in' THEN total ELSE 0 END), 0) AS dine_in_sales,
      COALESCE(SUM(CASE WHEN order_type = 'takeaway' THEN total ELSE 0 END), 0) AS takeaway_sales
    FROM orders ${where}
  `, params);

  const topProducts = queryAll(`
    SELECT oi.product_name, oi.product_id,
      SUM(oi.qty) AS total_qty,
      SUM(oi.total_price) AS total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    ${oWhere}
    GROUP BY oi.product_id
    ORDER BY total_qty DESC
    LIMIT 20
  `, params);

  // القائمة الكاملة للأصناف المباعة بدون حد أقصى - تُستخدم في التصدير حتى لا تسقط أصناف من التقرير
  const allProducts = queryAll(`
    SELECT oi.product_name, oi.product_id,
      SUM(oi.qty) AS total_qty,
      SUM(oi.total_price) AS total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    ${oWhere}
    GROUP BY oi.product_id
    ORDER BY total_qty DESC
  `, params);

  const dailyRows = queryAll(`
    SELECT created_at, COALESCE(total, 0) AS total
    FROM orders ${where}
  `, params);
  const dailyMap = new Map();
  for (const r of dailyRows) {
    const day = toCairoDateString(r.created_at) || String(r.created_at || '').slice(0, 10);
    if (!day) continue;
    const cur = dailyMap.get(day) || { day, order_count: 0, total: 0 };
    cur.order_count += 1;
    cur.total += r.total;
    dailyMap.set(day, cur);
  }
  const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => (a.day < b.day ? -1 : 1));

  const bySection = queryAll(`
    SELECT COALESCE(NULLIF(o.table_hall, ''), t.hall, 'صالة') AS section_name,
      COALESCE(NULLIF(o.table_name, ''), t.name, 'طاولة') AS table_name,
      COUNT(*) AS order_count,
      COALESCE(SUM(o.total), 0) AS total
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    ${oWhere.length ? oWhere + " AND o.order_type = 'dine_in'" : "WHERE o.order_type = 'dine_in'"}
    GROUP BY COALESCE(NULLIF(o.table_hall, ''), t.hall, 'صالة'), COALESCE(o.table_id, 'nm:' || COALESCE(NULLIF(o.table_name, ''), t.name, '')) ORDER BY total DESC
  `, params);

  const userBreakdown = queryAll(`
    SELECT 
      COALESCE(o.user_id, s.user_id, 0) AS user_id,
      COALESCE(u.name, o.cashier_name, u.username, 'كاشير') AS user_name,
      COUNT(*) AS order_count,
      COALESCE(SUM(o.total), 0) AS total_sales,
      COALESCE(SUM(CASE 
        WHEN (o.order_type = 'notebook' OR o.payment_method = 'notebook') THEN COALESCE(o.cash_amount, 0)
        WHEN o.payment_method = 'cash' THEN o.total 
        WHEN o.payment_method = 'split' THEN o.cash_amount 
        ELSE 0 
      END), 0) AS cash_sales,
      COALESCE(SUM(CASE 
        WHEN (o.order_type = 'notebook' OR o.payment_method = 'notebook') THEN 0
        WHEN o.payment_method = 'card' THEN o.total 
        WHEN o.payment_method = 'split' THEN o.card_amount 
        ELSE 0 
      END), 0) AS card_sales,
      COALESCE(SUM(CASE 
        WHEN (o.order_type = 'notebook' OR o.payment_method = 'notebook') THEN 0
        WHEN o.payment_method = 'wallet' THEN o.total 
        WHEN o.payment_method = 'split' THEN o.wallet_amount 
        ELSE 0 
      END), 0) AS wallet_sales,
      COALESCE(SUM(CASE WHEN (o.order_type = 'notebook' OR o.payment_method = 'notebook') THEN o.total ELSE 0 END), 0) AS notebook_sales
    FROM orders o
    LEFT JOIN shifts s ON o.shift_id = s.id
    LEFT JOIN users u ON COALESCE(o.user_id, s.user_id) = u.id
    ${oWhere}
    GROUP BY COALESCE(o.user_id, s.user_id)
    ORDER BY total_sales DESC
  `, params);

  const ordersList = queryAll(`
    SELECT 
      o.id, o.invoice_no, o.created_at, o.order_type, o.customer_name,
      o.total, o.payment_method, o.status,
      COALESCE(u.name, o.cashier_name, u.username, 'كاشير') AS cashier_name,
      COALESCE(NULLIF(o.table_name, ''), t.name, 'تيك أواي') AS table_name
    FROM orders o
    LEFT JOIN shifts s ON o.shift_id = s.id
    LEFT JOIN users u ON COALESCE(o.user_id, s.user_id) = u.id
    LEFT JOIN tables t ON o.table_id = t.id
    ${oWhere}
    ORDER BY o.created_at DESC
    LIMIT 2000
  `, params);

  return { summary, topProducts, allProducts, dailyBreakdown, bySection, userBreakdown, ordersList };
}


function getReportInventory({ dateFrom, dateTo, productId = null } = {}) {
  const allProducts = queryAll(`
    SELECT p.id, p.name, p.price, p.cost, p.stock_qty, p.low_stock_threshold,
      c.name AS category_name, p.is_deleted
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE (p.is_deleted = 0 OR p.is_deleted IS NULL)
    ORDER BY c.name ASC, p.name ASC
  `);

  // Today consumed items (sales, out, waste)
  const consumedToday = queryAll(`
    SELECT sm.product_id, p.name AS product_name, c.name AS category_name,
      SUM(ABS(sm.quantity)) AS qty_out,
      p.stock_qty, p.low_stock_threshold, p.price, p.cost
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE sm.movement_type IN ('sale', 'out', 'waste')
      AND date(sm.created_at, 'localtime') = date('now', 'localtime')
    GROUP BY sm.product_id
    ORDER BY qty_out DESC
  `);

  // Weekly consumed items (last 7 days)
  const consumedWeek = queryAll(`
    SELECT sm.product_id, p.name AS product_name, c.name AS category_name,
      SUM(ABS(sm.quantity)) AS qty_out,
      p.stock_qty, p.low_stock_threshold, p.price, p.cost
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE sm.movement_type IN ('sale', 'out', 'waste')
      AND date(sm.created_at, 'localtime') >= date('now', 'localtime', '-7 days')
    GROUP BY sm.product_id
    ORDER BY qty_out DESC
  `);

  const todayMap = {};
  for (const row of consumedToday) {
    todayMap[row.product_id] = Number(row.qty_out) || 0;
  }
  const weekMap = {};
  for (const row of consumedWeek) {
    weekMap[row.product_id] = Number(row.qty_out) || 0;
  }

  const enrichedProducts = allProducts.map(p => ({
    ...p,
    consumed_today: todayMap[p.id] || 0,
    consumed_week: weekMap[p.id] || 0
  }));

  // Stock movements in range (with optional productId filter)
  const conditions = [];
  const params = [];
  if (productId && productId !== 'all') {
    conditions.push("sm.product_id = ?");
    params.push(Number(productId));
  }
  if (dateFrom) { 
    conditions.push("date(sm.created_at, 'localtime') >= ?"); 
    params.push(String(dateFrom).slice(0, 10)); 
  }
  if (dateTo) { 
    conditions.push("date(sm.created_at, 'localtime') <= ?"); 
    params.push(String(dateTo).slice(0, 10)); 
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const movements = queryAll(`
    SELECT sm.*, p.name AS product_name, c.name AS category_name
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    ${where}
    ORDER BY sm.created_at DESC
    LIMIT 500
  `, params);

  const movementSummary = queryAll(`
    SELECT sm.product_id, p.name AS product_name,
      SUM(CASE WHEN sm.movement_type IN ('in', 'cancel', 'return', 'initial') THEN ABS(sm.quantity) ELSE 0 END) AS total_in,
      SUM(CASE WHEN sm.movement_type IN ('sale', 'out', 'waste') THEN ABS(sm.quantity) ELSE 0 END) AS total_out
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    ${where}
    GROUP BY sm.product_id
    ORDER BY total_out DESC
  `, params);

  const lowStock = enrichedProducts
    .filter(p => Number(p.stock_qty) <= Number(p.low_stock_threshold || 10))
    .sort((a, b) => Number(a.stock_qty) - Number(b.stock_qty));

  // Product specific details if requested
  let productDetails = null;
  if (productId && productId !== 'all') {
    const p = queryGet(`
      SELECT p.id, p.name, p.price, p.cost, p.stock_qty, p.low_stock_threshold,
        c.name AS category_name, p.is_deleted
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `, [Number(productId)]);
    if (p) {
      const todayOut = queryGet(`
        SELECT SUM(ABS(quantity)) AS total
        FROM stock_movements
        WHERE product_id = ? AND movement_type IN ('sale', 'out', 'waste')
          AND date(created_at, 'localtime') = date('now', 'localtime')
      `, [p.id])?.total || 0;

      const weekOut = queryGet(`
        SELECT SUM(ABS(quantity)) AS total
        FROM stock_movements
        WHERE product_id = ? AND movement_type IN ('sale', 'out', 'waste')
          AND date(created_at, 'localtime') >= date('now', 'localtime', '-7 days')
      `, [p.id])?.total || 0;

      const totalIn = queryGet(`
        SELECT SUM(ABS(quantity)) AS total
        FROM stock_movements
        WHERE product_id = ? AND movement_type IN ('in', 'cancel', 'return', 'initial')
      `, [p.id])?.total || 0;

      const totalOut = queryGet(`
        SELECT SUM(ABS(quantity)) AS total
        FROM stock_movements
        WHERE product_id = ? AND movement_type IN ('sale', 'out', 'waste')
      `, [p.id])?.total || 0;

      productDetails = {
        ...p,
        consumed_today: todayOut,
        consumed_week: weekOut,
        total_in: totalIn,
        total_out: totalOut
      };
    }
  }

  return { allProducts: enrichedProducts, movements, movementSummary, lowStock, consumedToday, consumedWeek, productDetails };
}

function getReportShift({ shiftId } = {}) {
  if (!shiftId) return null;
  let shift = queryGet('SELECT * FROM shifts WHERE id = ?', [shiftId]);
  if (!shift) return null;

  const rawAdjustments = queryAll('SELECT * FROM shift_adjustments WHERE shift_id = ? ORDER BY created_at ASC, id ASC', [shiftId]);
  const adjustments = rawAdjustments.map((a) => ({
    ...a,
    is_post_close: Boolean(shift.closed_at && a.created_at > shift.closed_at)
  }));
  const preCloseAdjustments = adjustments.filter((a) => !a.is_post_close);
  const postCloseAdjustments = adjustments.filter((a) => a.is_post_close);

  const adjustIn = adjustments.filter((a) => a.type === 'in').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const adjustOut = adjustments.filter((a) => a.type === 'out').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const totalAdjustments = roundCurrency(adjustIn - adjustOut, true);

  const preAdjustIn = preCloseAdjustments.filter((a) => a.type === 'in').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const preAdjustOut = preCloseAdjustments.filter((a) => a.type === 'out').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const preCloseAdjustmentsTotal = roundCurrency(preAdjustIn - preAdjustOut, true);

  const postAdjustIn = postCloseAdjustments.filter((a) => a.type === 'in').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const postAdjustOut = postCloseAdjustments.filter((a) => a.type === 'out').reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const postCloseAdjustmentsTotal = roundCurrency(postAdjustIn - postAdjustOut, true);

  shift.adjustments_total = totalAdjustments;
  shift.adjustments_in = roundCurrency(adjustIn);
  shift.adjustments_out = roundCurrency(adjustOut);
  shift.pre_close_adjustments_total = preCloseAdjustmentsTotal;
  shift.post_close_adjustments_total = postCloseAdjustmentsTotal;

  const refunds = queryAll(`
    SELECT r.refund_amount, r.payment_method, r.order_id, o.shift_id AS order_shift_id
    FROM order_refunds r
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE r.shift_id = ?
  `, [shiftId]);
  const cashRefundsOut = refunds.reduce((sum, r) => {
    if (r.payment_method !== 'cash') return sum;
    if (r.order_shift_id && Number(r.order_shift_id) === Number(shiftId)) {
      return sum;
    }
    return sum + (Number(r.refund_amount) || 0);
  }, 0);
  shift.cash_refunds_out = roundCurrency(cashRefundsOut);

  if (!shift.closed_at) {
    const cur = currentShift();
    if (cur && cur.id === shift.id) {
      shift = { ...shift, ...cur };
    }
    shift.updated_expected_cash = shift.expected_cash;
    shift.final_cash_difference = 0;
  } else {
    const shiftDebtCash = queryGet('SELECT COALESCE(SUM(amount), 0) AS total FROM debt_payments WHERE shift_id = ? AND (payment_method = "cash" OR payment_method IS NULL OR payment_method = "")', [shiftId])?.total || 0;
    const closingExpected = shift.closing_cash !== null && shift.closing_cash !== undefined
      ? Number(shift.closing_cash)
      : Math.round((
          (Number(shift.opening_cash) || 0) +
          (Number(shift.cash_sales) || 0) +
          (Number(shiftDebtCash) || 0) -
          (Number(shift.expenses_total) || 0) -
          (Number(shift.cash_refunds_out ?? shift.refunds_total) || 0) +
          (Number(preCloseAdjustmentsTotal) || 0)
        ) * 100) / 100;
    shift.expected_cash = closingExpected;
    shift.closing_cash = closingExpected;
    shift.updated_expected_cash = roundCurrency(closingExpected + postCloseAdjustmentsTotal, true);
    const countedActual = shift.actual_cash !== null && shift.actual_cash !== undefined
      ? Number(shift.actual_cash)
      : closingExpected;
    shift.final_cash_difference = roundCurrency(countedActual - shift.updated_expected_cash, true);
  }

  const orders = queryAll(`
    SELECT o.*, GROUP_CONCAT(oi.product_name || ' x' || oi.qty, ', ') AS items_summary
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.shift_id = ? AND o.status != 'cancelled'
    GROUP BY o.id
    ORDER BY o.created_at ASC
  `, [shiftId]);

  const itemsSummary = queryAll(`
    SELECT oi.product_name, SUM(oi.qty) AS total_qty, SUM(oi.total_price) AS total_sales
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.shift_id = ? AND o.status != 'cancelled'
    GROUP BY oi.product_id
    ORDER BY total_qty DESC
  `, [shiftId]);

  const expenses = queryAll('SELECT * FROM expenses WHERE shift_id = ? ORDER BY created_at ASC', [shiftId]);

  const stockConsumed = queryAll(`
    SELECT sm.product_id, p.name AS product_name,
      SUM(ABS(sm.quantity)) AS consumed
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    WHERE sm.movement_type IN ('sale', 'out', 'waste')
      AND sm.created_at >= ? AND sm.created_at <= ?
    GROUP BY sm.product_id
    ORDER BY consumed DESC
  `, [shift.opened_at, shift.closed_at || new Date().toISOString()]);

  return {
    shift,
    orders,
    itemsSummary,
    expenses,
    adjustments,
    preCloseAdjustments,
    postCloseAdjustments,
    stockConsumed
  };
}

// حساب هل مصر في توقيت صيفي في تاريخ معين (تلقائي وفقاً لقانون 24 لسنة 2023 أو إعداد المالك)
function getDstSettings() {
  if (!db) return { dst_mode: 'auto', dst_custom_start: '', dst_custom_end: '' };
  try {
    const rowMode = queryGet("SELECT value FROM settings WHERE key = 'dst_mode'");
    const rowStart = queryGet("SELECT value FROM settings WHERE key = 'dst_custom_start'");
    const rowEnd = queryGet("SELECT value FROM settings WHERE key = 'dst_custom_end'");
    return {
      dst_mode: rowMode?.value || 'auto',
      dst_custom_start: rowStart?.value || '',
      dst_custom_end: rowEnd?.value || ''
    };
  } catch (_) {
    return { dst_mode: 'auto', dst_custom_start: '', dst_custom_end: '' };
  }
}

function isEgyptDST(date = new Date(), options = null) {
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return false;
  const cfg = options || getDstSettings();
  const mode = cfg.dst_mode || 'auto';

  if (mode === 'enabled') {
    return true;
  }
  if (mode === 'disabled') {
    return false;
  }
  if (mode === 'custom') {
    if (cfg.dst_custom_start && cfg.dst_custom_end) {
      const cStart = new Date(cfg.dst_custom_start).getTime();
      const cEnd = new Date(cfg.dst_custom_end).getTime();
      const t = d.getTime();
      if (!isNaN(cStart) && !isNaN(cEnd)) {
        return t >= cStart && t < cEnd;
      }
    }
  }

  // 1. Egypt DST starts at 00:00 on the last Friday of April (Cairo UTC+2 -> Thursday 22:00 UTC)
  const year = d.getUTCFullYear();
  const april30Day = new Date(Date.UTC(year, 3, 30)).getUTCDay();
  const lastFridayApril = 30 - ((april30Day - 5 + 7) % 7);
  const dstStart = new Date(Date.UTC(year, 3, lastFridayApril - 1, 22, 0, 0));

  // 2. Egypt DST ends at 24:00 on the last Thursday of October (Cairo UTC+3 -> Thursday 21:00 UTC)
  const oct31Day = new Date(Date.UTC(year, 9, 31)).getUTCDay();
  const lastThursdayOct = 31 - ((oct31Day - 4 + 7) % 7);
  const dstEnd = new Date(Date.UTC(year, 9, lastThursdayOct, 21, 0, 0));

  const t = d.getTime();
  return t >= dstStart.getTime() && t < dstEnd.getTime();
}

// تحويل أي وقت مخزّن (UTC) إلى تاريخ اليوم الفعلي بصيغة YYYY-MM-DD
// يدعم التوقيت العالمي التلقائي حسب جهاز العميل (timezone_mode = 'auto')، أو توقيت القاهرة الدقيق، أو أي منطقة زمنية IANA
// وضع المنطقة الزمنية المختار من الإعدادات (auto يعني توقيت الجهاز)
function getReportTimezoneMode() {
  try {
    if (db) {
      const row = queryGet("SELECT value FROM settings WHERE key = 'timezone_mode'");
      if (row && row.value) return String(row.value).trim();
    }
  } catch (_) {}
  return 'auto';
}

// فرق التوقيت بالمللي ثانية للمنطقة المختارة عند لحظة معينة (موجب شرق UTC)
function tzOffsetMsAt(d, tzMode) {
  const t = d.getTime();
  if (tzMode === 'Africa/Cairo') {
    return (isEgyptDST(d) ? 3 : 2) * 3600000;
  }
  if (tzMode && tzMode !== 'auto' && tzMode !== 'local') {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tzMode, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }).formatToParts(d);
      const get = (type) => Number(parts.find(p => p.type === type)?.value);
      const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
      return asUtc - Math.floor(t / 1000) * 1000;
    } catch (_) {}
  }
  return -d.getTimezoneOffset() * 60000;
}

// بداية يوم العمل (00:00 بالتوقيت المختار) محولة إلى UTC، مع تكرار بسيط لضبط الانتقال الصيفي
function reportDayStartMs(dateStr, tzMode) {
  const [y, m, dd] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !dd) return null;
  const guess = Date.UTC(y, m - 1, dd, 0, 0, 0);
  let start = guess - tzOffsetMsAt(new Date(guess), tzMode);
  start = guess - tzOffsetMsAt(new Date(start), tzMode);
  return start;
}

// بداية اليوم التالي (نهاية اليوم المطلوب) كحد حصري بصيغة UTC
function reportDayNextStartMs(dateStr, tzMode) {
  const [y, m, dd] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !dd) return null;
  const guess = Date.UTC(y, m - 1, dd + 1, 0, 0, 0);
  let start = guess - tzOffsetMsAt(new Date(guess), tzMode);
  start = guess - tzOffsetMsAt(new Date(start), tzMode);
  return start;
}

function toCairoDateString(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;

  let tzMode = 'auto';
  try {
    if (db) {
      const row = queryGet("SELECT value FROM settings WHERE key = 'timezone_mode'");
      if (row && row.value) tzMode = String(row.value).trim();
    }
  } catch (_) {}

  if (tzMode === 'Africa/Cairo') {
    const offsetHours = isEgyptDST(d) ? 3 : 2;
    const cairoTime = new Date(d.getTime() + offsetHours * 3600000);
    const y = cairoTime.getUTCFullYear();
    const m = String(cairoTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cairoTime.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  try {
    const fmtOpts = { year: 'numeric', month: '2-digit', day: '2-digit' };
    if (tzMode && tzMode !== 'auto' && tzMode !== 'local') {
      fmtOpts.timeZone = tzMode;
    }
    const parts = new Intl.DateTimeFormat('en-CA', fmtOpts).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch (_) {}

  // Fallback to host local date
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCairoTodayString() {
  return toCairoDateString(new Date().toISOString());
}

function getDailySummaryReport(dateStr) {
  if (!dateStr) dateStr = toCairoDateString(new Date().toISOString());

  // نجيب أي شيفت ممكن يقع في حدود اليوم المطلوب بتوقيت القاهرة، بهامش يوم كامل
  // ونضم أي شيفت مفتوح حالياً لو الاستعلام عن اليوم حتى لو بدأ من أكثر من 24 ساعة
  const isToday = (dateStr === toCairoDateString(new Date().toISOString()));
  const wideRows = queryAll(
    `SELECT id, opened_at, closed_at FROM shifts
     WHERE (date(opened_at, 'localtime') BETWEEN date(?, '-2 days') AND date(?, '+2 days'))
        OR (? = 1 AND closed_at IS NULL)
     ORDER BY opened_at ASC`,
    [dateStr, dateStr, isToday ? 1 : 0]
  );
  // الفلتر الدقيق: الشيفت يتبع يوم العمل الذي تم فتح الوردية فيه حصراً:
  //   1. تاريخ فتح الشيفت (Cairo) = dateStr
  //   2. أو الشيفت المفتوح حالياً ولم يُغلق بعد عند الاستعلام عن اليوم الحالي
  const seenIds = new Set();
  const shiftRows = wideRows.filter((r) => {
    if (seenIds.has(r.id)) return false;
    if (isToday && !r.closed_at) {
      seenIds.add(r.id);
      return true;
    }
    const openedOnDate = toCairoDateString(r.opened_at) === dateStr;
    if (openedOnDate) {
      seenIds.add(r.id);
      return true;
    }
    return false;
  });

  if (shiftRows.length === 0) {
    return {
      date: dateStr,
      shifts: [],
      grandTotal: {
        totalSales: 0,
        totalExpenses: 0,
        cashSales: 0,
        walletSales: 0,
        cardSales: 0,
        netCash: 0,
        ordersCount: 0
      }
    };
  }

  // P1-FIX: Batch aggregation to prevent N+1 query storms on multi-shift / period reports
  const shiftIds = shiftRows.map((r) => r.id);
  const inClause = shiftIds.join(',');

  // 1. Shift records
  const allShifts = queryAll(`SELECT * FROM shifts WHERE id IN (${inClause}) ORDER BY opened_at ASC`);

  // 2. Orders list with item summary
  const allOrders = queryAll(`
    SELECT o.*, GROUP_CONCAT(oi.product_name || ' x' || oi.qty, ', ') AS items_summary
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.shift_id IN (${inClause}) AND o.status != 'cancelled'
    GROUP BY o.id
    ORDER BY o.created_at ASC
  `);
  const ordersByShift = new Map();
  for (const o of allOrders) {
    if (!ordersByShift.has(o.shift_id)) ordersByShift.set(o.shift_id, []);
    ordersByShift.get(o.shift_id).push(o);
  }

  // 3. Expenses
  const allExpenses = queryAll(`SELECT * FROM expenses WHERE shift_id IN (${inClause}) ORDER BY created_at ASC`);
  const expensesByShift = new Map();
  for (const e of allExpenses) {
    if (!expensesByShift.has(e.shift_id)) expensesByShift.set(e.shift_id, []);
    expensesByShift.get(e.shift_id).push(e);
  }

  // 4. Adjustments
  const allAdjustments = queryAll(`SELECT * FROM shift_adjustments WHERE shift_id IN (${inClause}) ORDER BY created_at ASC, id ASC`);
  const adjustmentsByShift = new Map();
  for (const a of allAdjustments) {
    if (!adjustmentsByShift.has(a.shift_id)) adjustmentsByShift.set(a.shift_id, []);
    adjustmentsByShift.get(a.shift_id).push(a);
  }

  // 5. Refunds
  const allRefunds = queryAll(`
    SELECT r.refund_amount, r.payment_method, r.order_id, r.shift_id, o.shift_id AS order_shift_id
    FROM order_refunds r
    LEFT JOIN orders o ON r.order_id = o.id
    WHERE r.shift_id IN (${inClause})
  `);
  const refundsByShift = new Map();
  for (const r of allRefunds) {
    if (!refundsByShift.has(r.shift_id)) refundsByShift.set(r.shift_id, []);
    refundsByShift.get(r.shift_id).push(r);
  }

  // 6. Debt collections
  const allDebts = queryAll(`
    SELECT shift_id, COALESCE(SUM(amount), 0) AS total
    FROM debt_payments
    WHERE shift_id IN (${inClause}) AND (payment_method = 'cash' OR payment_method IS NULL OR payment_method = '')
    GROUP BY shift_id
  `);
  const debtByShift = new Map();
  for (const d of allDebts) {
    debtByShift.set(d.shift_id, Number(d.total) || 0);
  }

  const shifts = [];
  let grandTotalSales = 0;
  let grandTotalExpenses = 0;
  let grandCashSales = 0;
  let grandWalletSales = 0;
  let grandCardSales = 0;
  let grandNetCash = 0;
  let grandOrdersCount = 0;

  for (let s of allShifts) {
    const shiftOrders = ordersByShift.get(s.id) || [];
    const shiftExpenses = expensesByShift.get(s.id) || [];
    const rawAdjustments = adjustmentsByShift.get(s.id) || [];
    const shiftRefunds = refundsByShift.get(s.id) || [];

    const adjustments = rawAdjustments.map((a) => ({
      ...a,
      is_post_close: Boolean(s.closed_at && a.created_at > s.closed_at)
    }));
    const preCloseAdjustments = adjustments.filter((a) => !a.is_post_close);
    const postCloseAdjustments = adjustments.filter((a) => a.is_post_close);

    const adjustIn = adjustments.filter((a) => a.type === 'in').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const adjustOut = adjustments.filter((a) => a.type === 'out').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const totalAdjustments = roundCurrency(adjustIn - adjustOut, true);

    const preAdjustIn = preCloseAdjustments.filter((a) => a.type === 'in').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const preAdjustOut = preCloseAdjustments.filter((a) => a.type === 'out').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const preCloseAdjustmentsTotal = roundCurrency(preAdjustIn - preAdjustOut, true);

    const postAdjustIn = postCloseAdjustments.filter((a) => a.type === 'in').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const postAdjustOut = postCloseAdjustments.filter((a) => a.type === 'out').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const postCloseAdjustmentsTotal = roundCurrency(postAdjustIn - postAdjustOut, true);

    const cashRefundsOut = shiftRefunds.reduce((sum, r) => {
      if (r.payment_method !== 'cash') return sum;
      if (r.order_shift_id && Number(r.order_shift_id) === Number(s.id)) return sum;
      return sum + (Number(r.refund_amount) || 0);
    }, 0);

    s.adjustments_total = totalAdjustments;
    s.adjustments_in = roundCurrency(adjustIn);
    s.adjustments_out = roundCurrency(adjustOut);
    s.pre_close_adjustments_total = preCloseAdjustmentsTotal;
    s.post_close_adjustments_total = postCloseAdjustmentsTotal;
    s.cash_refunds_out = roundCurrency(cashRefundsOut);

    if (!s.closed_at) {
      const cur = currentShift();
      if (cur && cur.id === s.id) {
        s = { ...s, ...cur };
      }
      s.updated_expected_cash = s.expected_cash;
      s.final_cash_difference = 0;
    } else {
      const shiftDebtCash = debtByShift.get(s.id) || 0;
      const closingExpected = s.closing_cash !== null && s.closing_cash !== undefined
        ? Number(s.closing_cash)
        : Math.round((
            (Number(s.opening_cash) || 0) +
            (Number(s.cash_sales) || 0) +
            (Number(shiftDebtCash) || 0) -
            (Number(s.expenses_total) || 0) -
            (Number(s.cash_refunds_out ?? s.refunds_total) || 0) +
            (Number(preCloseAdjustmentsTotal) || 0)
          ) * 100) / 100;
      s.expected_cash = closingExpected;
      s.closing_cash = closingExpected;
      s.updated_expected_cash = roundCurrency(closingExpected + postCloseAdjustmentsTotal, true);
      const countedActual = s.actual_cash !== null && s.actual_cash !== undefined
        ? Number(s.actual_cash)
        : closingExpected;
      s.final_cash_difference = roundCurrency(countedActual - s.updated_expected_cash, true);
    }

    const ordersCount = shiftOrders.length;
    const expCount = shiftExpenses.length;
    const adjCount = adjustments.length;
    const openingCash = Number(s.opening_cash || 0);
    const actualCash = Number(s.actual_cash || 0);

    // Calculate aggregated sales directly from orders
    let totalSales = 0;
    let cashSales = 0;
    let walletSales = 0;
    let cardSales = 0;
    for (const o of shiftOrders) {
      totalSales += Number(o.total || 0);
      cashSales += Number(o.cash_amount || 0);
      cardSales += Number(o.card_amount || 0);
      walletSales += Number(o.wallet_amount || 0);
    }
    totalSales = roundCurrency(totalSales);
    cashSales = roundCurrency(cashSales);
    cardSales = roundCurrency(cardSales);
    walletSales = roundCurrency(walletSales);

    let totalExpenses = 0;
    for (const e of shiftExpenses) {
      totalExpenses += Number(e.amount || 0);
    }
    totalExpenses = roundCurrency(totalExpenses);

    s.total_sales = totalSales;
    s.cash_sales = cashSales;
    s.card_sales = cardSales;
    s.wallet_sales = walletSales;
    s.expenses_total = totalExpenses;

    // استبعاد الشيفتات المغلقة الصفرية (فتح بـ 0 وقفل بـ 0 وبدون أي نشاط مالي أو فواتير)
    if (s.closed_at && openingCash === 0 && actualCash === 0 && totalSales === 0 && totalExpenses === 0 && ordersCount === 0 && expCount === 0 && adjCount === 0) {
      continue;
    }

    const debtCashCollections = debtByShift.get(s.id) || 0;
    const netCash = Math.round((cashSales - totalExpenses + debtCashCollections - cashRefundsOut + totalAdjustments) * 100) / 100;

    grandTotalSales += totalSales;
    grandTotalExpenses += totalExpenses;
    grandCashSales += cashSales;
    grandWalletSales += walletSales;
    grandCardSales += cardSales;
    grandNetCash += netCash;
    grandOrdersCount += ordersCount;

    shifts.push({
      shift: s,
      orders: shiftOrders,
      expenses: shiftExpenses,
      adjustments,
      preCloseAdjustments,
      postCloseAdjustments,
      totalSales,
      totalExpenses,
      cashSales,
      walletSales,
      cardSales,
      cashRefundsOut,
      netCash,
      ordersCount
    });
  }

  return {
    date: dateStr,
    shifts,
    grandTotal: {
      totalSales: Math.round(grandTotalSales * 100) / 100,
      totalExpenses: Math.round(grandTotalExpenses * 100) / 100,
      cashSales: Math.round(grandCashSales * 100) / 100,
      walletSales: Math.round(grandWalletSales * 100) / 100,
      cardSales: Math.round(grandCardSales * 100) / 100,
      netCash: Math.round(grandNetCash * 100) / 100,
      ordersCount: grandOrdersCount
    }
  };
}


function getSettings() {
  const rows = queryAll('SELECT * FROM settings');
  const setts = {};
  for (const r of rows) {
    setts[r.key] = r.value;
  }
  // License material and PIN lockout HMAC state are never exposed via general settings API
  delete setts.license_key;
  delete setts.pin_lockout_state;

  // DST Settings defaults
  setts.dst_mode = setts.dst_mode || 'auto';
  setts.dst_custom_start = setts.dst_custom_start || '';
  setts.dst_custom_end = setts.dst_custom_end || '';

  // Normalize vendor feature keys: ensure they are always string 'true'/'false'
  const VENDOR_BOOL_KEYS = [
    'show_notebook_to_cashier',
    'require_password_transfer_tables',
    'allow_cashier_cancel_orders',
    'show_stock_alert_on_order',
    'enable_bar_order',
    'enable_guest_check',
    'enable_multi_shifts',
    'show_orders_to_cashier',
    'require_check_print_before_checkout',
    'enable_waiter_qr',
    'enable_notebook_for_admin',
    'enable_takeaway',
    'show_shift_status_bar',
    'show_bar_ticket_in_receipt'
  ];
  VENDOR_BOOL_KEYS.forEach((k) => {
    if (setts[k] === undefined || setts[k] === null) {
      setts[k] = (k === 'enable_bar_order' || k === 'enable_guest_check' || k === 'require_check_print_before_checkout' || k === 'enable_waiter_qr' || k === 'enable_notebook_for_admin' || k === 'enable_takeaway') ? 'true' : 'false';
    } else if (setts[k] === true || setts[k] === 'true' || setts[k] === '1') {
      setts[k] = 'true';
    } else if (setts[k] === false || setts[k] === 'false' || setts[k] === '0' || setts[k] === '') {
      setts[k] = 'false';
    }
  });

  return setts;
}

function saveSettings(settingsObj) {
  return withTransaction(() => {
    // Hard-blocked security & tamper keys — NEVER writable via regular settings:save
    const PROTECTED_SYSTEM_KEYS = new Set([
      'license_key',
      'pin_lockout_state',
      'tamper_locked',
      'tamper_reason',
      'tamper_date',
      'last_system_time',
      'vendor_password',
      'tamper_key',
      'cloud_sync_secret',
      'admin_password',
      '_db_integrity_seal_v1'
    ]);
    // Vendor-locked commercial feature flags — ONLY writable via saveVendorFeatures() with Ed25519 signature
    const VENDOR_LOCKED_KEYS = new Set([
      'show_notebook_to_cashier',
      'require_password_transfer_tables',
      'allow_cashier_cancel_orders',
      'show_stock_alert_on_order',
      'enable_bar_order',
      'enable_guest_check',
      'enable_multi_shifts',
      'show_orders_to_cashier',
      'enable_waiter_qr',
      'enable_waiter_system',
      'enable_customer_qr',
      'enable_mobile_hub',
      'enable_notebook_for_admin',
      'enable_takeaway',
      'show_shift_status_bar',
      'show_bar_ticket_in_receipt'
    ]);
    for (const [k, v] of Object.entries(settingsObj || {})) {
      if (PROTECTED_SYSTEM_KEYS.has(k)) continue;
      if (VENDOR_LOCKED_KEYS.has(k)) continue;
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, String(v)], { skipSave: true });
    }
    return getSettings();
  });
}

function isVendorFeatureEnabled(featureKey) {
  if (!db || !featureKey) return false;
  try {
    const row = queryGet('SELECT value FROM settings WHERE key = ?', [String(featureKey)]);
    return Boolean(row && (row.value === 'true' || row.value === '1'));
  } catch (_) {
    return false;
  }
}

// --- Persistent PIN Lockout with Device/License-Derived HMAC Security (No Hardcoded Secret) ---
const PIN_LOCKOUT_KEY = 'pin_lockout_state';

function computePinLockoutHmac(count, windowStart, lockedUntil) {
  const payload = `${count}:${windowStart}:${lockedUntil}`;
  const hmacKey = getDeviceIntegrityKey('pin-lockout-v2');
  return crypto.createHmac('sha256', hmacKey).update(payload).digest('hex');
}

function verifyAuditLogChain(targetDb = null) {
  const d = targetDb || db;
  if (!d) return { valid: false, error: 'Database not initialized' };
  try {
    const res = d.exec('SELECT id, action, entity_type, entity_id, actor_name, details, created_at FROM audit_log ORDER BY id ASC');
    if (!res || !res[0] || res[0].values.length === 0) {
      return { valid: true, count: 0, chainHash: null, empty: true };
    }
    const rows = res[0].values;
    let prevHash = 'GENESIS_AUDIT_BLOCK';
    let prevId = 0;
    const hmacKey = getDeviceIntegrityKey('audit-log-chain-v2');
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const id = r[0];
      if (prevId > 0 && id <= prevId) {
        return { valid: false, error: `Audit sequence broken at row ${i}: id ${id} <= prevId ${prevId}`, index: i };
      }
      prevId = id;
      const payload = `${prevHash}|${r[0]}|${r[1]}|${r[2]}|${r[3]}|${r[4]}|${r[5]}|${r[6]}`;
      prevHash = crypto.createHmac('sha256', hmacKey).update(payload).digest('hex');
    }
    return {
      valid: true,
      count: rows.length,
      firstId: rows[0][0],
      lastId: rows[rows.length - 1][0],
      finalChainHash: prevHash
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function getPinLockoutState() {
  if (!db) {
    return { count: 0, windowStart: 0, lockedUntil: 0 };
  }
  try {
    const row = queryGet('SELECT value FROM settings WHERE key = ?', [PIN_LOCKOUT_KEY]);
    if (row && row.value) {
      const data = JSON.parse(row.value);
      const expectedHmac = computePinLockoutHmac(data.count, data.windowStart, data.lockedUntil);
      if (data.hmac === expectedHmac) {
        return {
          count: Number(data.count) || 0,
          windowStart: Number(data.windowStart) || 0,
          lockedUntil: Number(data.lockedUntil) || 0
        };
      } else {
        console.warn('[Security] PIN lockout HMAC mismatch! Possible tamper detected.');
        // Fail-closed: enforce lockout
        return {
          count: 5,
          windowStart: Date.now(),
          lockedUntil: Date.now() + 60000
        };
      }
    }
  } catch (err) {
    console.error('[Security] getPinLockoutState error:', err.message);
  }
  return { count: 0, windowStart: 0, lockedUntil: 0 };
}

function savePinLockoutState(state) {
  if (!db) return;
  const count = Number(state.count) || 0;
  const windowStart = Number(state.windowStart) || 0;
  const lockedUntil = Number(state.lockedUntil) || 0;
  const hmac = computePinLockoutHmac(count, windowStart, lockedUntil);
  const json = JSON.stringify({ count, windowStart, lockedUntil, hmac });

  withTransaction(() => {
    runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [PIN_LOCKOUT_KEY, json], { skipSave: true });
  });
}

// Vendor Dev features are unlocked strictly using an Ed25519 signature: `VENDOR_DEV|<machineId>`
function verifyVendorPassword(password) {
  return dbLicensing.verifyVendorPassword(password);
}

function saveVendorFeatures({ vendorPassword, features }) {
  if (!verifyVendorPassword(vendorPassword)) {
    return { success: false, error: 'كلمة سر تفعيل المطور غير صحيحة! لا يمكن تعديل هذه الخواص.' };
  }
  if (!features || typeof features !== 'object') {
    return { success: false, error: 'بيانات غير صحيحة' };
  }

  return withTransaction(() => {
    if (features.show_notebook_to_cashier !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'show_notebook_to_cashier',
        String(features.show_notebook_to_cashier)
      ], { skipSave: true });
    }
    if (features.require_password_transfer_tables !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'require_password_transfer_tables',
        String(features.require_password_transfer_tables)
      ], { skipSave: true });
    }
    if (features.allow_cashier_cancel_orders !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'allow_cashier_cancel_orders',
        String(features.allow_cashier_cancel_orders)
      ], { skipSave: true });
    }
    if (features.show_stock_alert_on_order !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'show_stock_alert_on_order',
        String(features.show_stock_alert_on_order)
      ], { skipSave: true });
    }
    if (features.enable_bar_order !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_bar_order',
        String(features.enable_bar_order)
      ], { skipSave: true });
    }
    if (features.enable_guest_check !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_guest_check',
        String(features.enable_guest_check)
      ], { skipSave: true });
    }
    if (features.enable_multi_shifts !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_multi_shifts',
        String(features.enable_multi_shifts)
      ], { skipSave: true });
    }
    if (features.show_orders_to_cashier !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'show_orders_to_cashier',
        String(features.show_orders_to_cashier)
      ], { skipSave: true });
    }
    if (features.require_check_print_before_checkout !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'require_check_print_before_checkout',
        String(features.require_check_print_before_checkout)
      ], { skipSave: true });
    }
    if (features.enable_waiter_qr !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_waiter_qr',
        String(features.enable_waiter_qr)
      ], { skipSave: true });
    }
    if (features.enable_waiter_system !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_waiter_system',
        String(features.enable_waiter_system)
      ], { skipSave: true });
    }
    if (features.enable_customer_qr !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_customer_qr',
        String(features.enable_customer_qr)
      ], { skipSave: true });
    }
    if (features.enable_mobile_hub !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_mobile_hub',
        String(features.enable_mobile_hub)
      ], { skipSave: true });
    }
    if (features.enable_notebook_for_admin !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_notebook_for_admin',
        String(features.enable_notebook_for_admin)
      ], { skipSave: true });
    }
    if (features.enable_takeaway !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'enable_takeaway',
        String(features.enable_takeaway)
      ], { skipSave: true });
    }
    if (features.show_shift_status_bar !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'show_shift_status_bar',
        String(features.show_shift_status_bar)
      ], { skipSave: true });
    }
    if (features.show_bar_ticket_in_receipt !== undefined) {
      runSql('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'show_bar_ticket_in_receipt',
        String(features.show_bar_ticket_in_receipt)
      ], { skipSave: true });
    }
    return { success: true, settings: getSettings() };
  });
}


function getBaseDir() {
  return dbPath ? path.dirname(dbPath) : (app ? app.getPath('userData') : path.join(__dirname, '..'));
}

// ---- Backup & Restore Engine ----
function getBackupDir() {
  const baseDir = getBaseDir();
  const backupDir = path.join(baseDir, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function autoBackupShift(shiftId) {
  try {
    const backupDir = getBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cafe-pos-shift-${shiftId}-${timestamp}.db`;
    const backupPath = path.join(backupDir, filename);

    updateDbIntegritySeal();
  const data = safeDbExport();
    fs.writeFileSync(backupPath, Buffer.from(data));
  } catch (err) {
    console.error('Auto shift backup failed:', err);
  }
}

function autoBackupDaily() {
  try {
    const backupDir = getBackupDir();
    const today = new Date().toISOString().slice(0, 10);
    const filename = `cafe-pos-daily-${today}.db`;
    const backupPath = path.join(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
      updateDbIntegritySeal();
  const data = safeDbExport();
      fs.writeFileSync(backupPath, Buffer.from(data));
    }
  } catch (err) {
    console.error('Daily backup failed:', err);
  }
}

// نسخة احتياطية دورية كل 10 دقايق أثناء تشغيل البرنامج — بتتبادل بين ملفين ثابتين
// فقط (A/B) عشان الحجم يفضل محدود ومايتراكمش آلاف الملفات.
function autoBackupPeriodic() {
  try {
    const backupDir = getBackupDir();
    const slot = Math.floor(Date.now() / (10 * 60 * 1000)) % 2 === 0 ? 'A' : 'B';
    const backupPath = path.join(backupDir, `cafe-pos-periodic-${slot}.db`);
    updateDbIntegritySeal();
  const data = safeDbExport();
    fs.writeFileSync(backupPath, Buffer.from(data));
  } catch (err) {
    console.error('Periodic backup failed:', err);
  }
}

// ---- أرشفة تلقائية: تمنع تضخم قاعدة البيانات الحية مع مرور الوقت ----
// الاحتفاظ بآخر 30 يوم فقط في القاعدة الحية؛ كل ما هو أقدم يُنسخ لملف أرشيف منفصل ثم يُحذف من القاعدة الحية.
// فواتير مرتبطة بدين غير مسدد بالكامل لا تُؤرشف أبدًا.
function archiveOldData(retentionDays = 30) {
  try {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    // 1. فواتير محمية: مرتبطة بدين لم يُسدد بالكامل بعد — لا تُؤرشف مهما كان تاريخها
    const protectedIds = new Set(
      queryAll(`SELECT order_id FROM customer_debts WHERE order_id IS NOT NULL AND status != 'paid'`)
        .map((r) => Number(r.order_id))
    );

    // 2. الفواتير المؤهلة للأرشفة: أقدم من فترة الاحتفاظ وغير محمية
    const eligibleOrders = queryAll(`SELECT id FROM orders WHERE created_at < ?`, [cutoff])
      .map((r) => Number(r.id))
      .filter((id) => !protectedIds.has(id));

    const oldStockMovements = queryGet(`SELECT COUNT(*) AS c FROM stock_movements WHERE created_at < ?`, [cutoff]);
    const oldAuditLogs = queryGet(`SELECT COUNT(*) AS c FROM audit_log WHERE created_at < ?`, [cutoff]);

    const hasOldStock = oldStockMovements && Number(oldStockMovements.c) > 0;
    const hasOldAudit = oldAuditLogs && Number(oldAuditLogs.c) > 0;

    if (eligibleOrders.length === 0 && !hasOldStock && !hasOldAudit) {
      return { archived: false, reason: 'لا توجد بيانات قديمة كافية للأرشفة بعد' };
    }

    // 3. لقطة أرشيف كاملة لكل قاعدة البيانات (آمنة 100%) قبل أي حذف — لا نفقد أي شيء أبدًا
    const archiveDir = path.join(getBaseDir(), 'archives');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const archiveTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(archiveDir, `cafe-pos-archive-${archiveTimestamp}.db`);
    fs.writeFileSync(archivePath, Buffer.from(safeDbExport()));

    // 4. الحذف الفعلي من القاعدة الحية — داخل transaction واحدة ذرية
    return withTransaction(() => {
      let deletedOrders = 0;
      if (eligibleOrders.length > 0) {
        for (const oid of eligibleOrders) {
          runSql('DELETE FROM order_items WHERE order_id = ?', [oid], { skipSave: true });
          runSql('DELETE FROM order_refunds WHERE order_id = ?', [oid], { skipSave: true });
          runSql('DELETE FROM orders WHERE id = ?', [oid], { skipSave: true });
          deletedOrders++;
        }
      }
      // Preserve audit_log (HMAC chain integrity) and stock_movements (inventory history)
      console.log(`[Archive] تمت أرشفة ${deletedOrders} فاتورة الأقدم من ${retentionDays} يوم إلى: ${archivePath}`);
      return { archived: true, archivePath, deletedOrders };
    }, { immediateSave: true });
  } catch (err) {
    console.error('archiveOldData error:', err);
    return { archived: false, error: err.message };
  }
}

function getDatabaseHealth() {
  return dbHealth.getDatabaseHealth({ db, dbPath, queryGet });
}

function archiveAndCompact(retentionDays = 365) {
  return dbHealth.archiveAndCompact({
    db,
    dbPath,
    baseDir: getBaseDir(),
    queryAll,
    queryGet,
    runSql,
    withTransaction,
    safeDbExport,
    saveDbAtomic,
    retentionDays
  });
}

function pruneOldBackups(maxAgeDays = 30) {
  try {
    const backupDir = getBackupDir();
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      const now = Date.now();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        // حماية ملفات النسخ الدوري A/B من الحذف لأنها تدور ذاتياً
        if (file.includes('periodic')) continue;
        // حماية النسخة البكر الأساسية — لا تُحذف أبداً مهما مضى عليها من وقت
        if (file.includes('initial-baseline')) continue;
        if (file.endsWith('.db')) {
          const fullPath = path.join(backupDir, file);
          let stat = null;
          try { stat = fs.statSync(fullPath); } catch (_) { continue; }

          // حماية نسخ الأمان المسبقة للترقية — لا تُحذف تلقائياً قبل مرور 30 يوماً على الأقل (Item 11-b)
          if (file.startsWith('pre-upgrade-')) {
            const preUpgradeMaxAgeMs = Math.max(maxAgeMs, 30 * 24 * 60 * 60 * 1000);
            if (now - stat.mtimeMs <= preUpgradeMaxAgeMs) continue;
          }
          if (now - stat.mtimeMs > maxAgeMs) {
            try { fs.unlinkSync(fullPath); } catch (_) {}
          }
        }
      }
    }

    // تنظيف مجلد الأرشيف الدوري القديم (الاحتفاظ بآخر 60 يوم) لمنع امتلاء مساحة القرص
    const archiveDir = path.join(getBaseDir(), 'archives');
    if (fs.existsSync(archiveDir)) {
      const archFiles = fs.readdirSync(archiveDir);
      const now = Date.now();
      const maxArchiveAgeMs = 60 * 24 * 60 * 60 * 1000;
      for (const file of archFiles) {
        // Never auto-delete permanent yearly archive snapshots
        if (file.includes('yearly-archive')) continue;
        if (file.endsWith('.db')) {
          const fullPath = path.join(archiveDir, file);
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > maxArchiveAgeMs) {
            try { fs.unlinkSync(fullPath); } catch (_) {}
          }
        }
      }
    }
  } catch (err) {
    console.error('Error pruning old backups:', err);
  }
}

function createBackup(customDestPath = null) {
  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `cafe-pos-backup-${timestamp}.db`;
  const backupPath = customDestPath || path.join(backupDir, filename);

  updateDbIntegritySeal();
  const data = safeDbExport();
  fs.writeFileSync(backupPath, Buffer.from(data));

  return {
    success: true,
    path: backupPath,
    filePath: backupPath,
    filename: path.basename(backupPath),
    size: fs.statSync(backupPath).size
  };
}

function restoreBackup(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('ملف النسخة الاحتياطية غير صالح');
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error('ملف النسخة الاحتياطية غير صالح');
  }

  try {
    const fd = fs.openSync(resolved, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
      throw new Error('ملف النسخة الاحتياطية غير صالح: ليس ملف قاعدة بيانات SQLite');
    }
  } catch (err) {
    throw new Error('ملف النسخة الاحتياطية غير صالح: ' + err.message);
  }

  const backupBuffer = fs.readFileSync(resolved);

  // F-11: Deep verification of SQLite integrity and required schema tables
  try {
    const testDb = new SQLInstance.Database(backupBuffer);
    const integrityRes = testDb.exec("PRAGMA integrity_check");
    const integrityStatus = integrityRes?.[0]?.values?.[0]?.[0];
    if (integrityStatus !== 'ok') {
      testDb.close();
      throw new Error('ملف النسخة الاحتياطية تالف وفق فحص السلامة (integrity check failed)');
    }
    const tablesRes = testDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = (tablesRes?.[0]?.values || []).map(v => v[0]);
    const requiredTables = ['users', 'products', 'orders', 'shifts', 'settings'];
    const missing = requiredTables.filter(t => !tableNames.includes(t));
    if (missing.length > 0) {
      testDb.close();
      throw new Error(`ملف النسخة الاحتياطية لا يخص نظام تقفيلة POS (ينقصه جداول: ${missing.join(', ')})`);
    }
    testDb.close();
  } catch (err) {
    throw new Error('فشل فحص سلامة ملف النسخة الاحتياطية: ' + err.message);
  }

  const backupDir = getBackupDir();
  if (dbPath && fs.existsSync(dbPath)) {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const preRestoreBackup = path.join(backupDir, `pre-restore-${Date.now()}.db`);
    try {
      fs.copyFileSync(dbPath, preRestoreBackup);
      if (!fs.existsSync(preRestoreBackup) || fs.statSync(preRestoreBackup).size === 0) {
        throw new Error('فشل التحقق من وجود ملف نسخة الأمان أو حجمه صفر');
      }
    } catch (e) {
      console.error('[CRITICAL] Failed to create pre-restore safety backup:', e);
      throw new Error('فشل إنشاء نسخة الأمان الاحتياطية قبل الاستعادة — تم إيقاف عملية الاستعادة لحماية بياناتك الحالية: ' + e.message);
    }
  }

  // Atomic file replacement on disk before memory reload
  if (dbPath) {
    const dir = path.dirname(dbPath);
    const tmpRestorePath = path.join(dir, `cafe-pos-restore-${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tmpRestorePath, backupBuffer);
      fs.renameSync(tmpRestorePath, dbPath);
    } catch (diskErr) {
      try { fs.unlinkSync(tmpRestorePath); } catch (_) {}
      console.error('[CRITICAL] Failed to atomically replace live database on disk:', diskErr);
      throw new Error('تعذر استبدال ملف قاعدة البيانات على القرص: ' + diskErr.message);
    }
  }

  db = new SQLInstance.Database(backupBuffer);
  try {
    db.run('PRAGMA foreign_keys = ON;');
    db.run('PRAGMA cache_size = -10000;');
    db.run('PRAGMA temp_store = MEMORY;');
  } catch (_) {}
  if (dbPath && fs.existsSync(dbPath)) {
    try {
      const st = fs.statSync(dbPath);
      lastKnownDbMtime = st.mtimeMs;
      lastKnownDbSize = st.size;
    } catch (_) {}
  }

  return {
    success: true,
    requiresRestart: true
  };
}

// ---- Data Export to CSV & Styled Excel (.xls) with RTL Support ----
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsv(field) {
  if (field === null || field === undefined) return '""';
  let str = String(field);
  // F-10: CSV Formula Injection protection (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function generateStyledExcelHtml({ title, subtitle = '', headers = [], rows = [], totals = null }) {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const thHtml = headers.map(h => `<th style="background-color:#0f172a; color:#ffffff; font-weight:bold; border:1px solid #cbd5e1; padding:10px 14px; font-size:11.5pt; text-align:right;">${escapeHtml(h)}</th>`).join('');
  
  const rowsHtml = rows.map((r, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const cells = r.map((c, colIdx) => {
      const isNum = typeof c === 'number' || (!isNaN(parseFloat(c)) && isFinite(c) && !String(c).includes('-') && !String(c).includes('/'));
      const align = isNum ? 'center' : 'right';
      const safeVal = c !== null && c !== undefined ? escapeHtml(c) : '';
      return `<td style="border:1px solid #cbd5e1; padding:8px 10px; font-size:10.5pt; text-align:${align};">${safeVal}</td>`;
    }).join('');
    return `<tr style="background-color:${bg};">${cells}</tr>`;
  }).join('');

  let totalsHtml = '';
  if (totals && Array.isArray(totals)) {
    const cells = totals.map(c => `<td style="border:2px solid #0f172a; padding:10px; font-weight:bold; font-size:11.5pt; background-color:#e2e8f0; color:#0f172a; text-align:right;">${c !== null && c !== undefined ? escapeHtml(c) : ''}</td>`).join('');
    totalsHtml = `<tr>${cells}</tr>`;
  }

  return `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${String(title).slice(0, 28)}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayRightToLeft/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; }
    table { border-collapse: collapse; width: 100%; direction: rtl; }
  </style>
</head>
<body dir="rtl">
  <table style="margin-bottom:14px;">
    <tr>
      <td colspan="${headers.length}" style="font-size:18pt; font-weight:bold; text-align:center; padding:16px; background-color:#0f172a; color:#ffffff;">
        ${safeTitle}
      </td>
    </tr>
    ${subtitle ? `<tr><td colspan="${headers.length}" style="font-size:11.5pt; text-align:center; padding:8px; background-color:#334155; color:#f8fafc;">${safeSubtitle}</td></tr>` : ''}
  </table>
  <table>
    <thead>
      <tr>${thHtml}</tr>
    </thead>
    <tbody>
      ${rowsHtml}
      ${totalsHtml}
    </tbody>
  </table>
  <div style="margin-top:16px; font-size:9.5pt; color:#64748b; text-align:center;">
    تم تصدير التقرير آلياً بواسطة نظام كافيه تقفيلة Taqfeela POS • ${new Date().toLocaleString('ar-EG')}
  </div>
</body>
</html>`.trim();
}

function exportOrdersExcel(filters = {}) {
  const orders = listOrders({ limit: 1000, ...filters });
  const headers = ['رقم الفاتورة', 'التاريخ والوقت', 'الكاشير', 'الشيفت', 'النوع', 'المكان/الطاولة', 'العميل', 'المجموع الفرعي', 'الخصم', 'الإجمالي المستحق', 'طريقة الدفع', 'المدفوع', 'الباقي', 'الحالة', 'الأصناف'];
  const rows = [];
  let sumTotal = 0;
  let sumDiscount = 0;

  for (const o of orders) {
    const itemsSummary = (o.items || []).map((it) => `${it.product_name} ×${it.qty}${it.notes ? ' (' + it.notes + ')' : ''}`).join(' + ');
    const tot = Number(o.total) || 0;
    const disc = Number(o.discount) || 0;
    if (o.status !== 'cancelled') {
      sumTotal += tot;
      sumDiscount += disc;
    }

    rows.push([
      `#${o.invoice_no || o.id}`,
      new Date(o.created_at).toLocaleString('ar-EG'),
      o.cashier_name || '-',
      o.shift_name || '-',
      o.order_type === 'dine_in' ? 'صالة' : (o.order_type === 'notebook' ? 'نوتة' : 'تيك أواي'),
      o.table_name || '-',
      o.customer_name || '-',
      Number(o.subtotal || 0).toFixed(2),
      disc > 0 ? disc.toFixed(2) : '0.00',
      tot.toFixed(2),
      o.payment_method === 'cash' ? 'نقدي (خزنة)' : (o.payment_method === 'wallet' ? 'فودافون كاش (محفظة)' : (o.payment_method === 'split' ? 'مقسم (نقدي + محفظة)' : (o.payment_method === 'card' ? 'فيزا / بطاقة' : 'آجل / نوتة'))),
      Number(o.amount_paid || 0).toFixed(2),
      Number(o.change_due || 0).toFixed(2),
      o.status === 'cancelled' ? 'ملغي' : 'مكتمل',
      itemsSummary
    ]);
  }

  const totals = [
    'الإجمالي العام',
    `عدد الفواتير: ${orders.length}`,
    '', '', '', '', '',
    '',
    `خصومات: ${sumDiscount.toFixed(2)}`,
    `صافي: ${sumTotal.toFixed(2)} ج.م`,
    '', '', '', '', ''
  ];

  return generateStyledExcelHtml({
    title: 'سجل فواتير ومبيعات الكافيه',
    subtitle: `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} • إجمالي الفواتير: ${orders.length}`,
    headers,
    rows,
    totals
  });
}

function exportOrdersCsv(filters = {}) {
  const orders = listOrders({ limit: 1000, ...filters });
  const headers = ['رقم الفاتورة', 'التاريخ والوقت', 'الكاشير', 'الشيفت', 'النوع', 'الطاولة', 'العميل', 'المجموع', 'الخصم', 'الضريبة', 'الإجمالي', 'طريقة الدفع', 'المدفوع', 'الباقي', 'الحالة', 'الأصناف'];
  const rows = [headers.map(escapeCsv).join(',')];

  for (const o of orders) {
    const itemsSummary = (o.items || []).map((it) => `${it.product_name} (${it.qty})${it.notes ? ' [' + it.notes + ']' : ''}`).join(' + ');
    const row = [
      o.invoice_no,
      o.created_at,
      o.cashier_name,
      o.shift_name,
      o.order_type === 'dine_in' ? 'صالة' : (o.order_type === 'notebook' ? 'نوتة' : 'تيك أواي'),
      o.table_name || '-',
      o.customer_name || '-',
      o.subtotal,
      o.discount,
      o.tax,
      o.total,
      o.payment_method,
      o.amount_paid,
      o.change_due,
      o.status === 'cancelled' ? 'ملغي' : 'مكتمل',
      itemsSummary
    ];
    rows.push(row.map(escapeCsv).join(','));
  }

  return '\uFEFF' + rows.join('\r\n');
}

function exportPayrollExcel(monthStr = null) {
  const payroll = getMonthlyPayroll(monthStr);
  const headers = ['اسم الموظف', 'الصلاحية', 'الهاتف', 'الشيفت', 'الراتب الأساسي', 'أيام الحضور', 'أيام الغياب', 'خصم الغياب', 'الجزاءات', 'المكافآت', 'إجمالي الاستقطاعات', 'صافي الراتب المستحق'];
  const rows = [];

  for (const r of payroll.records) {
    rows.push([
      r.userName,
      r.userRole === 'admin' ? 'مدير عام' : 'كاشير',
      r.phone || '-',
      r.shiftName,
      `${r.baseSalary} ج.م`,
      `${r.shiftsAttended} وردية`,
      `${r.absenceDays} يوم`,
      r.absenceDeduction > 0 ? `-${r.absenceDeduction} ج.م` : '0',
      r.penaltiesTotal > 0 ? `-${r.penaltiesTotal} ج.م` : '0',
      r.bonusesTotal > 0 ? `+${r.bonusesTotal} ج.م` : '0',
      `-${r.totalDeductions} ج.م`,
      `${r.netSalary} ج.م`
    ]);
  }

  const totals = [
    'الإجمالي',
    `عدد الموظفين: ${payroll.records.length}`,
    '', '',
    `${payroll.totals.totalBaseSalaries} ج.م`,
    '', '',
    `-${payroll.totals.totalAbsenceDeductions} ج.م`,
    `-${payroll.totals.totalPenalties} ج.م`,
    `+${payroll.totals.totalBonuses} ج.م`,
    '',
    `الصافي: ${payroll.totals.totalNetSalaries} ج.م`
  ];

  return generateStyledExcelHtml({
    title: `كشف رواتب ومستحقات الموظفين شهر: ${payroll.month}`,
    subtitle: `نظام كافيه تقفيلة • صافي الرواتب المستحقة: ${payroll.totals.totalNetSalaries} ج.م`,
    headers,
    rows,
    totals
  });
}

function exportPayrollCsv(monthStr = null) {
  const payroll = getMonthlyPayroll(monthStr);
  const headers = ['اسم الموظف', 'الصلاحية', 'الهاتف', 'الشيفت', 'الراتب الأساسي', 'أيام الحضور', 'أيام الغياب', 'خصم الغياب', 'الجزاءات والخصومات', 'المكافآت', 'إجمالي الاستقطاعات', 'صافي الراتب المستحق'];
  const rows = [headers.map(escapeCsv).join(',')];

  for (const r of payroll.records) {
    const row = [
      r.userName,
      r.userRole === 'admin' ? 'مدير عام' : 'كاشير',
      r.phone || '-',
      r.shiftName,
      r.baseSalary,
      r.shiftsAttended,
      r.absenceDays,
      r.absenceDeduction,
      r.penaltiesTotal,
      r.bonusesTotal,
      r.totalDeductions,
      r.netSalary
    ];
    rows.push(row.map(escapeCsv).join(','));
  }

  return '\uFEFF' + rows.join('\r\n');
}

function exportDailySalesExcel(dateFilter = null) {
  const attendance = getUserAttendanceReports(dateFilter);
  const targetDate = dateFilter || new Date().toISOString().slice(0, 10);
  const headers = ['رقم الشيفت', 'الموظف / الكاشير', 'نوع الشيفت', 'تاريخ ووقت الفتح', 'تاريخ ووقت الإغلاق', 'العهدة الافتتاحية', 'المبيعات النقدية', 'مبيعات المحافظ والفيزا', 'إجمالي المبيعات', 'المصروفات', 'النقدية الفعلية', 'الفارق (عجز/زيادة)'];
  const rows = [];
  let totalSales = 0;
  let totalExpenses = 0;

  for (const s of attendance.shifts) {
    const sSales = Number(s.total_sales) || 0;
    const sExp = Number(s.expenses_amount) || 0;
    totalSales += sSales;
    totalExpenses += sExp;

    rows.push([
      `#${s.id}`,
      s.user_name || '-',
      s.shift_type || 'الشيفت الصباحي',
      new Date(s.opened_at).toLocaleString('ar-EG'),
      s.closed_at ? new Date(s.closed_at).toLocaleString('ar-EG') : 'مفتوح حالياً',
      `${s.opening_cash || 0} ج.م`,
      `${s.cash_sales_total || 0} ج.م`,
      `${(Number(s.card_sales_total) || 0) + (Number(s.wallet_sales_total) || 0)} ج.م`,
      `${sSales} ج.م`,
      sExp > 0 ? `-${sExp} ج.م` : '0 ج.م',
      s.actual_cash !== null ? `${s.actual_cash} ج.م` : '-',
      s.cash_difference ? `${s.cash_difference} ج.م` : '0 ج.م'
    ]);
  }

  const totals = [
    'الإجمالي العام',
    `عدد الورديات: ${attendance.shifts.length}`,
    '', '', '', '', '', '',
    `مبيعات: ${totalSales} ج.م`,
    `مصروفات: -${totalExpenses} ج.م`,
    '', ''
  ];

  return generateStyledExcelHtml({
    title: `تقرير مبيعات وورديات اليوم: ${targetDate}`,
    subtitle: `إجمالي مبيعات الفترة: ${totalSales} ج.م • إجمالي المصروفات: ${totalExpenses} ج.م`,
    headers,
    rows,
    totals
  });
}

function exportDailySalesCsv(dateFilter = null) {
  const attendance = getUserAttendanceReports(dateFilter);
  const headers = ['رقم الشيفت', 'الموظف / الكاشير', 'نوع الشيفت', 'تاريخ الفتح', 'تاريخ الإغلاق', 'العهدة الافتتاحية', 'المبيعات النقدية', 'مبيعات الفيزا', 'مبيعات المحافظ', 'إجمالي المبيعات', 'المصروفات', 'النقدية الفعلية', 'العجز / الزيادة'];
  const rows = [headers.map(escapeCsv).join(',')];

  for (const s of attendance.shifts) {
    const row = [
      s.id,
      s.user_name || '-',
      s.shift_type || 'الشيفت الصباحي',
      s.opened_at,
      s.closed_at || 'نشط حالياً',
      s.opening_cash,
      s.cash_sales_total,
      s.card_sales_total,
      s.wallet_sales_total,
      s.total_sales,
      s.expenses_amount,
      s.actual_cash !== null ? s.actual_cash : '-',
      s.cash_difference || 0
    ];
    rows.push(row.map(escapeCsv).join(','));
  }

  return '\uFEFF' + rows.join('\r\n');
}

// ---- Offline Hardware-Locked Licensing Mechanism (Delegated to ./db/licensing.js with Dual-Key Rotation) ----
function getMachineId() {
  return dbLicensing.getMachineId();
}

function parseLicenseKey(licenseKey) {
  return dbLicensing.parseLicenseKey(licenseKey);
}

function verifyLicenseKey(licenseKey) {
  return dbLicensing.verifyLicenseKey(licenseKey, {
    getCairoTodayString,
    getLatestSystemTimestamp
  });
}

function isTamperLockedInDb() {
  try {
    if (!db) return false;
    const row = queryGet('SELECT value FROM settings WHERE key = "tamper_locked"');
    return row && row.value === '1';
  } catch (_) {
    return false;
  }
}

function getLicenseStatus() {
  if (!isPackagedElectron && process.env.CAFE_TEST_AUTOMATION === '1' && !process.env.CAFE_TEST_LICENSE_REAL) {
    return {
      machineId: 'TEST-MACHINE-ID',
      isActivated: true,
      isExpired: false,
      isTamperLocked: false,
      isClockTampered: false,
      daysLeft: 365,
      expiresAt: '2099-12-31',
      licenseKey: 'TEST-AUTOMATION-LICENSE'
    };
  }
  const machineId = getMachineId();
  const lockedInDb = isTamperLockedInDb();
  const lockedInFs = security.isTamperLocked({ isTamperLockedInDb });

  const clockCheck = checkClockIntegrity();
  // ملاحظة: مشكلات الساعة لا تلغي تفعيل الترخيص ولا تطالب العميل بإعادة إدخال كود التفعيل
  // حارس الساعة مفعل ومطبق بشكل مستقل في تسجيل الدخول وفتح الوردية لمنع تسجيل العمليات بتوقيت متراجع
  const isClockTampered = !clockCheck.valid;

  const isDbTampered = Boolean(dbOfflineTamperInfo && dbOfflineTamperInfo.tampered);

  if (lockedInDb || lockedInFs) {
    return {
      machineId,
      isActivated: false,
      isExpired: false,
      isTamperLocked: true,
      isDbTampered,
      dbTamperInfo: dbOfflineTamperInfo,
      tamperInfo: security.getTamperInfo(),
      error: '⚠️ تم قفل البرنامج نهائياً بسبب رصد محاولة غير مصرح بها لتعديل الملفات أو فحص الشفرة بالذكاء الاصطناعي. يرجى التواصل مع الدعم الفني.',
      licenseKey: null
    };
  }

  const baseDir = getBaseDir();
  const licFile = path.join(baseDir, '.license');

  let key = null;
  if (fs.existsSync(licFile)) {
    try { key = fs.readFileSync(licFile, 'utf8').trim(); } catch (_) {}
  }
  if (!key) {
    key = queryGet('SELECT value FROM settings WHERE key = "license_key"')?.value;
  }

  const result = key ? verifyLicenseKey(key) : { valid: false, expired: false };
  const isActivated = result.valid && !result.expired;

  // Calculate days left using Cairo local calendar
  let daysLeft = null;
  if (result.valid && result.expiresAt) {
    const todayStr = typeof getCairoTodayString === 'function' ? getCairoTodayString() : new Date().toISOString().slice(0, 10);
    const today = new Date(todayStr + 'T00:00:00');
    const expiry = new Date(result.expiresAt + 'T00:00:00');
    daysLeft = Math.round((expiry - today) / (1000 * 60 * 60 * 24));
  }

  return {
    machineId,
    isActivated,
    isExpired: result.valid && result.expired,
    isTamperLocked: false,
    isDbTampered,
    dbTamperInfo: dbOfflineTamperInfo,
    isClockTampered,
    clockError: isClockTampered ? clockCheck.error : null,
    expiresAt: result.expiresAt || null,
    daysLeft,
    licenseKey: result.valid ? key : null
  };
}

function activateLicense(licenseKey) {
  const lockedInDb = isTamperLockedInDb();
  const lockedInFs = security.isTamperLocked({ isTamperLockedInDb });
  if (lockedInDb || lockedInFs) {
    return {
      success: false,
      error: 'النظام في وضع القفل الأمني التام بسبب رصد تلاعب سابق. لا يمكن التفعيل قبل التواصل مع الدعم الفني لفك القفل.'
    };
  }

  const result = verifyLicenseKey(licenseKey);

  if (!result.valid) {
    return { success: false, error: 'كود التفعيل غير صحيح أو لا يتطابق مع هذا الجهاز' };
  }
  if (result.expired) {
    return { success: false, error: `انتهت صلاحية كود التفعيل في ${result.expiresAt}. يرجى طلب كود تجديد من المورد.` };
  }

  const cleanKey = licenseKey.trim();
  const baseDir = getBaseDir();
  const licFile = path.join(baseDir, '.license');

  // Capture existing PIN lockout before switching derived HMAC key to license-bound key
  const existingPinState = getPinLockoutState();
  try { fs.writeFileSync(licFile, cleanKey, 'utf8'); } catch (_) {}

  runSql('INSERT OR REPLACE INTO settings (key, value) VALUES ("license_key", ?)', [cleanKey]);
  // Re-seal PIN lockout and DB integrity seal with the newly activated license-derived key
  try {
    savePinLockoutState(existingPinState);
    updateDbIntegritySeal();
    saveDbAtomic();
  } catch (_) {}

  const todayStr = typeof getCairoTodayString === 'function' ? getCairoTodayString() : new Date().toISOString().slice(0, 10);
  const daysLeft = result.expiresAt
    ? Math.round((new Date(result.expiresAt + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / (1000 * 60 * 60 * 24))
    : null;

  return {
    success: true,
    message: result.expiresAt
      ? `تم تفعيل البرنامج بنجاح! الترخيص صالح حتى ${result.expiresAt} (${daysLeft} يوم متبقي)`
      : 'تم تفعيل البرنامج بنجاح لهذا الجهاز (ترخيص دائم)',
    expiresAt: result.expiresAt || null,
    daysLeft
  };
}

function unlockTamper(unlockKey) {
  const machineId = getMachineId();
  const unlockRes = security.unlockTamperState(machineId, unlockKey);
  if (!unlockRes.success) {
    return unlockRes;
  }

  try {
    dbOfflineTamperInfo = null;
    if (db) {
      runSql('DELETE FROM settings WHERE key = "tamper_locked"');
      runSql('DELETE FROM settings WHERE key = "tamper_reason"');
      runSql('DELETE FROM settings WHERE key = "tamper_date"');
      updateDbIntegritySeal();
      saveDbAtomic();
    }
  } catch (_) {}

  return {
    success: true,
    message: 'تم فك القفل الأمني بنجاح! يمكنك الآن إدخال كود الترخيص الجديد وتفعيل البرنامج.'
  };
}

function getLastRecoveryInfo() {
  return recoveryInfo || { recovered: false, source: null, quarantinedPath: null };
}

// ---- Paired Mobile Devices & Menu Revision Hub ----
function listPairedDevices() {
  return queryAll('SELECT id, device_name, platform, paired_at, last_seen_at, status FROM paired_devices ORDER BY id DESC');
}

function revokePairedDevice(id) {
  const dev = queryGet('SELECT device_token_hash FROM paired_devices WHERE id = ?', [id]);
  runSql("UPDATE paired_devices SET status = 'revoked' WHERE id = ?", [id]);
  return { success: true, tokenHash: dev ? dev.device_token_hash : null };
}

function deletePairedDevice(id) {
  runSql('DELETE FROM paired_devices WHERE id = ?', [id]);
  return { success: true };
}

function getMenuRevision() {
  const row = queryGet("SELECT value FROM settings WHERE key = 'menu_rev'");
  return row ? (Number(row.value) || 1) : 1;
}

function incrementMenuRevision() {
  const current = getMenuRevision();
  const next = current + 1;
  runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('menu_rev', ?)", [String(next)]);
  return next;
}

module.exports = {
  listPairedDevices,
  revokePairedDevice,
  deletePairedDevice,
  getMenuRevision,
  incrementMenuRevision,
  init,
  shutdownWriterWorker,
  saveDbAtomic,
  saveDb,
  flushDb,
  getAtomicSaveCount,
  resetAtomicSaveCount,
  getLastExternalConflict,
  getLastRecoveryInfo,
  getRecoveryInfo: getLastRecoveryInfo,
  autoBackupPeriodic,
  archiveOldData,
  roundCurrency,
  withTransaction,
  listProducts,
  saveProduct,
  deleteProduct,
  listStockMovements,
  listAuditLog,
  listCategories,
  saveCategory,
  deleteCategory,
  listSections,
  saveSection,
  deleteSection,
  resetSectionTables,
  listTables,
  saveTable,
  deleteTable,
  updateTableStatus,
  getTableCarts,
  saveTableCart,
  saveAllTableCarts,
  appendItemsToTableCart,
  moveOrderToTable,
  transferTable,
  transferTableItem,
  checkClockIntegrity,
  resetTables,
  currentShift,
  computeShiftCash,
  openShift,
  closeShift,
  getPendingShiftBlockers,
  listShifts,
  addShiftAdjustment,
  listShiftAdjustments,
  getUserShiftIds,
  listUsers,
  listPublicUsers,
  getUser,
  saveUser,
  deleteUser,
  loginUser,
  hasAdminUser,
  setupInitialAdmin,
  changePassword,
  changeAdminPasswordWithOld,
  resetAdminPassword,
  emergencyResetPassword: resetAdminPassword,
  getUserAttendanceReports,
  getMonthlyPayroll,
  listEmployeeAdjustments,
  addEmployeeAdjustment,
  deleteEmployeeAdjustment,
  listCustomers,
  getCustomer,
  getCustomerDebts,
  listDebts,
  listDebtsGroupedByCustomer,
  payDebt,
  payCustomerDebtsFIFO,
  deleteDebt,
  verifyAdminPassword,
  saveVendorFeatures,
  verifyVendorPassword,
  addExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  createOrder,
  getOrder,
  listOrders,
  updateOrder,
  cancelOrder,
  restoreOrder,
  clearAllOrders,
  todaySales,
  getDashboardStats,
  getReportSales,
  getReportCancellations,
  logItemVoidAudit,
  getReportInventory,
  getReportShift,
  getDailySummaryReport,
  getReportDaily: getDailySummaryReport,
  toCairoDateString,
  getCairoTodayString,
  isEgyptDST,
  getPinLockoutState,
  savePinLockoutState,
  generateQrToken,
  toggleTableQr,
  regenerateTableQrToken,
  resetAllTableQrTokens,
  resetClockGuard,
  getSettings,
  saveSettings,
  isVendorFeatureEnabled,
  createBackup,
  restoreBackup,
  exportOrdersCsv,
  exportPayrollCsv,
  exportDailySalesCsv,
  reorderCategories,
  systemReset,
  exportOrdersExcel,
  exportPayrollExcel,
  exportDailySalesExcel,
  getMachineId,
  verifyLicenseKey,
  getLicenseStatus,
  activateLicense,
  unlockTamper,
  isTamperLockedInDb,
  runSql,
  queryGet,
  queryAll,
  flushDb,
  flushDbAsync,
  isDbDirty,
  saveDbAtomic,
  saveDbAtomicAsync,
  waitForPendingWorkerSaves,
  safeDbExport,
  saveDb: (imm = true) => saveDb(imm),
  runDatabaseMaintenance,
  cleanupOrphanedTempFiles,
  migratePasswordsToBcrypt,
  searchCustomers,
  saveCustomerDetails,
  discoverAndMigrateLegacyDatabase,
  getSchemaVersion,
  getAppVersion,
  exportMigrationPackage,
  importMigrationPackage,
  getDatabaseHealth,
  archiveAndCompact,
  registerMigration,
  runPendingMigrations,
  verifyAuditLogChain,
  getDbOfflineTamperInfo,
  MIGRATIONS
};
