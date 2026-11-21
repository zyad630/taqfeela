/**
 * ==============================================================================================
 * Production Hardening & Obfuscation Script
 * Prepares and protects all JavaScript files, injects legal warnings,
 * obfuscates code, and generates integrity hashes for Anti-Tamper verification.
 * ==============================================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ELECTRON_DIR = path.join(ROOT_DIR, 'electron');
const BACKUP_DIR = path.join(ROOT_DIR, '.build_protection_backup');

const LEGAL_BANNER = `/**
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
 */\n`;

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.8,
  identifierNamesGenerator: 'hexadecimal',
  selfDefending: false, // Safe for Electron contextIsolation & Chromium renderer
  disableConsoleOutput: false,
  splitStrings: false // Prevent V8 AST depth explosion and semi-space OOM
};

function backupFile(filePath, relPath) {
  const dest = path.join(BACKUP_DIR, relPath);
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(filePath, dest);
}

function restoreAll() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('ℹ️ لا يوجد مجلد نسخ احتياطي لاسترجاعه.');
    return;
  }
  console.log('🔄 جاري استرجاع ملفات التطوير الأصلية من النسخة الاحتياطية...');
  function restoreRecursive(dir, relDir = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const srcPath = path.join(dir, ent.name);
      const relPath = path.join(relDir, ent.name);
      const targetPath = path.join(ROOT_DIR, relPath);
      if (ent.isDirectory()) {
        restoreRecursive(srcPath, relPath);
      } else {
        fs.copyFileSync(srcPath, targetPath);
      }
    }
  }
  restoreRecursive(BACKUP_DIR);
  // Delete backup dir
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('✅ تم استرجاع ملفات التطوير بنجاح.');
}

function protectFiles() {
  console.log('🛡️ بدء عملية تشفير وحماية ملفات المشروع وإعداد منظومة الـ Anti-Tamper...');

  // Ensure backup dir is clean
  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // 1. Frontend bundles in dist/assets/*.js (already minified & mangled by Vite/Rollup)
  // Running javascript-obfuscator breaks ES6 lexical scoping / TDZ (ReferenceError: Cannot access before initialization).
  // We inject the legal protection banner without breaking the React runtime.
  const distAssetsDir = path.join(DIST_DIR, 'assets');
  if (fs.existsSync(distAssetsDir)) {
    const files = fs.readdirSync(distAssetsDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const fullPath = path.join(distAssetsDir, file);
        console.log(`🔒 حماية واجهة المستخدم وحقن إشعار الملكية: dist/assets/${file}`);
        const code = fs.readFileSync(fullPath, 'utf8');
        if (!code.includes('STRICT PROPRIETARY & CRIMINAL LIABILITY NOTICE')) {
          fs.writeFileSync(fullPath, LEGAL_BANNER + code, 'utf8');
        }
      }
    }
  }

  // 2. Protect and inject warnings into electron files
  const electronFiles = ['preload.js', 'security.js', 'finance.js', 'mobileApi.js', 'updater.js', 'db/licensing.js', 'db/integrity.js', 'db/health.js'];
  for (const file of electronFiles) {
    const fullPath = path.join(ELECTRON_DIR, file);
    if (fs.existsSync(fullPath)) {
      backupFile(fullPath, path.join('electron', file));
      const code = fs.readFileSync(fullPath, 'utf8');
      const isAlreadyObfuscated = /_0x[a-f0-9]{4,6}/i.test(code);
      if (isAlreadyObfuscated) {
        console.log(`🔒 ملف محمي ومُعمّى مسبقاً (تخطي إعادة التعتيم لمنع التجميد): electron/${file}`);
        if (!code.includes('STRICT PROPRIETARY & CRIMINAL LIABILITY NOTICE')) {
          fs.writeFileSync(fullPath, LEGAL_BANNER + code, 'utf8');
        }
      } else {
        console.log(`🔒 تعتيم وحماية ملف: electron/${file}`);
        const obfuscated = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS).getObfuscatedCode();
        fs.writeFileSync(fullPath, LEGAL_BANNER + obfuscated, 'utf8');
      }
    }
  }

  // Backup main.js and db.js (inject legal trap banner + strip CAFE_TEST_AUTOMATION backdoor for production builds)
  for (const file of ['main.js', 'db.js']) {
    const fullPath = path.join(ELECTRON_DIR, file);
    if (fs.existsSync(fullPath)) {
      backupFile(fullPath, path.join('electron', file));
      let code = fs.readFileSync(fullPath, 'utf8');
      // Issue 19: Compile-time strip of test automation bypass in production builds
      code = code.replace(/process\.env\.CAFE_TEST_AUTOMATION\s*===\s*['"]1['"]/g, 'false /* TEST_AUTOMATION_STRIPPED_IN_PROD */');
      // Inject legal trap header at top of main.js and db.js
      if (!code.includes('STRICT PROPRIETARY & CRIMINAL LIABILITY NOTICE')) {
        code = LEGAL_BANNER + code;
      }
      fs.writeFileSync(fullPath, code, 'utf8');
    }
  }

  // Bundle server.js with esbuild so it is completely self-contained in production asar
  const serverPath = path.join(ELECTRON_DIR, 'server.js');
  if (fs.existsSync(serverPath)) {
    // Ensure server.js always requires fresh ./mobileApi from disk before bundling
    let serverSrc = fs.readFileSync(serverPath, 'utf8');
    if (serverSrc.includes('require_mobileApi()')) {
      serverSrc = serverSrc.replace('const mobileApi = require_mobileApi();', 'const mobileApi = require("./mobileApi");');
      fs.writeFileSync(serverPath, serverSrc, 'utf8');
    }
    backupFile(serverPath, path.join('electron', 'server.js'));
    console.log('⚡ حزم وتجهيز سيرفر المنيو المحلي للإنتاج: electron/server.js');
    const esbuild = require('esbuild');
    esbuild.buildSync({
      entryPoints: [serverPath],
      bundle: true,
      platform: 'node',
      target: 'node18',
      external: ['electron'],
      outfile: serverPath,
      allowOverwrite: true
    });
  }

  // 3. Generate Cryptographically Signed Security Manifest (SHA-256 + Ed25519)
  console.log('📋 إنشاء وتوقيع ملف التوقيع الرقمي وسلامة الملفات (security_manifest.json)...');
  const { canonicalManifestPayload } = require(path.join(ELECTRON_DIR, 'db', 'integrity.js'));
  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    legalNotice: 'Protected by Ed25519 Signed Anti-Tamper Fail-Closed Security',
    files: {},
    signature: null
  };

  const filesToCheck = [
    'preload.js',
    'security.js',
    'main.js',
    'db.js',
    'mobileApi.js',
    'finance.js',
    'updater.js',
    'db/licensing.js',
    'db/integrity.js',
    'db/health.js'
  ];

  for (const f of filesToCheck) {
    const fullPath = path.join(ELECTRON_DIR, f);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      manifest.files[f] = hash;
    }
  }

  // Sign manifest with vendor Ed25519 private key via external Key Vault (env or %USERPROFILE%\.taqfeela-vault\)
  const { loadVendorPrivateKey } = require('./setup-key-vault');
  const keyInfo = loadVendorPrivateKey();
  if (keyInfo.pem) {
    const canonical = canonicalManifestPayload(manifest.files);
    manifest.signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), keyInfo.pem).toString('base64');
    console.log(`🔐 تم توقيع security_manifest.json رقمياً بخوارزمية Ed25519 بنجاح (المصدر: ${keyInfo.source}).`);
  } else {
    console.warn('⚠️ تحذير: لم يتم العثور على مفتاح التوقيع الخاص (TAQFEELA_SIGNING_KEY أو الخزنة الخارجية). الـ Manifest غير موقّع!');
  }

  const manifestPath = path.join(ELECTRON_DIR, 'security_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('✅ اكتملت عملية التشفير وإعداد منظومة الحماية بنجاح!');
}

function verifyManifestCli() {
  const { verifySignedManifest } = require(path.join(ELECTRON_DIR, 'db', 'integrity.js'));
  const res = verifySignedManifest({ baseDir: ELECTRON_DIR, requireSignature: true });
  if (!res.valid) {
    console.error('❌ فشل التحقق من سلامة التوقيع الرقمي:', res.reason);
    process.exit(1);
  }
  console.log(`✅ تم التحقق من التوقيع الرقمي (Ed25519) وسلامة ${res.verifiedFiles} ملف حرج بنجاح.`);
}

const arg = process.argv[2];
if (arg === '--restore') {
  restoreAll();
} else if (arg === '--verify') {
  verifyManifestCli();
} else {
  protectFiles();
}
