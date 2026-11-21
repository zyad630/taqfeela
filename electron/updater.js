/**
 * ==============================================================================================
 * Portable Self-Update Module — TaqfeelaPOS
 * ==============================================================================================
 * 
 * المشكلة: لما العميل عنده نسخة portable قديمة وبينزل exe جديد بجانبها،
 * الكود القديم بيفضل يشتغل من الكاش (Code Cache / GPUCache) أو من المجلد المفكوك القديم.
 * 
 * الحل: النظام ده بيعمل الآتي عند تشغيل البرنامج:
 * 1. بيدوّر على أي exe جديد (أحدث) في نفس المجلد أو بيتأكد إن الحالي هو الأحدث
 * 2. بينضّف كل أنواع الكاش (Chromium Cache, Code Cache, GPUCache, DawnCache)
 * 3. بيسجل metadata عن النسخة الحالية عشان يعرف يقارن في المرة الجاية
 * 4. الداتا (cafe-pos.db + backups + license) مبيلمسهاش خالص
 * ==============================================================================================
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * Gets the version from package.json inside the app's resources
 * Returns the current running app version
 */
function getCurrentVersion() {
  try {
    if (app && typeof app.getVersion === 'function') {
      const v = app.getVersion();
      if (v && v !== '0.0.0') return v;
    }
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return pkg.version || '0.0.0';
    }
  } catch (_) {}
  return '0.0.0';
}

/**
 * Compares two semver-like version strings
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a, b) {
  const partsA = String(a).split('.').map(Number);
  const partsB = String(b).split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Cleans all Chromium/V8 caches from the userData directory
 * This is the KEY fix — forces Electron to load fresh JS/CSS/HTML
 * STRICTLY PROTECTED: Does NOT touch Local Storage, IndexedDB, cafe-pos.db, backups/, .license, security files
 */
function cleanCaches(userDataPath) {
  if (!userDataPath || !fs.existsSync(userDataPath)) return 0;

  const PROTECTED_NAMES = [
    'local storage',
    'indexeddb',
    'cafe-pos.db',
    'backups',
    '.license',
    'security'
  ];

  const cacheDirs = [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnCache',
    'DawnWebGPUCache',
    'Service Worker',
    'blob_storage',
    'Session Storage',    // Session-only data, safe to clear
    'Crashpad',
  ];

  let cleaned = 0;
  for (const dirName of cacheDirs) {
    if (PROTECTED_NAMES.includes(dirName.toLowerCase())) continue;
    const dirPath = path.join(userDataPath, dirName);
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        cleaned++;
        console.log(`[Updater] Cleaned cache: ${dirName}`);
      }
    } catch (err) {
      console.warn(`[Updater] Could not clean ${dirName}:`, err.message);
    }
  }

  // Also clean individual transient cache files (preserving user preferences and local data)
  const cacheFiles = [
    'Network Persistent State',
    'TransportSecurity',
  ];

  for (const fileName of cacheFiles) {
    if (PROTECTED_NAMES.includes(fileName.toLowerCase())) continue;
    const filePath = path.join(userDataPath, fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Updater] Cleaned cache file: ${fileName}`);
        cleaned++;
      }
    } catch (_) {}
  }

  return cleaned;
}

/**
 * Reads the stored version metadata from previous run
 */
function getStoredVersion(userDataPath) {
  const metaPath = path.join(userDataPath, '.app-version.json');
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
  } catch (_) {}
  return null;
}

/**
 * Saves current version metadata for next run comparison
 */
function saveVersionMetadata(userDataPath, version, exePath) {
  const metaPath = path.join(userDataPath, '.app-version.json');
  const metadata = {
    version,
    exePath,
    exeSize: 0,
    exeModified: null,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (fs.existsSync(exePath)) {
      const stat = fs.statSync(exePath);
      metadata.exeSize = stat.size;
      metadata.exeModified = stat.mtimeMs;
    }
  } catch (_) {}

  try {
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Updater] Could not save version metadata:', err.message);
  }
}

/**
 * Main update check — runs at app startup BEFORE creating any windows
 * 
 * Logic:
 * 1. Compare current exe version with stored version from last run
 * 2. If version changed (or exe file changed), clean all caches
 * 3. Save current version metadata for next comparison
 * 
 * Returns: { updated: boolean, fromVersion: string, toVersion: string, cachesCleaned: number }
 */
function checkForUpdate(targetUserDataPath = null) {
  const result = {
    updated: false,
    fromVersion: null,
    toVersion: null,
    cachesCleaned: 0,
    isFirstRun: false,
  };

  try {
    const currentVersion = getCurrentVersion();
    const exePath = process.execPath;
    result.toVersion = currentVersion;

    // Determine userData path
    let userDataPath = targetUserDataPath;
    if (!userDataPath) {
      const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
      if (isPortable) {
        userDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
      } else {
        userDataPath = app.getPath('userData');
      }
    }

    // Ensure data directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    const stored = getStoredVersion(userDataPath);

    if (!stored) {
      // First run ever — just save metadata and clean caches for safety
      result.isFirstRun = true;
      result.cachesCleaned = cleanCaches(userDataPath);
      try {
        if (app && app.getPath('appData')) {
          cleanCaches(path.join(app.getPath('appData'), 'TaqfeelaPOS'));
        }
      } catch (_) {}
      saveVersionMetadata(userDataPath, currentVersion, exePath);
      console.log(`[Updater] First run detected. Version: ${currentVersion}. Cleaned ${result.cachesCleaned} cache dirs.`);
      return result;
    }

    result.fromVersion = stored.version;

    // Check if version changed
    const versionChanged = compareVersions(currentVersion, stored.version) !== 0;

    // Check if exe file itself changed (same version but rebuilt)
    let exeChanged = false;
    try {
      if (fs.existsSync(exePath)) {
        const stat = fs.statSync(exePath);
        exeChanged = (stat.size !== stored.exeSize) || (stat.mtimeMs !== stored.exeModified);
      }
    } catch (_) {}

    // Check if exe path changed (portable moved to different location)
    const pathChanged = stored.exePath !== exePath;

    if (versionChanged || exeChanged || pathChanged) {
      result.updated = true;
      result.cachesCleaned = cleanCaches(userDataPath);
      try {
        if (app && app.getPath('appData')) {
          cleanCaches(path.join(app.getPath('appData'), 'TaqfeelaPOS'));
        }
      } catch (_) {}
      saveVersionMetadata(userDataPath, currentVersion, exePath);

      const reason = versionChanged ? 'version' : exeChanged ? 'exe-file' : 'exe-path';
      console.log(`[Updater] Update detected (${reason}): ${stored.version} → ${currentVersion}. Cleaned ${result.cachesCleaned} cache dirs.`);
    } else {
      // No update — just ensure metadata is fresh
      saveVersionMetadata(userDataPath, currentVersion, exePath);
    }

  } catch (err) {
    console.error('[Updater] Update check failed (non-fatal):', err);
  }

  return result;
}

/**
 * Checks if there's a NEWER portable exe in the same directory as the current one.
 * If found, launches it and quits the current instance.
 * 
 * This handles the scenario: user drops new TaqfeelaPOS-Portable-x64.exe
 * next to the old one, but double-clicks the OLD exe by mistake.
 * 
 * Detection: Looks for exe files matching TaqfeelaPOS pattern that are:
 * - Newer (by modification time)
 * - Different from current exe
 * - In the same directory
 */
function checkForNewerExe() {
  try {
    if (!app.isPackaged) return null; // Dev mode, skip

    const currentExe = process.execPath;
    const currentDir = path.dirname(currentExe);
    const currentName = path.basename(currentExe).toLowerCase();
    const currentVersion = getCurrentVersion();

    // Security Hardening: NEVER auto-discover/spawn executables from shared untrusted directories
    // (e.g. Downloads, Temp, Desktop) where an attacker or browser download could drop a Trojan exe.
    const normDir = path.resolve(currentDir).toLowerCase();
    const untrustedSegments = ['\\downloads', '\\temp', '\\tmp', '\\desktop', '\\appdata\\local\\temp'];
    if (untrustedSegments.some(seg => normDir.endsWith(seg) || normDir.includes(seg + '\\'))) {
      return null;
    }

    const files = fs.readdirSync(currentDir);
    const STRICT_PORTABLE_REGEX = /^taqfeelapos-portable-(\d+\.\d+\.\d+)(?:-(?:x64|ia32))?\.exe$/i;

    // Look strictly for official TaqfeelaPOS-Portable-<semver>*.exe with a strictly HIGHER semver
    const candidates = files
      .map(f => {
        const lower = f.toLowerCase();
        if (lower === currentName) return null;
        const match = f.match(STRICT_PORTABLE_REGEX);
        if (!match) return null;
        const candidateVersion = match[1];
        if (compareVersions(candidateVersion, currentVersion) <= 0) return null;

        const fullPath = path.join(currentDir, f);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) return null;
          return { name: f, path: fullPath, version: candidateVersion, mtimeMs: stat.mtimeMs, size: stat.size };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => compareVersions(b.version, a.version) || (b.mtimeMs - a.mtimeMs));

    if (candidates.length > 0) {
      return candidates[0]; // Return the highest strictly-newer official candidate
    }
  } catch (err) {
    console.warn('[Updater] Newer exe check failed (non-fatal):', err.message);
  }
  return null;
}

module.exports = {
  checkForUpdate,
  checkForNewerExe,
  cleanCaches,
  getCurrentVersion,
  compareVersions,
};
