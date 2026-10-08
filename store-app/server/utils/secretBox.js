const crypto = require('node:crypto');
const logger = require('./logger');

/**
 * Encryption at rest for third-party secrets the server must use again:
 * messaging gateway keys (communication_gateways.api_key/secret_key, which
 * include WhatsApp access tokens), Paystack keys (payment_gateways.secret_key/
 * webhook_secret) and outgoing webhook signing secrets
 * (webhook_endpoints.secret).
 *
 * AES-256-GCM with SECRETS_KEY (32 bytes, base64), held only in the server's
 * environment, never in the database. A sealed value reads
 * `enc:v1:<iv>:<tag>:<ciphertext>`. A value without that prefix is a row
 * written before encryption: open() returns it unchanged so it keeps working,
 * and scripts/encrypt-secrets.js seals it in place.
 *
 * Without SECRETS_KEY, seal() stores plaintext and warns once, so a deploy
 * that precedes the key never breaks saving a gateway. Opening a sealed value
 * without the key throws: a wrong or missing key must fail loudly, not send
 * garbage to a provider.
 */
const PREFIX = 'enc:v1:';
let warned = false;

function key() {
  const raw = process.env.SECRETS_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('SECRETS_KEY must be 32 bytes, base64-encoded.');
  return k;
}

/** @param {string|null|undefined} value */
function seal(value) {
  if (value === undefined || value === null || value === '') return value ?? null;
  const text = String(value);
  if (text.startsWith(PREFIX)) return text;
  const k = key();
  if (!k) {
    if (!warned) { warned = true; logger.warn('SECRETS_KEY is not set: provider secrets are stored unencrypted.'); }
    return text;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const sealed = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), sealed].map((b) => b.toString('base64')).join(':');
}

/** @param {string|null|undefined} value */
function open(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const k = key();
  if (!k) throw new Error('SECRETS_KEY is required to use an encrypted provider secret.');
  const [iv, tag, sealed] = value.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed), decipher.final()]).toString('utf8');
}

/** The masked form shown in settings: the last four characters of the real secret. */
function mask(value) {
  if (!value) return null;
  try { return '••••••••' + String(open(value)).slice(-4); } catch { return '••••••••'; }
}

/** A copy of a row with the named secret columns opened. */
function openRow(row, columns) {
  if (!row) return row;
  const copy = { ...row };
  for (const column of columns) if (column in copy) copy[column] = open(copy[column]);
  return copy;
}

const isSealed = (value) => typeof value === 'string' && value.startsWith(PREFIX);

module.exports = { seal, open, mask, openRow, isSealed, PREFIX };
