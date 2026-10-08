/**
 * What a subscription payment must be, and what it grants, computed on the
 * server from the plan.
 *
 * Paystack's metadata (business, plan, cycle) is set by whoever started the
 * checkout, and the public key needed to start one is public, so those are
 * only claims. Until 8 October 2026 a charge granted whatever its metadata
 * named, whatever was paid: picking a "trial" plan on the yearly cycle
 * charged GHS 1 and activated a paid year. Now the amount actually paid
 * decides. An intro price or a trial is offered only on a business's first
 * purchase, and a trial grants a trial, not a paid period.
 */
const CYCLES = ['monthly', 'yearly'];
const TRIAL_FEE = 1; // GHS card authorisation for a free trial
const DAY_MS = 86_400_000;

async function hasPaidBefore(db, businessId) {
  const { count, error } = await db.from('billing_invoices').select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('status', 'paid');
  if (error) throw error;
  return (count || 0) > 0;
}

/**
 * @returns {{ kind: 'full'|'intro'|'trial', amount: number, trialDays?: number }}
 */
function expectedCharge(plan, cycle, { firstPurchase }) {
  const full = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const promo = plan.promo_mode || 'none';
  if (firstPurchase && promo === 'intro') {
    const intro = cycle === 'yearly' ? plan.intro_price_yearly : plan.intro_price_monthly;
    if (intro !== null && intro !== undefined && intro !== '') return { kind: 'intro', amount: Number(intro) };
  }
  if (firstPurchase && promo === 'trial') {
    const value = Number(cycle === 'yearly' ? plan.trial_days_yearly : plan.trial_days_monthly) || 0;
    const unit = (cycle === 'yearly' ? plan.trial_unit_yearly : plan.trial_unit_monthly) || 'days';
    if (value > 0 && Number(full) > 0) return { kind: 'trial', amount: TRIAL_FEE, trialDays: unit === 'months' ? value * 30 : value };
  }
  return { kind: 'full', amount: full === null || full === undefined || full === '' ? NaN : Number(full) };
}

/** The charge to ask for when starting a checkout. */
async function chargeForCheckout(db, { businessId, plan, cycle }) {
  if (!CYCLES.includes(cycle)) return { error: 'Choose monthly or yearly billing.' };
  if (!plan?.is_active) return { error: 'This plan is not available.' };
  const charge = expectedCharge(plan, cycle, { firstPurchase: !(await hasPaidBefore(db, businessId)) });
  if (!Number.isFinite(charge.amount) || charge.amount <= 0) return { error: 'This plan has no price for that billing cycle.' };
  return { charge };
}

/**
 * What a verified successful charge grants, or why it grants nothing.
 * @param {{ businessId: string, planId: string, cycle: string, paid: number, currency?: string }} claim
 */
async function grantForCharge(db, { businessId, planId, cycle, paid, currency }) {
  if (!CYCLES.includes(cycle)) return { error: 'Unknown billing cycle.' };
  const { data: plan, error } = await db.from('platform_plans').select('*').eq('id', planId).maybeSingle();
  if (error) throw error;
  if (!plan) return { error: 'Plan not found.' };
  if ((currency || 'GHS') !== (plan.currency || 'GHS')) return { error: `Paid in ${currency}, the plan is priced in ${plan.currency || 'GHS'}.` };
  const charge = expectedCharge(plan, cycle, { firstPurchase: !(await hasPaidBefore(db, businessId)) });
  if (!Number.isFinite(charge.amount)) return { error: 'This plan has no price for that billing cycle.' };
  if (Math.round(Number(paid) * 100) < Math.round(charge.amount * 100)) {
    return { error: `Paid ${paid}, but this plan costs ${charge.amount} for the ${cycle} cycle.` };
  }
  const now = new Date();
  if (charge.kind === 'trial') {
    const end = new Date(now.getTime() + charge.trialDays * DAY_MS);
    return { plan, status: 'trialing', periodStart: now, periodEnd: end, trialEndsAt: end };
  }
  const end = new Date(now);
  if (cycle === 'yearly') end.setFullYear(end.getFullYear() + 1);
  else end.setDate(end.getDate() + 30);
  return { plan, status: 'active', periodStart: now, periodEnd: end, trialEndsAt: null };
}

module.exports = { expectedCharge, chargeForCheckout, grantForCharge, hasPaidBefore, CYCLES, TRIAL_FEE };
