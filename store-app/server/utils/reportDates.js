const DAY_MS = 24 * 60 * 60 * 1000;

function parseBoundary(value, end = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    throw Object.assign(new Error('Use a valid ISO date or timestamp.'), { status: 400 });
  }
  const dateOnly = value.length === 10;
  const date = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(date.getTime()) || (dateOnly && date.toISOString().slice(0, 10) !== value)) {
    throw Object.assign(new Error('Use a valid ISO date or timestamp.'), { status: 400 });
  }
  // Date-only end filters include the whole UTC business day. Timestamp
  // callers retain their inclusive boundary (converted to a half-open range).
  return new Date(date.getTime() + (end ? (dateOnly ? DAY_MS : 1) : 0)).toISOString();
}

function reportRange(startDate, endDate, { defaults = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const start = startDate || (defaults ? `${today.slice(0, 7)}-01` : undefined);
  const end = endDate || (defaults ? today : undefined);
  const from = start ? parseBoundary(start) : null;
  const until = end ? parseBoundary(end, true) : null;
  if (from && until && from >= until) {
    throw Object.assign(new Error('Start date must be on or before end date.'), { status: 400 });
  }
  return { from, until, startDate: start, endDate: end };
}

function applyReportRange(query, range, column = 'created_at') {
  if (range.from) query = query.gte(column, range.from);
  if (range.until) query = query.lt(column, range.until);
  return query;
}

module.exports = { DAY_MS, parseBoundary, reportRange, applyReportRange };
