/**
 * Streams a business's own records out as a ZIP of CSV files.
 *
 * Backs the promise made in the Privacy Policy — that an owner can retrieve
 * their data at any time — and gives them a way to leave without losing years
 * of trading history.
 *
 * STREAMING IS THE POINT. A busy shop's sales and stock_movements run to
 * hundreds of thousands of rows; buffering that into memory to build a ZIP
 * would take the whole worker down, and it is one of eight serving the POS.
 * Every table is a Readable built from an async generator that pages Supabase,
 * so rows are pulled only as fast as the ZIP is drained and memory stays flat
 * regardless of tenant size.
 */

const { Readable } = require('node:stream');
const { supabaseAdmin } = require('../db/supabase');
const { isSensitiveKey } = require('../utils/sensitiveKeys');
const logger = require('../utils/logger');

const PAGE_SIZE = 1000;

/**
 * What gets exported.
 *
 * An explicit allowlist rather than "every table with a business_id", because
 * that set includes things an export must not contain. Excluded deliberately:
 *
 *   api_keys, communication_gateways, webhook_endpoints
 *     Hold credentials for other systems. Even hashed, handing them out in a
 *     downloadable file is the wrong default — and they are recoverable from
 *     the admin UI by someone already authenticated.
 *   *_number_sequences
 *     Internal counters. Meaningless outside the database and confusing in an
 *     export people may open expecting their records.
 *   webhook_deliveries
 *     High-volume operational logging, not business records.
 *
 * Anything not listed here is simply not exported, so adding a table to the
 * schema never silently starts exporting it.
 */
const EXPORT_TABLES = [
  'locations', 'users', 'roles',
  'products', 'product_batches', 'inventory_units', 'inventory_reorder_config',
  'stock_movements', 'stock_transfers', 'stock_take_sessions', 'inventory_audits',
  'suppliers', 'purchase_orders',
  'customers', 'customer_orders',
  'sales', 'sale_items', 'returns',
  'ar_invoices', 'ar_payments', 'ap_bills', 'ap_payments',
  'business_ledger', 'accounting_templates',
  'loyalty_rules', 'loyalty_ledger', 'gift_cards', 'store_credit_ledger',
  'attendance_logs', 'shift_schedules', 'commission_rules', 'commission_ledger',
  'price_change_log', 'alerts', 'import_batches',
  'crm_communication_templates',
  'billing_invoices', 'business_subscriptions',
  'audit_logs',
];

/** RFC 4180: quote when needed, and double any embedded quote. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s;
  if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(columns, row) {
  return columns.map((c) => csvCell(row[c])).join(',') + '\n';
}

/**
 * Yields a table as CSV, one page at a time.
 *
 * Async generator rather than pushing into a Readable: this way the generator
 * only advances when the consumer pulls, which gives correct backpressure for
 * free. Pushing eagerly would reintroduce exactly the unbounded buffering this
 * design exists to avoid.
 */
async function* tableToCsv(table, businessId, counters) {
  let offset = 0;
  let columns = null;

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('business_id', businessId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      // Emit the problem into the file itself. A silently short table looks
      // identical to a genuinely small one, and this is the export someone may
      // be relying on to leave.
      yield `\n# ERROR reading ${table}: ${String(error.message || error).replace(/[\r\n]+/g, ' ')}\n`;
      counters.errors.push(table);
      return;
    }

    const rows = data || [];
    if (columns === null) {
      if (rows.length === 0) {
        yield '# no rows\n';
        return;
      }
      // Redaction happens at the column level so a secret never reaches the
      // file at all, rather than being blanked per row.
      columns = Object.keys(rows[0]).filter((c) => !isSensitiveKey(c));
      yield columns.join(',') + '\n';
    }

    for (const row of rows) {
      yield csvRow(columns, row);
      counters.rows += 1;
    }

    if (rows.length < PAGE_SIZE) return;
    offset += PAGE_SIZE;
  }
}

/** Row counts up front, so the manifest can be written before the data. */
async function countRows(table, businessId) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { head: true, count: 'exact' })
    .eq('business_id', businessId);
  return error ? null : (count ?? 0);
}

/**
 * Attach every table to an archiver instance.
 *
 * @param {import('archiver').Archiver} archive
 * @param {string} businessId
 * @param {object} business  the business row, for the manifest
 */
async function appendBusinessData(archive, businessId, business) {
  const counts = {};
  for (const table of EXPORT_TABLES) {
    counts[table] = await countRows(table, businessId);
  }

  // Manifest first so it is readable even from a truncated download, and so a
  // short table can be spotted by comparing against it.
  const manifest = {
    exported_at: new Date().toISOString(),
    business: { id: businessId, name: business?.name ?? null, slug: business?.slug ?? null },
    format: 'CSV (RFC 4180), UTF-8, one file per table',
    schema_version: 1,
    row_counts: counts,
    notes: [
      'Row counts were taken at the start of the export; a busy shop may write more rows while it runs.',
      'Columns holding credentials (PINs, API keys, gateway secrets) are omitted by design.',
      'API keys, webhook endpoints and communication gateways are not included — retrieve those from the admin area.',
    ],
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  const counters = { rows: 0, errors: [] };
  for (const table of EXPORT_TABLES) {
    archive.append(Readable.from(tableToCsv(table, businessId, counters)), { name: `${table}.csv` });
  }

  return counters;
}

module.exports = { appendBusinessData, EXPORT_TABLES, csvCell, PAGE_SIZE };
