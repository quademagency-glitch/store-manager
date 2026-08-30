/**
 * Customer credit limit arithmetic.
 *
 * Pulled out of the AR invoice route so the rule can be tested without a
 * database, the same way utils/tax.js is. The route does the fetching; this
 * decides.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * What a customer currently owes: every invoice that is not void, at its
 * unpaid remainder.
 *
 * A void invoice is not debt. Filtering it here rather than in the query keeps
 * the rule in one place and means a caller that over-fetches cannot quietly
 * change the answer.
 */
function outstandingBalance(invoices) {
  return round2(
    (invoices || [])
      .filter((inv) => inv && inv.status !== 'void')
      .reduce(
        (acc, inv) => acc + ((Number(inv.total_amount) || 0) - (Number(inv.amount_paid) || 0)),
        0,
      ),
  );
}

/**
 * Decide whether a new invoice may be raised.
 *
 * @param {object}  args
 * @param {number|null|undefined} args.limit  null/undefined = no limit set,
 *   which is the behaviour before migration 075 and the default after it. 0 is
 *   a real value meaning this customer pays cash.
 * @param {Array}   args.invoices  every invoice already on the account.
 * @param {number}  args.amount    the invoice being raised.
 * @param {boolean} args.isOpeningBalance  an opening balance records debt that
 *   already exists. Refusing to write down what a customer already owes,
 *   because it exceeds a limit set afterwards, would leave the books wrong to
 *   protect a number.
 * @returns {{allowed: boolean, limit: number|null, outstanding: number, projected: number}}
 */
function checkCreditLimit({ limit, invoices, amount, isOpeningBalance = false }) {
  const outstanding = outstandingBalance(invoices);
  const projected = round2(outstanding + (Number(amount) || 0));

  if (limit === null || limit === undefined || isOpeningBalance) {
    return { allowed: true, limit: limit ?? null, outstanding, projected };
  }

  const cap = Number(limit);
  if (!Number.isFinite(cap)) {
    return { allowed: true, limit: null, outstanding, projected };
  }

  /* Compared against the total the account would reach, not against this
     invoice alone: a limit of 500 checked per-invoice permits ten invoices of
     500. Equal to the limit is allowed; a limit is a ceiling you may reach. */
  return { allowed: projected <= cap, limit: cap, outstanding, projected };
}

module.exports = { checkCreditLimit, outstandingBalance };
