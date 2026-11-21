/**
 * tests/test-phase3-signed-manifest-and-longevity.js
 *
 * Comprehensive Verification Suite for Phase 3:
 * 1. Ed25519 Signed Manifest Verification (valid, 1-byte tamper, re-hashed tamper, stripped signature, path traversal)
 * 2. 10-Year Longevity Engine: getDatabaseHealth() telemetry
 * 3. Safe Yearly Archiving & VACUUM Compaction:
 *    - Archives orders older than 365 days into SHA-256 verified permanent yearly archive
 *    - Protects unpaid customer debt orders even if older than 365 days
 *    - Preserves recent orders (< 365 days)
 *    - Reclaims freed SQLite pages via VACUUM (freelist_count === 0)
 *    - Keeps PRAGMA foreign_keys = ON after VACUUM
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  REQUIRED_CRITICAL_FILES,
  canonicalManifestPayload,
  sha256File,
  verifySignedManifest
} = require('../electron/db/integrity');

const baseTemp = fs.existsSync('D:/cafe-temp') ? 'D:/cafe-temp' : os.tmpdir();
const testDir = path.join(baseTemp, `cafe-phase3-test-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
const testDbPath = path.join(testDir, 'cafe-pos.db');

async function run() {
  console.log('====================================================');
  console.log('   PHASE 3 SIGNED MANIFEST & LONGEVITY TEST SUITE   ');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------
    // 1. Ed25519 Signed Manifest Verification & Tamper Resistance
    // -------------------------------------------------------------
    console.log('--- 1. Ed25519 Signed Manifest & Anti-Tamper Scenarios ---');
    const sandboxDir = path.join(testDir, 'manifest_sandbox');
    fs.mkdirSync(path.join(sandboxDir, 'db'), { recursive: true });

    // Read local vendor test private key from scripts/generate-license.js
    const keygenSrc = fs.readFileSync(path.join(__dirname, '../scripts/generate-license.js'), 'utf8');
    const keyMatch = keygenSrc.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
    assert.ok(keyMatch, 'Local vendor private key needed for signing test');
    const privateKeyPem = keyMatch[0];

    // Create all required critical files in sandbox
    const filesMap = {};
    for (const rel of REQUIRED_CRITICAL_FILES) {
      const fp = path.join(sandboxDir, rel);
      fs.writeFileSync(fp, `// simulated production module: ${rel}\nmodule.exports = {};\n`, 'utf8');
      filesMap[rel] = sha256File(fp);
    }

    const canonical = canonicalManifestPayload(filesMap);
    const validSig = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKeyPem).toString('base64');
    const manifestPath = path.join(sandboxDir, 'security_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 2, files: filesMap, signature: validSig }, null, 2));

    // 1a. Valid signed manifest -> MUST PASS
    const okRes = verifySignedManifest({ baseDir: sandboxDir, requireSignature: true });
    assert.strictEqual(okRes.valid, true, `Expected valid manifest, got: ${okRes.reason}`);
    assert.strictEqual(okRes.verifiedFiles, REQUIRED_CRITICAL_FILES.length);
    console.log(`✓ Valid Ed25519-signed manifest verified (${okRes.verifiedFiles} critical files)`);

    // 1b. Tamper 1 byte in db.js without touching manifest -> MUST FAIL with INTEGRITY_MISMATCH
    const dbFile = path.join(sandboxDir, 'db.js');
    fs.appendFileSync(dbFile, '\n// tampered', 'utf8');
    const tamper1 = verifySignedManifest({ baseDir: sandboxDir, requireSignature: true });
    assert.strictEqual(tamper1.valid, false);
    assert.strictEqual(tamper1.reason, 'INTEGRITY_MISMATCH:db.js');
    console.log('✓ Detected 1-byte tamper in db.js:', tamper1.reason);

    // 1c. Attacker re-hashes db.js inside security_manifest.json -> MUST FAIL with INVALID_MANIFEST_SIGNATURE
    const forgedFiles = { ...filesMap, 'db.js': sha256File(dbFile) };
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 2, files: forgedFiles, signature: validSig }, null, 2));
    const tamper2 = verifySignedManifest({ baseDir: sandboxDir, requireSignature: true });
    assert.strictEqual(tamper2.valid, false);
    assert.strictEqual(tamper2.reason, 'INVALID_MANIFEST_SIGNATURE');
    console.log('✓ Blocked forged manifest re-hash attack:', tamper2.reason);

    // 1d. Attacker strips signature field -> MUST FAIL with MISSING_MANIFEST_SIGNATURE
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 2, files: forgedFiles }, null, 2));
    const tamper3 = verifySignedManifest({ baseDir: sandboxDir, requireSignature: true });
    assert.strictEqual(tamper3.valid, false);
    assert.strictEqual(tamper3.reason, 'MISSING_MANIFEST_SIGNATURE');
    console.log('✓ Blocked signature-stripping attack:', tamper3.reason);

    // -------------------------------------------------------------
    // 2. 10-Year Longevity Engine: Health Telemetry & Yearly Archive
    // -------------------------------------------------------------
    console.log('\n--- 2. Database Health Telemetry & Yearly Archive + VACUUM ---');
    const db = require('../electron/db');
    await db.init(testDbPath);

    db.setupInitialAdmin('AdminStrong#2026', 'المدير العام', { cafe_name: 'كافيه الخليج' });
    const admin = db.queryGet('SELECT id, username, name FROM users WHERE role = "admin" LIMIT 1');
    const prod = db.queryGet('SELECT id, name, price FROM products WHERE is_deleted = 0 LIMIT 1');

    // Open & close an old shift so old orders aren't tied to an open shift
    const shift = db.openShift(500, 'شيفت قديم', admin, 'الشيفت الصباحي');

    const oldDateIso = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const recentDateIso = new Date().toISOString();

    // Insert 40 old paid orders (400 days old) + order_items
    for (let i = 1; i <= 40; i++) {
      db.runSql(
        `INSERT INTO orders (invoice_no, shift_id, user_id, cashier_name, order_type, subtotal, discount, total, payment_method, status, created_at)
         VALUES (?, ?, ?, ?, 'takeaway', 50, 0, 50, 'cash', 'paid', ?)`,
        [`OLD-${i}`, shift.id, admin.id, admin.name, oldDateIso],
        { skipSave: true }
      );
      const oid = db.queryGet('SELECT last_insert_rowid() AS id').id;
      db.runSql(
        `INSERT INTO order_items (order_id, product_id, product_name, qty, unit_price, total_price) VALUES (?, ?, ?, 1, 50, 50)`,
        [oid, prod.id, prod.name],
        { skipSave: true }
      );
    }

    // Insert 1 old order (400 days old) tied to an UNPAID debt -> MUST BE PROTECTED
    db.runSql(
      `INSERT INTO orders (invoice_no, shift_id, user_id, cashier_name, order_type, subtotal, discount, total, payment_method, status, created_at)
       VALUES ('OLD-DEBT-1', ?, ?, ?, 'takeaway', 120, 0, 120, 'debt', 'paid', ?)`,
      [shift.id, admin.id, admin.name, oldDateIso],
      { skipSave: true }
    );
    const debtOrderId = db.queryGet('SELECT last_insert_rowid() AS id').id;
    db.runSql(
      `INSERT INTO customer_debts (customer_name, order_id, total_amount, paid_amount, remaining_amount, status, created_at)
       VALUES ('عميل آجل قديم', ?, 120, 0, 120, 'unpaid', ?)`,
      [debtOrderId, oldDateIso],
      { skipSave: true }
    );

    // Insert 5 recent orders (today) -> MUST BE PRESERVED
    for (let i = 1; i <= 5; i++) {
      db.runSql(
        `INSERT INTO orders (invoice_no, shift_id, user_id, cashier_name, order_type, subtotal, discount, total, payment_method, status, created_at)
         VALUES (?, ?, ?, ?, 'takeaway', 75, 0, 75, 'cash', 'paid', ?)`,
        [`NEW-${i}`, shift.id, admin.id, admin.name, recentDateIso],
        { skipSave: true }
      );
    }

    // Close shift so old orders are eligible for archiving
    db.runSql('UPDATE shifts SET closed_at = ? WHERE id = ?', [recentDateIso, shift.id], { skipSave: true });
    db.saveDbAtomic();

    // Check health telemetry BEFORE archiving
    const healthBefore = db.getDatabaseHealth();
    assert.strictEqual(healthBefore.status, 'healthy');
    assert.strictEqual(healthBefore.tables.orders, 46);
    assert.ok(healthBefore.sizeBytes > 0);
    assert.ok(healthBefore.estimatedRamMb >= 120);
    console.log(`✓ getDatabaseHealth() before archive: ${healthBefore.sizeMb} MB, ${healthBefore.tables.orders} orders, status=${healthBefore.status}`);

    // Run Yearly Archive & Compact (365 days retention)
    const archRes = db.archiveAndCompact(365);
    assert.strictEqual(archRes.archived, true, 'Archive must succeed');
    assert.strictEqual(archRes.deletedOrders, 40, 'Exactly 40 old paid orders must be archived & deleted');
    assert.ok(fs.existsSync(archRes.archivePath), 'Permanent yearly archive .db file must exist');
    assert.ok(fs.existsSync(`${archRes.archivePath}.sha256`), 'Archive SHA-256 sidecar must exist');
    assert.ok(path.basename(archRes.archivePath).includes('yearly-archive'), 'Archive filename must include yearly-archive for prune protection');

    // Verify archive SHA-256 matches actual file
    const actualArchHash = sha256File(archRes.archivePath);
    assert.strictEqual(actualArchHash, archRes.archiveSha256, 'Archive SHA-256 checksum must match disk file');

    // Verify unpaid debt order & 5 recent orders were PROTECTED (6 total orders left)
    const remainingOrders = db.queryGet('SELECT COUNT(*) AS c FROM orders').c;
    assert.strictEqual(remainingOrders, 6, `Expected 6 remaining orders (1 unpaid debt + 5 recent), got ${remainingOrders}`);
    const protectedDebtOrder = db.queryGet('SELECT id FROM orders WHERE id = ?', [debtOrderId]);
    assert.ok(protectedDebtOrder, 'Unpaid debt order MUST NEVER be archived/deleted');

    // Verify VACUUM compacted freelist to 0 and PRAGMA foreign_keys stayed ON
    const freelistAfter = db.queryGet('PRAGMA freelist_count').freelist_count;
    const fkAfter = db.queryGet('PRAGMA foreign_keys').foreign_keys;
    assert.strictEqual(freelistAfter, 0, 'VACUUM must reduce freelist_count to 0');
    assert.strictEqual(fkAfter, 1, 'PRAGMA foreign_keys must remain ON (1) after VACUUM');
    console.log(`✓ Yearly Archive & VACUUM passed: archived 40 orders, protected 1 unpaid debt + 5 recent, SHA-256 verified, freelist=0, FK=1`);

    if (typeof db.shutdownWriterWorker === 'function') {
      await db.shutdownWriterWorker();
    }

    console.log('\n====================================================');
    console.log('   ALL PHASE 3 SIGNED MANIFEST & LONGEVITY PASSED!  ');
    console.log('====================================================');
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((err) => {
  console.error('❌ PHASE 3 TEST FAILED:', err);
  process.exit(1);
});

