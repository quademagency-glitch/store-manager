/**
 * Resolves the effective currency for a request: the active location's
 * currency override if set, otherwise the business's default currency.
 */
async function resolveCurrency(supabaseAdmin, businessId, locationId) {
  if (locationId) {
    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('currency')
      .eq('id', locationId)
      .single();
    if (location?.currency) return location.currency;
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('currency')
    .eq('id', businessId)
    .single();

  return business?.currency || 'GHS';
}

module.exports = { resolveCurrency };
