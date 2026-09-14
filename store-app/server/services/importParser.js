const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

/**
 * SheetJS is loaded on demand, not at module scope.
 *
 * It is pinned to a tarball on SheetJS's own CDN rather than npm (see
 * parseFile), so it is the one dependency here that a build could fail to
 * fetch. Requiring it at the top would turn that into "the API does not
 * start", because this module is on the import route's require chain. Loaded
 * lazily, the worst case is that legacy .xls uploads report the same thing
 * they reported before support existed.
 */
function loadXlsx() {
  try {
    return require('xlsx');
  } catch {
    throw new Error('Legacy .xls files cannot be read right now. Please re-save the file as .xlsx or .csv and upload again.');
  }
}

/**
 * Parses an uploaded file buffer into { headers, rows }. Rows are plain
 * objects keyed by the raw header text, no column mapping applied yet.
 *
 * .xlsx goes through exceljs, which has handled it since this was written.
 * .xls is the legacy BIFF format Excel 97-2003 wrote, which exceljs cannot
 * read at all; that is SheetJS's job. It is pinned from SheetJS's own CDN
 * rather than npm on purpose: npm's newest xlsx is 0.18.5, which still
 * carries the CVE-2023-30533 prototype pollution fixed in 0.19.3, and the
 * project stopped publishing there.
 */
async function parseFile(buffer, filename) {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) return parseCsv(buffer);
  if (lower.endsWith('.xlsx')) return parseXlsx(buffer);
  if (lower.endsWith('.xls')) return parseXls(buffer);
  throw new Error('Unsupported file type. Please upload a .csv, .xlsx or .xls file.');
}

function parseCsv(buffer) {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, rows: records };
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('The uploaded file has no worksheets.');
  }

  const rows = [];
  let headers = [];
  worksheet.eachRow((row, rowNumber) => {
    const values = row.values.slice(1); // exceljs row.values is 1-indexed; index 0 is always undefined
    if (rowNumber === 1) {
      headers = values.map(v => String(normalizeCellValue(v) ?? '').trim());
      return;
    }
    const record = {};
    headers.forEach((header, i) => {
      record[header] = normalizeCellValue(values[i]);
    });
    rows.push(record);
  });

  return { headers, rows };
}

/**
 * Legacy Excel 97-2003. Same shape as parseXlsx: first worksheet, row 1 is
 * the header, values passed through normalizeCellValue so a date lands as
 * YYYY-MM-DD here too.
 */
function parseXls(buffer) {
  const XLSX = loadXlsx();
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The uploaded file has no worksheets.');
  }

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: '',
  });
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = (matrix[0] || []).map(v => String(normalizeCellValue(v) ?? '').trim());
  const rows = matrix.slice(1).map(values => {
    const record = {};
    headers.forEach((header, i) => {
      record[header] = normalizeCellValue(values[i]);
    });
    return record;
  });

  return { headers, rows };
}

function normalizeCellValue(cell) {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().split('T')[0];
  if (typeof cell === 'object' && 'result' in cell) return normalizeCellValue(cell.result);
  if (typeof cell === 'object' && 'text' in cell) return cell.text;
  return cell;
}

/**
 * Renames row keys per the provided mapping ({ csvHeader: targetField }).
 * Columns mapped to an empty/falsy target are dropped.
 */
function applyColumnMapping(rows, mapping) {
  return rows.map(row => {
    const mapped = {};
    for (const [csvHeader, targetField] of Object.entries(mapping)) {
      if (!targetField) continue;
      mapped[targetField] = row[csvHeader];
    }
    return mapped;
  });
}

/**
 * Header spellings a real spreadsheet uses for each target field.
 *
 * The matcher used to compare header text against the field name alone, so
 * only a sheet that happened to be written in our own column names mapped
 * itself. A customer's real product sheet ("Product Name", "Model / SKU",
 * "Unit Price (GHS)", "Quantity") matched nothing but Category, and all of
 * it had to be mapped by hand.
 *
 * Only products are listed. Customers and suppliers still match on the field
 * name, which is what they did before.
 */
const HEADER_ALIASES = {
  products: {
    name: ['product name', 'item name', 'product', 'item', 'description', 'product description'],
    sku: ['model sku', 'model', 'code', 'item code', 'product code', 'ref', 'reference', 'article', 'article number'],
    price: ['unit price', 'selling price', 'sell price', 'retail price', 'sale price', 'sales price', 'rrp'],
    cost_price: ['cost', 'buying price', 'buy price', 'purchase price', 'unit cost', 'landed cost', 'supplier price'],
    opening_quantity: ['quantity', 'qty', 'stock', 'stock quantity', 'stock qty', 'opening stock', 'on hand', 'in stock', 'available', 'units'],
    location_id: ['location', 'branch', 'store', 'warehouse'],
    category: ['type', 'group', 'department', 'product category'],
  },
};

/**
 * Lowercase, drop anything parenthesised, drop currency words, then strip
 * everything that is not a letter or digit. So "Unit Price (GHS)" and
 * "unit_price" both reduce to "unitprice", and "Model / SKU" to "modelsku".
 */
function normalizeHeader(s) {
  return String(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(ghs|ghc|cedis|usd|ngn)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Suggests a column mapping by matching header text against known target
 * fields and their common aliases. Pure convenience for pre-filling the
 * mapping UI, not authoritative; the user confirms/adjusts before validating.
 *
 * Exact field-name matches are taken first, so a sheet carrying both "Cost"
 * and "Cost Price" gives cost_price to the exact one. A field is claimed at
 * most once, because the wizard keeps the mapping keyed by field and a second
 * claim would silently displace the first.
 */
function suggestColumnMapping(headers, targetFields, entityType) {
  const aliases = HEADER_ALIASES[entityType] || {};
  const normalizedTargets = targetFields.map(f => ({ field: f, normalized: normalizeHeader(f) }));

  const mapping = {};
  const claimed = new Set();

  const claim = (header, field) => {
    if (claimed.has(field) || mapping[header]) return;
    mapping[header] = field;
    claimed.add(field);
  };

  headers.forEach(header => {
    const normalized = normalizeHeader(header);
    const match = normalizedTargets.find(t => t.normalized === normalized);
    if (match) claim(header, match.field);
  });

  headers.forEach(header => {
    const normalized = normalizeHeader(header);
    const match = normalizedTargets.find(t =>
      (aliases[t.field] || []).some(alias => normalizeHeader(alias) === normalized));
    if (match) claim(header, match.field);
  });

  return mapping;
}

module.exports = { parseFile, applyColumnMapping, suggestColumnMapping };
