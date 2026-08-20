/**
 * Phone numbers: global parsing, with the country code supplied automatically.
 *
 * Staff type what is written on a receipt, `024 123 4567`, not `+233…`.
 * The country that turns that into E.164 is resolved, not typed. An explicit
 * `+44…` always wins, so a foreign customer can still be entered anywhere.
 *
 * Superseded a Ghana-only implementation that hardcoded NCA prefixes and
 * rejected every non-Ghanaian number. Parsing is delegated to
 * libphonenumber-js rather than hand-rolled: per-country lengths, trunk
 * prefixes and allocations change, and getting them subtly wrong shows up as
 * undeliverable SMS long after the number was captured.
 *
 * Stored in E.164 (`+233241234567`), unambiguous across countries, and the
 * only sane key for a uniqueness check once numbers can come from anywhere.
 *
 * NOTE: mirrored by server/utils/phone.js. The server is authoritative; this
 * exists so the counter sees the problem before submitting.
 */
import { parsePhoneNumberFromString, getCountryCallingCode } from 'libphonenumber-js';

/** Last-resort default when neither the business nor the device says. */
const FALLBACK_COUNTRY = 'GH';

/**
 * Ghana network prefixes, keyed by the first three digits of the national
 * number. Kept because it is genuinely useful at a Ghanaian counter, it is
 * a display nicety layered on top of parsing, never a validation rule, so a
 * number from any other country is unaffected.
 */
const GH_NETWORK_BY_PREFIX = {
  '024': 'MTN', '025': 'MTN', '053': 'MTN', '054': 'MTN', '055': 'MTN', '059': 'MTN',
  '020': 'Telecel', '050': 'Telecel',
  '026': 'AirtelTigo', '027': 'AirtelTigo', '056': 'AirtelTigo', '057': 'AirtelTigo',
  '023': 'Glo', '066': 'Glo',
};

/**
 * The country to assume for numbers typed without a code.
 *
 * Order matters: the active location wins over the business, because a
 * multi-location business can span countries (locations carry their own
 * currency override for exactly that reason, migration 057). The device is
 * only consulted when nothing is configured, since a laptop set to en-US in
 * an Accra shop should not start producing +1 customers.
 *
 * @param {object} [business]  business record, may carry `country`
 * @param {object} [location]  active location, may carry `country`
 */
export function resolveCountry(business, location) {
  return (
    location?.country ||
    business?.country ||
    countryFromDevice() ||
    FALLBACK_COUNTRY
  );
}

/** Region subtag from the browser's locale, then its timezone. */
function countryFromDevice() {
  try {
    const locale = navigator?.language;
    // `en-GH` → GH. A bare `en` has no region and tells us nothing.
    const region = locale && new Intl.Locale(locale).region;
    if (region) return region;
  } catch {
    // Intl.Locale is unavailable or the tag is malformed, fall through.
  }
  return null;
}

/**
 * Parse to E.164, or null if the input is not a usable number.
 *
 * `+…` input is parsed as-is; anything else is read as a national number in
 * `country`.
 */
export function normalizePhone(input, country = FALLBACK_COUNTRY) {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(String(input).trim(), country);
  return parsed?.isValid() ? parsed.number : null;
}

/** True when the input parses to a valid number for the given country. */
export function isValidPhone(input, country = FALLBACK_COUNTRY) {
  return normalizePhone(input, country) !== null;
}

/**
 * Everything the UI needs to describe what was typed, in one parse.
 *
 * Returns `{ e164, country, national, formatted, network }`, or null when the
 * number is not valid, so a caller can show one hint for "not there yet" and
 * another for "here is what we understood".
 */
export function describePhone(input, defaultCountry = FALLBACK_COUNTRY) {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(String(input).trim(), defaultCountry);
  if (!parsed?.isValid()) return null;

  const national = parsed.nationalNumber;
  // Ghana national numbers are written with a leading trunk 0, which
  // libphonenumber strips, restore it before matching the prefix table.
  const network =
    parsed.country === 'GH' ? GH_NETWORK_BY_PREFIX[('0' + national).slice(0, 3)] ?? null : null;

  return {
    e164: parsed.number,
    country: parsed.country ?? null,
    national,
    formatted: parsed.formatInternational(),
    network,
  };
}

/** `+233 24 123 4567` for display, or the raw input if it will not parse. */
export function formatPhone(input, country = FALLBACK_COUNTRY) {
  return describePhone(input, country)?.formatted ?? String(input ?? '');
}

/** `+233`, shown next to the field so the assumed country is never a surprise. */
export function callingCodeFor(country) {
  try {
    return '+' + getCountryCallingCode(country);
  } catch {
    return null;
  }
}
