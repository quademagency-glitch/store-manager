const { supabaseAdmin } = require('../db/supabase');

/**
 * Dry-run validators for bulk import. Each returns:
 *   { valid: [rowWithLineNumber], errors: [{row, field, message}], warnings: [{row, field, message}] }
 * Rows are never mutated in place — callers get back normalized copies.
 */

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * Products: name, sku, price required. SKU is GLOBALLY unique across the
 * whole platform (not per-business — see products.sku UNIQUE constraint),
 * so dedup must check the entire table, not just this business.
 */
async function validateProductRows(rows, businessId) {
  const errors = [];
  const warnings = [];
  const valid = [];

  const seenSkus = new Map(); // sku -> first row number seen at
  const skusToCheck = [];

  rows.forEach((row, i) => {
    const lineNumber = i + 2; // +1 for 1-indexing, +1 for the header row
    const sku = String(row.sku || '').trim();
    if (isBlank(row.name)) errors.push({ row: lineNumber, field: 'name', message: 'Name is required' });
    if (isBlank(sku)) errors.push({ row: lineNumber, field: 'sku', message: 'SKU is required' });
    if (isBlank(row.price)) errors.push({ row: lineNumber, field: 'price', message: 'Price is required' });
    else if (Number.isNaN(Number(row.price)) || Number(row.price) < 0) {
      errors.push({ row: lineNumber, field: 'price', message: 'Price must be a non-negative number' });
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

  rows.forEach((row, i) => {
    const lineNumber = i + 2;
    const sku = String(row.sku || '').trim();
    if (!sku || existingSkus.has(sku) || errors.some(e => e.row === lineNumber)) {
      if (sku && existingSkus.has(sku)) {
        errors.push({ row: lineNumber, field: 'sku', message: `SKU '${sku}' is already in use on this platform. SKUs must be globally unique — please use a different SKU.` });
      }
      return;
    }

    valid.push({
      row: lineNumber,
      name: String(row.name).trim(),
      sku,
      category: isBlank(row.category) ? 'Uncategorized' : String(row.category).trim(),
      price: Number(row.price),
      cost_price: isBlank(row.cost_price) ? 0 : Number(row.cost_price),
      opening_quantity: isBlank(row.opening_quantity) ? 0 : parseInt(row.opening_quantity, 10) || 0,
      location_id: isBlank(row.location_id) ? null : String(row.location_id).trim(),
    });
  });

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
 * Suppliers: name required only — suppliers have no DB uniqueness
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
      warnings.push({ row: lineNumber, field: 'name', message: `A supplier named '${existingMatch}' already exists — this will still import as a separate record unless you remove this row.` });
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

module.exports = { VALIDATORS, TARGET_FIELDS, validateProductRows, validateCustomerRows, validateSupplierRows };
