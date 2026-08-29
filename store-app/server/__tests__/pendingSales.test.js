/**
 * Reversing an abandoned sale.
 *
 * The stock is taken down when the sale row is written, before the payment
 * screen, so a sale nobody paid for holds goods off the shelf until something
 * puts them back. These tests cover the guards rather than the arithmetic:
 * putting stock back for a sale that really happened is worse than leaving it.
 */
const { buildMockSupabase } = require('./helpers/mockSupabase');

const SALE = {
  id: 'sale-uuid-1',
  business_id: 'biz-uuid-123',
  status: 'pending',
  location_id: 'loc-uuid-1',
  sale_items: [{ product_id: 'prod-1', quantity: 3 }],
};

function load(overrides) {
  jest.resetModules();
  const mock = buildMockSupabase(overrides);
  jest.doMock('../db/supabase', () => ({ supabaseAdmin: mock }));
  const { reversePendingSale } = require('../services/pendingSales');
  return { reversePendingSale, mock };
}

describe('reversePendingSale', () => {
  afterEach(() => jest.resetModules());

  test('reverses a pending sale and reports it', async () => {
    const { reversePendingSale } = load({
      sales: [
        { single: { data: SALE, error: null }, data: SALE, error: null },
        { single: { data: { id: SALE.id }, error: null }, data: { id: SALE.id }, error: null },
      ],
      product_inventory: { single: { data: { quantity: 10 }, error: null }, data: { quantity: 10 }, error: null },
      inventory_units: { data: null, error: null },
    });

    const result = await reversePendingSale(SALE.id, { reason: 'test' });
    expect(result.reversed).toBe(true);
  });

  for (const status of ['completed', 'voided', 'void_pending']) {
    test(`refuses to touch a ${status} sale`, async () => {
      // The damaging case: returning stock for a sale that was really made.
      const { reversePendingSale } = load({
        sales: { single: { data: { ...SALE, status }, error: null }, data: { ...SALE, status }, error: null },
      });

      const result = await reversePendingSale(SALE.id);
      expect(result.reversed).toBe(false);
      expect(result.skipped).toBe(status);
    });
  }

  test('a sale that is gone is not an error', async () => {
    const { reversePendingSale } = load({
      sales: { single: { data: null, error: { message: 'no rows' } }, data: null, error: { message: 'no rows' } },
    });

    const result = await reversePendingSale('missing-uuid');
    expect(result.reversed).toBe(false);
    expect(result.skipped).toBe('not-found');
  });

  test('loses the race rather than restoring stock twice', async () => {
    /* Two reversals at once, the cashier's cancel and the sweeper. The status
       update is conditional on the row still being pending, so the loser
       matches nothing and must report it instead of claiming success. */
    const { reversePendingSale } = load({
      sales: [
        { single: { data: SALE, error: null }, data: SALE, error: null },
        { single: { data: null, error: null }, data: null, error: null },
      ],
      product_inventory: { single: { data: { quantity: 10 }, error: null }, data: { quantity: 10 }, error: null },
      inventory_units: { data: null, error: null },
    });

    const result = await reversePendingSale(SALE.id);
    expect(result.reversed).toBe(false);
    expect(result.skipped).toBe('raced');
  });

  test('marks the sale voided, never void_pending', async () => {
    /* void_pending means a finished sale awaiting a manager, and the reports
       count it as money taken. A sale nobody paid for must not land there. */
    jest.resetModules();
    const mock = buildMockSupabase({
      sales: [
        { single: { data: SALE, error: null }, data: SALE, error: null },
        { single: { data: { id: SALE.id }, error: null }, data: { id: SALE.id }, error: null },
      ],
      product_inventory: { single: { data: { quantity: 10 }, error: null }, data: { quantity: 10 }, error: null },
      inventory_units: { data: null, error: null },
    });
    jest.doMock('../db/supabase', () => ({ supabaseAdmin: mock }));
    const { reversePendingSale } = require('../services/pendingSales');

    await reversePendingSale(SALE.id);

    const statuses = mock.mutations
      .filter((m) => m.table === 'sales' && m.op === 'update')
      .map((m) => m.payload.status);
    expect(statuses).toContain('voided');
    expect(statuses).not.toContain('void_pending');
  });
});
