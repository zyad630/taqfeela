const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const stagingDir = path.join(rootDir, 'cafe-app-developer-pack');
const zipFile = path.join(rootDir, 'cafe-app-for-developer.zip');

console.log('========================================================');
console.log('  Packaging clean copy for developer...');
console.log('========================================================');

// 1. Cleanup old staging & zip
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.rmSync(zipFile, { force: true });
}

fs.mkdirSync(stagingDir, { recursive: true });

// 2. Directories to copy
const dirsToCopy = ['src', 'public', 'electron'];
for (const dir of dirsToCopy) {
  const srcPath = path.join(rootDir, dir);
  const destPath = path.join(stagingDir, dir);
  if (fs.existsSync(srcPath)) {
    console.log(`[+] Copying folder: ${dir}...`);
    fs.cpSync(srcPath, destPath, { recursive: true });
  }
}

// 3. Purge any sensitive files inside electron
const electronDest = path.join(stagingDir, 'electron');
const sensitiveInsideElectron = ['.license', 'cafe-pos.db', 'vendor-tools'];
for (const item of sensitiveInsideElectron) {
  const p = path.join(electronDest, item);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

// 4. Copy essential root files
const rootFiles = [
  'package.json',
  'package-lock.json',
  'vite.config.js',
  'index.html',
  'sql-wasm.wasm',
  'README.md',
  'دليل_ربط_التطبيق_للمبرمج_API.md'
];

console.log('[+] Copying root config & documentation files...');
for (const file of rootFiles) {
  const src = path.join(rootDir, file);
  const dest = path.join(stagingDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// 5. Create README_DEVELOPER.md
const devReadme = `# دليل المطور السريع (Cafe POS Developer Pack)

مرحباً بك! هذا المجلد يحتوي على الكود المصدري النظيف لنظام الكافيه لتطوير وتوصيل تطبيقات الموبايل/الويب.

## 🚀 التشغيل السريع:
1. تثبيت الحزم:
   npm install

2. تشغيل السيرفر وواجهة الكاشير محلياً:
   npm run electron:dev

## 📱 الربط مع تطبيق الموبايل / الويب:
- السيرفر يعمل على منفذ: 3000
- نقطة جلب البيانات والمنيو: GET /api/waiter/data
- نقطة إرسال طلب جديد: POST /api/waiter/order
- لمزيد من التفاصيل ونماذج الـ JSON الكاملة، راجع ملف:
  دليل_ربط_التطبيق_للمبرمج_API.md
`;
fs.writeFileSync(path.join(stagingDir, 'README_DEVELOPER.md'), devReadme, 'utf8');

// 6. Compress with PowerShell Compress-Archive
console.log('[+] Creating zip archive: cafe-app-for-developer.zip...');
const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipFile}' -Force"`;
execSync(psCommand, { stdio: 'inherit' });

// 7. Remove staging directory
console.log('[+] Cleaning up temporary folder...');
fs.rmSync(stagingDir, { recursive: true, force: true });

const stats = fs.statSync(zipFile);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

console.log('========================================================');
console.log(`✅ تم بنجاح إنشاء ملف جاهز للإرسال!`);
console.log(`📁 المسار: ${zipFile}`);
console.log(`📦 الحجم: ${sizeMb} MB`);
console.log('========================================================');
