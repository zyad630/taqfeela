const fs = require('fs');
const path = require('path');

const targetDir = 'c:\\Users\\zyad\\Downloads\\Taqfeela_POS_EXE';
const sourceUnpacked = path.join(__dirname, '..', 'release', 'win-unpacked');
const releaseDir = path.join(__dirname, '..', 'release');
const buildDir = path.join(__dirname, '..', 'build');
const electronDir = path.join(__dirname, '..', 'electron');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy win-unpacked files
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying unpacked application files...');
copyDirRecursive(sourceUnpacked, targetDir);

// Find the main unpacked exe in targetDir and copy it to Taqfeela_POS.exe
const targetFiles = fs.readdirSync(targetDir);
for (const f of targetFiles) {
  if (f.endsWith('.exe') && f.includes('POS') && !f.startsWith('Taqfeela_POS')) {
    fs.copyFileSync(path.join(targetDir, f), path.join(targetDir, 'Taqfeela_POS.exe'));
    fs.unlinkSync(path.join(targetDir, f)); // Remove the weirdly-encoded name
    console.log(`Renamed unpacked exe to Taqfeela_POS.exe`);
    break;
  }
}

// Copy installers from releaseDir
const releaseFiles = fs.readdirSync(releaseDir);
for (const f of releaseFiles) {
  if (f.endsWith('.exe')) {
    if (f.includes('Setup')) {
      fs.copyFileSync(path.join(releaseDir, f), path.join(targetDir, 'Taqfeela_POS_Setup.exe'));
      console.log('Copied installer to Taqfeela_POS_Setup.exe');
    } else if (f.includes('1.0.0') && !f.includes('CafePOS')) {
      fs.copyFileSync(path.join(releaseDir, f), path.join(targetDir, 'Taqfeela_POS_Portable.exe'));
      console.log('Copied portable to Taqfeela_POS_Portable.exe');
    }
  }
}

// Copy branding files
if (fs.existsSync(path.join(buildDir, 'icon.ico'))) {
  fs.copyFileSync(path.join(buildDir, 'icon.ico'), path.join(targetDir, 'icon.ico'));
}
if (fs.existsSync(path.join(buildDir, 'icon.png'))) {
  fs.copyFileSync(path.join(buildDir, 'icon.png'), path.join(targetDir, 'icon.png'));
}
if (fs.existsSync(path.join(electronDir, 'taqfeela_splash.jpg'))) {
  fs.copyFileSync(path.join(electronDir, 'taqfeela_splash.jpg'), path.join(targetDir, 'taqfeela_splash.jpg'));
}

console.log('All files prepared in ' + targetDir);
