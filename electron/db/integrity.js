/**
 * electron/db/integrity.js
 *
 * Cryptographic Manifest & Anti-Tamper Integrity Verification (Ed25519 + SHA-256).
 * Single source of truth for verifying critical production files and signed security_manifest.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PUBLIC_KEY_PEM, verifyEd25519AnyTrustedKey } = require('./licensing');

const REQUIRED_CRITICAL_FILES = [
  'preload.js',
  'security.js',
  'db.js',
  'mobileApi.js',
  'finance.js',
  'updater.js',
  'db/licensing.js',
  'db/integrity.js',
  'db/health.js'
];

/**
 * Produces a deterministic canonical string from the manifest files map
 * so Ed25519 signatures are identical across platforms and Node versions.
 */
function canonicalManifestPayload(filesMap) {
  const keys = Object.keys(filesMap || {}).sort();
  const lines = keys.map((k) => `${k}:${String(filesMap[k]).trim().toLowerCase()}`);
  return `TAQFEELA_MANIFEST_V2\n${lines.join('\n')}`;
}

/**
 * Computes SHA-256 hex digest of a file on disk.
 */
function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Verifies security_manifest.json signature (Ed25519) AND SHA-256 hashes of all listed critical files.
 *
 * @param {object} options
 * @param {string} options.baseDir - Directory containing electron files (typically __dirname/..)
 * @param {string} [options.manifestPath] - Path to security_manifest.json
 * @param {boolean} [options.requireSignature=true] - Require valid Ed25519 manifest signature
 * @param {string[]} [options.requiredFiles] - Critical files that MUST be present in manifest & on disk
 * @returns {{ valid: boolean, reason: string|null, verifiedFiles: number }}
 */
function verifySignedManifest({
  baseDir,
  manifestPath = null,
  requireSignature = true,
  requiredFiles = REQUIRED_CRITICAL_FILES
} = {}) {
  try {
    const resolvedManifest = manifestPath || path.join(baseDir, 'security_manifest.json');
    if (!fs.existsSync(resolvedManifest)) {
      return { valid: false, reason: 'MISSING_SECURITY_MANIFEST', verifiedFiles: 0 };
    }

    const manifest = JSON.parse(fs.readFileSync(resolvedManifest, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || !manifest.files || typeof manifest.files !== 'object') {
      return { valid: false, reason: 'MALFORMED_SECURITY_MANIFEST', verifiedFiles: 0 };
    }

    // 1. Verify Ed25519 cryptographic signature over canonical files map
    if (requireSignature || manifest.signature) {
      if (!manifest.signature || typeof manifest.signature !== 'string') {
        return { valid: false, reason: 'MISSING_MANIFEST_SIGNATURE', verifiedFiles: 0 };
      }
      const canonical = canonicalManifestPayload(manifest.files);
      const sigOk = verifyEd25519AnyTrustedKey(canonical, manifest.signature);
      if (!sigOk) {
        return { valid: false, reason: 'INVALID_MANIFEST_SIGNATURE', verifiedFiles: 0 };
      }
    }

    // 2. Verify every required file is listed in manifest
    for (const reqFile of requiredFiles) {
      if (!manifest.files[reqFile]) {
        return { valid: false, reason: `MANIFEST_MISSING_ENTRY:${reqFile}`, verifiedFiles: 0 };
      }
    }

    // 3. Verify SHA-256 of every file listed in manifest
    let verifiedCount = 0;
    for (const [relName, expectedHash] of Object.entries(manifest.files)) {
      // Prevent path traversal inside manifest
      const normalized = path.normalize(relName).replace(/\\/g, '/');
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        return { valid: false, reason: `UNSAFE_MANIFEST_PATH:${relName}`, verifiedFiles: verifiedCount };
      }
      const fullPath = path.join(baseDir, normalized);
      if (!fs.existsSync(fullPath)) {
        return { valid: false, reason: `MISSING_CRITICAL_FILE:${relName}`, verifiedFiles: verifiedCount };
      }
      const actualHash = sha256File(fullPath);
      if (actualHash !== String(expectedHash).trim().toLowerCase()) {
        return { valid: false, reason: `INTEGRITY_MISMATCH:${relName}`, verifiedFiles: verifiedCount };
      }
      verifiedCount++;
    }

    return { valid: true, reason: null, verifiedFiles: verifiedCount };
  } catch (err) {
    return { valid: false, reason: `INTEGRITY_CHECK_ERROR:${err.message || String(err)}`, verifiedFiles: 0 };
  }
}

module.exports = {
  PUBLIC_KEY_PEM,
  REQUIRED_CRITICAL_FILES,
  canonicalManifestPayload,
  sha256File,
  verifySignedManifest
};

