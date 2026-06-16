const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Extracts and validates pagination params from req.query.
 * Returns { page, limit, offset }.
 */
function getPagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Builds the pagination metadata object to include in API responses.
 */
function buildPaginationMeta(count, page, limit) {
  const total = count ?? 0;
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

module.exports = { getPagination, buildPaginationMeta };
