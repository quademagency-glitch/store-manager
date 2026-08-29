/**
 * Sales tax arithmetic.
 *
 * Covered thickly because this is the code that decides what a customer is
 * charged, and because the field it serves spent a year storing a number
 * nothing read. The cases that matter most are the ones where tax must NOT
 * apply: a rate left over from that year is not permission to start charging
 * it.
 */
const { computeTax } = require('../utils/tax');

const money = (o) => {
  const r = computeTax(o);
  return [r.subtotal, r.tax, r.total];
};

describe('computeTax, when tax must not apply', () => {
  test('a rate stored while the field did nothing stays inert until switched on', () => {
    // The exact hazard migration 074's tax_enabled column exists for: shops
    // typed 12.5 into a dead box. Enabling on "rate > 0" would have started
    // charging them on deploy day.
    expect(money({ total: 100, rate: 12.5, enabled: false, inclusive: true })).toEqual([100, 0, 100]);
  });

  test('switched on with a zero rate charges nothing', () => {
    expect(money({ total: 100, rate: 0, enabled: true, inclusive: true })).toEqual([100, 0, 100]);
  });

  test('a missing rate is not an error, it is no tax', () => {
    expect(money({ total: 100, rate: null, enabled: true, inclusive: true })).toEqual([100, 0, 100]);
    expect(money({ total: 100, rate: undefined, enabled: true, inclusive: false })).toEqual([100, 0, 100]);
  });

  test('a zero-value sale stays zero rather than dividing anything', () => {
    expect(money({ total: 0, rate: 15, enabled: true, inclusive: true })).toEqual([0, 0, 0]);
  });
});

describe('computeTax, inclusive pricing', () => {
  test('carves the tax out of the marked price instead of adding to it', () => {
    // The customer pays the shelf price. This is the Ghanaian retail default
    // and the reason tax_inclusive defaults true.
    expect(money({ total: 115, rate: 15, enabled: true, inclusive: true })).toEqual([100, 15, 115]);
  });

  test('never changes what the customer pays', () => {
    for (const total of [1, 9.99, 37.5, 240, 1999.95]) {
      const r = computeTax({ total, rate: 15, enabled: true, inclusive: true });
      expect(r.total).toBeCloseTo(total, 2);
      expect(r.subtotal + r.tax).toBeCloseTo(total, 2);
    }
  });

  test('rounds to two decimals and still reconciles', () => {
    const r = computeTax({ total: 9.99, rate: 15, enabled: true, inclusive: true });
    expect(r.tax).toBe(1.3);
    expect(r.subtotal).toBe(8.69);
    expect(r.subtotal + r.tax).toBeCloseTo(9.99, 2);
  });
});

describe('computeTax, exclusive pricing', () => {
  test('adds tax on top, so the total is not the total that was posted', () => {
    expect(money({ total: 100, rate: 15, enabled: true, inclusive: false })).toEqual([100, 15, 115]);
  });

  test('subtotal stays the marked price', () => {
    const r = computeTax({ total: 250, rate: 21.9, enabled: true, inclusive: false });
    expect(r.subtotal).toBe(250);
    expect(r.total).toBeCloseTo(250 + r.tax, 2);
  });
});

describe('computeTax, the two modes agree at the boundary', () => {
  test('exclusive on the net equals inclusive on the gross', () => {
    const excl = computeTax({ total: 100, rate: 15, enabled: true, inclusive: false });
    const incl = computeTax({ total: excl.total, rate: 15, enabled: true, inclusive: true });
    expect(incl.subtotal).toBeCloseTo(excl.subtotal, 2);
    expect(incl.tax).toBeCloseTo(excl.tax, 2);
    expect(incl.total).toBeCloseTo(excl.total, 2);
  });

  test('a Ghanaian VAT-plus-levies effective rate round-trips', () => {
    // 15 VAT on top of 2.5 NHIL + 2.5 GETFund + 1 COVID works out near 21.9%
    // in total. The app takes one rate rather than modelling the stack, so the
    // arithmetic has to hold at that value like any other.
    const excl = computeTax({ total: 80, rate: 21.9, enabled: true, inclusive: false });
    const incl = computeTax({ total: excl.total, rate: 21.9, enabled: true, inclusive: true });
    expect(incl.subtotal).toBeCloseTo(80, 1);
  });
});

describe('computeTax, output shape', () => {
  test('every field is a number rounded to at most two decimals', () => {
    const r = computeTax({ total: 33.33, rate: 17.5, enabled: true, inclusive: true });
    for (const v of [r.subtotal, r.tax, r.total]) {
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.round(v * 100)).toBe(v * 100);
    }
  });
});
