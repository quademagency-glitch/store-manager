/**
 * Sales tax arithmetic.
 *
 * Pure and separate from the route because it is the part that decides what a
 * customer is charged, and it is the part worth testing exhaustively. The
 * route's job is to fetch the settings and hand them here.
 *
 * The client computes the same numbers to show a tax line before payment, but
 * this is the authority. A tax figure posted by a browser is a tax figure
 * chosen by whoever is holding the browser.
 */

/** Money is stored to two decimals, so round there and nowhere else. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * @param {object} args
 * @param {number} args.total     Cart total as the till presented it.
 * @param {number} args.rate      Percentage, e.g. 15 for 15%.
 * @param {boolean} args.enabled  The business's explicit switch.
 * @param {boolean} args.inclusive Whether `total` already contains the tax.
 * @returns {{subtotal: number, tax: number, total: number}}
 *   `total` is what the customer pays. Under inclusive pricing it is the input
 *   unchanged; under exclusive pricing the tax has been added to it.
 */
function computeTax({ total, rate, enabled, inclusive }) {
  const gross = Number(total) || 0;
  const pct = Number(rate) || 0;

  /* Not "rate > 0". A business that typed a rate into the old field years ago,
     when it did nothing, has not agreed to start charging it. Only the switch
     counts. */
  if (!enabled || pct <= 0 || gross <= 0) {
    return { subtotal: round2(gross), tax: 0, total: round2(gross) };
  }

  if (inclusive) {
    // The marked price already contains the tax, so carve it out rather than
    // adding to it. tax = gross * r / (100 + r).
    const tax = round2((gross * pct) / (100 + pct));
    return { subtotal: round2(gross - tax), tax, total: round2(gross) };
  }

  const tax = round2((gross * pct) / 100);
  return { subtotal: round2(gross), tax, total: round2(gross + tax) };
}

module.exports = { computeTax, round2 };
