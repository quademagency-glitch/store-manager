const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

/**
 * Parses an uploaded file buffer into { headers, rows }. Rows are plain
 * objects keyed by the raw header text — no column mapping applied yet.
 */
async function parseFile(buffer, filename) {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) return parseCsv(buffer);
  if (lower.endsWith('.xlsx')) return parseXlsx(buffer);
  if (lower.endsWith('.xls')) {
    throw new Error('Legacy .xls files are not supported. Please re-save the file as .xlsx or .csv and upload again.');
  }
  throw new Error('Unsupported file type. Please upload a .csv or .xlsx file.');
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
 * Suggests a column mapping by fuzzy-matching header text against known
 * target fields. Pure convenience for pre-filling the mapping UI — not
 * authoritative; the user confirms/adjusts before validating.
 */
function suggestColumnMapping(headers, targetFields) {
  const normalize = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, '');
  const normalizedTargets = targetFields.map(f => ({ field: f, normalized: normalize(f) }));

  const mapping = {};
  headers.forEach(header => {
    const normalizedHeader = normalize(header);
    const match = normalizedTargets.find(t => t.normalized === normalizedHeader);
    if (match) mapping[header] = match.field;
  });
  return mapping;
}

module.exports = { parseFile, applyColumnMapping, suggestColumnMapping };
