/**
 * What a payment costs and whether a paid amount covers it
 * (utils/subscriptionCharge). One plan since 8 October 2026: a one-time setup
 * fee, a yearly price for the first branch, and a yearly price for each
 * further branch, charged in full whenever it is added.
 */
const { quote, checkoutQuote, verifyCharge } = require('../utils/subscriptionCharge');

const PLAN = { id: 'p1', name: 'QuadERP', is_active: true, currency: 'GHS', price_yearly: 1000, setup_fee: 1000, price_per_extra_location: 200 };

const db = (paidInvoices) => ({
  from: () => {
    const chain = { select: () => chain, eq: () => chain, then: (ok) => ok({ count: paidInvoices, error: null }) };
    return chain;
  },
});

describe('quote', () => {
  test('starting with one branch is the setup fee and the first year: GHS 2,000', () => {
    const q = quote(PLAN, { kind: 'start', branches: 1 });
    expect(q.amount).toBe(2000);
    expect(q.lines).toEqual([
      { label: 'One-time setup', amount: 1000 },
      { label: 'First branch, for a year', amount: 1000 },
    ]);
  });

  test('starting with three branches adds GHS 200 for each one after the first', () => {
    expect(quote(PLAN, { kind: 'start', branches: 3 }).amount).toBe(2400);
  });

  test('a renewal has no setup fee and covers every branch paid for', () => {
    expect(quote(PLAN, { kind: 'renew', branches: 1 }).amount).toBe(1000);
    expect(quote(PLAN, { kind: 'renew', branches: 4 }).amount).toBe(1600);
  });

  test('a branch added mid-year is the full GHS 200', () => {
    expect(quote(PLAN, { kind: 'branches', branches: 1 }).amount).toBe(200);
    expect(quote(PLAN, { kind: 'branches', branches: 2 }).amount).toBe(400);
  });

  test('nonsense is refused, and a missing price is not zero', () => {
    expect(quote(PLAN, { kind: 'monthly', branches: 1 }).error).toBeTruthy();
    expect(quote(PLAN, { kind: 'branches', branches: 0 }).error).toBeTruthy();
    expect(quote(PLAN, { kind: 'branches', branches: 1.5 }).error).toBeTruthy();
    expect(quote({ ...PLAN, price_yearly: null }, { kind: 'renew', branches: 1 }).error).toBeTruthy();
  });
});

describe('checkoutQuote', () => {
  const business = { id: 'b1', paid_locations: 3 };

  test('a business that has never paid can only start', async () => {
    expect((await checkoutQuote(db(0), { business, plan: PLAN, kind: 'start', branches: 1 })).amount).toBe(2000);
    expect((await checkoutQuote(db(0), { business, plan: PLAN, kind: 'renew' })).error).toMatch(/Start your subscription first/);
    expect((await checkoutQuote(db(0), { business, plan: PLAN, kind: 'branches', branches: 1 })).error).toMatch(/Start your subscription first/);
  });

  test('after the first payment: renew every paid branch, or add more; never start again', async () => {
    const renew = await checkoutQuote(db(1), { business, plan: PLAN, kind: 'renew', branches: 1 });
    expect(renew).toMatchObject({ amount: 1400, branches: 3 }); // what the client asked for is ignored
    expect((await checkoutQuote(db(1), { business, plan: PLAN, kind: 'branches', branches: 2 })).amount).toBe(400);
    expect((await checkoutQuote(db(1), { business, plan: PLAN, kind: 'start', branches: 1 })).error).toMatch(/already started/);
  });

  test('a plan no longer on sale cannot be bought', async () => {
    expect((await checkoutQuote(db(0), { business, plan: { ...PLAN, is_active: false }, kind: 'start', branches: 1 })).error).toBeTruthy();
  });
});

describe('verifyCharge', () => {
  test('the full price grants; less, or another currency, grants nothing', () => {
    expect(verifyCharge(PLAN, { kind: 'start', branches: 1, paid: 2000, currency: 'GHS' })).toMatchObject({ ok: true });
    expect(verifyCharge(PLAN, { kind: 'start', branches: 1, paid: 1999.99, currency: 'GHS' }).error).toMatch(/costs 2000/);
    expect(verifyCharge(PLAN, { kind: 'branches', branches: 1, paid: 200, currency: 'NGN' }).error).toMatch(/Paid in NGN/);
  });

  test('a claim of more branches than were paid for is refused', () => {
    expect(verifyCharge(PLAN, { kind: 'branches', branches: 5, paid: 200, currency: 'GHS' }).error).toBeTruthy();
  });
});
