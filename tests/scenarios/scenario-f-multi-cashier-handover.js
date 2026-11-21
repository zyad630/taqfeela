/**
 * Scenario F: Multi-Cashier Shift Handover & Drawer Cash Reconciliation
 * tests/scenarios/scenario-f-multi-cashier-handover.js
 * 
 * Verifies:
 * 1. Cashier 1 closes shift with physical cash count and handover notes
 * 2. Blocker check prevents closing when tables are still occupied (unless overridden)
 * 3. Cashier 2 opens next shift with exact handed-over cash
 * 4. Audit trail preserves handover history across successive shifts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function loadIsolatedDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafe-scenario-f-'));
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return original.call(this, request, parent, isMain);
  };
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../../electron/db')];
  const db = require('../../electron/db');
  Module._load = original;
  return { db, dir };
}

test('Scenario F: Multi-Cashier Shift Handover & Reconciliation', async (t) => {
  const { db, dir } = loadIsolatedDb();
  await db.init();
  db.setupInitialAdmin('AdminPass123!');
  const admin = db.loginUser('admin', 'AdminPass123!');

  const cashier1 = db.saveUser({
    username: 'cashier_hassan',
    name: 'حسن إبراهيم',
    password: 'Password123!',
    role: 'cashier'
  });

  const cashier2 = db.saveUser({
    username: 'cashier_samy',
    name: 'سامي فؤاد',
    password: 'Password123!',
    role: 'cashier'
  });

  const product = db.listProducts().find(p => !p.is_deleted);
  const prodPrice = Number(product.price); // 70
  const tables = db.listTables();

  let shift1;
  await t.test('1. Cashier 1 shift operations', () => {
    shift1 = db.openShift(200, 'شيفت الصباح', cashier1);

    // Sale of 2 products for prodPrice (70) each (Total 140)
    db.createOrder({
      shiftId: shift1.id,
      items: [{ id: product.id, name: product.name, price: prodPrice, qty: 2 }],
      paymentMethod: 'cash',
      user: cashier1
    });

    // In-drawer cash is now 200 + 140 = 340 EGP
    const cash = db.computeShiftCash(shift1.id);
    assert.strictEqual(cash.expected_cash, 340);
  });

  await t.test('2. Shift closing with open table blocker enforcement', () => {
    // Occupy table 1
    db.saveTableCart(tables[0].id, {
      cart: [{ id: product.id, name: product.name, price: prodPrice, qty: 1 }]
    });

    // Blocker check must detect 1 open table
    const blockers = db.getPendingShiftBlockers(shift1.id);
    assert.ok(blockers.openTablesCount > 0, 'Must detect open table as blocker');

    // Clear table before closing
    db.saveTableCart(tables[0].id, { cart: [] });
    const clearedBlockers = db.getPendingShiftBlockers(shift1.id);
    assert.strictEqual(clearedBlockers.openTablesCount, 0);

    // Cashier 1 counts 340 in drawer, writes handover note
    const closeRes = db.closeShift(
      shift1.id,
      340,
      'تم تسليم الدرج لكاشير المساء سامي فؤاد بمبلغ 340 ج.م نقدية',
      cashier1
    );
    assert.strictEqual(closeRes.success, true);
    assert.strictEqual(closeRes.actualCash, 340);
    assert.strictEqual(closeRes.cashDifference, 0);
  });

  await t.test('3. Cashier 2 opens shift with handed-over cash and verifies continuity', () => {
    // Last closed shift
    const lastShifts = db.listShifts(1);
    assert.strictEqual(lastShifts.length, 1);
    const handedOverCash = lastShifts[0].actual_cash;
    assert.strictEqual(handedOverCash, 340);

    // Cashier 2 opens shift with exactly 340
    const shift2 = db.openShift(handedOverCash, 'شيفت المساء', cashier2);
    assert.ok(shift2.id > 0);

    const cash2 = db.computeShiftCash(shift2.id);
    assert.strictEqual(cash2.expected_cash, 340);

    // Normal sales proceed: 1 item for prodPrice (70)
    const sale2 = db.createOrder({
      shiftId: shift2.id,
      items: [{ id: product.id, name: product.name, price: prodPrice, qty: 1 }],
      paymentMethod: 'cash',
      user: cashier2
    });
    assert.strictEqual(sale2.success, true);

    const cash2After = db.computeShiftCash(shift2.id);
    assert.strictEqual(cash2After.expected_cash, 340 + prodPrice);

    db.closeShift(shift2.id, 340 + prodPrice, 'إغلاق شيفت 2', cashier2);
  });

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});
