#!/usr/bin/env node
/**
 * Encrypt provider secrets written before utils/secretBox existed.
 *
 *   node scripts/encrypt-secrets.js          # dry run: counts only, changes nothing
 *   node scripts/encrypt-secrets.js --apply  # encrypt in one transaction
 *
 * Needs DIRECT_URL and the SAME SECRETS_KEY the server runs with: a value
 * sealed with a different key cannot be opened by the server, and a provider
 * would stop working. Every sealed value is opened again and compared with
 * the original before COMMIT; any mismatch rolls the whole run back.
 * Never prints a secret.
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { seal, open, isSealed } = require('../utils/secretBox');

const COLUMNS = [
  ['communication_gateways', 'api_key'],
  ['communication_gateways', 'secret_key'],
  ['payment_gateways', 'secret_key'],
  ['payment_gateways', 'webhook_secret'],
  ['webhook_endpoints', 'secret'],
];

async function main() {
  const apply = process.argv.includes('--apply');
  if (!process.env.SECRETS_KEY) throw new Error('Set SECRETS_KEY (the value the server uses) before running.');
  if (!process.env.DIRECT_URL) throw new Error('Set DIRECT_URL.');
  const db = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query('BEGIN');
    const summary = [];
    for (const [table, column] of COLUMNS) {
      const { rows } = await db.query(`SELECT id, ${column} AS value FROM public.${table} WHERE ${column} IS NOT NULL AND ${column} <> '' FOR UPDATE`);
      const plain = rows.filter((r) => !isSealed(r.value));
      if (apply) {
        for (const row of plain) {
          const sealed = seal(row.value);
          if (!isSealed(sealed) || open(sealed) !== row.value) throw new Error(`Verification failed for ${table}.${column}; nothing was changed.`);
          await db.query(`UPDATE public.${table} SET ${column} = $1 WHERE id = $2`, [sealed, row.id]);
        }
      }
      summary.push({ table, column, rows: rows.length, alreadyEncrypted: rows.length - plain.length, [apply ? 'encrypted' : 'wouldEncrypt']: plain.length });
    }
    if (apply) {
      // Re-read inside the transaction: everything must now open.
      for (const [table, column] of COLUMNS) {
        const { rows } = await db.query(`SELECT ${column} AS value FROM public.${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`);
        for (const r of rows) { if (!isSealed(r.value)) throw new Error(`${table}.${column} still has plaintext; rolled back.`); open(r.value); }
      }
      await db.query('COMMIT');
    } else {
      await db.query('ROLLBACK');
    }
    console.table(summary);
    console.log(apply ? 'Committed.' : 'Dry run: nothing changed. Re-run with --apply.');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
