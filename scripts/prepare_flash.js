const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const flashDir = 'F:\\cafe-app';

console.log('Checking flash drive directory:', flashDir);
if (!fs.existsSync(flashDir)) {
  fs.mkdirSync(flashDir, { recursive: true });
}

// 1. Copy node.exe
const nodeSource = process.execPath; // C:\Program Files\nodejs\node.exe
console.log('Copying node.exe from:', nodeSource);
fs.copyFileSync(nodeSource, path.join(flashDir, 'node.exe'));

// 2. Copy server.js
console.log('Copying server.js...');
fs.copyFileSync(path.join(projectDir, 'server.js'), path.join(flashDir, 'server.js'));

// 3. Copy dist folder (resolving junction)
console.log('Copying dist folder...');
const targetDist = path.join(flashDir, 'dist');
if (fs.existsSync(targetDist)) {
  fs.rmSync(targetDist, { recursive: true, force: true });
}
fs.cpSync(path.join(projectDir, 'dist'), targetDist, { recursive: true, dereference: true });

// 4. Remove old .bat files
fs.readdirSync(flashDir).forEach(file => {
  if (file.endsWith('.bat')) {
    try { fs.unlinkSync(path.join(flashDir, file)); } catch (e) {}
  }
});

// 5. Copy EXEs from release if available
const releaseDir = path.join(projectDir, 'release');
if (fs.existsSync(releaseDir)) {
  const portableSource = path.join(releaseDir, 'CafePOS 1.0.0.exe');
  if (fs.existsSync(portableSource)) {
    console.log('Copying CafePOS_Portable.exe...');
    fs.copyFileSync(portableSource, path.join(flashDir, 'CafePOS_Portable.exe'));
  }
  
  const setupFiles = fs.readdirSync(releaseDir).filter(f => f.includes('Setup') && f.endsWith('.exe'));
  if (setupFiles.length > 0) {
    console.log('Copying setup exe:', setupFiles[0]);
    fs.copyFileSync(path.join(releaseDir, setupFiles[0]), path.join(flashDir, 'Cafe_POS_Setup.exe'));
  }
}

// 6. Create clean launcher BAT files
const batLines = [
  '@echo off',
  'chcp 65001 > nul',
  'title Cafe POS - تقفيلة',
  'cd /d "%~dp0"',
  'echo ===============================================================',
  'echo            Cafe POS - Starting Server',
  'echo ===============================================================',
  'echo.',
  'if exist "%~dp0node.exe" (',
  '    "%~dp0node.exe" "%~dp0server.js"',
  ') else (',
  '    echo [Error] node.exe not found in this folder!',
  '    pause',
  ')'
].join('\r\n');

fs.writeFileSync(path.join(flashDir, 'Run_Cafe_POS.bat'), batLines, 'utf8');
fs.writeFileSync(path.join(flashDir, 'تشغيل_البرنامج.bat'), batLines, 'utf8');

console.log('Flash drive F:\\cafe-app prepared successfully!');
