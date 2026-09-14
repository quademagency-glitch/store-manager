const { randomBytes } = require('crypto');
const { supabaseAdmin } = require('../db/supabase');

/**
 * Dry-run validators for bulk import. Each returns:
 *   { valid: [rowWithLineNumber], errors: [{row, field, message}], warnings: [{row, field, message}] }
 * Rows are never mutated in place, callers get back normalized copies.
 */

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * Thrown for a request that is wrong as a whole rather than row by row, e.g.
 * importing into a location the caller does not own. The route turns this
 * into a 400 instead of repeating the same message against every row.
 */
class ImportRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportRequestError';
    this.status = 400;
  }
}

/**
 * Stock does not live on `products`, it was dropped from that table in
 * migration 011. It lives in product_inventory, one row per (product,
 * location), so a quantity with no location has nowhere to go.
 *
 * Until 2026-09-13 the committer simply skipped the inventory insert when a
 * row carried no location_id, with no error and no warning, and the wizard
 * still reported the row as a success. One real customer imported 52
 * products that way and every quantity was discarded. The only way to supply
 * a location was to hand-paste a UUID into every row of the spreadsheet.
 *
 * So: prefer the location the user picked in the wizard, fall back to the
 * business's only location when it has exactly one (which is every
 * single-branch shop, the common case), and if neither applies make it a
 * blocking error rather than losing the number silently.
 */
async function resolveImportLocation(businessId, requestedLocationId) {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id')
    .eq('business_id', businessId);
  if (error) throw error;

  const locations = data || [];
  const owned = new Set(locations.map(l => l.id));

  if (requestedLocationId) {
    // Never trust a caller-supplied location. The import runs as
    // supabaseAdmin, which bypasses RLS, so an unchecked id here would write
    // this tenant's opening stock into another tenant's location.
    if (!owned.has(requestedLocationId)) {
      throw new ImportRequestError('That location does not belong to this business.');
    }
    return { owned, locationCount: locations.length, fallbackLocationId: requestedLocationId };
  }

  return {
    owned,
    locationCount: locations.length,
    fallbackLocationId: locations.length === 1 ? locations[0].id : null,
  };
}

/**
 * SKU is NOT NULL and globally unique, so a sheet without one still needs a
 * value. Derive it from the name and add entropy, because uniqueness spans
 * every business on the platform. A collision against a row we did not query
 * still lands on the committer's 23505 branch with a readable message.
 */
function generateSku(name, taken) {
  const base = String(name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16) || 'ITEM';

  let candidate;
  do {
    candidate = `${base}-${randomBytes(4).toString('hex').toUpperCase()}`;
  } while (taken.has(candidate));

  taken.add(candidate);
  return candidate;
}

/**
 * Products: only `name` is required. Price is deliberately optional, a
 * supplier's price list normally carries what you paid, not what you will
 * charge, and forcing a selling price made those sheets un-importable.
 * Unpriced products land at 0 and are listed under "Needs pricing", where
 * the bulk price tool can set prices from cost.
 *
 * SKU is GLOBALLY unique across the whole platform (not per-business, see
 * the products.sku UNIQUE constraint), so dedup must check the entire table,
 * not just this business.
 */
async function validateProductRows(rows, businessId, options = {}) {
  const errors = [];
  const warnings = [];
  const valid = [];

  const { owned, locationCount, fallbackLocationId } =
    await resolveImportLocation(businessId, options.locationId || null);

  const seenSkus = new Map(); // sku -> first row number seen at
  const skusToCheck = [];

  rows.forEach((row, i) => {
    const lineNumber = i + 2; // +1 for 1-indexing, +1 for the header row
    const sku = String(row.sku || '').trim();
    if (isBlank(row.name)) errors.push({ row: lineNumber, field: 'name', message: 'Name is required' });

    if (!isBlank(row.price) && (Number.isNaN(Number(row.price)) || Number(row.price) < 0)) {
      errors.push({ row: lineNumber, field: 'price', message: 'Price must be a non-negative number' });
    }
    // Cost was never range-checked, so Number("abc") reached the insert as NaN.
    if (!isBlank(row.cost_price) && (Number.isNaN(Number(row.cost_price)) || Number(row.cost_price) < 0)) {
      errors.push({ row: lineNumber, field: 'cost_price', message: 'Cost price must be a non-negative number' });
    }

    if (!isBlank(row.opening_quantity) && (Number.isNaN(Number(row.opening_quantity)) || Number(row.opening_quantity) < 0)) {
      errors.push({ row: lineNumber, field: 'opening_quantity', message: 'Quantity must be a non-negative number' });
    }

    const rowLocation = isBlank(row.location_id) ? null : String(row.location_id).trim();
    if (rowLocation && !owned.has(rowLocation)) {
      errors.push({ row: lineNumber, field: 'location_id', message: `Location '${rowLocation}' does not belong to this business.` });
    }

    const quantity = isBlank(row.opening_quantity) ? 0 : parseInt(row.opening_quantity, 10) || 0;
    if (quantity > 0 && !rowLocation && !fallbackLocationId) {
      errors.push({
        row: lineNumber,
        field: 'location_id',
        message: locationCount === 0
          ? 'There is nowhere to put this stock: the business has no locations yet. Add a location first.'
          : 'This business has several locations, so pick which one this opening stock belongs to before importing.',
      });
    }

    if (sku) {
      if (seenSkus.has(sku)) {
        errors.push({ row: lineNumber, field: 'sku', message: `Duplicate SKU '${sku}' also appears on row ${seenSkus.get(sku)} of this file` });
      } else {
        seenSkus.set(sku, lineNumber);
        skusToCheck.push(sku);
      }
    }
  });

  let existingSkus = new Set();
  if (skusToCheck.length > 0) {
    const { data, error } = await supabaseAdmin.from('products').select('sku').in('sku', skusToCheck);
    if (error) throw error;
    existingSkus = new Set((data || []).map(p => p.sku));
  }

  const takenSkus = new Set([...existingSkus, ...seenSkus.keys()]);
  const unpricedRows = [];

  rows.forEach((row, i) => {
    const lineNumber = i + 2;
    const sku = String(row.sku || '').trim();
    if (sku && existingSkus.has(sku)) {
      errors.push({ row: lineNumber, field: 'sku', message: `SKU '${sku}' is already in use on this platform. SKUs must be globally unique, please use a different SKU.` });
      return;
    }
    if (errors.some(e => e.row === lineNumber)) return;

    const price = isBlank(row.price) ? 0 : Number(row.price);
    const rowLocation = isBlank(row.location_id) ? null : String(row.location_id).trim();
    const quantity = isBlank(row.opening_quantity) ? 0 : parseInt(row.opening_quantity, 10) || 0;

    if (price === 0) unpricedRows.push(lineNumber);

    valid.push({
      row: lineNumber,
      name: String(row.name).trim(),
      sku: sku || generateSku(row.name, takenSkus),
      category: isBlank(row.category) ? 'Uncategorized' : String(row.category).trim(),
      price,
      cost_price: isBlank(row.cost_price) ? 0 : Number(row.cost_price),
      opening_quantity: quantity,
      // Resolved here, not in the committer, so that "which location?" is
      // answered once per import and a row can never reach the database with
      // a quantity and nowhere to put it.
      location_id: quantity > 0 ? (rowLocation || fallbackLocationId) : (rowLocation || null),
    });
  });

  // One line, not one per row. A deliberately cost-only sheet would
  // otherwise fill the review step with hundreds of identical warnings.
  if (unpricedRows.length > 0) {
    warnings.push({
      row: unpricedRows[0],
      field: 'price',
      message: unpricedRows.length === 1
        ? 'No selling price. This product imports at 0 and will be listed under "Needs pricing".'
        : `${unpricedRows.length} rows have no selling price. They import at 0 and will be listed under "Needs pricing", where you can set prices from cost.`,
    });
  }

  return { valid, errors, warnings };
}

/**
 * Customers: name, phone required. Phone is unique per business (matches
 * the real customers UNIQUE(business_id, phone) constraint). An
 * opening_ar_amount column, if present, requires opening_ar_as_of_date.
 */
async function validateCustomerRows(rows, businessId) {
  const errors = [];
  const warnings = [];
  const valid = [];

  const seenPhones = new Map();
  const phonesToCheck = [];

  rows.forEach((row, i) => {
    const lineNumber = i + 2;
    const phone = String(row.phone || '').trim();
    if (isBlank(row.name)) errors.push({ row: lineNumber, field: 'name', message: 'Name is required' });
    if (isBlank(phone)) errors.push({ row: lineNumber, field: 'phone', message: 'Phone is required' });

    if (!isBlank(row.opening_ar_amount)) {
      const amount = Number(row.opening_ar_amount);
      if (Number.isNaN(amount) || amount < 0) {
        errors.push({ row: lineNumber, field: 'opening_ar_amount', message: 'opening_ar_amount must be a non-negative number' });
      } else if (amount > 0 && isBlank(row.opening_ar_as_of_date)) {
        errors.push({ row: lineNumber, field: 'opening_ar_as_of_date', message: 'opening_ar_as_of_date is required when opening_ar_amount is set' });
      }
    }

    if (phone) {
      if (seenPhones.has(phone)) {
        errors.push({ row: lineNumber, field: 'phone', message: `Duplicate phone '${phone}' also appears on row ${seenPhones.get(phone)} of this file` });
      } else {
        seenPhones.set(phone, lineNumber);
        phonesToCheck.push(phone);
      }
    }
  });

  let existingPhones = new Set();
  if (phonesToCheck.length > 0) {
    const { data, error } = await supabaseAdmin.from('customers').select('phone').eq('business_id', businessId).in('phone', phonesToCheck);
    if (error) throw error;
    existingPhones = new Set((data || []).map(c => c.phone));
  }

  rows.forEach((row, i) => {
    const lineNumber = i + 2;
    const phone = String(row.phone || '').trim();
    if (errors.some(e => e.row === lineNumber)) return;

    if (phone && existingPhones.has(phone)) {
      errors.push({ row: lineNumber, field: 'phone', message: `A customer with phone '${phone}' already exists (customer_code lookup required to merge manually).` });
      return;
    }

    const openingArAmount = isBlank(row.opening_ar_amount) ? 0 : Number(row.opening_ar_amount);

    valid.push({
      row: lineNumber,
      name: String(row.name).trim(),
      phone,
      opening_ar_amount: openingArAmount,
      opening_ar_as_of_date: openingArAmount > 0 ? String(row.opening_ar_as_of_date).trim() : null,
      opening_ar_description: isBlank(row.opening_ar_description) ? null : String(row.opening_ar_description).trim(),
    });
  });

  return { valid, errors, warnings };
}

/**
 * Suppliers: name required only, suppliers have no DB uniqueness
 * constraint even on manual entry, so import shouldn't be stricter than
 * that. Exact-name collisions are surfaced as non-blocking warnings.
 */
async function validateSupplierRows(rows, businessId) {
  const errors = [];
  const warnings = [];
  const valid = [];

  rows.forEach((row, i) => {
    const lineNumber = i + 2;
    if (isBlank(row.name)) errors.push({ row: lineNumber, field: 'name', message: 'Name is required' });

    if (!isBlank(row.opening_ap_amount)) {
      const amount = Number(row.opening_ap_amount);
      if (Number.isNaN(amount) || amount < 0) {
        errors.push({ row: lineNumber, field: 'opening_ap_amount', message: 'opening_ap_amount must be a non-negative number' });
      } else if (amount > 0 && isBlank(row.opening_ap_as_of_date)) {
        errors.push({ row: lineNumber, field: 'opening_ap_as_of_date', message: 'opening_ap_as_of_date is required when opening_ap_amount is set' });
      }
    }
  });

  const namesToCheck = [...new Set(rows.map(r => String(r.name || '').trim()).filter(Boolean))];
  let existingByName = new Map();
  if (namesToCheck.length > 0) {
    const { data, error } = await supabaseAdmin.from('suppliers').select('id, name').eq('business_id', businessId);
    if (error) throw error;
    existingByName = new Map((data || []).map(s => [s.name.toLowerCase(), s.name]));
  }

  rows.forEach((row, i) => {
    const lineNumber = i + 2;
    if (errors.some(e => e.row === lineNumber)) return;

    const name = String(row.name).trim();
    const existingMatch = existingByName.get(name.toLowerCase());
    if (existingMatch) {
      warnings.push({ row: lineNumber, field: 'name', message: `A supplier named '${existingMatch}' already exists, this will still import as a separate record unless you remove this row.` });
    }

    const openingApAmount = isBlank(row.opening_ap_amount) ? 0 : Number(row.opening_ap_amount);

    valid.push({
      row: lineNumber,
      name,
      contact_person: isBlank(row.contact_person) ? null : String(row.contact_person).trim(),
      phone: isBlank(row.phone) ? null : String(row.phone).trim(),
      email: isBlank(row.email) ? null : String(row.email).trim(),
      address: isBlank(row.address) ? null : String(row.address).trim(),
      notes: isBlank(row.notes) ? null : String(row.notes).trim(),
      opening_ap_amount: openingApAmount,
      opening_ap_as_of_date: openingApAmount > 0 ? String(row.opening_ap_as_of_date).trim() : null,
      opening_ap_description: isBlank(row.opening_ap_description) ? null : String(row.opening_ap_description).trim(),
    });
  });

  return { valid, errors, warnings };
}

const VALIDATORS = {
  products: validateProductRows,
  customers: validateCustomerRows,
  suppliers: validateSupplierRows,
};

const TARGET_FIELDS = {
  products: ['name', 'sku', 'category', 'price', 'cost_price', 'opening_quantity', 'location_id'],
  customers: ['name', 'phone', 'opening_ar_amount', 'opening_ar_as_of_date', 'opening_ar_description'],
  suppliers: ['name', 'contact_person', 'phone', 'email', 'address', 'notes', 'opening_ap_amount', 'opening_ap_as_of_date', 'opening_ap_description'],
};

module.exports = {
  VALIDATORS,
  TARGET_FIELDS,
  ImportRequestError,
  validateProductRows,
  validateCustomerRows,
  validateSupplierRows,
};
