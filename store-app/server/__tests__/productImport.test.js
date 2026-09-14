/**
 * Bulk product import.
 *
 * This had no tests at all, and every fault it shipped was a SILENT one, the
 * kind no exception and no log line reports. On 2026-09-12 a real customer
 * imported 52 products with a Quantity column; the wizard said "52 of 52
 * succeeded" and every quantity was discarded, because the sheet carried no
 * location UUID and the committer skipped the inventory insert without a
 * word. Their inventory then read zero, and so did their stock value.
 *
 * So these tests are mostly about what must NOT pass quietly:
 *   - a quantity that has nowhere to go must fail, never import as zero
 *   - a location belonging to someone else must be refused (the importer
 *     runs as supabaseAdmin and bypasses RLS)
 *   - a cost that is not a number must not reach the database as NaN
 * and about what must now be allowed through: a sheet with only what you
 * paid, no selling price, which is what a supplier price list looks like.
 */

/* importValidators requires db/supabase, which calls createClient() at module
   scope. On Node 20, which is what CI runs, that throws for want of a native
   WebSocket. Mocked away entirely, matching the other suites. */
const { buildMockSupabase } = require('./helpers/mockSupabase');

const overrides = {};
const mock = buildMockSupabase(overrides);
jest.mock('../db/supabase', () => ({ supabaseAdmin: mock }));

const { validateProductRows, ImportRequestError } = require('../services/importValidators');
const { parseFile, suggestColumnMapping, applyColumnMapping } = require('../services/importParser');

const BIZ = 'biz-uuid-123';
const LOC_A = '11111111-1111-4111-8111-111111111111';
const LOC_B = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '99999999-9999-4999-8999-999999999999';

const PRODUCT_FIELDS = ['name', 'sku', 'category', 'price', 'cost_price', 'opening_quantity', 'location_id'];

/** No product in the file collides with an existing SKU unless a test says so. */
function withLocations(ids, existingSkus = []) {
  overrides.locations = { data: ids.map(id => ({ id })), error: null };
  overrides.products = { data: existingSkus.map(sku => ({ sku })), error: null };
}

beforeEach(() => {
  for (const k of Object.keys(overrides)) delete overrides[k];
  withLocations([LOC_A]);
});

const rowFor = (over = {}) => ({ name: 'Hisense Fridge', sku: 'HS-220', price: '2450', ...over });

describe('opening stock has to land somewhere', () => {
  it('sends stock to the only location without being asked', async () => {
    const { valid, errors } = await validateProductRows([rowFor({ opening_quantity: '7' })], BIZ);

    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].opening_quantity).toBe(7);
    expect(valid[0].location_id).toBe(LOC_A);
  });

  /* The regression that started all of this. A quantity with no location used
     to import as a success and vanish. */
  it('refuses a quantity it cannot place instead of dropping it', async () => {
    withLocations([LOC_A, LOC_B]);

    const { valid, errors } = await validateProductRows([rowFor({ opening_quantity: '7' })], BIZ);

    expect(valid).toHaveLength(0);
    expect(errors).toContainEqual(
      expect.objectContaining({ row: 2, field: 'location_id', message: expect.stringMatching(/several locations/i) }),
    );
  });

  it('says to create a location when the business has none', async () => {
    withLocations([]);

    const { valid, errors } = await validateProductRows([rowFor({ opening_quantity: '7' })], BIZ);

    expect(valid).toHaveLength(0);
    expect(errors[0].message).toMatch(/no locations yet/i);
  });

  it('lets a product with no quantity through when the location is ambiguous', async () => {
    withLocations([LOC_A, LOC_B]);

    const { valid, errors } = await validateProductRows([rowFor()], BIZ);

    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].opening_quantity).toBe(0);
  });

  it('uses the location picked in the wizard when the sheet does not say', async () => {
    withLocations([LOC_A, LOC_B]);

    const { valid, errors } = await validateProductRows(
      [rowFor({ opening_quantity: '3' })], BIZ, { locationId: LOC_B },
    );

    expect(errors).toEqual([]);
    expect(valid[0].location_id).toBe(LOC_B);
  });

  it('lets a per-row location beat the picker', async () => {
    withLocations([LOC_A, LOC_B]);

    const { valid } = await validateProductRows(
      [rowFor({ opening_quantity: '3', location_id: LOC_A })], BIZ, { locationId: LOC_B },
    );

    expect(valid[0].location_id).toBe(LOC_A);
  });
});

/* The import runs as supabaseAdmin, so RLS is not there to catch this. An
   unchecked id would write this tenant's opening stock into another tenant's
   location. */
describe('a location must belong to the caller', () => {
  it('rejects a row naming a location this business does not own', async () => {
    const { valid, errors } = await validateProductRows(
      [rowFor({ opening_quantity: '7', location_id: FOREIGN })], BIZ,
    );

    expect(valid).toHaveLength(0);
    expect(errors).toContainEqual(
      expect.objectContaining({ field: 'location_id', message: expect.stringMatching(/does not belong/i) }),
    );
  });

  it('refuses the whole request when the picked location is not ours', async () => {
    await expect(validateProductRows([rowFor()], BIZ, { locationId: FOREIGN }))
      .rejects.toThrow(ImportRequestError);
  });
});

describe('only the name is required', () => {
  it('imports a sheet that has cost but no selling price', async () => {
    const { valid, errors, warnings } = await validateProductRows(
      [{ name: 'Kettle', sku: 'K-1', cost_price: '80', opening_quantity: '12' }], BIZ,
    );

    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ name: 'Kettle', price: 0, cost_price: 80, opening_quantity: 12 });
    expect(warnings[0].message).toMatch(/needs pricing/i);
  });

  it('summarises unpriced rows once rather than once per row', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ name: `Item ${i}`, sku: `S-${i}`, cost_price: '5' }));

    const { warnings } = await validateProductRows(rows, BIZ);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/20 rows/);
  });

  it('still rejects a price that is present but not a number', async () => {
    const { errors } = await validateProductRows([rowFor({ price: 'free' })], BIZ);
    expect(errors).toContainEqual(expect.objectContaining({ field: 'price' }));
  });

  /* Cost was never range-checked, so Number("abc") reached the insert as NaN. */
  it('rejects a cost that is not a number instead of storing NaN', async () => {
    const { valid, errors } = await validateProductRows([rowFor({ cost_price: 'abc' })], BIZ);

    expect(valid).toHaveLength(0);
    expect(errors).toContainEqual(expect.objectContaining({ field: 'cost_price' }));
  });

  it('rejects a negative cost', async () => {
    const { errors } = await validateProductRows([rowFor({ cost_price: '-5' })], BIZ);
    expect(errors).toContainEqual(expect.objectContaining({ field: 'cost_price' }));
  });

  it('still requires a name', async () => {
    const { valid, errors } = await validateProductRows([{ sku: 'X-1', price: '5' }], BIZ);

    expect(valid).toHaveLength(0);
    expect(errors).toContainEqual(expect.objectContaining({ field: 'name' }));
  });
});

describe('SKU', () => {
  it('generates one from the name when the sheet has no SKU column', async () => {
    const { valid, errors } = await validateProductRows([{ name: 'Hisense Fridge 220L' }], BIZ);

    expect(errors).toEqual([]);
    expect(valid[0].sku).toMatch(/^HISENSE-FRIDGE-2/);
  });

  it('gives two identically named products different SKUs', async () => {
    const { valid } = await validateProductRows([{ name: 'Kettle' }, { name: 'Kettle' }], BIZ);

    expect(valid).toHaveLength(2);
    expect(valid[0].sku).not.toBe(valid[1].sku);
  });

  it('falls back to ITEM when the name has no usable characters', async () => {
    const { valid } = await validateProductRows([{ name: '???' }], BIZ);
    expect(valid[0].sku).toMatch(/^ITEM-/);
  });

  it('still catches a duplicate inside the file', async () => {
    const { errors } = await validateProductRows([rowFor(), rowFor()], BIZ);
    expect(errors).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/Duplicate SKU/) }));
  });

  it('still catches a SKU already used on the platform', async () => {
    withLocations([LOC_A], ['HS-220']);

    const { valid, errors } = await validateProductRows([rowFor()], BIZ);

    expect(valid).toHaveLength(0);
    expect(errors).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/globally unique/) }));
  });
});

/* The customer's own sheet. Four of its five headers matched nothing, so all
   of it had to be mapped by hand, and "Quantity" not matching is what led to
   the column being mapped correctly and the value still being lost. */
describe('column matching against a real spreadsheet', () => {
  const REAL_HEADERS = ['Product Name', 'Model / SKU', 'Unit Price (GHS)', 'Quantity', 'Category'];

  it('maps every header of the sheet that failed', () => {
    const mapping = suggestColumnMapping(REAL_HEADERS, PRODUCT_FIELDS, 'products');

    expect(mapping).toEqual({
      'Product Name': 'name',
      'Model / SKU': 'sku',
      'Unit Price (GHS)': 'price',
      Quantity: 'opening_quantity',
      Category: 'category',
    });
  });

  it('recognises cost under the names a price list uses', () => {
    for (const header of ['Cost', 'Buying Price', 'Purchase Price', 'Unit Cost']) {
      expect(suggestColumnMapping([header], PRODUCT_FIELDS, 'products')).toEqual({ [header]: 'cost_price' });
    }
  });

  it('recognises quantity under the names a stock sheet uses', () => {
    for (const header of ['Qty', 'Stock', 'On Hand', 'Opening Stock']) {
      expect(suggestColumnMapping([header], PRODUCT_FIELDS, 'products')).toEqual({ [header]: 'opening_quantity' });
    }
  });

  it('prefers an exact field name over an alias for the same field', () => {
    expect(suggestColumnMapping(['Cost', 'Cost Price'], PRODUCT_FIELDS, 'products'))
      .toEqual({ 'Cost Price': 'cost_price' });
  });

  it('never gives one field to two columns', () => {
    const mapping = suggestColumnMapping(['Qty', 'Stock', 'On Hand'], PRODUCT_FIELDS, 'products');
    expect(Object.values(mapping)).toEqual(['opening_quantity']);
  });

  it('leaves a column it does not recognise for the user to map', () => {
    expect(suggestColumnMapping(['Shelf Position'], PRODUCT_FIELDS, 'products')).toEqual({});
  });
});

describe('file formats', () => {
  const XLSX = require('xlsx');
  const SHEET = [
    ['Product Name', 'Model / SKU', 'Unit Price (GHS)', 'Quantity'],
    ['Hisense Fridge', 'HS-220', 2450.5, 7],
  ];

  const workbook = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SHEET), 'Sheet1');
    return wb;
  };

  /* .xls was advertised in the file picker and accepted by the upload filter,
     then rejected at parse with "please re-save as .xlsx", after the user had
     already waited for the upload. exceljs cannot read the format at all. */
  it('reads a genuine Excel 97-2003 .xls', async () => {
    const buffer = XLSX.write(workbook(), { type: 'buffer', bookType: 'biff8' });
    // OLE2 compound document magic, i.e. really the legacy format.
    expect(buffer.slice(0, 4).toString('hex')).toBe('d0cf11e0');

    const { headers, rows } = await parseFile(buffer, 'stock.xls');

    expect(headers).toEqual(SHEET[0]);
    expect(rows[0]['Model / SKU']).toBe('HS-220');
  });

  it('reads .xlsx the same way', async () => {
    const buffer = XLSX.write(workbook(), { type: 'buffer', bookType: 'xlsx' });
    const { rows } = await parseFile(buffer, 'stock.xlsx');
    expect(rows[0]['Product Name']).toBe('Hisense Fridge');
  });

  it('reads .csv the same way', async () => {
    const csv = 'Product Name,Model / SKU,Unit Price (GHS),Quantity\nHisense Fridge,HS-220,2450.5,7\n';
    const { rows } = await parseFile(Buffer.from(csv), 'stock.csv');
    expect(rows[0].Quantity).toBe('7');
  });

  it('names the formats it does take when given something else', async () => {
    await expect(parseFile(Buffer.from('x'), 'notes.txt')).rejects.toThrow(/\.csv, \.xlsx or \.xls/);
  });

  it('carries a real sheet all the way to validated rows', async () => {
    const buffer = XLSX.write(workbook(), { type: 'buffer', bookType: 'biff8' });
    const { headers, rows } = await parseFile(buffer, 'stock.xls');
    const mapped = applyColumnMapping(rows, suggestColumnMapping(headers, PRODUCT_FIELDS, 'products'));

    const { valid, errors } = await validateProductRows(mapped, BIZ);

    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({
      name: 'Hisense Fridge',
      sku: 'HS-220',
      price: 2450.5,
      opening_quantity: 7,
      location_id: LOC_A,
    });
  });
});
