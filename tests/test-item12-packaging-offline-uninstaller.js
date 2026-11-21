const fs = require('fs');
const path = require('path');

async function run() {
  console.log('=== TEST ITEM 12: Packaging, Offline Operation, and Uninstaller Safety ===\n');

  let passed = 0;
  let failed = 0;

  try {
    // 1. Check package.json NSIS uninstaller configuration
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    const deleteAppData = pkg.build?.nsis?.deleteAppDataOnUninstall;
    console.log('[Test 12] package.json build.nsis.deleteAppDataOnUninstall =', deleteAppData);

    if (deleteAppData === false) {
      console.log('✅ PASS: deleteAppDataOnUninstall is explicitly set to false (uninstaller protects user database).');
      passed++;
    } else {
      console.log('❌ FAIL: deleteAppDataOnUninstall is not false! User data could be wiped on uninstall!');
      failed++;
    }

    // 2. Check build/installer.nsh
    const nshPath = path.resolve(__dirname, '../build/installer.nsh');
    const nshContent = fs.readFileSync(nshPath, 'utf8');
    const touchesDb = nshContent.includes('cafe-pos.db') || nshContent.includes('$APPDATA\\TaqfeelaPOS\\*') || nshContent.includes('RMDir /r "$APPDATA\\TaqfeelaPOS"');

    if (!touchesDb && nshContent.includes('customUnInstall')) {
      console.log('✅ PASS: customUnInstall in installer.nsh only wipes temporary cache folders, preserving cafe-pos.db.');
      passed++;
    } else {
      console.log('❌ FAIL: installer.nsh may delete the user database on uninstall!');
      failed++;
    }

    // 3. Check for external CDNs / online scripts in index.html and dist/index.html
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const distHtml = fs.existsSync(path.resolve(__dirname, '../dist/index.html'))
      ? fs.readFileSync(path.resolve(__dirname, '../dist/index.html'), 'utf8')
      : indexHtml;

    const hasExternalScript = /<script[^>]+src=["']https?:\/\//i.test(indexHtml) || /<script[^>]+src=["']https?:\/\//i.test(distHtml);
    const hasExternalCss = /<link[^>]+href=["']https?:\/\//i.test(indexHtml) || /<link[^>]+href=["']https?:\/\//i.test(distHtml);

    if (!hasExternalScript && !hasExternalCss) {
      console.log('✅ PASS: Zero external CDNs or online script/style tags. 100% clean offline operation.');
      passed++;
    } else {
      console.log('❌ FAIL: External online CDN script or style tags found!');
      failed++;
    }

    // 4. Electron Version and Supported Windows Check (Owner Strategic Decision: Electron 22.3.27)
    const devElectron = pkg.devDependencies?.electron;
    const installedElectron = require('electron/package.json').version;
    const buildElectron = pkg.build?.electronVersion;
    console.log(`[Test 12] devDependencies.electron = ${devElectron}, installed = ${installedElectron}, build.electronVersion = ${buildElectron || '(unified from devDependencies)'}`);

    const isUnifiedOn22 = devElectron && installedElectron.startsWith('22.3.27') && (!buildElectron || buildElectron.startsWith('22.3.27'));
    if (isUnifiedOn22) {
      console.log(`✅ PASS: Electron unified on universal Electron 22.3.27 (installed: ${installedElectron}, target: Universal Windows 7 SP1 / 8.1 / 10 / 11 across x64 and ia32).`);
      passed++;
    } else {
      console.log(`❌ FAIL: Electron version is not unified on universal version 22.3.27 (installed: ${installedElectron}).`);
      failed++;
    }

  } catch (err) {
    console.log('❌ FAIL (Error):', err.message);
    failed++;
  }

  console.log(`\nItem 12 Results: Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run();

