/**
 * Sales tax arithmetic, for display only.
 *
 * A deliberate mirror of server/utils/tax.js, which is the authority: the API
 * recomputes tax from the business's own settings and ignores whatever the
 * till posts. This copy exists so the cashier and the customer can see the tax
 * line before money changes hands, rather than discovering it on the receipt.
 *
 * The two must agree. If you change the rule, change it in both, and the
 * server's tests in __tests__/tax.test.js are the ones that define it.
 */

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * @param {number} total     Cart total as shown.
 * @param {object} business  The business record from /businesses/me.
 * @returns {{subtotal: number, tax: number, total: number, label: string, applies: boolean}}
 */
export function computeTax(total, business) {
  const gross = Number(total) || 0;
  const rate = Number(business?.tax_rate) || 0;
  const enabled = business?.tax_enabled === true;
  const inclusive = business?.tax_inclusive !== false;
  const label = (business?.tax_label || 'VAT').trim() || 'VAT';

  /* Not "rate > 0": the rate column predates the feature and may hold a number
     nobody meant to charge. Only the explicit switch counts. */
  if (!enabled || rate <= 0 || gross <= 0) {
    return { subtotal: round2(gross), tax: 0, total: round2(gross), label, applies: false };
  }

  if (inclusive) {
    const tax = round2((gross * rate) / (100 + rate));
    return { subtotal: round2(gross - tax), tax, total: round2(gross), label, applies: true };
  }

  const tax = round2((gross * rate) / 100);
  return { subtotal: round2(gross), tax, total: round2(gross + tax), label, applies: true };
}
