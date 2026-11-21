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
// Respect host OS timezone by default for worldwide deployments (Gulf, Egypt, Europe, US, etc.)
if (process.env.CAFE_FORCE_TZ) {
  process.env.TZ = process.env.CAFE_FORCE_TZ;
}

const { app, BrowserWindow, ipcMain, Menu, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const isPackagedApp = Boolean(app && app.isPackaged);
const security = (!isPackagedApp && process.env.CAFE_TEST_AUTOMATION === '1')
  ? { verifyAppIntegrity: () => ({ valid: true }), protectBrowserWindow: () => { }, isTamperLocked: () => false, getTamperInfo: () => null, unlockTamperState: () => ({ success: true }), getLockFilePath: () => '' }
  : require('./security');
const updater = require('./updater');

// ==================== حماية من التوقف المفاجئ ====================
// أي خطأ غير متوقع يُسجَّل في ملف بدل ما يقفل البرنامج بالكامل فجأة
// المسار يُحسب داخل الدالة نفسها (وقت الاستخدام الفعلي) وليس عند تحميل الملف،
// حتى يعكس مسار النسخة المحمولة (Portable) الصحيح إذا كان قد تم ضبطه بالفعل.
function logCrash(type, err) {
  try {
    const crashLogPath = path.join(app.getPath('userData'), 'crash-log.txt');
    // حماية القرص: تدوير السجل تلقائياً إذا تجاوز 2 ميجابايت حتى لا يتضخم مع الوقت
    if (fs.existsSync(crashLogPath)) {
      const stats = fs.statSync(crashLogPath);
      if (stats.size > 2 * 1024 * 1024) {
        const oldLogPath = path.join(app.getPath('userData'), 'crash-log.old.txt');
        try { if (fs.existsSync(oldLogPath)) fs.unlinkSync(oldLogPath); } catch (_) { }
        fs.renameSync(crashLogPath, oldLogPath);
      }
    }
    const line = `\n[${new Date().toISOString()}] [${type}] ${err && err.stack ? err.stack : String(err)}\n`;
    fs.appendFileSync(crashLogPath, line, 'utf8');
  } catch (_) {
    // تجاهل أي خطأ أثناء تسجيل الخطأ نفسه، لا داعي لإسقاط البرنامج بسببه
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  logCrash('UNCAUGHT_EXCEPTION', err);
  // لا نستدعي app.quit() أو process.exit() هنا عمدًا — البرنامج يكمل عمله
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  logCrash('UNHANDLED_REJECTION', reason);
});
// ===================================================================

// ── Portable / Test userData detection ── must happen BEFORE anything else
const exeDir = path.dirname(process.execPath);
const localDataDir = path.join(exeDir, 'data');
const isPortableExe = Boolean(process.env.PORTABLE_EXECUTABLE_DIR) || fs.existsSync(localDataDir);
if (process.env.CAFE_USER_DATA) {
  if (!fs.existsSync(process.env.CAFE_USER_DATA)) fs.mkdirSync(process.env.CAFE_USER_DATA, { recursive: true });
  app.setPath('userData', process.env.CAFE_USER_DATA);
} else if (isPortableExe) {
  const portableDataDir = process.env.PORTABLE_EXECUTABLE_DIR
    ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
    : localDataDir;
  if (!fs.existsSync(portableDataDir)) fs.mkdirSync(portableDataDir, { recursive: true });
  app.setPath('userData', portableDataDir);
  // appData is preserved to point to %APPDATA% for cross-backup and auto-preservation
}

// Arabic keyboard input language setting
app.commandLine.appendSwitch('lang', 'ar');

// Explicitly unify application name so AppData path is identical in dev & production: %APPDATA%\TaqfeelaPOS
app.setName('TaqfeelaPOS');
if (process.env.CAFE_USER_DATA) {
  app.setPath('userData', process.env.CAFE_USER_DATA);
}

// Security Hardening: Test automation flags are STRICTLY disabled in packaged production builds
const isTestAutomation = !isPackagedApp && (
  process.env.CAFE_TEST_AUTOMATION === '1' ||
  process.env.CAFE_TEST_MODE === '1' ||
  process.argv.some(a => a.startsWith('--remote-debugging') || a.includes('inspect'))
);

// ── Automated Self-Test Flag (--selftest) ──
if (process.argv.includes('--selftest')) {
  app.whenReady().then(async () => {
    const selftest = require('./selftest');
    const diag = await selftest.runSelfTest(isTestAutomation ? null : dialog);
    app.exit(diag.success ? 0 : 1);
  });
  return;
}

// ── Windows Prerequisites Verification (Windows 7 SP1, UCRT, VC++, SHA-2) ──
const prereqs = require('./prereqs');
const prereqResult = prereqs.checkSystemPrerequisites();
if (!prereqResult.compatible && !isTestAutomation) {
  app.whenReady().then(() => {
    prereqs.showPrerequisitesDialog(dialog, prereqResult.missing);
    app.exit(1);
  });
  return;
}

// Ensure single instance only (skip lock in isolated test automation so parallel/local instances don't block tests)
const gotTheLock = isTestAutomation ? true : app.requestSingleInstanceLock();
if (!gotTheLock) {
  try {
    dialog.showErrorBox(
      'البرنامج يعمل بالفعل',
      'يوجد نسخة أخرى من برنامج تقفيلة (TaqfeelaPOS) تعمل بالفعل في الخلفية.\nيرجى التحقق من شريط المهام أو إنهاء العملية من مدير المهام (Task Manager).'
    );
  } catch (_) { }
  app.quit();
  process.exit(0);
}

// ── Check for updates / Clean stale caches (Preserving DB & License) ──
if (!isTestAutomation) {
  try {
    updater.checkForUpdate(app.getPath('userData'));
  } catch (updaterErr) {
    console.warn('[Updater] Startup check failed (non-fatal):', updaterErr);
  }

  // ── Check if newer portable exe exists in the same folder ──
  try {
    const newerExe = updater.checkForNewerExe();
    if (newerExe) {
      const choice = dialog.showMessageBoxSync({
        type: 'question',
        title: 'تنبيه — توجد نسخة أحدث من البرنامج',
        message: `تم العثور على نسخة أحدث من البرنامج في نفس المجلد:\n(${newerExe.name})`,
        detail: 'هل تريد إغلاق هذه النسخة وتشغيل النسخة الأحدث الآن تلقائياً؟',
        buttons: ['تشغيل النسخة الأحدث (موصى به)', 'الاستمرار بهذه النسخة'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice === 0) {
        const { spawn } = require('child_process');
        spawn(newerExe.path, [], { detached: true, stdio: 'ignore' }).unref();
        app.quit();
        process.exit(0);
      }
    }
  } catch (newerErr) {
    console.warn('[Updater] Newer exe prompt error:', newerErr);
  }
}

// ── Pre-Security: neutralize only harmless Chromium logging flag (--enable-logging).
// In packaged production builds, NEVER strip real debugging/inspect flags (--remote-debugging-port, --inspect, --inspect-brk)
// so Anti-Tamper properly detects unauthorized debugger attachment.
(function _sanitizeBeforeSecurity() {
  const harmlessFlags = isPackagedApp
    ? ['--enable-logging']
    : ['--enable-logging', '--remote-debugging-port', '--inspect', '--inspect-brk'];
  process.argv = process.argv.filter(arg => !harmlessFlags.some(f => arg.startsWith(f)));
  if (!isPackagedApp) {
    try {
      const lockPath = path.join(app.getPath('userData'), '.tamper_lock');
      if (fs.existsSync(lockPath)) {
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (lockData.reason === 'UNAUTHORIZED_DEBUG_FLAG') {
          fs.unlinkSync(lockPath);
          const auditPath = path.join(app.getPath('userData'), 'security-audit.log');
          if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath);
        }
      }
    } catch (_) { }
  }
})();

// Anti-Tamper, Environment, and Critical File Integrity Check
if (!isTestAutomation) {
  security.verifyAppIntegrity();

  // Mutual Cryptographic Integrity Verification (Packaged Production Only):
  // Verifies BOTH Ed25519 signature of security_manifest.json AND SHA-256 of all critical backend modules.
  if (isPackagedApp) {
    try {
      const { verifySignedManifest } = require('./db/integrity');
      const check = verifySignedManifest({
        baseDir: __dirname,
        requireSignature: true
      });
      if (!check.valid) {
        throw new Error(check.reason || 'INTEGRITY_VERIFICATION_FAILED');
      }
    } catch (integrityErr) {
      logCrash('MUTUAL_INTEGRITY_FAIL', integrityErr);
      try {
        dialog.showErrorBox(
          'تحذير أمني — تلف أو تعديل في ملفات النظام',
          'تم رصد تعديل غير مصرح به في أحد ملفات النظام الأساسية أو التوقيع الرقمي.\nسيتم إغلاق البرنامج فوراً لحماية البيانات.'
        );
      } catch (_) {}
      app.exit(1);
      return;
    }
  }
}

let mainWindow;
let splashWindow = null;
let currentSession = null;
let hasOpenShift = false;
let isForceQuit = false;
const SPLASH_DURATION_MS = isTestAutomation ? 0 : 5000;

function getAppIcon() {
  const possiblePaths = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(process.resourcesPath || '', 'build/icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(__dirname, 'icon.ico')
  ];
  return possiblePaths.find((p) => p && fs.existsSync(p));
}

function createSplashWindow() {
  const iconPath = getAppIcon();
  splashWindow = new BrowserWindow({
    width: 580,
    height: 600,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: false,
    show: false,
    icon: iconPath,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  splashWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
    splashWindow.focus();
    splashWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  const iconPath = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: `تقفيلة v${app.getVersion()} - نظام إدارة ونقطة بيع الكافيه`,
    icon: iconPath,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,           // Prevents Arabic input freezing
      disableBlinkFeatures: 'Auxclick',
      devTools: !app.isPackaged,
    },
  });

  security.protectBrowserWindow(mainWindow);

  const editMenu = Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]);
  Menu.setApplicationMenu(editMenu);
  mainWindow.setMenuBarVisibility(false);

  // Block DevTools in production safely
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (app.isPackaged && input && typeof input.key === 'string') {
      const k = input.key.toLowerCase();
      const isDevTools =
        ((input.control || input.meta) && input.shift && (k === 'i' || k === 'j')) ||
        k === 'f12';
      if (isDevTools) event.preventDefault();
    }
  });

  mainWindow.webContents.on('devtools-opened', () => {
    if (app.isPackaged) mainWindow.webContents.closeDevTools();
  });

  // Forward renderer errors to crash-log.txt
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 3 || (message && (message.includes('Error') || message.includes('Exception')))) {
      logCrash('RENDERER_ERROR', `${message} [${sourceId}:${line}]`);
    }
  });

  // Load the app
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(0.90);
    // D1: إفراغ طابور البون المؤجل بعد تحميل الواجهة
    setTimeout(() => { try { if (qrServer) qrServer.flushPendingQrOrders(); } catch (_) { } }, 3000);
  });

  // Block unauthorized navigation
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    let isAllowed = false;
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.protocol === 'file:') {
        isAllowed = true;
      } else if (devServerUrl && !app.isPackaged) {
        const devParsed = new URL(devServerUrl);
        if (parsed.origin === devParsed.origin) {
          isAllowed = true;
        }
      }
    } catch (_) { }

    if (!isAllowed) {
      console.warn('Blocked unauthorized navigation attempt to:', navigationUrl);
      event.preventDefault();
    }
  });

  // Open external links safely (only http/https) in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      } else {
        console.warn('Blocked opening non-http(s) external URL:', url);
      }
    } catch (e) {
      console.error('Failed to parse or open external url:', url, e);
    }
    return { action: 'deny' };
  });

  // Prevent closing while shift is open unless force quit
  mainWindow.on('close', (e) => {
    if (isForceQuit || isTestAutomation) return;
    if (db.currentShift() || hasOpenShift) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: 'تنبيه — شيفت مفتوح',
        message: 'يوجد شيفت مفتوح حالياً في البرنامج!',
        detail: 'لحماية الحسابات والكاش، يُفضل إنهاء الشيفت أولاً. هل تريد البقاء لإغلاقه، أم الإغلاق الاضطراري؟',
        buttons: ['البقاء لإغلاق الشيفت (موصى به)', 'إغلاق اضطراري للبرنامج'],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice === 1) {
        isForceQuit = true;
        app.quit();
      }
    }
  });
}

app.whenReady().then(async () => {
  // Clear any Chromium cache on startup so fresh code is always loaded
  try {
    if (session && session.defaultSession) {
      await session.defaultSession.clearCache();
      try {
        await session.defaultSession.clearStorageData({
          storages: ['cachestorage', 'serviceworkers', 'shadercache']
        });
      } catch (_) { }

      // Security: Deny all device / sensitive permissions (geolocation, camera, microphone, etc.)
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        return callback(false);
      });

      // Security: Enforce Content-Security-Policy on renderer content
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const csp = app.isPackaged
          ? "default-src 'self' 'unsafe-inline' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*;"
          : "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:* http://127.0.0.1:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* http://127.0.0.1:*; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*;";
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [csp],
          },
        });
      });
    }
  } catch (e) {
    console.error('Failed to configure session security:', e);
  }

  const splashStartTime = Date.now();
  // Show splash immediately (skip in test automation so Playwright firstWindow() resolves to mainWindow)
  if (!isTestAutomation) {
    createSplashWindow();
  }

  try {
    const recoveryInfo = await db.init();
    if (!isTestAutomation && recoveryInfo && recoveryInfo.quarantinedPath) {
      if (recoveryInfo.recovered) {
        const recoveredDate = recoveryInfo.sourceTime ? new Date(recoveryInfo.sourceTime).toLocaleString('ar-EG') : 'غير معروف';
        dialog.showMessageBoxSync({
          type: 'warning',
          title: 'تم استرجاع قاعدة البيانات تلقائيًا',
          message: 'حصل انقطاع مفاجئ أدى لتلف ملف البيانات الرئيسي، وتم استرجاع آخر نسخة احتياطية سليمة تلقائيًا.',
          detail: `النسخة المسترجعة بتاريخ: ${recoveredDate}\n\nملاحظة: أي بيانات اتسجلت بعد هذا التاريخ ممكن تكون ضاعت ولازم تتراجع يدويًا لو لزم الأمر (الفواتير المطبوعة متاحة كمرجع). الملف التالف الأصلي تم حفظه كنسخة احتياطية في:\n${recoveryInfo.quarantinedPath}`,
          buttons: ['تم، فهمت'],
        });
      } else {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'تعذر استرجاع أي نسخة احتياطية',
          message: 'حصل تلف في ملف البيانات ولا توجد أي نسخة احتياطية صالحة، فتم فتح قاعدة بيانات جديدة فارغة.',
          detail: `الملف التالف الأصلي تم حفظه هنا للمراجعة ولم يُحذف:\n${recoveryInfo.quarantinedPath}\n\nمهم: تواصل فورًا مع الدعم الفني قبل إدخال أي بيانات جديدة.`,
          buttons: ['تم، فهمت'],
        });
      }
    }
  } catch (err) {
    console.error('Database init error:', err);
    if (!isTestAutomation) {
      dialog.showErrorBox('خطأ في قاعدة البيانات', err.message || 'تعذر فتح قاعدة البيانات بأمان.');
    }
    app.quit();
    return;
  }

  setInterval(() => {
    try { db.autoBackupPeriodic(); } catch (_) { }
  }, 10 * 60 * 1000);

  // ملاحظة تجارية هامة: تم إيقاف الحذف التلقائي للفواتير الأقدم من 30 يوماً عند بدء التشغيل
  // للحفاظ على سجل مبيعات وتقارير العميل السنوية والشهرية كاملة دون فقدان أي فواتير تاريخية.

  // Create main window immediately in background
  createWindow();

  let isMainRevealed = false;
  function revealMainWindow() {
    if (isMainRevealed) return;
    isMainRevealed = true;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  }

  // When main window is ready to show, reveal it after splash minimum time
  mainWindow.once('ready-to-show', () => {
    const elapsed = Date.now() - splashStartTime;
    const remaining = Math.max(0, SPLASH_DURATION_MS - elapsed);
    setTimeout(() => {
      revealMainWindow();
    }, remaining);
  });

  // Fallback safety: reveal main window at 6 seconds even if ready-to-show was delayed
  setTimeout(() => {
    revealMainWindow();
  }, SPLASH_DURATION_MS + 1000);

  // Safe isolated startup for QR Ordering Server
  // D2: qrServer خارج try لإتاحة flushPendingQrOrders في did-finish-load
  let qrServer = null;
  try {
    qrServer = require('./server');
    qrServer.startServer({ db, get mainWindow() { return mainWindow; }, getMainWindow: () => mainWindow, port: 3000 });

    try {
      const mdns = require('./mdns');
      const settings = db.getSettings ? db.getSettings() : {};
      mdns.startDiscoveryBeacon({ port: 3000, cafeName: settings.cafe_name || 'تقفيلة كافيه', version: '1.0.2' });
    } catch (_) { }
  } catch (qrErr) {
    console.warn('[QR Server] Startup error caught safely:', qrErr.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
});

let isQuittingConfirmed = false;
app.on('before-quit', (event) => {
  if (isQuittingConfirmed) return;
  event.preventDefault();
  isForceQuit = true;
  try {
    const qrServer = require('./server');
    qrServer.stopServer();
  } catch (e) { }

  (async () => {
    try {
      if (typeof db.waitForPendingWorkerSaves === 'function') {
        await db.waitForPendingWorkerSaves();
      }
      if (typeof db.flushDbAsync === 'function') {
        await db.flushDbAsync();
      } else if (typeof db.flushDb === 'function') {
        db.flushDb();
      } else {
        db.saveDbAtomic();
      }
    } catch (e) {
      console.error('Error flushing database on before-quit:', e);
      try { db.saveDbAtomic(); } catch (_) { }
    } finally {
      isQuittingConfirmed = true;
      app.quit();
    }
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('shift:notify', (_event, isOpen) => {
  hasOpenShift = !!isOpen;
});

// Map of sessions per WebContents ID: webContents.id -> session
const windowSessions = new Map();

function validateIpcSender(event) {
  if (!event || !event.senderFrame) return true;
  const url = event.senderFrame.url || '';
  if (url) {
    const isFile = url.startsWith('file://');
    const isLocalDev = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:');
    if (!isFile && !isLocalDev) {
      console.warn(`[SECURITY IPC] Blocked request from untrusted frame/origin: ${url}`);
      return false;
    }
  }
  return true;
}

function getSessionForEvent(event) {
  if (event && event.sender && windowSessions.has(event.sender.id)) {
    return windowSessions.get(event.sender.id);
  }
  return currentSession;
}

function setSessionForEvent(event, session) {
  currentSession = session;
  if (event && event.sender) {
    if (session) {
      windowSessions.set(event.sender.id, session);
    } else {
      windowSessions.delete(event.sender.id);
    }
  }
}

// ---- Auth Middleware ----
function requireAuth(handler) {
  return async (event, ...args) => {
    if (!validateIpcSender(event)) {
      return { success: false, error: 'غير مصرح: مصدر الاستدعاء غير موثوق' };
    }
    const session = getSessionForEvent(event);
    if (!session || !session.id) {
      return { success: false, error: 'غير مصرح: يجب تسجيل الدخول أولاً' };
    }
    return handler(event, ...args);
  };
}

function requireAdmin(handler) {
  return async (event, ...args) => {
    if (!validateIpcSender(event)) {
      return { success: false, error: 'غير مصرح: مصدر الاستدعاء غير موثوق' };
    }
    const session = getSessionForEvent(event);
    if (!session || !session.id) {
      return { success: false, error: 'غير مصرح: يجب تسجيل الدخول كمدير أولاً' };
    }
    if (session.role !== 'admin') {
      return { success: false, error: 'غير مصرح: هذه العملية تتطلب صلاحيات المدير العام (Admin)' };
    }
    return handler(event, ...args);
  };
}

// ---- IPC Handlers ----

ipcMain.handle('auth:session', (event) => getSessionForEvent(event));

ipcMain.handle('users:login', async (_event, username, password) => {
  if (!validateIpcSender(_event)) {
    return { error: 'غير مصرح: مصدر الاستدعاء غير موثوق' };
  }
  const clockCheck = db.checkClockIntegrity();
  if (!clockCheck.valid) {
    return { error: clockCheck.error, clockTampered: true };
  }
  const user = db.loginUser(username, password);
  if (user && user.error) {
    return user;
  }
  if (user) {
    const sessionData = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      shift_name: user.shift_name,
      shift_start: user.shift_start,
      shift_end: user.shift_end,
      must_change_password: user.must_change_password || 0
    };
    setSessionForEvent(_event, sessionData);
    return user;
  }
  return null;
});

ipcMain.handle('users:logout', (event) => {
  setSessionForEvent(event, null);
  return { success: true };
});

// Rate limiting for admin password verification across all channels
// Max 5 attempts per 60 seconds per process session
const _adminPasswordAttempts = { count: 0, windowStart: Date.now() };
const ADMIN_PW_MAX_ATTEMPTS = 5;
const ADMIN_PW_WINDOW_MS = 60 * 1000;

function verifyAdminWithRateLimit(password) {
  const now = Date.now();
  if (now - _adminPasswordAttempts.windowStart > ADMIN_PW_WINDOW_MS) {
    _adminPasswordAttempts.count = 0;
    _adminPasswordAttempts.windowStart = now;
  }
  if (_adminPasswordAttempts.count >= ADMIN_PW_MAX_ATTEMPTS) {
    const waitSec = Math.ceil((ADMIN_PW_WINDOW_MS - (now - _adminPasswordAttempts.windowStart)) / 1000);
    return { success: false, error: `تم تجاوز الحد المسموح به من المحاولات. أعد المحاولة بعد ${waitSec} ثانية.` };
  }
  const result = db.verifyAdminPassword(password);
  if (!result || !result.success) {
    _adminPasswordAttempts.count++;
  } else {
    _adminPasswordAttempts.count = 0;
    _adminPasswordAttempts.windowStart = Date.now();
  }
  return result;
}

// Persistent rate limiting for PIN and admin password verification (Survives restarts & file deletion)
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 60 * 1000;

function getPinLockoutState() {
  try {
    if (typeof db.getPinLockoutState === 'function') {
      return db.getPinLockoutState();
    }
  } catch (_) { }
  return { count: 0, windowStart: 0, lockedUntil: 0 };
}

function savePinLockoutState(state) {
  try {
    if (typeof db.savePinLockoutState === 'function') {
      db.savePinLockoutState(state);
    }
  } catch (_) { }
}

function checkPinRateLimit() {
  const now = Date.now();
  const state = getPinLockoutState();

  // If currently locked out
  if (state.lockedUntil && now < state.lockedUntil) {
    const waitSec = Math.ceil((state.lockedUntil - now) / 1000);
    return { allowed: false, error: `تم تجاوز الحد المسموح به من المحاولات. أعد المحاولة بعد ${waitSec} ثانية.` };
  }

  // If window expired
  if (now - state.windowStart > PIN_LOCKOUT_MS) {
    state.count = 0;
    state.windowStart = now;
    state.lockedUntil = 0;
    savePinLockoutState(state);
  }

  if (state.count >= PIN_MAX_ATTEMPTS) {
    state.lockedUntil = now + PIN_LOCKOUT_MS;
    savePinLockoutState(state);
    const waitSec = Math.ceil(PIN_LOCKOUT_MS / 1000);
    return { allowed: false, error: `تم تجاوز الحد المسموح به من المحاولات. أعد المحاولة بعد ${waitSec} ثانية.` };
  }

  return { allowed: true };
}

function recordPinFailure() {
  const now = Date.now();
  const state = getPinLockoutState();
  if (now - state.windowStart > PIN_LOCKOUT_MS) {
    state.count = 0;
    state.windowStart = now;
  }
  state.count++;
  if (state.count >= PIN_MAX_ATTEMPTS) {
    state.lockedUntil = now + PIN_LOCKOUT_MS;
  }
  savePinLockoutState(state);
}

function recordPinSuccess() {
  savePinLockoutState({ count: 0, windowStart: 0, lockedUntil: 0 });
}

ipcMain.handle('auth:hasAdmin', () => {
  return db.hasAdminUser();
});

ipcMain.handle('auth:setupInitialAdmin', (_event, password, name, cafeInfo = null) => {
  if (!validateIpcSender(_event)) {
    return { success: false, error: 'غير مصرح: مصدر الاستدعاء غير موثوق' };
  }
  if (db.hasAdminUser()) {
    return { success: false, error: 'يوجد حساب مدير مسجل بالفعل في النظام' };
  }
  const res = db.setupInitialAdmin(password, name || 'مدير النظام');
  if (res && res.success && cafeInfo && typeof cafeInfo === 'object') {
    const newSettings = {};
    if (cafeInfo.cafe_name && String(cafeInfo.cafe_name).trim()) {
      newSettings.cafe_name = String(cafeInfo.cafe_name).trim();
    }
    if (cafeInfo.cafe_phone !== undefined) {
      newSettings.cafe_phone = String(cafeInfo.cafe_phone).trim();
    }
    if (cafeInfo.cafe_address !== undefined) {
      newSettings.cafe_address = String(cafeInfo.cafe_address).trim();
    }
    if (Object.keys(newSettings).length > 0) {
      try { db.saveSettings(newSettings); } catch (_) { }
    }
  }
  return res;
});

ipcMain.handle('auth:verifyAdminPassword', (_event, payload) => {
  const isObj = payload && typeof payload === 'object';
  const password = isObj ? payload.password : payload;
  const res = verifyAdminWithRateLimit(password);
  if (res && res.success && isObj && payload.voidAudit && typeof db.logItemVoidAudit === 'function') {
    const session = getSessionForEvent(_event) || currentSession;
    db.logItemVoidAudit({
      ...payload.voidAudit,
      actorId: session?.id || null,
      actorName: payload.voidAudit.actorName || session?.name || session?.username || 'كاشير'
    });
  }
  return res;
});

ipcMain.handle('auth:changeAdminPassword', async (_event, oldPassword, newPassword) => {
  if (!validateIpcSender(_event)) {
    return { success: false, error: 'غير مصرح: مصدر الاستدعاء غير موثوق' };
  }
  return db.changeAdminPasswordWithOld(oldPassword, newPassword);
});

ipcMain.handle('auth:adminOverlayLogin', async (_event, password) => {
  const auth = verifyAdminWithRateLimit(password);
  if (!auth || !auth.success) {
    return { success: false, error: auth?.error || 'كلمة مرور المدير غير صحيحة' };
  }
  const adminUser = auth.admin || {
    id: 1,
    username: 'admin',
    name: 'المدير العام',
    role: 'admin'
  };
  const prevSession = getSessionForEvent(_event) || currentSession;
  currentSession = {
    id: adminUser.id,
    username: adminUser.username,
    name: adminUser.name,
    role: 'admin',
    shift_name: adminUser.shift_name,
    shift_start: adminUser.shift_start,
    shift_end: adminUser.shift_end,
    isOverlay: true,
    overlayPrevSession: prevSession
  };
  if (_event && _event.sender && _event.sender.id) {
    windowSessions.set(_event.sender.id, currentSession);
  }
  return { success: true, user: currentSession };
});

ipcMain.handle('auth:adminOverlayReturn', async (_event) => {
  const activeSession = getSessionForEvent(_event) || currentSession;
  if (activeSession && activeSession.isOverlay && activeSession.overlayPrevSession) {
    currentSession = activeSession.overlayPrevSession;
    if (_event && _event.sender && _event.sender.id) {
      windowSessions.set(_event.sender.id, currentSession);
    }
  }
  return { success: true, user: currentSession };
});

// Emergency reset — protected by vendor master PIN and logged in audit_log
ipcMain.handle('users:resetAdminPassword', async (_event, masterPin, newPassword) => {
  if (!validateIpcSender(_event)) {
    return { success: false, error: 'غير مصرح: مصدر الاستدعاء غير موثوق' };
  }
  const rate = checkPinRateLimit();
  if (!rate.allowed) {
    return { success: false, error: rate.error, locked: true };
  }
  const session = getSessionForEvent(_event);
  const result = db.resetAdminPassword(masterPin, newPassword, session);
  if (!result || !result.success) {
    recordPinFailure();
  } else {
    recordPinSuccess();
  }
  return result;
});

ipcMain.handle('users:changePassword', requireAuth(async (_event, { userId, currentPassword, newPassword }) => {
  const targetId = userId || currentSession.id;
  if (currentSession.role !== 'admin' && currentSession.id !== targetId)
    return { success: false, error: 'غير مصرح لك بتغيير كلمة مرور مستخدم آخر' };
  const res = db.changePassword({ userId: targetId, currentPassword, newPassword });
  if (res.success && currentSession.id === targetId) currentSession.must_change_password = 0;
  return res;
}));

ipcMain.handle('products:list', () => db.listProducts());
ipcMain.handle('products:save', requireAdmin((_e, prod) => db.saveProduct(prod)));
ipcMain.handle('products:delete', requireAdmin((_e, id) => db.deleteProduct(id, currentSession)));
ipcMain.handle('categories:list', () => db.listCategories());
ipcMain.handle('categories:save', requireAdmin((_e, cat) => db.saveCategory(cat)));
ipcMain.handle('categories:delete', requireAdmin((_e, id) => db.deleteCategory(id)));
ipcMain.handle('categories:reorder', requireAdmin((_e, orderedIds) => db.reorderCategories(orderedIds)));
ipcMain.handle('stock:movements', requireAuth((_e, productId, limit) => db.listStockMovements(productId, limit)));
ipcMain.handle('audit:list', requireAdmin((_e, limit) => db.listAuditLog(limit)));

ipcMain.handle('tables:list', () => db.listTables());
ipcMain.handle('tables:save', requireAdmin((_e, tbl) => db.saveTable(tbl)));
ipcMain.handle('tables:delete', requireAdmin((_e, id) => db.deleteTable(id)));
ipcMain.handle('tables:updateStatus', requireAuth((_e, id, status, orderId) => {
  const res = db.updateTableStatus(id, status, orderId);
  if (status === 'available') {
    try {
      const qrServer = require('./server');
      qrServer.clearTableCart(id);
    } catch (_) { }
    try {
      const mobileApi = require('./mobileApi');
      mobileApi.broadcastSseEvent('tables', { tableId: id, state: 'free' });
    } catch (_) { }
  }
  return res;
}));
ipcMain.handle('tables:reset', requireAdmin((_e, counts) => db.resetTables(counts)));
ipcMain.handle('tables:toggleQr', requireAdmin((_e, id, enabled) => db.toggleTableQr(id, enabled)));
ipcMain.handle('tables:regenerateToken', requireAdmin((_e, id) => db.regenerateTableQrToken(id)));
ipcMain.handle('tables:resetTokens', requireAdmin(() => db.resetAllTableQrTokens()));

// Sections (dynamic halls)
ipcMain.handle('sections:list', () => db.listSections());
ipcMain.handle('sections:save', requireAdmin((_e, sec) => db.saveSection(sec)));
ipcMain.handle('sections:delete', requireAdmin((_e, id) => db.deleteSection(id)));
ipcMain.handle('sections:resetTables', requireAdmin((_e, payload) => db.resetSectionTables(payload)));

ipcMain.handle('tables:moveOrder', requireAuth((_e, payload) => {
  const res = db.moveOrderToTable(payload);
  if (res && res.success !== false) {
    try {
      const qrServer = require('./server');
      if (payload?.fromTableId) qrServer.clearTableCart(payload.fromTableId);
    } catch (_) { }
    try {
      const mobileApi = require('./mobileApi');
      mobileApi.broadcastSseEvent('tables', { fromTableId: payload?.fromTableId, toTableId: payload?.toTableId });
    } catch (_) { }
  }
  return res;
}));
ipcMain.handle('tables:getCarts', () => db.getTableCarts());
ipcMain.handle('tables:saveCart', requireAuth((_e, tableId, cartData) => {
  const res = db.saveTableCart(tableId, cartData);
  if (res && res.success !== false) {
    if (!cartData || !cartData.cart || cartData.cart.length === 0) {
      try {
        const qrServer = require('./server');
        qrServer.clearTableCart(tableId);
      } catch (_) { }
    }
    try {
      const mobileApi = require('./mobileApi');
      mobileApi.broadcastSseEvent('tables', { tableId });
    } catch (_) { }
  }
  return res;
}));
ipcMain.handle('tables:saveAllCarts', requireAuth((_e, cartsMap) => db.saveAllTableCarts(cartsMap)));
ipcMain.handle('tables:appendItems', requireAuth((_e, tableId, items, opts) => db.appendItemsToTableCart(tableId, items, opts || {})));
ipcMain.handle('tables:transfer', requireAuth((_e, payload) => {
  const res = db.transferTable(payload);
  if (res && res.success) {
    try {
      const qrServer = require('./server');
      if (payload?.fromTableId) qrServer.clearTableCart(payload.fromTableId);
    } catch (_) { }
    try {
      const mobileApi = require('./mobileApi');
      mobileApi.broadcastSseEvent('tables', { fromTableId: payload?.fromTableId, toTableId: payload?.toTableId });
    } catch (_) { }
  }
  return res;
}));
ipcMain.handle('tables:transferItem', requireAuth((_e, payload) => {
  const res = db.transferTableItem(payload);
  if (res && res.success) {
    if (!res.sourceCart || res.sourceCart.length === 0) {
      try {
        const qrServer = require('./server');
        if (payload?.fromTableId) qrServer.clearTableCart(payload.fromTableId);
      } catch (_) { }
    }
    try {
      const mobileApi = require('./mobileApi');
      mobileApi.broadcastSseEvent('tables', { fromTableId: payload?.fromTableId, toTableId: payload?.toTableId });
    } catch (_) { }
  }
  return res;
}));
ipcMain.handle('system:checkClock', () => db.checkClockIntegrity());
ipcMain.handle('system:resetClockGuard', requireAdmin((_e, adminPassword) =>
  db.resetClockGuard({ adminPassword, actor: currentSession })
));

ipcMain.handle('orders:create', requireAuth((_e, payload) => {
  const activeShift = db.currentShift();
  if (!activeShift) return { success: false, error: 'لا يوجد شيفت مفتوح حالياً' };
  if (payload?.shiftId && Number(payload.shiftId) !== Number(activeShift.id)) {
    return { success: false, error: 'الشيفت المرسل غير مطابق للشيفت الحالي' };
  }
  // Backend discount lock: only admin can apply discounts
  if (Number(payload?.discount) > 0 && currentSession.role !== 'admin') {
    return { success: false, error: 'الخصم متاح فقط لصلاحية المدير' };
  }
  const orderRes = db.createOrder({ ...payload, shiftId: activeShift.id, user: currentSession });
  // Only clear QR/mobile table state when the created order actually closed a dine_in table (orderRes.tableId)
  if (orderRes && orderRes.success !== false && orderRes.tableId) {
    try {
      const qrServer = require('./server');
      qrServer.clearTableCart(orderRes.tableId);
    } catch (_) { }
    // Notify mobile apps that this table is now free
    try {
      const mobileApi = require('./mobileApi');
      mobileApi.broadcastSseEvent('tables', { tableId: orderRes.tableId, state: 'free' });
    } catch (_) { }
  }
  return orderRes;
}));
ipcMain.handle('orders:get', requireAuth((_e, id) => {
  const order = db.getOrder(id);
  if (!order) return null;
  if (currentSession.role === 'cashier') {
    const curShift = db.currentShift();
    if (curShift && order.shift_id && Number(order.shift_id) !== Number(curShift.id)) {
      return null;
    }
  }
  return order;
}));
ipcMain.handle('orders:list', requireAuth((_e, filters) => {
  if (currentSession.role === 'cashier') {
    const curShift = db.currentShift();
    filters = {
      ...filters,
      shiftId: curShift?.id || -1,
      userId: currentSession.id
    };
  }
  return db.listOrders(filters);
}));
ipcMain.handle('orders:update', requireAdmin((_e, id, updateData) =>
  db.updateOrder(id, updateData, currentSession)
));
ipcMain.handle('orders:cancel', requireAuth((_e, id, reason, actor, refundMethod, adminPassword) => {
  const order = db.getOrder(id);
  if (!order) return { success: false, error: 'الطلب غير موجود' };
  let adminPasswordVerified = false;
  if (order.payment_method && currentSession.role !== 'admin') {
    if (!adminPassword) {
      return { success: false, error: 'إلغاء فاتورة مدفوعة يتطلب موافقة وكلمة مرور المدير', requiresAdminPassword: true };
    }
    const auth = verifyAdminWithRateLimit(adminPassword);
    if (!auth || !auth.success) {
      return { success: false, error: auth?.error || 'كلمة مرور المدير غير صحيحة' };
    }
    adminPasswordVerified = true;
  }
  const cancelRes = db.cancelOrder(id, reason, currentSession, refundMethod, adminPasswordVerified);
  if (cancelRes && cancelRes.success !== false && order?.table_id) {
    try {
      const liveCarts = db.getTableCarts ? db.getTableCarts() : {};
      if (!liveCarts[order.table_id] && !liveCarts[String(order.table_id)]) {
        const mobileApi = require('./mobileApi');
        mobileApi.broadcastSseEvent('tables', { tableId: order.table_id, state: 'free' });
      }
    } catch (_) { }
  }
  return cancelRes;
}));
ipcMain.handle('orders:restore', requireAuth((_e, id, adminPassword) => {
  if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
    return { success: false, error: 'استعادة الفاتورة الملغية تتطلب كلمة مرور المدير' };
  }
  const auth = verifyAdminWithRateLimit(adminPassword);
  if (!auth || !auth.success) {
    return { success: false, error: auth?.error || 'كلمة مرور المدير غير صحيحة' };
  }
  const session = getSessionForEvent(_e) || currentSession;
  const actor = (session && session.role === 'admin')
    ? session
    : (auth.admin || { id: 1, username: 'admin', name: 'المدير العام', role: 'admin' });
  return db.restoreOrder(id, actor);
}));
ipcMain.handle('orders:clear', requireAdmin((_e, adminPassword) => {
  const auth = verifyAdminWithRateLimit(adminPassword);
  if (!auth || !auth.success) {
    return { success: false, error: auth?.error || 'كلمة مرور المدير غير صحيحة' };
  }
  return db.clearAllOrders(adminPassword);
}));
ipcMain.handle('system:reset', requireAdmin((_e, payload) => {
  if (payload?.adminPassword) {
    const auth = verifyAdminWithRateLimit(payload.adminPassword);
    if (!auth || !auth.success) {
      return { success: false, error: auth?.error || 'كلمة مرور المدير غير صحيحة' };
    }
  }
  return db.systemReset(payload);
}));

// shift:current is open (no auth) so login screen can detect open shifts
ipcMain.handle('shift:current', () => db.currentShift());
ipcMain.handle('shift:open', requireAuth((_e, openingCash, notes, _user, shiftType) => {
  const clockCheck = db.checkClockIntegrity();
  if (!clockCheck.valid) {
    return { success: false, error: clockCheck.error, clockTampered: true };
  }
  return db.openShift(openingCash, notes, currentSession, shiftType);
}));
ipcMain.handle('shift:close', requireAuth((_e, shiftId, actualCash, notes, _user, adminOverridePassword) => {
  const activeShift = db.currentShift();
  if (!activeShift) {
    return { success: false, error: 'لا يوجد أي شيفت مفتوح حالياً لإغلاقه' };
  }
  const targetShiftId = shiftId ? Number(shiftId) : activeShift.id;
  return db.closeShift(targetShiftId, actualCash, notes, currentSession, adminOverridePassword);
}));
ipcMain.handle('shift:pendingBlockers', requireAuth((_e, shiftId) => db.getPendingShiftBlockers(shiftId)));
ipcMain.handle('shifts:list', requireAuth((_e, limit, userId) => {
  const targetUser = currentSession.role === 'cashier' ? currentSession.id : userId;
  return db.listShifts(limit, targetUser);
}));
ipcMain.handle('shifts:adjustments:add', requireAdmin((_e, payload) =>
  db.addShiftAdjustment({ ...payload, actor: currentSession })
));
ipcMain.handle('shifts:adjustments:list', requireAuth((_e, shiftId) =>
  db.listShiftAdjustments(shiftId)
));

// users:list is open (no auth) — returns only safe fields (id, username, name, role) for login screen, or full info for admin
ipcMain.handle('users:list', (_e) => {
  const session = getSessionForEvent(_e) || currentSession;
  if (session && session.role === 'admin') {
    return db.listUsers();
  }
  return db.listPublicUsers();
});
ipcMain.handle('users:get', requireAdmin((_e, id) => db.getUser(id)));
ipcMain.handle('users:save', requireAdmin((_e, user) => {
  const res = db.saveUser(user);
  try {
    const mobileApi = require('./mobileApi');
    mobileApi.broadcastSseEvent('tables', { userUpdated: true, userId: res?.id });
  } catch (_) { }
  return res;
}));
ipcMain.handle('users:delete', requireAdmin((_e, id) => {
  const res = db.deleteUser(id);
  try {
    const mobileApi = require('./mobileApi');
    mobileApi.broadcastSseEvent('tables', { userDeleted: true, userId: id });
  } catch (_) { }
  return res;
}));
ipcMain.handle('users:attendanceReports', requireAdmin((_e, dateFilter) => db.getUserAttendanceReports(dateFilter)));
ipcMain.handle('users:payroll:get', requireAdmin((_e, month) => db.getMonthlyPayroll(month)));
ipcMain.handle('users:adjustments:list', requireAdmin((_e, userId) => db.listEmployeeAdjustments(userId)));
ipcMain.handle('users:adjustments:add', requireAdmin((_e, payload) =>
  db.addEmployeeAdjustment({ ...payload, createdBy: currentSession?.name || 'المدير' })
));
ipcMain.handle('users:adjustments:delete', requireAdmin((_e, id) => db.deleteEmployeeAdjustment(id)));

ipcMain.handle('debts:list', requireAuth(() => db.listDebts()));
ipcMain.handle('debts:listGrouped', requireAuth(() => db.listDebtsGroupedByCustomer()));
ipcMain.handle('debts:pay', requireAuth((_e, payload) => {
  const activeShift = db.currentShift();
  if (!activeShift) return { success: false, error: 'يجب فتح شيفت قبل سداد الديون' };
  return db.payDebt({ ...payload, shiftId: activeShift.id, cashierName: currentSession.name });
}));
ipcMain.handle('debts:payFIFO', requireAuth((_e, payload) => {
  const activeShift = db.currentShift();
  if (!activeShift) return { success: false, error: 'يجب فتح شيفت قبل سداد الديون' };
  return db.payCustomerDebtsFIFO({ ...payload, shiftId: activeShift.id, cashierName: currentSession.name });
}));
ipcMain.handle('debts:delete', requireAdmin((_e, payload) => db.deleteDebt({ ...payload, actor: currentSession })));

// Customers
ipcMain.handle('customers:list', requireAuth(() => db.listCustomers()));
ipcMain.handle('customers:get', requireAuth((_e, id) => db.getCustomer(id)));
ipcMain.handle('customers:getDebts', requireAuth((_e, customerId) => db.getCustomerDebts(customerId)));
ipcMain.handle('customers:search', requireAuth((_e, query) => db.searchCustomers(query)));
ipcMain.handle('customers:saveDetails', requireAuth((_e, data) => db.saveCustomerDetails(data)));

ipcMain.handle('expenses:add', requireAuth((_e, exp) => {
  const activeShift = db.currentShift();
  if (!activeShift) return { success: false, error: 'يجب فتح شيفت قبل تسجيل مصروف' };
  return db.addExpense({ ...exp, shiftId: activeShift.id, userId: currentSession.id, userName: currentSession.name });
}));
ipcMain.handle('expenses:list', requireAuth((_e, shiftId, fromDate, toDate) => db.listExpenses(shiftId, fromDate, toDate)));
ipcMain.handle('expenses:update', requireAuth((_e, exp) => {
  const session = getSessionForEvent(_e) || currentSession;
  let adminPasswordVerified = false;
  if (!session || session.role !== 'admin') {
    if (!exp?.adminPassword) {
      return { success: false, error: 'تعديل أي مصروف يتطلب صلاحية المدير العام أو كلمة مرور المدير' };
    }
    const auth = verifyAdminWithRateLimit(exp.adminPassword);
    if (!auth || !auth.success) {
      return { success: false, error: auth?.error || 'كلمة مرور المدير غير صحيحة' };
    }
    adminPasswordVerified = true;
  }
  return db.updateExpense({ ...exp, actor: session, adminPassword: adminPasswordVerified ? 'VERIFIED' : null });
}));
ipcMain.handle('expenses:delete', requireAuth((_e, id, adminPassword) =>
  db.deleteExpense(id, currentSession, adminPassword)
));

ipcMain.handle('orders:today', requireAuth(() => db.todaySales()));
ipcMain.handle('dashboard:stats', requireAuth(() => db.getDashboardStats()));

// Comprehensive Reports
ipcMain.handle('reports:sales', requireAdmin((_e, filters) => {
  if (filters && filters.reportType === 'cancellations' && typeof db.getReportCancellations === 'function') {
    return db.getReportCancellations(filters);
  }
  return db.getReportSales(filters);
}));
ipcMain.handle('reports:inventory', requireAdmin((_e, filters) => db.getReportInventory(filters)));
ipcMain.handle('reports:shift', requireAdmin((_e, payload) => db.getReportShift(payload)));
ipcMain.handle('reports:daily', requireAdmin((_e, dateStr) => db.getDailySummaryReport(dateStr)));

ipcMain.handle('settings:get', (event) => {
  if (!validateIpcSender(event)) return { error: 'غير مصرح: مصدر الاستدعاء غير موثوق' };
  const allSettings = db.getSettings();
  const session = getSessionForEvent(event);
  if (session && session.role === 'admin') {
    return allSettings;
  }
  // Mask sensitive secret keys if not authenticated as admin
  const safeSettings = { ...allSettings };
  delete safeSettings.vendor_password;
  delete safeSettings.license_key;
  delete safeSettings.admin_password;
  delete safeSettings.tamper_key;
  delete safeSettings.cloud_sync_secret;
  return safeSettings;
});
ipcMain.handle('settings:save', requireAdmin((_e, s) => db.saveSettings(s)));

ipcMain.handle('vendor:saveFeatures', requireAdmin((_e, payload) => {
  const rate = checkPinRateLimit();
  if (!rate.allowed) {
    return { success: false, error: rate.error, locked: true };
  }
  const res = db.saveVendorFeatures(payload);
  if (!res || !res.success) {
    recordPinFailure();
  } else {
    recordPinSuccess();
  }
  return res;
}));
ipcMain.handle('vendor:verifyPassword', requireAdmin((_e, password) => {
  const rate = checkPinRateLimit();
  if (!rate.allowed) {
    return { success: false, error: rate.error, locked: true };
  }
  const ok = db.verifyVendorPassword(password);
  if (!ok) {
    recordPinFailure();
    return { success: false, error: 'رمز المرور غير صحيح' };
  }
  recordPinSuccess();
  return { success: true };
}));


ipcMain.handle('backup:create', requireAdmin(() => db.createBackup()));
ipcMain.handle('backup:restore', requireAdmin((_e, filePath) => db.restoreBackup(filePath)));

ipcMain.handle('database:getSchemaVersion', () => ({
  schemaVersion: db.getSchemaVersion(),
  appVersion: db.getAppVersion()
}));
ipcMain.handle('database:getHealth', requireAdmin(() => db.getDatabaseHealth()));
ipcMain.handle('database:archiveAndCompact', requireAdmin((_e, { retentionDays = 365, adminPassword } = {}) => {
  if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
    return { archived: false, error: 'كلمة مرور المدير مطلوبة لتأكيد الأرشفة وضغط قاعدة البيانات' };
  }
  const v = verifyAdminWithRateLimit(adminPassword);
  if (!v || !v.success) {
    return { archived: false, error: v?.error || 'كلمة مرور المدير غير صحيحة' };
  }
  return db.archiveAndCompact(retentionDays);
}));
ipcMain.handle('database:exportMigrationPackage', requireAdmin((_e, targetPath) => db.exportMigrationPackage(targetPath)));
ipcMain.handle('database:importMigrationPackage', requireAdmin((_e, sourcePath, adminPassword) => {
  if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
    return { success: false, error: 'كلمة مرور الأدمن مطلوبة لتأكيد استيراد حزمة البيانات' };
  }
  const v = db.verifyAdminPassword(adminPassword);
  if (!v.success) {
    return { success: false, error: v.error || 'كلمة مرور الأدمن غير صحيحة' };
  }
  return db.importMigrationPackage(sourcePath, adminPassword);
}));

ipcMain.handle('backup:dialogSave', requireAdmin(async () => {
  if (isTestAutomation) {
    const defaultFile = path.join(app.getPath('userData'), `test-backup-${Date.now()}.db`);
    return { ...db.createBackup(defaultFile), canceled: false, filePath: defaultFile };
  }
  const timestamp = (typeof db.getCairoTodayString === 'function' ? db.getCairoTodayString() : new Date().toISOString().slice(0, 10));
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'حفظ نسخة احتياطية',
    defaultPath: `cafe-pos-backup-${timestamp}.db`,
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  return { ...db.createBackup(filePath), canceled: false };
}));

ipcMain.handle('backup:dialogRestore', requireAdmin(async () => {
  if (isTestAutomation) {
    return { canceled: true };
  }
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'اختر ملف النسخة الاحتياطية',
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths?.length) return { canceled: true };
  return { ...db.restoreBackup(filePaths[0]), canceled: false, filePath: filePaths[0] };
}));

ipcMain.handle('export:ordersCsv', requireAdmin(async (_e, filters) => {
  const todayStr = (typeof db.getCairoTodayString === 'function' ? db.getCairoTodayString() : new Date().toISOString().slice(0, 10));
  const { canceled, filePath } = isTestAutomation
    ? { canceled: false, filePath: path.join(app.getPath('userData'), `cafe-pos-orders-${Date.now()}.xls`) }
    : await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير سجل الفواتير',
      defaultPath: `cafe-pos-orders-${todayStr}.xls`,
      filters: [
        { name: 'Excel Workbook (*.xls)', extensions: ['xls'] },
        { name: 'CSV File (*.csv)', extensions: ['csv'] }
      ]
    });
  if (!canceled && filePath) {
    try {
      const isXls = filePath.toLowerCase().endsWith('.xls');
      const content = isXls ? db.exportOrdersExcel(filters) : db.exportOrdersCsv(filters);
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
    } catch (writeErr) {
      console.error('export:ordersCsv error:', writeErr);
      return { success: false, error: 'تعذر حفظ الملف — تأكد من أن الملف غير مفتوح في برنامج آخر ولديك صلاحيات الكتابة' };
    }
  }
  return { canceled: true };
}));

ipcMain.handle('export:payrollCsv', requireAdmin(async (_e, monthStr) => {
  const targetMonth = monthStr || new Date().toISOString().slice(0, 7);
  const { canceled, filePath } = isTestAutomation
    ? { canceled: false, filePath: path.join(app.getPath('userData'), `cafe-pos-payroll-${Date.now()}.xls`) }
    : await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير كشف المرتبات',
      defaultPath: `cafe-pos-payroll-${targetMonth}.xls`,
      filters: [
        { name: 'Excel Workbook (*.xls)', extensions: ['xls'] },
        { name: 'CSV File (*.csv)', extensions: ['csv'] }
      ]
    });
  if (!canceled && filePath) {
    try {
      const isXls = filePath.toLowerCase().endsWith('.xls');
      const content = isXls ? db.exportPayrollExcel(monthStr) : db.exportPayrollCsv(monthStr);
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
    } catch (writeErr) {
      console.error('export:payrollCsv error:', writeErr);
      return { success: false, error: 'تعذر حفظ الملف — تأكد من أن الملف غير مفتوح في برنامج آخر ولديك صلاحيات الكتابة' };
    }
  }
  return { canceled: true };
}));

ipcMain.handle('export:dailySalesCsv', requireAdmin(async (_e, dateFilter) => {
  const todayStr = dateFilter || (typeof db.getCairoTodayString === 'function' ? db.getCairoTodayString() : new Date().toISOString().slice(0, 10));
  const { canceled, filePath } = isTestAutomation
    ? { canceled: false, filePath: path.join(app.getPath('userData'), `cafe-pos-sales-${Date.now()}.xls`) }
    : await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير تقرير المبيعات',
      defaultPath: `cafe-pos-sales-${todayStr}.xls`,
      filters: [
        { name: 'Excel Workbook (*.xls)', extensions: ['xls'] },
        { name: 'CSV File (*.csv)', extensions: ['csv'] }
      ]
    });
  if (!canceled && filePath) {
    try {
      const isXls = filePath.toLowerCase().endsWith('.xls');
      const content = isXls ? db.exportDailySalesExcel(dateFilter) : db.exportDailySalesCsv(dateFilter);
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, filePath };
    } catch (writeErr) {
      console.error('export:dailySalesCsv error:', writeErr);
      return { success: false, error: 'تعذر حفظ الملف — تأكد من أن الملف غير مفتوح في برنامج آخر ولديك صلاحيات الكتابة' };
    }
  }
  return { canceled: true };
}));

function sanitizePrintHtml(rawHtml) {
  if (typeof rawHtml !== 'string') return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .replace(/javascript:[^"'\s>]+/gi, '');
}

// Dedicated isolated printing: eliminates blank sheets and 1-inch margins
ipcMain.handle('print:ticketHtml', requireAuth(async (_e, payload) => {
  return new Promise((resolve) => {
    let safetyTimeout = null;
    let printWin = null;
    try {
      let html = '', deviceName = '', silent = true, isA4 = false, paperWidth = '80';
      if (typeof payload === 'string') {
        html = payload;
      } else if (payload && typeof payload === 'object') {
        html = payload.html || '';
        deviceName = payload.deviceName || '';
        silent = payload.silent !== undefined ? !!payload.silent : true;
        isA4 = !!payload.isA4 || payload.paper === 'a4';
        paperWidth = payload.paperWidth || (payload.html && (payload.html.includes('paper-58') || payload.html.includes('receipt-paper-58')) ? '58' : '80');
      }

      html = sanitizePrintHtml(html);

      const is58 = paperWidth === '58';
      const thermalWidthMm = is58 ? '48mm' : '72.1mm';

      printWin = new BrowserWindow({
        show: false,
        width: isA4 ? 800 : (is58 ? 260 : 384),
        height: 600,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        }
      });
      printWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWin.webContents.on('will-navigate', (e) => e.preventDefault());

      const pageStyles = isA4 ? `
        @page { size: A4 portrait; margin: 10mm 12mm; }
        *, *::before, *::after { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body {
          margin: 0 !important; padding: 0 !important;
          font-family: 'Segoe UI', 'Cairo', 'Tahoma', 'Arial', sans-serif !important;
          direction: rtl !important; color: #000000 !important; background: #ffffff !important;
          font-size: 12px !important; line-height: 1.5 !important;
        }
        #printable-report, .printable-report-container, #printable-payroll-details, .printable-payroll-details {
          width: 100% !important; max-width: 100% !important;
          margin: 0 !important; padding: 0 !important;
          direction: rtl !important; text-align: right !important;
          color: #000000 !important; background: #ffffff !important;
          font-family: 'Segoe UI', 'Cairo', 'Tahoma', 'Arial', sans-serif !important;
        }
        #printable-report *, .printable-report-container *, #printable-payroll-details *, .printable-payroll-details * {
          box-sizing: border-box !important; color: #000000 !important;
          word-break: break-word !important; overflow-wrap: break-word !important;
        }
        #printable-payroll-details .table-container {
          max-height: none !important; overflow: visible !important;
        }
        #printable-payroll-details .modal-actions,
        #printable-payroll-details button {
          display: none !important;
        }
        table { width: 100% !important; border-collapse: collapse !important; table-layout: auto !important; }
        th, td { border: 1px solid #000000 !important; padding: 5px 6px !important; font-size: 11.5px !important; font-weight: 600 !important; color: #000000 !important; }
        th { background: #e8e8e8 !important; font-weight: 900 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        h2 { font-size: 22px !important; font-weight: 900 !important; text-align: center !important; margin: 0 0 6px 0 !important; }
        h4 { font-size: 13px !important; font-weight: 900 !important; margin: 0 0 6px 0 !important; border-bottom: 1.5px solid #000 !important; padding-bottom: 4px !important; }
        div[style*='display: flex'], div[style*='display:flex'] { display: flex !important; }
        div[style*='display: grid'], div[style*='display:grid'] { display: grid !important; }
        [style*='background: #f8fafc'], [style*='background:#f8fafc'],
        [style*='background: #f1f5f9'], [style*='background:#f1f5f9'],
        [style*='background: #f0fdf4'], [style*='background:#f0fdf4'],
        [style*='background: #fff1f2'], [style*='background:#fff1f2'] {
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
      ` : `
        @page { size: ${thermalWidthMm} 297mm; margin: 0; }
        @page { size: ${thermalWidthMm} auto; margin: 0; }
        *, *::before, *::after {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        html, body {
          width: ${thermalWidthMm} !important;
          max-width: ${thermalWidthMm} !important;
          margin: 0 !important;
          padding: 0 !important;
          font-family: 'Tahoma', 'Segoe UI', 'Cairo', 'Arial', sans-serif !important;
          direction: rtl !important;
          color: #000000 !important;
          background: #ffffff !important;
          font-size: ${is58 ? '11px' : '12.5px'} !important;
          line-height: ${is58 ? '1.35' : '1.45'} !important;
          font-weight: 600 !important;
          overflow: visible !important;
        }

        .receipt-preview,
        #printable-receipt,
        #printable-bar-ticket,
        #printable-shisha-ticket,
        #printable-bar-void,
        #printable-expenses,
        #printable-prebill-check {
          position: static !important;
          top: 0 !important;
          left: 0 !important;
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 100% !important;
          margin: 0 auto !important;
          padding: 1.5mm 2mm !important;
          box-sizing: border-box !important;
          direction: rtl !important;
          text-align: right !important;
          font-family: 'Segoe UI', 'Cairo', 'Tahoma', 'Arial', sans-serif !important;
          font-size: 13.5px !important;
          line-height: 1.4 !important;
          font-weight: 600 !important;
          background: #ffffff !important;
          color: #000000 !important;
          border: none !important;
          box-shadow: none !important;
          overflow: visible !important;
        }

        /* All child text elements must be crisp solid black */
        .receipt-preview *,
        #printable-receipt *,
        #printable-bar-ticket *,
        #printable-shisha-ticket *,
        #printable-bar-void *,
        #printable-expenses *,
        #printable-prebill-check * {
          max-width: 100% !important;
          box-sizing: border-box !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          color: #000000 !important;
        }

        .receipt-preview table,
        #printable-receipt table,
        #printable-bar-ticket table,
        #printable-shisha-ticket table,
        #printable-bar-void table,
        #printable-expenses table,
        #printable-prebill-check table {
          width: 100% !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
        }

        #printable-receipt,
        .receipt-preview {
          page-break-inside: auto !important;
          break-inside: auto !important;
        }

        #printable-receipt tr,
        .receipt-preview tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }

        .receipt-preview td,
        .receipt-preview th,
        #printable-receipt td,
        #printable-receipt th,
        #printable-bar-ticket td,
        #printable-bar-ticket th,
        #printable-shisha-ticket td,
        #printable-shisha-ticket th,
        #printable-expenses td,
        #printable-expenses th,
        #printable-prebill-check td,
        #printable-prebill-check th {
          color: #000000 !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
        }

        .receipt-header h2, .receipt-cafe-name { font-size: 24px !important; font-weight: 900 !important; text-align: center !important; margin: 0 0 4px 0 !important; color: #000000 !important; letter-spacing: -0.5px; }
        .receipt-header p, .receipt-cafe-contact { font-size: 13.5px !important; text-align: center !important; margin: 2px 0 5px 0 !important; color: #000000 !important; font-weight: 700 !important; }
        .receipt-divider { border-top: 2px dashed #000000 !important; border-bottom: none !important; border-left: none !important; border-right: none !important; margin: 6px 0 !important; height: 0 !important; line-height: 0 !important; font-size: 0 !important; overflow: visible !important; }
        .receipt-title-badge { font-size: 15px !important; font-weight: 900 !important; text-align: center !important; border-top: 2px dashed #000000 !important; border-bottom: 2px dashed #000000 !important; padding: 5px 0 !important; margin: 6px 0 !important; }
        .receipt-meta, .receipt-meta-grid { font-size: 14px !important; text-align: right !important; direction: rtl !important; line-height: 1.6 !important; color: #000000 !important; font-weight: 700 !important; }
        .receipt-meta strong { font-size: 15px !important; font-weight: 900 !important; }
        .receipt-meta-row { display: flex !important; justify-content: space-between !important; align-items: center !important; font-size: 14px !important; font-weight: 700 !important; line-height: 1.5 !important; padding: 2px 0 !important; }
        .receipt-meta-row strong { font-size: 15px !important; font-weight: 900 !important; }
        .receipt-table-box { font-size: 16px !important; font-weight: 900 !important; border: 2.5px solid #000000 !important; border-radius: 4px !important; padding: 6px 8px !important; margin: 6px 0 !important; text-align: center !important; justify-content: center !important; }
        .receipt-table { width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; direction: rtl !important; text-align: right !important; margin: 6px 0 !important; font-size: 14px !important; overflow: visible !important; }
        .receipt-table th, .receipt-table td { padding: 5px 2px !important; font-size: 14px !important; border-bottom: 1.5px dashed #000000 !important; color: #000000 !important; word-break: break-word !important; overflow-wrap: break-word !important; }
        .receipt-table th { font-weight: 900 !important; font-size: 15px !important; border-bottom: 2.5px solid #000000 !important; }
        .receipt-table td { font-weight: 800 !important; }
        .receipt-table th:nth-child(1), .receipt-table td:nth-child(1), .receipt-table .th-item, .receipt-table .td-item { width: 34% !important; text-align: right !important; }
        .receipt-table th:nth-child(2), .receipt-table td:nth-child(2), .receipt-table .th-qty, .receipt-table .td-qty { width: 11% !important; text-align: center !important; font-weight: 900 !important; }
        .receipt-table th:nth-child(3), .receipt-table td:nth-child(3), .receipt-table .th-price, .receipt-table .td-price { width: 25% !important; text-align: center !important; white-space: nowrap !important; font-variant-numeric: tabular-nums !important; font-size: 11px !important; letter-spacing: -0.3px !important; padding: 4px 1px !important; }
        .receipt-table th:nth-child(4), .receipt-table td:nth-child(4), .receipt-table .th-total, .receipt-table .td-total { width: 30% !important; text-align: left !important; font-weight: 900 !important; white-space: nowrap !important; font-variant-numeric: tabular-nums !important; font-size: 11px !important; letter-spacing: -0.3px !important; padding: 4px 1px !important; }
        .th-price, .th-total, .td-price, .td-total { white-space: nowrap !important; font-variant-numeric: tabular-nums !important; font-size: 11px !important; letter-spacing: -0.3px !important; padding: 4px 1px !important; }
        .item-title { font-size: 14.5px !important; font-weight: 900 !important; color: #000000 !important; }
        .item-note { font-size: 12px !important; font-weight: 700 !important; color: #222222 !important; margin-top: 2px !important; }
        .receipt-order-notes { font-size: 13.5px !important; font-weight: 800 !important; border: 1.5px dashed #000000 !important; padding: 5px 7px !important; margin: 5px 0 !important; }
        .receipt-totals { width: 100% !important; margin: 6px 0 !important; font-size: 15px !important; direction: rtl !important; text-align: right !important; color: #000000 !important; }
        .r-row { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 3px 0 !important; direction: rtl !important; font-weight: 800 !important; font-size: 14.5px !important; }
        .r-grand { font-size: 22px !important; font-weight: 900 !important; border-top: 2.5px dashed #000000 !important; border-bottom: 2.5px dashed #000000 !important; padding: 7px 0 !important; margin: 6px 0 !important; }
        .r-change { font-size: 15px !important; font-weight: 900 !important; }
        .receipt-footer { margin-top: 10px !important; font-size: 14px !important; text-align: center !important; color: #000000 !important; font-weight: 800 !important; border-top: 1.5px dashed #000000 !important; padding-top: 6px !important; }
        .receipt-thanks { font-size: 14px !important; font-weight: 800 !important; color: #000000 !important; }
        .receipt-system-branding { font-size: 12px !important; font-weight: 800 !important; color: #333333 !important; }

        #printable-bar-ticket .bar-table-badge,
        #printable-shisha-ticket .bar-table-badge,
        #printable-bar-void .bar-table-badge {
          border: 2.5px solid #000000 !important;
          border-radius: 6px !important;
          padding: 6px 8px !important;
          margin: 6px 0 !important;
          text-align: center !important;
          background: #ffffff !important;
          color: #000000 !important;
        }
      `;


      const fullHtml = `<!DOCTYPE html>
      <html lang="ar">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: 'self'; font-src data: 'self'; script-src 'none'; object-src 'none'; base-uri 'none';">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { box-sizing: border-box; }
          ${pageStyles}
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>`;

      printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

      safetyTimeout = setTimeout(() => {
        try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
        resolve({ success: false, error: 'انتهت مهلة تحميل صفحة الطباعة' });
      }, 10000);

      printWin.webContents.on('did-finish-load', async () => {
        try {
          await new Promise((r) => setTimeout(r, 50));
          const metrics = await printWin.webContents.executeJavaScript(`(() => {
            const body = document.body;
            const xssExecuted = Boolean(window.__xss_executed || document.title === 'XSS_POWNED');
            const priceCells = Array.from(document.querySelectorAll('.td-price, .th-price, .td-total, .th-total')).map(el => ({
              className: el.className,
              text: (el.textContent || '').trim(),
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              offsetWidth: el.offsetWidth,
              offsetHeight: el.offsetHeight,
              overflows: el.scrollWidth > el.clientWidth
            }));
            const tableEl = document.querySelector('table');
            return {
              xssExecuted,
              contentHeight: Math.ceil(body.scrollHeight),
              bodyScrollWidth: body.scrollWidth,
              bodyClientWidth: body.clientWidth,
              bodyOffsetWidth: body.offsetWidth,
              bodyText: (body.innerText || '').trim(),
              tableScrollWidth: tableEl ? tableEl.scrollWidth : 0,
              tableClientWidth: tableEl ? tableEl.clientWidth : 0,
              priceCells
            };
          })()`);
          const contentHeight = metrics.contentHeight;

          if (metrics.xssExecuted) {
            try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
            if (safetyTimeout) clearTimeout(safetyTimeout);
            return resolve({ success: false, xssExecuted: true, error: 'XSS detected in print payload' });
          }

          if (payload && typeof payload === 'object' && payload.dryRun) {
            try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
            if (safetyTimeout) clearTimeout(safetyTimeout);
            return resolve({ success: true, xssExecuted: false, dryRun: true, metrics });
          }

          const pdfOutDir = process.env.CAFE_PRINT_PDF_DIR;
          const requestedPdfPath = (payload && typeof payload === 'object' && payload.pdfPath)
            ? payload.pdfPath
            : (pdfOutDir ? path.join(pdfOutDir, `print_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.pdf`) : null);

          if (requestedPdfPath) {
            const useDynamicThermalHeight = !isA4 && Boolean(payload && typeof payload === 'object' && payload.pdfDynamicHeight);
            const dynamicHeightInches = Math.max(40, Math.round((contentHeight + 24) * 0.2645833)) / 25.4;
            const pdfOpts = isA4 ? {
              pageSize: 'A4',
              printBackground: true,
              margins: { top: 0.39, bottom: 0.39, left: 0.47, right: 0.47 }
            } : {
              pageSize: {
                width: is58 ? (48 / 25.4) : (72.1 / 25.4),
                height: useDynamicThermalHeight ? dynamicHeightInches : (297 / 25.4)
              },
              preferCSSPageSize: false,
              printBackground: true,
              margins: { top: 0, bottom: 0, left: 0, right: 0 }
            };
            const pdfBuffer = await printWin.webContents.printToPDF(pdfOpts);
            fs.mkdirSync(path.dirname(requestedPdfPath), { recursive: true });
            fs.writeFileSync(requestedPdfPath, pdfBuffer);
            if (pdfOutDir) {
              try {
                fs.appendFileSync(
                  path.join(pdfOutDir, 'print_log.jsonl'),
                  JSON.stringify({
                    ts: Date.now(),
                    pdfPath: requestedPdfPath,
                    deviceName: deviceName || '',
                    isA4,
                    paperWidth,
                    contentHeight,
                    bodyOffsetWidth: metrics.bodyOffsetWidth,
                    bodyScrollWidth: metrics.bodyScrollWidth,
                    bodyText: metrics.bodyText || ''
                  }) + '\n',
                  'utf8'
                );
              } catch (_) { }
            }
            try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
            if (safetyTimeout) clearTimeout(safetyTimeout);
            resolve({ success: true, pdfPath: requestedPdfPath, metrics, deviceName: deviceName || '' });
            return;
          }

          const printOpts = {
            silent: !!silent,
            printBackground: true,
            margins: { marginType: 'none' }
          };
          if (deviceName && typeof deviceName === 'string' && deviceName.trim()) {
            const reqName = deviceName.trim();
            try {
              const printers = await printWin.webContents.getPrintersAsync();
              const norm = (s) => (s || '').toLowerCase()
                .replace(/[\u064B-\u065F]/g, '')
                .replace(/ة/g, 'ه')
                .replace(/[أإآ]/g, 'ا')
                .replace(/ى/g, 'ي')
                .trim();
              const stripAl = (s) => {
                const n = norm(s);
                return n.startsWith('ال') ? n.slice(2) : n;
              };

              const reqNorm = norm(reqName);
              const reqBare = stripAl(reqName);

              // 1. Exact match (case insensitive)
              let matched = printers.find(p => p.name.toLowerCase() === reqName.toLowerCase());

              // 2. Normalized or article-stripped match
              if (!matched) {
                matched = printers.find(p => norm(p.name) === reqNorm || stripAl(p.name) === reqBare);
              }

              // 3. Substring containment in either direction
              if (!matched) {
                matched = printers.find(p => {
                  const pNorm = norm(p.name);
                  const pBare = stripAl(p.name);
                  return pNorm.includes(reqNorm) || reqNorm.includes(pNorm) ||
                    pBare.includes(reqBare) || reqBare.includes(pBare);
                });
              }

              // 4. Aliases for common roles (cashier, bar, shisha)
              if (!matched) {
                const aliasMap = {
                  shisha: ['شيشه', 'شيشة', 'shisha', 'hookah'],
                  bar: ['بار', 'bar', 'kitchen', 'مطبخ'],
                  cashier: ['كاشير', 'الكاشير', 'cashier', 'pos', 'receipt', 'فاتوره', 'فاتورة']
                };
                let detectedRole = null;
                for (const [role, words] of Object.entries(aliasMap)) {
                  if (words.some(w => reqNorm.includes(norm(w)))) {
                    detectedRole = role;
                    break;
                  }
                }
                if (detectedRole) {
                  matched = printers.find(p => {
                    const pNorm = norm(p.name);
                    return aliasMap[detectedRole].some(w => pNorm.includes(norm(w)));
                  });
                }
              }

              if (matched) {
                printOpts.deviceName = matched.name;
              } else {
                printOpts.deviceName = reqName;
              }
            } catch (_) {
              printOpts.deviceName = reqName;
            }
          }

          // إذا كانت الطابعة المختارة طابعة ملفات افتراضية (PDF / XPS / OneNote)، إيقاف الطباعة الصامتة لتجنب تعليق الويندوز
          const targetDevice = printOpts.deviceName || '';
          if (/pdf|xps|onenote|fax/i.test(targetDevice) && printOpts.silent) {
            console.log(`[Print] الطابعة "${targetDevice}" طابعة ملفات افتراضية. تم تعطيل silent للسماح بحفظ الملف بدون تعليق.`);
            printOpts.silent = false;
          }

          if (isA4) {
            printOpts.pageSize = 'A4';
          } else {
            const widthMicrons = is58 ? 48000 : 72100; // 48mm for 58mm paper, 72.1mm for 80mm paper (XP-80)
            const MIN_SAFE_HEIGHT_MICRONS = 40000; // 40mm minimum so short tickets never shrink or jam
            const MAX_SAFE_HEIGHT_MICRONS = 8000000; // 8000mm — رفعناها لتغطية التقارير الطويلة جدًا (يوم كامل بأصناف وفواتير كثيرة)
            let heightMicrons = Math.max(MIN_SAFE_HEIGHT_MICRONS, Math.round((contentHeight + 24) * 264.5833));
            if (heightMicrons > MAX_SAFE_HEIGHT_MICRONS) {
              console.warn(`[Print] الفاتورة طويلة جدًا (${Math.round(heightMicrons / 1000)}mm) — تم تحديدها بحد أقصى ${MAX_SAFE_HEIGHT_MICRONS / 1000}mm. تأكد أن "Max Length" في تعريف الطابعة على الأقل بنفس القيمة.`);
              heightMicrons = MAX_SAFE_HEIGHT_MICRONS;
            }
            printOpts.pageSize = { width: widthMicrons, height: heightMicrons };
            printOpts.scaleFactor = 100;
          }

          printWin.webContents.print(printOpts, (success, failureReason) => {
            try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
            if (safetyTimeout) clearTimeout(safetyTimeout);
            if (!success) {
              console.warn('Dedicated print completed with status:', failureReason);
              resolve({ success: false, error: failureReason });
            } else {
              resolve({ success: true });
            }
          });
        } catch (err) {
          console.error('Print execution error:', err);
          try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
          if (safetyTimeout) clearTimeout(safetyTimeout);
          resolve({ success: false, error: err.message });
        }
      });

      printWin.webContents.on('did-fail-load', (_event, _code, desc) => {
        try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
        if (safetyTimeout) clearTimeout(safetyTimeout);
        resolve({ success: false, error: desc });
      });
    } catch (err) {
      if (safetyTimeout) clearTimeout(safetyTimeout);
      try { if (printWin && !printWin.isDestroyed()) printWin.close(); } catch (_) { }
      resolve({ success: false, error: err.message });
    }
  });
}));

ipcMain.handle('print:silent', requireAuth(async (_e, options = {}) => {
  if (isTestAutomation) return { success: true, simulated: true };
  if (!mainWindow) return { success: false, error: 'النافذة غير متاحة' };
  try {
    mainWindow.webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' }, ...options },
      (success, reason) => { if (!success) console.warn('Print failed:', reason); }
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}));

ipcMain.handle('printers:list', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err) {
    console.error('Error fetching printers:', err);
    return [];
  }
});

ipcMain.handle('license:status', () => db.getLicenseStatus());
ipcMain.handle('license:activate', (_e, licenseKey) => db.activateLicense(licenseKey));
ipcMain.handle('license:getMachineId', () => db.getMachineId());
ipcMain.handle('license:unlockTamper', (_e, unlockKey) => db.unlockTamper(unlockKey));

ipcMain.handle('qr:getInfo', () => {
  try {
    const qrServer = require('./server');
    const ip = qrServer.getLocalIp();
    return {
      ip,
      localIp: ip,
      port: 3000,
      url: `http://${ip}:3000/menu`,
      tablesUrl: `http://${ip}:3000/qr-tables`,
      waiterUrl: `http://${ip}:3000/waiter`,
      waiterQrUrl: `http://${ip}:3000/qr-waiter`
    };
  } catch (err) {
    return {
      ip: '127.0.0.1',
      localIp: '127.0.0.1',
      port: 3000,
      url: 'http://127.0.0.1:3000/menu',
      tablesUrl: 'http://127.0.0.1:3000/qr-tables',
      waiterUrl: 'http://127.0.0.1:3000/waiter',
      waiterQrUrl: 'http://127.0.0.1:3000/qr-waiter'
    };
  }
});

// ---- Mobile Hub & Waiter Pairing IPC (Strictly Gated by Vendor Feature: enable_mobile_hub) ----
ipcMain.handle('mobile:createPairingSession', requireAdmin(async () => {
  if (!db.isVendorFeatureEnabled || !db.isVendorFeatureEnabled('enable_mobile_hub')) {
    return { ok: false, success: false, error: 'ميزة تطبيق الموبايل وربط الأجهزة غير مفعّلة لهذه النسخة. تواصل مع المطور لتفعيلها.', code: 'FEATURE_LOCKED' };
  }
  try {
    const qrServer = require('./server');
    qrServer.startServer({ db, get mainWindow() { return mainWindow; }, getMainWindow: () => mainWindow, port: 3000 });
  } catch (err) {
    console.warn('[Mobile Hub] Ensure server running error:', err.message);
  }
  const mobileApi = require('./mobileApi');
  const settings = db.getSettings ? db.getSettings() : {};
  const cafeName = settings.cafe_name || 'تقفيلة كافيه';
  return mobileApi.createPairingSession(cafeName, 3000);
}));

ipcMain.handle('mobile:listPairedDevices', requireAdmin(() => {
  if (!db.isVendorFeatureEnabled || !db.isVendorFeatureEnabled('enable_mobile_hub')) {
    return [];
  }
  return db.listPairedDevices ? db.listPairedDevices() : [];
}));

ipcMain.handle('mobile:revokeDevice', requireAdmin((_e, id) => {
  if (!db.isVendorFeatureEnabled || !db.isVendorFeatureEnabled('enable_mobile_hub')) {
    return { success: false, error: 'ميزة تطبيق الموبايل غير مفعّلة لهذه النسخة.', code: 'FEATURE_LOCKED' };
  }
  const res = db.revokePairedDevice ? db.revokePairedDevice(id) : { success: false };
  if (res.tokenHash) {
    const mobileApi = require('./mobileApi');
    mobileApi.notifyDeviceRevoked(res.tokenHash);
  }
  return res;
}));

ipcMain.handle('mobile:deleteDevice', requireAdmin((_e, id) => {
  if (!db.isVendorFeatureEnabled || !db.isVendorFeatureEnabled('enable_mobile_hub')) {
    return { success: false, error: 'ميزة تطبيق الموبايل غير مفعّلة لهذه النسخة.', code: 'FEATURE_LOCKED' };
  }
  return db.deletePairedDevice ? db.deletePairedDevice(id) : { success: false };
}));

ipcMain.handle('mobile:getInfo', () => {
  const mobileApi = require('./mobileApi');
  const settings = db.getSettings ? db.getSettings() : {};
  const enabled = db.isVendorFeatureEnabled ? db.isVendorFeatureEnabled('enable_mobile_hub') : false;
  const devices = enabled && db.listPairedDevices ? db.listPairedDevices() : [];
  return {
    enabled,
    ip: mobileApi.getLocalIp(),
    port: 3000,
    activeDevicesCount: devices.filter(d => d.status === 'active').length,
    autoAppend: settings.waiter_auto_append_to_tables !== '0',
    menuRev: db.getMenuRevision ? db.getMenuRevision() : 1
  };
});

