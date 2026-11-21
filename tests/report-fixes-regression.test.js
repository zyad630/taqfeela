/**
 * Regression tests for report bugs R2-R6 found in the Nov 2026 audit (commit 64f9674).
 * Run: node tests/report-fixes-regression.test.js
 * Uses a disposable temp database. Never run against a customer database.
 */
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module'), assert = require('assert/strict');
process.env.CAFE_TEST_AUTOMATION = '1'; process.env.NODE_ENV = 'test';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taq-report-regression-'));
const orig = Module._load;
Module._load = function (r, p, i) { if (r === 'electron') return { app: { getPath: () => dir, isPackaged: false } }; return orig.call(this, r, p, i); };
const db = require(path.join(__dirname, '..', 'electron', 'db'));
Module._load = orig;

(async () => {
  await db.init();
  db.setupInitialAdmin('Regression2026!');
  const admin = db.loginUser('admin', 'Regression2026!');
  const shift = db.openShift(500, '', admin);
  const p = db.saveProduct({ name: 'Regression item', price: 100, category_id: 1, stock_qty: 1000 });
  const make = (extra = {}) => db.createOrder({ items: [{ id: p.id, qty: 1 }], paymentMethod: 'cash', amountPaid: 100, shiftId: shift.id, user: admin, ...extra });

  // R2: employee filter must not attribute a colleague's invoice to the shift owner
  db.saveUser({ username: 'regcashier', name: 'Regression Cashier', password: 'Regression2026!', role: 'cashier' });
  const cashier = db.loginUser('regcashier', 'Regression2026!');
  make(); make({ user: cashier });
  const adminFilter = db.getReportSales({ userId: admin.id }).summary;
  const cashierFilter = db.getReportSales({ userId: cashier.id }).summary;
  assert.equal(adminFilter.order_count, 1, 'R2: shift owner sees only own invoice');
  assert.equal(adminFilter.total_sales, 100, 'R2: shift owner total is 100');
  assert.equal(cashierFilter.order_count, 1, 'R2: cashier sees own invoice');
  // Legacy rows without user_id still fall back to the shift owner
  db.runSql('UPDATE orders SET user_id = NULL WHERE id = (SELECT MIN(id) FROM orders)');
  assert.ok(db.getReportSales({ userId: admin.id }).summary.order_count >= 1, 'R2: legacy null user_id falls back to shift owner');
  db.runSql('UPDATE orders SET user_id = ? WHERE user_id IS NULL', [admin.id]);

  // R3: identically named tables in different halls must not merge
  const t1 = db.saveTable({ name: 'Dup', number: '991', hall: 'Hall A' });
  const t2 = db.saveTable({ name: 'Dup', number: '992', hall: 'Hall B' });
  make({ tableId: t1.id, orderType: 'dine_in' }); make({ tableId: t2.id, orderType: 'dine_in' });
  const sections = db.getReportSales().bySection.filter(s => s.table_name === 'Dup');
  assert.equal(sections.length, 2, 'R3: two halls stay separate');
  assert.deepEqual(sections.map(s => s.total).sort(), [100, 100], 'R3: each hall keeps its own 100');

  // R4: report day follows the configured timezone, not the host clock
  db.saveSettings({ timezone_mode: 'Asia/Dubai' });
  db.runSql('UPDATE orders SET created_at = ? WHERE id = (SELECT MIN(id) FROM orders)', ['2026-11-21T21:30:00.000Z']); // 01:30 Nov 22 in Dubai
  const r21 = db.getReportSales({ dateFrom: '2026-11-21', dateTo: '2026-11-21' }).summary;
  const r22 = db.getReportSales({ dateFrom: '2026-11-22', dateTo: '2026-11-22' }).summary;
  assert.ok(r22.order_count >= 1, 'R4: order lands on Nov 22 under Dubai');
  assert.ok(db.getReportSales({ dateFrom: '2026-11-21', dateTo: '2026-11-22' }).dailyBreakdown.some(d => d.day === '2026-11-22'), 'R4: daily breakdown uses configured tz day');
  db.saveSettings({ timezone_mode: 'Africa/Cairo' });
  assert.ok(db.getReportSales({ dateFrom: '2026-11-21', dateTo: '2026-11-21' }).summary.order_count >= r21.order_count + 1, 'R4: Cairo puts the same order back on Nov 21');

  // R5: export list is complete while the display list stays limited
  for (let i = 0; i < 22; i++) { const x = db.saveProduct({ name: 'Regression extra ' + i, price: 1, category_id: 1, stock_qty: 100 }); db.createOrder({ items: [{ id: x.id, qty: 1 }], paymentMethod: 'cash', amountPaid: 1, user: admin, shiftId: shift.id }); }
  const full = db.getReportSales();
  assert.equal(full.topProducts.length, 20, 'R5: display list capped at 20');
  assert.equal(full.allProducts.length, 23, 'R5: export list has all 23 products');

  // R6: deferred (notebook) sale exposes its remaining balance
  db.createOrder({ items: [{ id: p.id, qty: 1 }], paymentMethod: 'notebook', orderType: 'notebook', amountPaid: 20, cashAmount: 20, user: admin, shiftId: shift.id, customerName: 'Regression debt' });
  const s6 = db.getReportSales().summary;
  assert.equal(s6.notebook_sales, 100, 'R6: notebook total recorded');
  assert.equal(s6.notebook_remaining, 80, 'R6: remaining deferred balance is 80');

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  console.log('PASS: report-fixes-regression (R2, R3, R4, R5, R6)');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
