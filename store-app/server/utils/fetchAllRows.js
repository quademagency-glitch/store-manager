// PostgREST caps each response. Reporting must not silently stop at that cap.
// Callers supply a stable, unique ordering in buildQuery.
async function fetchAllRows(buildQuery, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

module.exports = { fetchAllRows };
