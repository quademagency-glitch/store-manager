const crypto = require('crypto');

// Raw key shape: pk_live_<48 hex chars>. The first PREFIX_LENGTH characters
// (covering the pk_live_ marker plus a slice of random data) are stored in
// plaintext as the lookup column; the rest is only ever compared via bcrypt.
const PREFIX_LENGTH = 20;

function generateApiKey() {
  const raw = `pk_live_${crypto.randomBytes(24).toString('hex')}`;
  return { raw, prefix: raw.slice(0, PREFIX_LENGTH) };
}

module.exports = { generateApiKey, PREFIX_LENGTH };
