/**
 * electron/db/licensing.js
 *
 * Modular Hardware-Locked Ed25519 Licensing & Vendor Authentication Engine.
 * Supports Dual-Key Rotation (TRUSTED_PUBLIC_KEYS) so a new Production Ed25519 keypair
 * can be deployed for worldwide/Gulf customers without invalidating legacy licenses.
 */

'use strict';

const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

// Primary Production Public Key (Ed25519)
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlSMvRI0fogs2B3YdBEsixui2eo0JmMHB6eSG5ZjWmj4=
-----END PUBLIC KEY-----`;

// Key Rotation List:
// To rotate to a new Production Keypair without breaking existing customers:
// 1. Run: node scripts/setup-key-vault.js --generate-new
// 2. Add the printed PUBLIC KEY PEM as the FIRST element in TRUSTED_PUBLIC_KEYS below.
// 3. All new licenses & manifests will be signed with the new private key stored outside the repo,
//    while legacy customers signed with the older key continue working seamlessly.
const TRUSTED_PUBLIC_KEYS = [
  PUBLIC_KEY_PEM
];

function verifyEd25519AnyTrustedKey(dataUtf8, signatureBase64) {
  if (!dataUtf8 || !signatureBase64 || typeof signatureBase64 !== 'string') return false;
  const cleanSig = signatureBase64.trim().replace(/\s+/g, '');
  if (!cleanSig) return false;

  let sigBuf;
  try {
    sigBuf = Buffer.from(cleanSig, 'base64');
    if (sigBuf.length === 0) return false;
  } catch (_) {
    return false;
  }

  const dataBuf = Buffer.from(String(dataUtf8), 'utf8');
  for (const pubPem of TRUSTED_PUBLIC_KEYS) {
    try {
      if (crypto.verify(null, dataBuf, pubPem, sigBuf)) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

function getMachineId() {
  let machineGuid = '';
  try {
    if (process.platform === 'win32') {
      // Use /reg:64 so that 32-bit processes under WOW64 read the exact same 64-bit MachineGuid
      let output = '';
      try {
        output = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid /reg:64', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (_) {
        // Fallback for native 32-bit Windows (e.g. Windows 7 32-bit where /reg:64 is invalid)
        output = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      }
      const match = output.match(/MachineGuid\s+REG_SZ\s+([a-f0-9\-]+)/i);
      if (match) machineGuid = match[1];
    }
  } catch (_) {}

  if (!machineGuid) {
    const normArch = (os.arch() === 'ia32' || os.arch() === 'x64') ? 'x86_family' : os.arch();
    machineGuid = `${os.hostname()}-${os.platform()}-${normArch}-${os.cpus()[0]?.model || ''}`;
  }

  return crypto.createHash('sha256').update(machineGuid).digest('hex').substring(0, 16).toUpperCase();
}

function parseLicenseKey(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') return null;
  const clean = licenseKey.trim().replace(/\r?\n|\r/g, '');
  const dateMatch = clean.match(/^(\d{4}-\d{2}-\d{2}):(.+)$/);
  if (dateMatch) {
    return { type: 'expiry', expiresAt: dateMatch[1], signature: dateMatch[2].trim() };
  }
  return { type: 'permanent', signature: clean };
}

function verifyLicenseKey(licenseKey, { getCairoTodayString, getLatestSystemTimestamp } = {}) {
  if (!licenseKey || typeof licenseKey !== 'string') return { valid: false, expired: false };
  const parsed = parseLicenseKey(licenseKey);
  if (!parsed) return { valid: false, expired: false };

  const machineId = getMachineId();

  try {
    if (parsed.type === 'expiry') {
      const signData = `${machineId}|${parsed.expiresAt}`;
      const sigValid = verifyEd25519AnyTrustedKey(signData, parsed.signature);
      if (!sigValid) return { valid: false, expired: false };

      // Check expiry against BOTH current local date AND highest recorded system timestamp
      // so rolling back Windows clock cannot revive an expired time-limited license.
      const today = typeof getCairoTodayString === 'function' ? getCairoTodayString() : new Date().toISOString().slice(0, 10);
      let effectiveDate = today;
      try {
        const latestTs = typeof getLatestSystemTimestamp === 'function' ? getLatestSystemTimestamp() : null;
        if (latestTs && typeof latestTs === 'string') {
          const latestDateStr = latestTs.slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(latestDateStr) && latestDateStr > effectiveDate) {
            effectiveDate = latestDateStr;
          }
        }
      } catch (_) {}
      const expired = effectiveDate > parsed.expiresAt;
      return { valid: true, expired, expiresAt: parsed.expiresAt };
    } else {
      const sigValid = verifyEd25519AnyTrustedKey(machineId, parsed.signature);
      return { valid: sigValid, expired: false, expiresAt: null };
    }
  } catch (_) {
    return { valid: false, expired: false };
  }
}

function verifyVendorPassword(password) {
  if (!password || typeof password !== 'string' || !password.trim()) return false;
  const machineId = getMachineId();
  return verifyEd25519AnyTrustedKey(`VENDOR_DEV|${machineId}`, password);
}

function verifyAdminResetCode(masterPin) {
  if (!masterPin || typeof masterPin !== 'string' || !masterPin.trim()) return false;
  const machineId = getMachineId();
  if (verifyEd25519AnyTrustedKey(`RESET_ADMIN|${machineId}`, masterPin)) return true;
  return verifyEd25519AnyTrustedKey(`UNLOCK_TAMPER|${machineId}`, masterPin);
}

module.exports = {
  PUBLIC_KEY_PEM,
  TRUSTED_PUBLIC_KEYS,
  verifyEd25519AnyTrustedKey,
  getMachineId,
  parseLicenseKey,
  verifyLicenseKey,
  verifyVendorPassword,
  verifyAdminResetCode
};

