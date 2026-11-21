/**
 * Test Item 10: Cairo DST Owner Controls (auto, enabled, disabled, custom) & Settings Persistence
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

async function run() {
  console.log('--- STARTING DST OWNER CONTROLS TEST ---');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-dst-ctrl-'));
  const testDbPath = path.join(tempDir, 'cafe-pos.db');
  process.env.TEST_DB_PATH = testDbPath;
  process.env.CAFE_DATA_DIR = tempDir;

  const db = require('../electron/db');
  await db.init(testDbPath);

  // 1. Default mode: 'auto' (Egyptian Law 24/2023)
  const setts0 = db.getSettings();
  assert.strictEqual(setts0.dst_mode, 'auto', 'Default dst_mode should be auto');

  // Verify Law 24/2023 transition boundaries in 2026
  const beforeStart = new Date('2026-04-23T21:59:00Z');
  const afterStart = new Date('2026-04-23T22:01:00Z');
  assert.strictEqual(db.isEgyptDST(beforeStart), false, '2026-04-23 21:59Z is winter');
  assert.strictEqual(db.isEgyptDST(afterStart), true, '2026-04-23 22:01Z is summer');

  const beforeEnd = new Date('2026-10-29T20:59:00Z');
  const afterEnd = new Date('2026-10-29T21:01:00Z');
  assert.strictEqual(db.isEgyptDST(beforeEnd), true, '2026-10-29 20:59Z is summer');
  assert.strictEqual(db.isEgyptDST(afterEnd), false, '2026-10-29 21:01Z is winter');
  console.log('✓ 1. Auto mode (Law 24/2023) verified at exact boundaries');

  // 2. Owner sets dst_mode = 'enabled' (Forced summer all year)
  db.saveSettings({ dst_mode: 'enabled' });
  const setts1 = db.getSettings();
  assert.strictEqual(setts1.dst_mode, 'enabled');

  const winterDate = new Date('2026-01-15T12:00:00Z');
  assert.strictEqual(db.isEgyptDST(winterDate), true, 'Forced enabled must return true in winter');
  console.log('✓ 2. Forced enabled mode verified (always true)');

  // 3. Owner sets dst_mode = 'disabled' (Forced winter all year)
  db.saveSettings({ dst_mode: 'disabled' });
  const setts2 = db.getSettings();
  assert.strictEqual(setts2.dst_mode, 'disabled');

  const summerDate = new Date('2026-07-15T12:00:00Z');
  assert.strictEqual(db.isEgyptDST(summerDate), false, 'Forced disabled must return false in summer');
  console.log('✓ 3. Forced disabled mode verified (always false)');

  // 4. Owner sets dst_mode = 'custom'
  db.saveSettings({
    dst_mode: 'custom',
    dst_custom_start: '2026-06-01T00:00:00.000Z',
    dst_custom_end: '2026-08-01T00:00:00.000Z'
  });
  const setts3 = db.getSettings();
  assert.strictEqual(setts3.dst_mode, 'custom');
  assert.strictEqual(setts3.dst_custom_start, '2026-06-01T00:00:00.000Z');
  assert.strictEqual(setts3.dst_custom_end, '2026-08-01T00:00:00.000Z');

  const dateMay = new Date('2026-05-15T12:00:00Z');
  const dateJune = new Date('2026-06-15T12:00:00Z');
  const dateAugust = new Date('2026-08-15T12:00:00Z');

  assert.strictEqual(db.isEgyptDST(dateMay), false, 'May is outside custom DST window');
  assert.strictEqual(db.isEgyptDST(dateJune), true, 'June is inside custom DST window');
  assert.strictEqual(db.isEgyptDST(dateAugust), false, 'August is outside custom DST window');
  console.log('✓ 4. Custom mode verified with user-specified date ranges');

  // 5. Restore auto
  db.saveSettings({ dst_mode: 'auto' });
  assert.strictEqual(db.getSettings().dst_mode, 'auto');
  console.log('✓ 5. Restored auto mode');

  // Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('--- ALL DST OWNER CONTROLS TESTS PASSED (GREEN) ---');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
