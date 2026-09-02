#!/usr/bin/env node
/**
 * Send the sub-processor notice that clause 5.3 of the DPA requires.
 *
 *   node scripts/send-subprocessor-notice.js              dry run, sends nothing
 *   node scripts/send-subprocessor-notice.js --send       actually send
 *   node scripts/send-subprocessor-notice.js --send --to me@example.com
 *
 * WHY THIS EXISTS AS A SCRIPT
 *
 * Clause 5.3 commits us to at least 30 days' notice by email before a new
 * sub-processor starts processing. That is not a one-off: it is due again
 * every time the stack gains a processor. Doing it by hand means composing
 * the wording under time pressure, on the day, by whoever is around, which is
 * how the PostHog notice came to be written after analytics was already live
 * rather than 30 days before it.
 *
 * The content lives in docs/legal/posthog-subprocessor-notice.md and is
 * duplicated below deliberately: a script that reads its legal text out of a
 * markdown file at send time will one day send a half-edited draft.
 *
 * SAFE BY DEFAULT
 *
 * It prints the recipients and exits unless --send is passed. Sending is
 * irreversible and goes to real customers, so the default had to be the one
 * that cannot hurt.
 *
 * Re-running with --send is also safe: the Resend idempotency key is derived
 * from NOTICE.id, so a second run returns the first run's result instead of
 * emailing everyone twice. Change NOTICE.id only when the notice itself is a
 * genuinely new one.
 *
 * --to takes a separate, per-run key, so a test send neither consumes the real
 * one nor is itself deduplicated against an earlier test.
 *
 * Recipients come from the businesses table, every business that is not
 * banned, which is the same audience as Platform Admin -> Communications ->
 * All Businesses, and each gets their own message. See 54cc340: this used to
 * put every recipient in one To header.
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { supabaseAdmin } = require('../db/supabase');
const emailService = require('../services/emailService');

const NOTICE = {
  /* Bump this for a genuinely new notice. Reusing it makes Resend treat the
     send as a retry and deliver nothing, which is the point. */
  id: 'posthog-2026-08-29',
  subject: 'PostHog has been added as a sub-processor for QuadERP',
  replyTo: 'info@quaderp.app',
  paragraphs: [
    ['', 'Hello,'],
    ['', 'This is the notice our Data Processing Agreement requires when we add a sub-processor.'],
    ['What has changed', 'On <strong>29 August 2026</strong> we started using <strong>PostHog</strong>, a product analytics service, as a sub-processor.'],
    ['We should have told you first', 'Clause 5.3 of the Data Processing Agreement commits us to at least 30 days&rsquo; notice by email before a new sub-processor begins processing. That did not happen: analytics was switched on before this notice went out. Your right to object is unaffected and is set out below.'],
    ['What PostHog receives', 'Which screens in QuadERP are opened and how often, together with the technical details any web request carries: your approximate location from your IP address, and your browser and device type. Page addresses are included, and some of those contain the identifier of a record, such as a sale.'],
    ['What it does not receive', 'Your customer records, your products, your prices, your sales figures, or anything typed into the app. Click tracking, heatmaps and session recording are switched off, so the text on your screens is not collected. No profile is built against your name.'],
    ['Where', 'The United States. Your database and uploaded files stay in the European Union, in Stockholm.'],
    ['Why', 'So we can see which parts of QuadERP are actually used, rather than guessing when we decide what to build and what to fix.'],
    ['If you object', 'Reply to this email. If we cannot resolve an objection made on data protection grounds, you may end the affected subscription and we will refund the fees you have paid for the unused remainder of your subscription period.'],
    ['', 'You do not need to do anything if you are happy for this to continue.'],
  ],
  signature: 'Quadem Digital Enterprise',
};

/* The same content as plain text, so a dry run shows the operator exactly what
   is about to go out. An email you cannot read before sending is one you send
   on trust. */
function renderText(notice) {
  const body = notice.paragraphs
    .map(([heading, text]) => {
      const plain = text.replace(/<[^>]+>/g, '').replace(/&rsquo;/g, "'");
      return heading ? `${heading.toUpperCase()}\n${plain}` : plain;
    })
    .join('\n\n');
  return `${body}\n\n${notice.signature}\n${notice.replyTo}\n`;
}

/* Same mark the transactional templates use. Imported rather than repeated so
   the notice cannot end up branded differently from every other email; see
   emailService for why it is a PNG in a table and not an SVG in a flex box. */
const LOGO_URL = emailService.LOGO_URL;

function renderHtml(notice) {
  const body = notice.paragraphs
    .map(([heading, text]) => (heading
      ? `<p style="margin:20px 0 6px;font-weight:600">${heading}</p><p style="margin:0 0 14px">${text}</p>`
      : `<p style="margin:0 0 14px">${text}</p>`))
    .join('');

  /* Tables, not flex: Outlook renders through Word's engine and ignores
     display:flex, which would stack the mark above the wordmark. */
  const header = '<table role="presentation" cellpadding="0" cellspacing="0" border="0"'
    + ' style="border-collapse:collapse;margin:0 0 26px"><tr>'
    + `<td style="padding:0 12px 0 0;vertical-align:middle"><img src="${LOGO_URL}"`
    + ' width="44" height="44" alt=""'
    + ' style="display:block;width:44px;height:44px;border:0;border-radius:10px"></td>'
    + '<td style="vertical-align:middle;font-size:19px;font-weight:700;color:#1a1a1a;'
    + 'letter-spacing:-0.2px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">'
    + 'QuadERP</td></tr></table>';

  return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;'
    + 'font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">'
    + header
    + body
    + `<p style="margin:24px 0 0;color:#555">${notice.signature}<br>`
    + `<a href="mailto:${notice.replyTo}" style="color:#555">${notice.replyTo}</a></p>`
    + '</div>';
}

async function loadRecipients() {
  const { data, error } = await supabaseAdmin
    .from('businesses')
    .select('name, contact_email, status')
    .neq('status', 'banned');
  if (error) throw error;

  const withEmail = (data || []).filter((b) => b.contact_email);
  const withoutEmail = (data || []).filter((b) => !b.contact_email);
  return { withEmail, withoutEmail };
}

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes('--send');
  const toIndex = args.indexOf('--to');
  const override = toIndex !== -1 ? args[toIndex + 1] : null;

  const { withEmail, withoutEmail } = override
    ? { withEmail: [{ name: 'override', contact_email: override, status: 'n/a' }], withoutEmail: [] }
    : await loadRecipients();

  console.log(`\nNotice:  ${NOTICE.id}`);
  console.log(`From:    ${emailService.senderAddress()}`);
  console.log(`Reply-to: ${NOTICE.replyTo}`);
  console.log(`Subject: ${NOTICE.subject}\n`);
  if (override) console.log('TEST SEND: one address, separate idempotency key.\n');
  console.log(`Recipients (${withEmail.length}):`);
  for (const b of withEmail) {
    console.log(`  ${b.contact_email.padEnd(34)} ${b.name} [${b.status}]`);
  }
  if (withoutEmail.length) {
    console.log(`\n${withoutEmail.length} business(es) have no contact_email and CANNOT be notified:`);
    for (const b of withoutEmail) console.log(`  ${b.name} [${b.status}]`);
    console.log('Clause 5.3 says notice by email. These need contacting another way.');
  }

  if (!send) {
    console.log('\n' + '-'.repeat(72));
    console.log(renderText(NOTICE));
    console.log('-'.repeat(72));

    /* The plain-text render cannot show the logo, the spacing or a broken image
       URL, which is most of what goes wrong in an HTML email. Write the real
       HTML out so it can be opened in a browser before sending. */
    const preview = path.join(os.tmpdir(), `subprocessor-notice-${NOTICE.id}.html`);
    fs.writeFileSync(preview, renderHtml(NOTICE), 'utf8');
    console.log(`\nHTML preview: ${preview}`);
    console.log('Dry run. Nothing was sent. Re-run with --send to send it.\n');
    return;
  }

  if (withEmail.length === 0) {
    console.log('\nNo recipients with an email address. Nothing to send.\n');
    return;
  }

  /* A --to test run must NOT reuse the real idempotency key. Resend keys the
     first payload it sees against the key; a one-recipient test would either
     make the real three-recipient send return the test's result and deliver
     nothing, or fail it outright as a changed payload. Either way the notice
     silently never goes out, and the run that broke it looks like a success.
     So a test send gets its own key, unique per run so it can be repeated. */
  const idempotencyKey = override
    ? `subprocessor-notice-${NOTICE.id}-test-${Date.now()}`
    : `subprocessor-notice-${NOTICE.id}`;

  const result = await emailService.sendCustomEmail(
    withEmail.map((b) => b.contact_email),
    NOTICE.subject,
    renderHtml(NOTICE),
    null,
    { idempotencyKey, replyTo: NOTICE.replyTo },
  );

  console.log('\nResult:', JSON.stringify(result, null, 2));

  if (result.success) {
    const today = new Date().toISOString().split('T')[0];
    console.log(`\nSent ${result.sentCount} of ${withEmail.length} on ${today}.`);
    if (result.failedCount) {
      console.log(`${result.failedCount} FAILED: ${(result.failedRecipients || []).join(', ')}`);
    }
    console.log('\nRecord the date on the "sent on ____" line in');
    console.log('docs/legal/posthog-subprocessor-notice.md, which is the only record that it happened.\n');
  } else {
    console.log('\nNothing was sent.\n');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
