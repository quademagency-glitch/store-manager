/**
 * Apply a subscription payment: check it pays for what it claims, then grant
 * it exactly once (apply_subscription_payment, migration 105).
 *
 * One path for the three ways a payment arrives: the client's
 * POST /subscriptions/verify-paystack after checkout, Paystack's
 * charge.success webhook (often for the same payment, at the same moment),
 * and a payment a Platform Admin records by hand. Until 8 October 2026 each
 * had its own copy of this, and the first two each moved the subscription
 * before the invoice that de-duplicates them was written.
 */
const { supabaseAdmin } = require('../db/supabase');
const { quote, verifyCharge, KINDS } = require('../utils/subscriptionCharge');
const { invalidateBusinessCache } = require('../middleware/authGuard');

/**
 * @param {object} p
 * @param {string} p.businessId
 * @param {string} p.planId
 * @param {'start'|'renew'|'branches'} p.kind
 * @param {number} p.branches
 * @param {number} p.paid        in the currency's main unit
 * @param {string} [p.currency]
 * @param {string} p.reference   unique per payment
 * @param {string} [p.channel]
 * @param {boolean} [p.recordedByHand]  a Platform Admin's manual record: the
 *   amount is whatever was agreed, so it is not checked against the price
 * @returns {Promise<{ applied: boolean, already?: boolean, result?: object } | { error: string }>}
 */
async function applySubscriptionPayment(p, db = supabaseAdmin) {
  if (!p.businessId || !p.planId) return { error: 'The payment does not name a business and a plan.' };
  if (!KINDS.includes(p.kind)) return { error: 'The payment does not say what it pays for.' };
  const branches = Number(p.branches);

  const { data: plan, error: planError } = await db.from('platform_plans').select('*').eq('id', p.planId).maybeSingle();
  if (planError) throw planError;
  if (!plan) return { error: 'Plan not found.' };

  let description;
  if (p.recordedByHand) {
    const priced = quote(plan, { kind: p.kind, branches });
    if (priced.error) return priced;
    description = `${priced.description} (recorded by QuadERP)`;
  } else {
    const verdict = verifyCharge(plan, { kind: p.kind, branches, paid: p.paid, currency: p.currency });
    if (verdict.error) return verdict;
    description = verdict.description;
  }

  const { data, error } = await db.rpc('apply_subscription_payment', {
    p_business_id: p.businessId,
    p_plan_id: p.planId,
    p_kind: p.kind,
    p_branches: branches,
    p_amount: Number(p.paid),
    p_currency: p.currency || plan.currency || 'GHS',
    p_reference: p.reference,
    p_channel: p.channel || null,
    p_description: description,
  });
  if (error) throw error;

  // authGuard gates the whole app on a cached copy of businesses.status and
  // paid_locations; without this the owner who just paid keeps seeing the
  // payment screen on whichever workers hold the stale entry.
  invalidateBusinessCache(p.businessId);
  return { applied: !data?.already_applied, already: !!data?.already_applied, result: data };
}

/** The claim a Paystack transaction's metadata makes, in applySubscriptionPayment's terms. */
function fromPaystack(transaction) {
  const metadata = transaction.metadata || {};
  return {
    businessId: metadata.business_id,
    planId: metadata.plan_id,
    kind: metadata.kind,
    branches: Number(metadata.branches),
    paid: typeof transaction.amount === 'number' ? transaction.amount / 100 : NaN,
    currency: transaction.currency,
    reference: transaction.reference,
    channel: transaction.channel || 'paystack',
  };
}

module.exports = { applySubscriptionPayment, fromPaystack };
