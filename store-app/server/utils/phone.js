/**
 * Phone numbers: global parsing and E.164 normalisation.
 *
 * Mirrors client/src/lib/phone.js, but this is the authoritative one — the
 * API is reachable without the form (bulk import, the public API, a direct
 * call), and storage format is what uniqueness and search depend on.
 *
 * Numbers are stored in E.164. Anything else makes the uniqueness check
 * meaningless once numbers can come from more than one country: `024 123
 * 4567`, `0241234567` and `+233241234567` are three different strings for one
 * person, each with its own loyalty balance and ledger.
 */
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const FALLBACK_COUNTRY = 'GH';

/** Ghana network prefixes — a display nicety, never a validation rule. */
const GH_NETWORK_BY_PREFIX = {
  '024': 'MTN', '025': 'MTN', '053': 'MTN', '054': 'MTN', '055': 'MTN', '059': 'MTN',
  '020': 'Telecel', '050': 'Telecel',
  '026': 'AirtelTigo', '027': 'AirtelTigo', '056': 'AirtelTigo', '057': 'AirtelTigo',
  '023': 'Glo', '066': 'Glo',
};

/**
 * Effective country for a request: the active location's override, else the
 * business default, else the fallback.
 *
 * Deliberately shaped like resolveCurrency in utils/currency.js — same
 * override semantics, same reason (migration 057: a business can run a Ghana
 * branch and a Nigeria branch).
 */
async function resolveCountry(supabaseAdmin, businessId, locationId) {
  if (locationId) {
    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('country')
      .eq('id', locationId)
      .single();
    if (location?.country) return location.country;
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('country')
    .eq('id', businessId)
    .single();

  return business?.country || FALLBACK_COUNTRY;
}

/** Parse to E.164, or null. `+…` is honoured as-is; else read as national. */
function normalizePhone(input, country = FALLBACK_COUNTRY) {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(String(input).trim(), country);
  return parsed?.isValid() ? parsed.number : null;
}

/** Network name for Ghanaian numbers, else null. */
function detectNetwork(input, country = FALLBACK_COUNTRY) {
  const parsed = parsePhoneNumberFromString(String(input ?? '').trim(), country);
  if (!parsed?.isValid() || parsed.country !== 'GH') return null;
  return GH_NETWORK_BY_PREFIX[('0' + parsed.nationalNumber).slice(0, 3)] ?? null;
}

/**
 * Digits-only international form for SMS gateways (`233241234567`).
 *
 * Arkesel rejects a leading `+`, and sending the national form with its trunk
 * 0 delivers inconsistently. Takes whatever is stored — rows predating
 * normalisation may still hold a local spelling — so a `country` hint is
 * accepted for those.
 */
function toSmsFormat(input, country = FALLBACK_COUNTRY) {
  const e164 = normalizePhone(input, country);
  return e164 ? e164.replace(/^\+/, '') : null;
}

/**
 * Digits to match a stored E.164 number against, for search.
 *
 * Staff search by the number they know — `0241234567` — but storage is
 * `+233241234567`, and a plain substring match of the typed string finds
 * nothing because of the trunk 0. Dropping it leaves `241234567`, which *is*
 * a substring of the E.164 form, and also of a legacy locally-stored value.
 *
 * Returns null for input with no digits, so a name search is left alone.
 * Digits-only by construction, so it is safe to interpolate into a PostgREST
 * filter string.
 */
function phoneSearchDigits(query) {
  const digits = String(query ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.replace(/^0+/, '') || null;
}

module.exports = {
  resolveCountry,
  normalizePhone,
  detectNetwork,
  toSmsFormat,
  phoneSearchDigits,
  FALLBACK_COUNTRY,
};
