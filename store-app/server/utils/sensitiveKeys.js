/**
 * The single list of field names that must never leave the building.
 *
 * Shared by the audit-log redactor and the business data exporter. One list,
 * not two: the failure mode of duplicating it is that someone adds a secret
 * column, updates the copy they happened to be looking at, and the other path
 * silently starts leaking.
 *
 * Matched as a SUBSTRING, case-insensitively, so `manager_pin`,
 * `paystack_secret_key` and `new_password` are all caught without having to be
 * listed. That deliberately errs towards over-redaction — a wrongly hidden
 * field is an inconvenience, a wrongly exported one is an incident.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password', 'pin', 'token', 'secret', 'key_hash', 'api_key',
  'authorization', 'credential', 'session',
];

function isSensitiveKey(key) {
  const lower = String(key).toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

module.exports = { isSensitiveKey, SENSITIVE_KEY_PATTERNS };
