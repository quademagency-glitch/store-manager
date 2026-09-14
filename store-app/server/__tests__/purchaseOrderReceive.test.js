const request = require('supertest');
const { buildMockSupabase } = require('./helpers/mockSupabase');

/**
 * Receiving goods against a purchase order.
 *
 * Receiving read the line's unit_cost, put it in the JSON response and the
 * GRN, and never wrote it to the product. So a shop could receive five air
 * conditioners at GHS 4,500 each and products.cost_price stayed 0.00: every
 * margin was computed as though the stock had been free, and the "set price
 * from cost" bulk tool skipped the product entirely for having no cost.
 *
 * The failure was invisible in the response, which cheerfully echoed the
 * 4,500 back.
 */
const overrides = {};
const mock = buildMockSupabase(overrides);
jest.mock('../db/supabase', () => ({ supabaseAdmin: mock }));

const app = require('../index');

const BIZ = 'biz-uuid-123'; // matches the mock's default user
const PO_ID = 'po-uuid-1';
const ITEM_ID = 'item-uuid-1';
const PRODUCT_ID = 'product-uuid-1';
const LOCATION_ID = 'location-uuid-1';

function givenPurchaseOrder(opts = {}) {
  const { status = 'sent', quantity = 5, received = 0 } = opts;
  /* Read with `in` rather than a destructuring default, so that passing an
     explicit `undefined` really does mean "no cost on this line". A default
     would quietly substitute 4500 and the test would assert nothing. */
  const unitCost = 'unitCost' in opts ? opts.unitCost : 4500;

  overrides.purchase_orders = {
    data: {
      id: PO_ID,
      business_id: BIZ,
      po_number: 'PO-0001',
      status,
      supplier: { name: 'Omek Gigs Headoffice' },
      items: [{
        id: ITEM_ID,
        product_id: PRODUCT_ID,
        quantity,
        received_quantity: received,
        unit_cost: unitCost,
      }],
    },
    error: null,
  };
}

const receive = (body) => request(app)
  .post(`/api/purchase-orders/${PO_ID}/receive`)
  .set('Authorization', 'Bearer valid-test-token')
  .send({ location_id: LOCATION_ID, items: [{ item_id: ITEM_ID, received_qty: 5 }], ...body });

const mutationsOn = (table, op) => mock.mutations.filter(m => m.table === table && (!op || m.op === op));

beforeEach(() => {
  for (const k of Object.keys(overrides)) delete overrides[k];
  mock.mutations.length = 0;
  givenPurchaseOrder();
});

describe('POST /api/purchase-orders/:id/receive', () => {
  it('writes what the goods cost onto the product', async () => {
    const res = await receive();

    expect(res.status).toBe(200);
    const update = mutationsOn('products', 'update')[0];
    expect(update).toBeDefined();
    expect(update.payload).toEqual({ cost_price: 4500 });
  });

  it('accepts a cost written as a string, which is how numeric comes back', async () => {
    givenPurchaseOrder({ unitCost: '4500.00' });

    await receive();

    expect(mutationsOn('products', 'update')[0].payload).toEqual({ cost_price: 4500 });
  });

  /* A zero unit cost means "not recorded", not "free". Writing it would wipe
     a cost the owner had already set by hand. */
  it('leaves the recorded cost alone when the line has no cost', async () => {
    givenPurchaseOrder({ unitCost: 0 });

    const res = await receive();

    expect(res.status).toBe(200);
    expect(mutationsOn('products', 'update')).toHaveLength(0);
  });

  it('leaves it alone for a null or unparseable cost too', async () => {
    for (const bad of [null, undefined, '', 'abc']) {
      mock.mutations.length = 0;
      givenPurchaseOrder({ unitCost: bad });

      await receive();

      expect(mutationsOn('products', 'update')).toHaveLength(0);
    }
  });

  it('never lets a cost update escape the caller business', async () => {
    await receive();
    // The mock records only the payload, so the guard is asserted on the
    // route reading req.user.business_id rather than the PO's own column.
    const src = require('fs').readFileSync(require('path').join(__dirname, '../routes/purchaseOrders.js'), 'utf8');
    const block = src.slice(src.indexOf('.from(\'products\')'));
    expect(block.slice(0, 300)).toMatch(/\.eq\('business_id', req\.user\.business_id\)/);
  });

  it('still adds the received quantity to the location', async () => {
    await receive();

    const upsert = mutationsOn('product_inventory', 'upsert')[0];
    expect(upsert.payload).toMatchObject({
      product_id: PRODUCT_ID,
      location_id: LOCATION_ID,
      quantity: 5,
    });
  });

  it('ties the stock movement back to the purchase order', async () => {
    await receive();

    const movement = mutationsOn('stock_movements', 'insert')[0];
    expect(movement.payload).toMatchObject({
      product_id: PRODUCT_ID,
      movement_type: 'RECEIPT',
      quantity_change: 5,
      reference_id: PO_ID,
    });
    expect(movement.payload.notes).toMatch(/PO-0001/);
  });

  it('records the received quantity against the line', async () => {
    await receive();

    expect(mutationsOn('purchase_order_items', 'update')[0].payload)
      .toEqual({ received_quantity: 5 });
  });

  it('will not receive against a draft, which must be sent first', async () => {
    givenPurchaseOrder({ status: 'draft' });

    const res = await receive();

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/draft/);
    expect(mutationsOn('products', 'update')).toHaveLength(0);
  });

  it('refuses a receipt with no location, since stock has to land somewhere', async () => {
    const res = await request(app)
      .post(`/api/purchase-orders/${PO_ID}/receive`)
      .set('Authorization', 'Bearer valid-test-token')
      .send({ items: [{ item_id: ITEM_ID, received_qty: 5 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/location_id is required/);
  });

  it('does not over-receive beyond what was ordered', async () => {
    givenPurchaseOrder({ quantity: 5, received: 3 });

    await receive({ items: [{ item_id: ITEM_ID, received_qty: 99 }] });

    // Only the outstanding 2 are taken.
    expect(mutationsOn('purchase_order_items', 'update')[0].payload)
      .toEqual({ received_quantity: 5 });
    expect(mutationsOn('stock_movements', 'insert')[0].payload.quantity_change).toBe(2);
  });

  it('writes nothing at all when the whole line is already received', async () => {
    givenPurchaseOrder({ quantity: 5, received: 5 });

    await receive();

    expect(mutationsOn('products', 'update')).toHaveLength(0);
    expect(mutationsOn('stock_movements', 'insert')).toHaveLength(0);
    expect(mutationsOn('product_inventory', 'upsert')).toHaveLength(0);
  });
});
