/**
 * What a subscription payment must be and what it grants. Until 8 October
 * 2026 a charge granted whatever its metadata named: a "trial" plan on the
 * yearly cycle charged GHS 1 and activated a paid year.
 */
const { expectedCharge, chargeForCheckout, grantForCharge } = require('../utils/subscriptionCharge');

const plan = (extra = {}) => ({ id: 'p', is_active: true, currency: 'GHS', price_monthly: 199, price_yearly: 1990, promo_mode: 'none', ...extra });
const db = (planRow, paidBefore = 0) => ({
  from(table) {
    const chain = {
      select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: planRow, error: null }),
      then: (ok) => ok(table === 'billing_invoices' ? { count: paidBefore, error: null } : { data: null, error: null }),
    };
    return chain;
  },
});

describe('expectedCharge', () => {
  test('full price, intro and trial only on a first purchase', () => {
    expect(expectedCharge(plan(), 'yearly', { firstPurchase: true })).toEqual({ kind: 'full', amount: 1990 });
    const intro = plan({ promo_mode: 'intro', intro_price_monthly: 99 });
    expect(expectedCharge(intro, 'monthly', { firstPurchase: true })).toEqual({ kind: 'intro', amount: 99 });
    expect(expectedCharge(intro, 'monthly', { firstPurchase: false })).toEqual({ kind: 'full', amount: 199 });
    const trial = plan({ promo_mode: 'trial', trial_days_yearly: 30 });
    expect(expectedCharge(trial, 'yearly', { firstPurchase: true })).toEqual({ kind: 'trial', amount: 1, trialDays: 30 });
    expect(expectedCharge(trial, 'yearly', { firstPurchase: false })).toEqual({ kind: 'full', amount: 1990 });
  });
  test('a missing price is not zero', () => {
    expect(Number.isNaN(expectedCharge(plan({ price_yearly: null }), 'yearly', { firstPurchase: false }).amount)).toBe(true);
  });
});

describe('grantForCharge', () => {
  const claim = (extra) => ({ businessId: 'b', planId: 'p', cycle: 'yearly', currency: 'GHS', ...extra });

  test('GHS 1 on a trial plan grants a trial with an end date, not a paid year', async () => {
    const g = await grantForCharge(db(plan({ promo_mode: 'trial', trial_days_yearly: 30 })), claim({ paid: 1 }));
    expect(g.status).toBe('trialing');
    expect(Math.round((g.trialEndsAt - g.periodStart) / 86_400_000)).toBe(30);
    expect(g.periodEnd).toEqual(g.trialEndsAt);
  });
  test('GHS 1 again, after the first purchase, grants nothing', async () => {
    const g = await grantForCharge(db(plan({ promo_mode: 'trial', trial_days_yearly: 30 }), 1), claim({ paid: 1 }));
    expect(g.error).toMatch(/costs 1990/);
  });
  test('the full price grants a calendar year; underpaying or another currency grants nothing', async () => {
    const g = await grantForCharge(db(plan()), claim({ paid: 1990 }));
    expect(g.status).toBe('active');
    expect(g.periodEnd.getUTCFullYear() - g.periodStart.getUTCFullYear()).toBe(1);
    expect((await grantForCharge(db(plan()), claim({ paid: 1989.99 }))).error).toBeDefined();
    expect((await grantForCharge(db(plan()), claim({ paid: 1990, currency: 'USD' }))).error).toMatch(/USD/);
    expect((await grantForCharge(db(plan()), claim({ paid: 1990, cycle: 'weekly' }))).error).toBeDefined();
    expect((await grantForCharge(db(null), claim({ paid: 1990 }))).error).toBe('Plan not found.');
  });
});

describe('chargeForCheckout', () => {
  test('inactive plans and missing prices cannot be bought', async () => {
    expect((await chargeForCheckout(db(null), { businessId: 'b', plan: plan({ is_active: false }), cycle: 'monthly' })).error).toBeDefined();
    expect((await chargeForCheckout(db(null), { businessId: 'b', plan: plan({ price_yearly: null }), cycle: 'yearly' })).error).toBeDefined();
    expect((await chargeForCheckout(db(null), { businessId: 'b', plan: plan(), cycle: 'monthly' })).charge).toEqual({ kind: 'full', amount: 199 });
  });
});
