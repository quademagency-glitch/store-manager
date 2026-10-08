/**
 * What a QuadERP payment costs, computed on the server from the plan.
 *
 * Since 8 October 2026 there is one plan, paid before use:
 *   start     the one-time setup fee + the first year for the first branch
 *             + a year for each further branch bought with it
 *   renew     a year for the first branch + a year for each further branch
 *             paid for (businesses.paid_locations)
 *   branches  the yearly price of each branch added, in full, however much of
 *             the year is left
 *
 * Paystack's metadata (business, plan, kind, branches) is set by whoever
 * started the checkout, so it is only a claim: the amount actually paid
 * decides whether anything is granted (verifyCharge). What a verified payment
 * grants is applied in the database by apply_subscription_payment (105).
 */
const KINDS = ['start', 'renew', 'branches'];
const MAX_BRANCHES = 100;

const money = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value));
const plural = (n) => `${n} branch${n === 1 ? '' : 'es'}`;

async function hasPaidBefore(db, businessId) {
  const { count, error } = await db.from('billing_invoices').select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('status', 'paid');
  if (error) throw error;
  return (count || 0) > 0;
}

/**
 * The price of one payment.
 * @returns {{ amount: number, lines: {label: string, amount: number}[], description: string } | { error: string }}
 */
function quote(plan, { kind, branches }) {
  if (!KINDS.includes(kind)) return { error: 'Unknown payment.' };
  if (!Number.isInteger(branches) || branches < 1 || branches > MAX_BRANCHES) return { error: `Choose between 1 and ${MAX_BRANCHES} branches.` };
  const yearly = money(plan.price_yearly);
  const setup = money(plan.setup_fee ?? 0);
  const extra = money(plan.price_per_extra_location ?? 0);
  if (![yearly, setup, extra].every(Number.isFinite)) return { error: 'This plan has no price set.' };

  const lines = [];
  if (kind === 'branches') {
    lines.push({ label: `${plural(branches)} added, for a year`, amount: extra * branches });
  } else {
    if (kind === 'start' && setup > 0) lines.push({ label: 'One-time setup', amount: setup });
    lines.push({ label: 'First branch, for a year', amount: yearly });
    if (branches > 1) lines.push({ label: `${plural(branches - 1)} more, for a year`, amount: extra * (branches - 1) });
  }
  const amount = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  if (!(amount > 0)) return { error: 'This plan has no price set.' };
  const description = {
    start: `${plan.name}: setup and first year, ${plural(branches)}`,
    renew: `${plan.name}: a year's renewal, ${plural(branches)}`,
    branches: `${plan.name}: ${plural(branches)} added`,
  }[kind];
  return { amount, lines, description, currency: plan.currency || 'GHS' };
}

/**
 * The payment a business may start now, priced.
 * `start` before the first payment; `renew` and `branches` after it. A
 * renewal always covers every branch paid for.
 */
async function checkoutQuote(db, { business, plan, kind, branches }) {
  if (!plan?.is_active) return { error: 'This plan is not available.' };
  const paidBefore = await hasPaidBefore(db, business.id);
  if (kind === 'start' && paidBefore) return { error: 'Your subscription has already started. Renew it or add branches instead.' };
  if ((kind === 'renew' || kind === 'branches') && !paidBefore) return { error: 'Start your subscription first.' };
  const count = kind === 'renew' ? Math.max(1, Number(business.paid_locations) || 1) : Number(branches ?? 1);
  const priced = quote(plan, { kind, branches: count });
  return priced.error ? priced : { ...priced, kind, branches: count };
}

/**
 * Whether a verified payment covers what it claims to buy. A `start` paid by
 * a business that has paid before is accepted as a renewal: it paid more.
 */
function verifyCharge(plan, { kind, branches, paid, currency }) {
  const priced = quote(plan, { kind, branches });
  if (priced.error) return priced;
  if ((currency || 'GHS') !== (plan.currency || 'GHS')) return { error: `Paid in ${currency}, the plan is priced in ${plan.currency || 'GHS'}.` };
  if (Math.round(Number(paid) * 100) < Math.round(priced.amount * 100)) {
    return { error: `Paid ${paid}, but this costs ${priced.amount}.` };
  }
  return { ok: true, description: priced.description };
}

module.exports = { quote, checkoutQuote, verifyCharge, hasPaidBefore, KINDS, MAX_BRANCHES };
