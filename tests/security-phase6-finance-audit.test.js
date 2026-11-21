const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const finance = require('../electron/finance');

describe('🔒 Phase 6 Financial Audit: Black-box Boundary & Invariant Testing for finance.js', () => {

  test('1. ADV-P6-01: Boundary fractional pricing & 2-decimal truncation behavior', () => {
    // Audit finding: Each item price is rounded/truncated to 2 decimal places before multiplication
    // 10.333 becomes 10.33 -> 10.33 * 3 = 30.99 (creates 0.01 discrepancy from 31.00)
    const res = finance.calculateTotals([{ price: 10.333, qty: 3 }], 0, 0);
    assert.strictEqual(typeof res.total, 'number');
    assert.ok(!Number.isNaN(res.total), 'Total must not be NaN');
    assert.strictEqual(res.total, 30.99, 'finance.js rounds per-item to 2 decimals (10.33 * 3 = 30.99)');
  });

  test('2. ADV-P6-02: Zero values & empty items array validation', () => {
    // Empty items array is strictly rejected
    assert.throws(
      () => finance.calculateTotals([], 0, 0),
      /items required/i,
      'finance.js requires a non-empty items array'
    );

    // Zero priced items are allowed
    const zeroRes = finance.calculateTotals([{ price: 0, qty: 5 }], 0, 0);
    assert.strictEqual(zeroRes.total, 0);
    assert.strictEqual(zeroRes.subtotal, 0);
  });

  test('3. ADV-P6-03: Large quantities and extreme values', () => {
    const bigQty = finance.calculateTotals([{ price: 25.5, qty: 100000 }], 0, 0);
    assert.strictEqual(bigQty.total, 2550000);
    assert.ok(!Number.isNaN(bigQty.total));
    assert.ok(Number.isFinite(bigQty.total));
  });

  test('4. ADV-P6-04: Discount boundaries & excess discount rejection', () => {
    // Normal discount
    const normal = finance.calculateTotals([{ price: 50, qty: 2 }], 15, 0);
    assert.strictEqual(normal.subtotal, 100);
    assert.strictEqual(normal.discount, 15);
    assert.strictEqual(normal.total, 85);

    // Negative discount is rejected
    assert.throws(
      () => finance.calculateTotals([{ price: 50, qty: 1 }], -10, 0),
      /non-negative/i,
      'Negative discount must be rejected'
    );

    // Excess discount exceeding subtotal is strictly rejected
    assert.throws(
      () => finance.calculateTotals([{ price: 20, qty: 1 }], 50, 0),
      /exceeds subtotal/i,
      'Discount exceeding subtotal must be rejected'
    );
  });

  test('5. ADV-P6-05: Tax additive calculation & negative rejection', () => {
    const withTax = finance.calculateTotals([{ price: 100, qty: 1 }], 0, 14);
    assert.strictEqual(withTax.subtotal, 100);
    assert.strictEqual(withTax.tax, 14);
    assert.strictEqual(withTax.total, 114);

    assert.throws(
      () => finance.calculateTotals([{ price: 100, qty: 1 }], 0, -5),
      /non-negative/i,
      'Negative tax must be rejected'
    );
  });

  test('6. ADV-P6-06: Fractional quantity rejection (integer constraint)', () => {
    // Audit finding: finance.js rejects fractional quantities (e.g. 1.5 kg)
    assert.throws(
      () => finance.calculateTotals([{ price: 20, qty: 1.5 }], 0, 0),
      /positive integer/i,
      'finance.js requires quantities to be positive integers'
    );
  });

  test('7. ADV-P6-07: Malformed, NaN, null, and string inputs', () => {
    // String numbers are coerced gracefully
    const strRes = finance.calculateTotals([{ price: '25.50', qty: 2 }], '5', '14');
    assert.strictEqual(strRes.subtotal, 51);
    assert.strictEqual(strRes.discount, 5);
    assert.strictEqual(strRes.tax, 14);
    assert.strictEqual(strRes.total, 60);

    // Invalid NaN / non-numeric prices throw cleanly
    assert.throws(
      () => finance.calculateTotals([{ price: NaN, qty: 1 }], 0, 0),
      /valid number/i
    );
    assert.throws(
      () => finance.calculateTotals([{ price: 'not-a-number', qty: 1 }], 0, 0),
      /valid number/i
    );
  });

  test('8. ADV-P6-08: validatePayment behavior and invariants', () => {
    // Exact payment
    const exact = finance.validatePayment(100, 100, false);
    assert.deepStrictEqual(exact, { amount: 100, change: 0 });

    // Overpayment calculates change
    const over = finance.validatePayment(100, 150, false);
    assert.deepStrictEqual(over, { amount: 150, change: 50 });

    // Underpayment without notebook throws invalid payment amount
    assert.throws(
      () => finance.validatePayment(100, 80, false),
      /invalid payment amount/i
    );

    // Underpayment permitted for notebook (debt)
    const notebook = finance.validatePayment(100, 0, true);
    assert.deepStrictEqual(notebook, { amount: 0, change: 0 });
  });
});
