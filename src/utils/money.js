/**
 * Financial Calculation & Precision Helpers (FIX-11 / UI-02 / A6)
 * Eliminates IEEE 754 floating point distortion (e.g. 0.1 + 0.2 = 0.30000000000000004 or 10.1 * 3 = 30.299999999999997)
 * Implements Symmetric Half-Cents Rounding (away from zero) for accurate negative discounts, refunds, and adjustments.
 */

export const toCents = (v) => {
  const num = Number(v) || 0;
  return Math.sign(num) * Math.round(Math.abs(num) * 100);
};

export const fromCents = (c) => {
  const cents = Math.round(Number(c) || 0);
  return (Math.sign(cents) * Math.round(Math.abs(cents))) / 100;
};

export const roundMoney = (v) => fromCents(toCents(v));

export const lineTotal = (price, qty) => fromCents(Math.round(toCents(price) * (Number(qty) || 0)));

export const addMoney = (a, b) => fromCents(toCents(a) + toCents(b));

export const subMoney = (a, b) => fromCents(toCents(a) - toCents(b));

export const fmtMoney = (v) => fromCents(toCents(v)).toFixed(2);

/**
 * Single Source of Truth for Cart / Order Financial Totals
 * @param {Array<{ price?: number|string, unit_price?: number|string, qty: number }>} items
 * @param {number|object} options - either fixed discount amount, or { discount, discountPercent, service, servicePercent, tax, taxPercent }
 */
export const calculateTotals = (items, options = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      subtotal: 0,
      discount: 0,
      service: 0,
      tax: 0,
      total: 0,
      subtotalCents: 0,
      discountCents: 0,
      serviceCents: 0,
      taxCents: 0,
      totalCents: 0
    };
  }

  let subtotalCents = 0;
  for (const it of items) {
    const p = it.price ?? it.unit_price ?? 0;
    const q = Number(it.qty) || 0;
    subtotalCents += Math.round(toCents(p) * q);
  }

  let discountCents = 0;
  if (typeof options === 'number') {
    discountCents = toCents(options);
  } else if (options && typeof options === 'object') {
    if (options.discountPercent) {
      discountCents = Math.round(subtotalCents * (Number(options.discountPercent) / 100));
    } else if (options.discount !== undefined) {
      discountCents = toCents(options.discount);
    }
  }
  discountCents = Math.min(subtotalCents, Math.max(0, discountCents));
  const afterDiscountCents = subtotalCents - discountCents;

  let serviceCents = 0;
  if (options && typeof options === 'object') {
    if (options.servicePercent) {
      serviceCents = Math.round(afterDiscountCents * (Number(options.servicePercent) / 100));
    } else if (options.service !== undefined) {
      serviceCents = toCents(options.service);
    }
  }

  let taxCents = 0;
  if (options && typeof options === 'object') {
    if (options.taxPercent) {
      taxCents = Math.round((afterDiscountCents + serviceCents) * (Number(options.taxPercent) / 100));
    } else if (options.tax !== undefined) {
      taxCents = toCents(options.tax);
    }
  }

  const totalCents = Math.max(0, afterDiscountCents + serviceCents + taxCents);

  return {
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    service: fromCents(serviceCents),
    tax: fromCents(taxCents),
    total: fromCents(totalCents),
    subtotalCents,
    discountCents,
    serviceCents,
    taxCents,
    totalCents
  };
};

export default {
  toCents,
  fromCents,
  roundMoney,
  lineTotal,
  addMoney,
  subMoney,
  fmtMoney,
  calculateTotals
};
