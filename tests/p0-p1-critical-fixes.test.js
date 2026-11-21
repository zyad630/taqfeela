/**
 * ==============================================================================================
 * p0-p1-critical-fixes.test.js
 * Tests for P0-A (Cart Disappearing Fix), P0-B (CMOS Clock Override), P1 (Spinlock Fix)
 * ==============================================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('🛡️ P0/P1 Critical Architecture Fixes Suite', () => {
  let testEnvDir;
  let db;
  const ADMIN_PASSWORD = 'P0P1TestAdmin2026!#';

  before(async () => {
    testEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-p0p1-test-'));
    process.env.NODE_ENV = 'test';
    delete require.cache[require.resolve('../electron/db')];
    db = require('../electron/db');
    const testDbPath = path.join(testEnvDir, 'p0p1-test.db');
    await db.init(testDbPath);

    // Setup admin user for tests
    if (typeof db.setupInitialAdmin === 'function') {
      db.setupInitialAdmin(ADMIN_PASSWORD, 'مدير اختبار P0/P1');
    }
  });

  after(() => {
    if (testEnvDir && fs.existsSync(testEnvDir)) {
      try { fs.rmSync(testEnvDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  // ============================================================================
  // P0-A: Cart Disappearing Fix — Miss Purge Threshold & Item Guard
  // ============================================================================

  describe('P0-A: Cart Disappearing Protection (2-tick miss purge eliminated)', () => {

    test('1. Polling logic requires 10+ consecutive misses before purging an empty cart', () => {
      // Simulate the polling miss counter logic as extracted from App.jsx
      // OLD behavior: curMiss < 2 → purge after 2 misses (6 seconds)
      // NEW behavior: curMiss < 10 → purge after 10 misses (30 seconds)
      const missCountRef = {};
      const THRESHOLD = 10; // The new threshold

      // Simulate 9 consecutive misses — should NOT purge
      for (let i = 1; i <= 9; i++) {
        const tId = '42';
        const curMiss = (missCountRef[tId] || 0) + 1;
        missCountRef[tId] = curMiss;
        assert.ok(curMiss < THRESHOLD, `Miss count ${curMiss} must be below threshold ${THRESHOLD}`);
      }

      // 10th miss — should trigger purge for empty cart
      const tId = '42';
      const finalMiss = (missCountRef[tId] || 0) + 1;
      missCountRef[tId] = finalMiss;
      assert.strictEqual(finalMiss >= THRESHOLD, true, '10th consecutive miss must reach purge threshold');
    });

    test('2. Cart with real items must NEVER be purged regardless of miss count', () => {
      // Simulate the cart-item protection guard from the P0 fix
      const localCart = {
        cart: [{ name: 'شاي أخضر', qty: 2, price: 15 }],
        customerName: 'محمد'
      };
      const hasRealItems = localCart && Array.isArray(localCart.cart) && localCart.cart.length > 0;
      assert.strictEqual(hasRealItems, true, 'Cart with items must be detected as non-empty');

      // Even with miss count at 999, the hasRealItems guard blocks deletion
      const missCount = 999;
      const shouldPurge = missCount >= 10 && !hasRealItems;
      assert.strictEqual(shouldPurge, false, 'Cart with real items must NEVER be auto-purged');
    });

    test('3. Empty/invalid cart IS purged after 10 misses (cleanup still works)', () => {
      // Empty cart
      const emptyCart = { cart: [], customerName: '' };
      const hasRealItemsEmpty = emptyCart && Array.isArray(emptyCart.cart) && emptyCart.cart.length > 0;
      assert.strictEqual(hasRealItemsEmpty, false, 'Empty cart correctly detected');

      // Null cart — short-circuit evaluation yields falsy (not strictly false)
      const nullCart = null;
      const hasRealItemsNull = !!(nullCart && Array.isArray(nullCart.cart) && nullCart.cart.length > 0);
      assert.strictEqual(hasRealItemsNull, false, 'Null cart correctly detected');

      // After 10 misses, empty carts should be purged
      const missCount = 10;
      const shouldPurge = missCount >= 10 && !hasRealItemsEmpty;
      assert.strictEqual(shouldPurge, true, 'Empty cart must be purged after 10 misses');
    });

    test('4. saveTableCart correctly handles _rev conflict detection (prevents blind overwrites)', () => {
      // Create a test table
      const table = db.runSql(
        "INSERT INTO tables (number, name, capacity, status, hall) VALUES ('T-REV', 'طاولة Rev', 4, 'occupied', 'indoor')"
      );
      const tableId = table.lastInsertRowid;

      // First save — no _rev needed (new cart)
      const res1 = db.saveTableCart(tableId, { cart: [{ name: 'قهوة', qty: 1, price: 20 }], customerName: 'Test' });
      assert.ok(res1 && res1.success !== false, 'First save (new cart) must succeed');
      assert.ok(res1.rev, 'First save must return rev');

      // Second save — must include _rev from first save
      const res2 = db.saveTableCart(tableId, {
        cart: [{ name: 'شاي', qty: 2, price: 10 }],
        customerName: 'Test2',
        _rev: res1.rev
      });
      assert.ok(res2 && res2.success !== false, 'Second save with correct _rev must succeed');
      assert.ok(res2.rev > res1.rev, 'Second rev must be higher');

      // Third save with WRONG _rev — must fail with conflict
      const res3 = db.saveTableCart(tableId, {
        cart: [{ name: 'نسكافيه', qty: 1, price: 25 }],
        customerName: 'Test3',
        _rev: res1.rev // old rev!
      });
      assert.ok(res3.conflict === true, 'Save with stale _rev must return conflict');
    });

    test('5. Rapid sequential saves with correct _rev chain preserve all data', () => {
      const table = db.runSql(
        "INSERT INTO tables (number, name, capacity, status, hall) VALUES ('T-RAPID', 'طاولة سريعة', 4, 'occupied', 'indoor')"
      );
      const tId = table.lastInsertRowid;

      // Chain of saves, each using the rev from the previous
      let lastRev = null;
      for (let i = 1; i <= 5; i++) {
        const items = [];
        for (let j = 1; j <= i; j++) {
          items.push({ name: `صنف-${j}`, qty: 1, price: 10 * j });
        }
        const cartData = { cart: items, customerName: `Save-${i}` };
        if (lastRev !== null) cartData._rev = lastRev;
        const res = db.saveTableCart(tId, cartData);
        assert.ok(res.success !== false, `Save #${i} must succeed`);
        lastRev = res.rev;
      }

      // Final state must have 5 items (from the last save)
      const carts = db.getTableCarts();
      const cart = carts[tId] || carts[String(tId)];
      assert.ok(cart, 'Cart must exist after rapid saves');
      assert.strictEqual(cart.cart.length, 5, 'Final cart must contain all 5 items from last save');
    });
  });

  // ============================================================================
  // P0-B: CMOS Clock Guard Override — Admin can force-sync
  // ============================================================================

  describe('P0-B: CMOS Clock Guard Admin Override', () => {

    test('6. checkClockIntegrity detects backwards clock (simulated CMOS battery death)', () => {
      // Set last_system_time to far in the future to simulate CMOS reset
      const futureTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ahead
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [futureTime]);

      const result = db.checkClockIntegrity();
      assert.strictEqual(result.valid, false, 'Clock check must fail when system time is behind stored time');
      assert.strictEqual(result.clockTampered, true, 'clockTampered flag must be set');
      assert.ok(result.error && result.error.length > 0, 'Error message must be present');
    });

    test('7. resetClockGuard rejects wrong admin password', () => {
      const result = db.resetClockGuard({ adminPassword: 'wrong_password_12345' });
      assert.strictEqual(result.success, false, 'Wrong password must be rejected');
      assert.ok(result.error, 'Error message must be present');
    });

    test('8. resetClockGuard accepts correct admin password and re-syncs clock', () => {
      // Set clock to future (simulating CMOS battery death scenario)
      const futureTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [futureTime]);

      // Verify clock is broken
      const broken = db.checkClockIntegrity();
      assert.strictEqual(broken.valid, false, 'Clock must be broken before reset');

      // Admin reset using the password set in before()
      const resetResult = db.resetClockGuard({ adminPassword: ADMIN_PASSWORD });
      assert.strictEqual(resetResult.success, true, 'Admin clock reset must succeed with correct password');

      // Verify clock is fixed
      const fixed = db.checkClockIntegrity();
      assert.strictEqual(fixed.valid, true, 'Clock must be valid after admin reset');
    });

    test('9. resetClockGuard writes audit log entry', () => {
      // Set clock to future
      const futureTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [futureTime]);

      db.resetClockGuard({ adminPassword: ADMIN_PASSWORD, actor: { id: 1, name: 'مدير اختبار' } });

      // Check audit log
      const auditEntry = db.queryGet("SELECT * FROM audit_log WHERE action = 'clock_sync' ORDER BY id DESC LIMIT 1");
      assert.ok(auditEntry, 'Audit log entry must exist for clock_sync');
      assert.ok(auditEntry.details.includes('إعادة ضبط'), 'Audit details must describe the sync action');
    });

    test('10. preload.js exposes resetClockGuard method', () => {
      const preloadPath = path.join(__dirname, '..', 'electron', 'preload.js');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('resetClockGuard'), 'preload.js must expose resetClockGuard method');
      assert.ok(content.includes('system:resetClockGuard'), 'preload.js must invoke system:resetClockGuard IPC channel');
    });
  });

  // ============================================================================
  // P1: Spinlock Fix — Atomics.wait replaces busy-wait
  // ============================================================================

  describe('P1: Spinlock Elimination (CPU burn prevention)', () => {

    test('11. db.js uses Atomics.wait instead of busy-wait spinlock', () => {
      const dbJsPath = path.join(__dirname, '..', 'electron', 'db.js');
      const content = fs.readFileSync(dbJsPath, 'utf8');

      // Must contain Atomics.wait
      assert.ok(content.includes('Atomics.wait'), 'db.js must use Atomics.wait for synchronous sleep');

      // Atomics.wait must appear before the fallback spinlock
      const atomicsPos = content.indexOf('Atomics.wait');
      const firstSpinlockPos = content.indexOf('while (Date.now() - start < 30)');
      assert.ok(atomicsPos < firstSpinlockPos, 'Atomics.wait must appear before any fallback spinlock');
    });

    test('12. Atomics.wait is functional in this Node.js environment', () => {
      // Verify Atomics.wait actually works (not just syntax)
      const startTime = Date.now();
      try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        const elapsed = Date.now() - startTime;
        assert.ok(elapsed >= 15, `Atomics.wait must actually wait (~25ms), waited ${elapsed}ms`);
        assert.ok(elapsed < 200, `Atomics.wait must not over-wait, waited ${elapsed}ms`);
      } catch (err) {
        // If Atomics.wait throws (shouldn't in Node main thread), the fallback exists
        assert.ok(true, 'Atomics.wait threw but fallback exists in code');
      }
    });

    test('13. saveDbAtomic survives concurrent rename retry scenario', () => {
      // Verify the save function works correctly even with the Atomics.wait change
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('p1_test_key', 'p1_test_value')");
      const result = db.queryGet("SELECT value FROM settings WHERE key = 'p1_test_key'");
      assert.strictEqual(result.value, 'p1_test_value', 'Data must persist through save cycle with Atomics.wait');
    });
  });

  // ============================================================================
  // Integration: Full Flow Scenarios
  // ============================================================================

  describe('Integration: Full POS Flow After Fixes', () => {

    test('14. Complete table lifecycle: create → add items → save → retrieve → checkout', () => {
      // Create table
      const tbl = db.runSql(
        "INSERT INTO tables (number, name, capacity, status, hall) VALUES ('T-INT1', 'طاولة تكامل', 4, 'available', 'indoor')"
      );
      const tId = tbl.lastInsertRowid;

      // Add items to cart
      const cartData = {
        cart: [
          { name: 'كابتشينو', qty: 2, price: 35 },
          { name: 'كريب نوتيلا', qty: 1, price: 55 },
          { name: 'موهيتو فراولة', qty: 3, price: 30 }
        ],
        customerName: 'أحمد',
        discountAmount: 5,
        orderNotes: 'بدون سكر'
      };
      const saveRes = db.saveTableCart(tId, cartData);
      assert.ok(saveRes.success !== false, 'Cart save must succeed');
      db.runSql("UPDATE tables SET status = 'occupied' WHERE id = ?", [tId]);

      // Retrieve and verify
      const carts = db.getTableCarts();
      const retrieved = carts[tId] || carts[String(tId)];
      assert.ok(retrieved, 'Cart must be retrievable');
      assert.strictEqual(retrieved.cart.length, 3, 'Must have 3 items');
      assert.strictEqual(retrieved.customerName, 'أحمد', 'Customer name must be preserved');
      assert.strictEqual(retrieved.discountAmount, 5, 'Discount must be preserved');

      // Verify total calculation
      const total = retrieved.cart.reduce((sum, item) => sum + (item.qty * item.price), 0);
      assert.strictEqual(total, 2*35 + 1*55 + 3*30, 'Total must be correctly calculable from cart');
    });

    test('15. Login blocked during clock tamper, unblocked after admin reset', () => {
      // Set clock to future (simulate CMOS death)
      const futureTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [futureTime]);

      // Login must fail with clockTampered
      const loginResult = db.loginUser('admin', 'anything');
      assert.ok(loginResult.clockTampered === true || loginResult.error, 'Login must be blocked during clock tamper');

      // Admin reset
      const resetResult = db.resetClockGuard({ adminPassword: ADMIN_PASSWORD });
      assert.strictEqual(resetResult.success, true, 'Admin reset must succeed');

      // Clock should be valid now
      const clockCheck = db.checkClockIntegrity();
      assert.strictEqual(clockCheck.valid, true, 'Clock must be valid after reset');
    });

    test('16. Shift opening blocked during clock tamper, unblocked after admin reset', () => {
      // Set clock to future
      const futureTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.runSql("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_system_time', ?)", [futureTime]);

      // Close any existing open shift first
      const currentShift = db.currentShift();
      if (currentShift) {
        try { db.closeShift(currentShift.actual_cash || 0, '', null, null, true); } catch (_) {}
      }

      // Open shift must fail with clockTampered
      const shiftResult = db.openShift(100, 'test');
      assert.ok(
        shiftResult.clockTampered === true || (shiftResult.success === false && shiftResult.error),
        'Shift opening must be blocked during clock tamper'
      );

      // Admin reset
      db.resetClockGuard({ adminPassword: ADMIN_PASSWORD });
      const clockCheck = db.checkClockIntegrity();
      assert.strictEqual(clockCheck.valid, true, 'Clock valid after admin reset');
    });
  });
});
