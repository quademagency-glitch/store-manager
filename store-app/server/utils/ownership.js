/**
 * Is an id from a request really this business's?
 *
 * Routes query with the service-role client, which bypasses row-level
 * security, so a product, branch or user id in a request body is only a
 * claim. Until 8 October 2026 several write routes stored such ids as given,
 * which let one business record stock, schedules or payments against
 * another's rows. Check every id a route did not read itself.
 */

/**
 * True when every non-empty id names a row of `table` in `businessId`.
 * An empty list is trivially owned. A query error counts as "not owned".
 */
async function ownsAll(db, table, ids, businessId) {
  const unique = [...new Set((ids || []).filter((id) => id !== null && id !== undefined && id !== ''))];
  if (unique.length === 0) return true;
  if (!businessId) return false;
  const { data, error } = await db.from(table).select('id').eq('business_id', businessId).in('id', unique);
  if (error) return false;
  return (data || []).length === unique.length;
}

/**
 * May this signed-in user act on this branch? Platform Admins may act on any;
 * a Business Admin on any branch of their business; everyone else only on
 * the branches they are assigned to.
 */
function branchAllowed(user, locationId) {
  if (!locationId) return false;
  if (user.role === 'Platform Admin') return true;
  if (user.role === 'Business Admin') return (user.business_location_ids || []).includes(locationId);
  return (user.location_ids || []).includes(locationId);
}

/**
 * branchAllowed, confirmed against the database: the branch must also belong
 * to the business the route writes rows under (req.user.business_id), which
 * holds a Platform Admin to their own business too.
 */
async function usableBranch(db, user, locationId) {
  if (!branchAllowed(user, locationId)) return false;
  return ownsAll(db, 'locations', [locationId], user.business_id);
}

module.exports = { ownsAll, branchAllowed, usableBranch };
