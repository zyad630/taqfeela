#!/usr/bin/env node
/**
 * scripts/setup-key-vault.js
 *
 * External Vendor Key Vault Manager (keeps Ed25519 Private Key OUTSIDE the Git repository).
 *
 * Vault location: %USERPROFILE%\.taqfeela-vault\vendor-private.pem
 * Env override:   TAQFEELA_SIGNING_KEY (PEM string) or TAQFEELA_SIGNING_KEY_FILE (file path)
 *
 * Usage:
 *   node scripts/setup-key-vault.js --status        Show where the signing key is loaded from
 *   node scripts/setup-key-vault.js --generate-new  Generate a brand-new Production Ed25519 keypair in external vault
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VAULT_DIR = path.join(os.homedir(), '.taqfeela-vault');
const DEFAULT_VAULT_KEY_PATH = path.join(VAULT_DIR, 'vendor-private.pem');

function loadVendorPrivateKey() {
  // 1. Environment variable (highest priority — CI/CD secrets)
  if (process.env.TAQFEELA_SIGNING_KEY && process.env.TAQFEELA_SIGNING_KEY.includes('BEGIN PRIVATE KEY')) {
    return {
      source: 'env:TAQFEELA_SIGNING_KEY',
      pem: process.env.TAQFEELA_SIGNING_KEY.replace(/\\n/g, '\n').trim()
    };
  }

  // 2. Explicit key file path via env
  if (process.env.TAQFEELA_SIGNING_KEY_FILE && fs.existsSync(process.env.TAQFEELA_SIGNING_KEY_FILE)) {
    return {
      source: `file:${process.env.TAQFEELA_SIGNING_KEY_FILE}`,
      pem: fs.readFileSync(process.env.TAQFEELA_SIGNING_KEY_FILE, 'utf8').trim()
    };
  }

  // 3. External User Vault (%USERPROFILE%\.taqfeela-vault\vendor-private.pem) — OUTSIDE repo
  if (fs.existsSync(DEFAULT_VAULT_KEY_PATH)) {
    return {
      source: `vault:${DEFAULT_VAULT_KEY_PATH}`,
      pem: fs.readFileSync(DEFAULT_VAULT_KEY_PATH, 'utf8').trim()
    };
  }

  // 4. Legacy local dev fallback (scripts/generate-license.js) — ONLY when vault not initialized yet
  const legacyPath = path.join(__dirname, 'generate-license.js');
  if (fs.existsSync(legacyPath)) {
    const src = fs.readFileSync(legacyPath, 'utf8');
    const m = src.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
    if (m) {
      return {
        source: 'legacy:scripts/generate-license.js',
        pem: m[0].trim()
      };
    }
  }

  return { source: null, pem: null };
}

function generateNewProductionKeypair() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const newPrivatePath = path.join(VAULT_DIR, `vendor-private-prod-${ts}.pem`);
  const newPublicPath = path.join(VAULT_DIR, `vendor-public-prod-${ts}.pem`);

  fs.writeFileSync(newPrivatePath, privateKey, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(newPublicPath, publicKey, { encoding: 'utf8', mode: 0o644 });

  console.log('\n==============================================================');
  console.log('  🔐 Brand-New Production Ed25519 Keypair Generated (Vault)');
  console.log('==============================================================');
  console.log(`  Private Key (SECRET — KEEP SAFE): ${newPrivatePath}`);
  console.log(`  Public Key  (SAFE FOR APP CODE) : ${newPublicPath}`);
  console.log('\n  Public Key PEM to add to TRUSTED_PUBLIC_KEYS in electron/db/licensing.js:\n');
  console.log(publicKey.trim());
  console.log('\n  To activate this key as your default build/keygen signer:');
  console.log(`  Copy it to: ${DEFAULT_VAULT_KEY_PATH}`);
  console.log('  (And NEVER copy the private .pem into your project folder or Git!)');
  console.log('==============================================================\n');

  return { newPrivatePath, newPublicPath, publicKey, privateKey };
}

if (require.main === module) {
  const arg = process.argv[2] || '--status';
  if (arg === '--generate-new') {
    generateNewProductionKeypair();
  } else {
    const info = loadVendorPrivateKey();
    console.log('Vault directory :', VAULT_DIR);
    console.log('Active key src  :', info.source || 'NONE (not configured)');
  }
}

module.exports = {
  VAULT_DIR,
  DEFAULT_VAULT_KEY_PATH,
  loadVendorPrivateKey,
  generateNewProductionKeypair
};

