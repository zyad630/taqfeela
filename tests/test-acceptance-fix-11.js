const assert = require('assert');
const money = require('../src/utils/money.js');
const finance = require('../electron/finance.js');

console.log('--- Acceptance Test FIX-11 (A6: UI & Finance Precision Match & Symmetric Cents) ---');

// 1. Test Symmetric toCents on Negative Values (Discounts / Refunds)
console.log('1. Testing Symmetric toCents on negative half-piastre values...');
const posCents = money.toCents(0.025);
const negCents = money.toCents(-0.025);
console.log(`toCents(0.025) = ${posCents}, toCents(-0.025) = ${negCents}`);

assert.strictEqual(
  negCents,
  -posCents,
  `toCents must be symmetric around zero: toCents(-0.025) (${negCents}) must equal -toCents(0.025) (-${posCents})`
);

// 2. 1000 Seeded Random Carts Invariant: UI total === finance total (to the exact piastre)
console.log('2. Testing 1,000 Seeded Pseudo-Random Carts Invariant (UI total === finance total)...');

// Seeded LCG PRNG for reproducibility
let seed = 123456789;
function pseudoRandom() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

let mismatches = 0;
const totalScenarios = 1000;

for (let i = 0; i < totalScenarios; i++) {
  const itemCount = 1 + Math.floor(pseudoRandom() * 15); // 1 to 15 items
  const items = [];
  for (let j = 0; j < itemCount; j++) {
    const rawPrice = +(5 + pseudoRandom() * 200).toFixed(2);
    const qty = 1 + Math.floor(pseudoRandom() * 6);
    items.push({
      price: rawPrice,
      unit_price: rawPrice,
      qty
    });
  }

  // Calculate Subtotal via UI money helper
  const uiSubtotalCents = items.reduce((sum, it) => sum + Math.round(money.toCents(it.price) * it.qty), 0);
  const uiSubtotal = money.fromCents(uiSubtotalCents);

  // Discount: 50% chance of percentage discount (1-25%), 50% fixed amount (0 to subtotal/2)
  const isPercent = pseudoRandom() > 0.5;
  const discountVal = isPercent
    ? +(uiSubtotal * (Math.floor(pseudoRandom() * 25) / 100)).toFixed(2)
    : +(pseudoRandom() * (uiSubtotal * 0.4)).toFixed(2);

  const discountCents = Math.min(uiSubtotalCents, money.toCents(discountVal));
  const uiTotalCents = Math.max(0, uiSubtotalCents - discountCents);
  const uiTotal = money.fromCents(uiTotalCents);

  // Calculate via finance.js
  const finResult = finance.calculateTotals(items, money.fromCents(discountCents));

  const finTotalCents = money.toCents(finResult.total);
  const finSubtotalCents = money.toCents(finResult.subtotal);

  if (uiSubtotalCents !== finSubtotalCents || uiTotalCents !== finTotalCents) {
    mismatches++;
    if (mismatches <= 3) {
      console.error(`Scenario #${i + 1} Mismatch:`);
      console.error(`  Items:`, items);
      console.error(`  UI: subtotalCents=${uiSubtotalCents} (${uiSubtotal}), totalCents=${uiTotalCents} (${uiTotal})`);
      console.error(`  Finance: subtotalCents=${finSubtotalCents} (${finResult.subtotal}), totalCents=${finTotalCents} (${finResult.total})`);
    }
  }
}

assert.strictEqual(
  mismatches,
  0,
  `Expected 0 mismatches across 1,000 random carts, got ${mismatches} mismatches between UI and Finance calculations!`
);

console.log(`✓ 1,000 / 1,000 seeded random cart scenarios matched with 100% exact equality!`);
console.log('=== TEST-ACCEPTANCE-FIX-11 (A6) PASSED ===');
