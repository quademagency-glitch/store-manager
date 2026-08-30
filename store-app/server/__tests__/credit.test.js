const { checkCreditLimit, outstandingBalance } = require('../utils/credit');

const inv = (total, paid, status = 'open') => ({ total_amount: total, amount_paid: paid, status });

describe('outstandingBalance', () => {
  it('is the unpaid remainder, not the invoiced total', () => {
    expect(outstandingBalance([inv(500, 200), inv(300, 300)])).toBe(300);
  });

  it('ignores void invoices, which are not debt', () => {
    expect(outstandingBalance([inv(500, 0), inv(1000, 0, 'void')])).toBe(500);
  });

  it('is 0 for an account with no invoices', () => {
    expect(outstandingBalance([])).toBe(0);
    expect(outstandingBalance(null)).toBe(0);
  });

  it('does not accumulate floating point noise', () => {
    expect(outstandingBalance([inv(0.1, 0), inv(0.2, 0)])).toBe(0.3);
  });
});

describe('checkCreditLimit', () => {
  it('allows anything when no limit is set, which is the pre-075 behaviour', () => {
    for (const limit of [null, undefined]) {
      expect(checkCreditLimit({ limit, invoices: [inv(9000, 0)], amount: 5000 }).allowed).toBe(true);
    }
  });

  it('treats a limit of 0 as a real decision, not as absent', () => {
    const verdict = checkCreditLimit({ limit: 0, invoices: [], amount: 1 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.limit).toBe(0);
  });

  it('measures the whole account, not the single invoice', () => {
    // Ten invoices of 500 against a limit of 500 is the bug this prevents.
    const invoices = [inv(500, 0)];
    expect(checkCreditLimit({ limit: 500, invoices, amount: 500 }).allowed).toBe(false);
  });

  it('allows reaching the limit exactly', () => {
    expect(checkCreditLimit({ limit: 500, invoices: [inv(200, 0)], amount: 300 }).allowed).toBe(true);
  });

  it('refuses one pesewa over', () => {
    expect(checkCreditLimit({ limit: 500, invoices: [inv(200, 0)], amount: 300.01 }).allowed).toBe(false);
  });

  it('counts payments as freeing up credit', () => {
    const invoices = [inv(500, 500)]; // fully paid
    expect(checkCreditLimit({ limit: 500, invoices, amount: 500 }).allowed).toBe(true);
  });

  it('lets an opening balance through, because it records debt that already exists', () => {
    const verdict = checkCreditLimit({
      limit: 100, invoices: [], amount: 5000, isOpeningBalance: true,
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.projected).toBe(5000);
  });

  it('reports the numbers the error message quotes', () => {
    const verdict = checkCreditLimit({ limit: 500, invoices: [inv(400, 100)], amount: 250 });
    expect(verdict).toMatchObject({ allowed: false, limit: 500, outstanding: 300, projected: 550 });
  });

  it('does not block on a non-numeric limit', () => {
    // Nothing should be able to make invoicing impossible via a bad column value.
    expect(checkCreditLimit({ limit: 'abc', invoices: [], amount: 10 }).allowed).toBe(true);
  });
});
