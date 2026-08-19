/**
 * Collector for Content-Security-Policy violation reports.
 *
 * WHY THIS EXISTS: the CSP in vercel.json ships as Report-Only, which means the
 * browser checks every request against the policy and reports what would have
 * been blocked — but reports go to the browser console, where nobody sees them.
 * A bake period you have to remember to watch is a bake period that doesn't
 * happen. This gives the reports somewhere to land, so the decision to switch
 * from Report-Only to enforcing is made on evidence rather than optimism.
 *
 * THE ENDPOINT IS PUBLIC AND UNAUTHENTICATED, because browsers send these
 * without credentials. That means the body is entirely attacker-controlled, so
 * everything here is defensive: hard rate limit, every field truncated, nothing
 * echoed back, and logged at warn rather than error so a flood cannot be used
 * to bury real errors.
 */

const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

// Aggregate rather than log-per-report. One misconfigured directive on a busy
// page produces a report per pageview per asset; logging each would cost more
// than the problem it describes.
const seen = new Map();
const MAX_TRACKED = 500;          // bounded so a spray of unique URIs can't grow this forever
const RELOG_AFTER_MS = 15 * 60 * 1000;

function truncate(value, max = 300) {
  if (value == null) return null;
  return String(value).slice(0, max);
}

/**
 * Browsers disagree on shape: the legacy report-uri format nests everything
 * under "csp-report", while the Reporting API (report-to) posts an array of
 * { type, body }. Normalise both.
 */
function normalise(payload) {
  const out = [];
  if (!payload) return out;

  if (payload['csp-report']) {
    const r = payload['csp-report'];
    out.push({
      directive: r['effective-directive'] || r['violated-directive'],
      blockedUri: r['blocked-uri'],
      documentUri: r['document-uri'],
      sourceFile: r['source-file'],
      line: r['line-number'],
      disposition: r.disposition,
    });
  } else if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item?.type !== 'csp-violation' || !item.body) continue;
      const b = item.body;
      out.push({
        directive: b.effectiveDirective || b.violatedDirective,
        blockedUri: b.blockedURL,
        documentUri: b.documentURL,
        sourceFile: b.sourceFile,
        line: b.lineNumber,
        disposition: b.disposition,
      });
    }
  }
  return out;
}

function cspReportHandler(req, res) {
  // Answer immediately and unconditionally. The browser does not care about the
  // response, and a slow or failing collector must never become a problem for
  // the page that reported to it.
  res.status(204).end();

  try {
    for (const v of normalise(req.body)) {
      const directive = truncate(v.directive, 60);
      const blockedUri = truncate(v.blockedUri, 200);
      if (!directive) continue;

      // Key on what identifies the RULE being broken, not the individual
      // pageview — that is what collapses thousands of reports into one line.
      const key = `${directive}|${blockedUri}`;
      const now = Date.now();
      const prev = seen.get(key);

      if (prev) {
        prev.count += 1;
        if (now - prev.lastLoggedAt < RELOG_AFTER_MS) continue;
        prev.lastLoggedAt = now;
        persist(v, directive, blockedUri);
        logger.warn({
          directive, blockedUri,
          documentUri: truncate(v.documentUri, 200),
          count: prev.count,
          disposition: truncate(v.disposition, 20),
        }, '[CSP] Violation still occurring');
        continue;
      }

      if (seen.size >= MAX_TRACKED) {
        // Stop tracking new keys rather than growing without bound. The ones
        // already tracked are the ones worth watching.
        logger.warn({ directive, blockedUri }, '[CSP] Violation (tracking table full)');
        continue;
      }

      seen.set(key, { count: 1, lastLoggedAt: now });
      persist(v, directive, blockedUri);
      logger.warn({
        directive, blockedUri,
        documentUri: truncate(v.documentUri, 200),
        sourceFile: truncate(v.sourceFile, 200),
        line: typeof v.line === 'number' ? v.line : null,
        disposition: truncate(v.disposition, 20),
        count: 1,
      }, '[CSP] New violation — policy may need this allowed before enforcing');
    }
  } catch (err) {
    // Response is already sent; this must never surface to the reporter.
    logger.warn({ err }, '[CSP] Failed to process violation report');
  }
}

/**
 * Write the violation to Postgres.
 *
 * Fire-and-forget, on the same schedule as the log line — the in-memory
 * de-duplication above means a given directive/blocked-uri pair is written once
 * and then at most once per RELOG_AFTER_MS, so this stays cheap even when a
 * directive is badly wrong on a busy page.
 */
function persist(v, directive, blockedUri) {
  supabaseAdmin
    .from('csp_violations')
    .insert([{
      directive,
      blocked_uri: blockedUri,
      document_uri: truncate(v.documentUri, 200),
      disposition: truncate(v.disposition, 20),
    }])
    .then(({ error }) => {
      if (error) logger.warn({ err: error, directive }, '[CSP] Could not persist violation');
    })
    .catch((err) => logger.warn({ err, directive }, '[CSP] Persist threw'));
}

/**
 * In-process aggregate. Only ever reflects THIS worker, which is why the
 * summary endpoint reads the database instead — see cspReportSummaryFromDb.
 */
function cspReportSummary() {
  return Array.from(seen.entries())
    .map(([key, v]) => {
      const [directive, blockedUri] = key.split('|');
      return { directive, blockedUri, count: v.count };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Cross-worker aggregate, read from Postgres.
 *
 * The API runs one worker per core, and reports are distributed across them, so
 * an in-memory tally is a one-in-N sample — it reported zero violations while
 * its siblings were recording them. Since the entire purpose is deciding
 * whether the policy is safe to enforce, a false all-clear is the one answer
 * this must never give.
 */
async function cspReportSummaryFromDb({ sinceDays = 30 } = {}) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('csp_violations')
    .select('directive, blocked_uri, document_uri, disposition, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw error;

  const byRule = new Map();
  for (const row of data || []) {
    const key = `${row.directive}|${row.blocked_uri}`;
    const entry = byRule.get(key);
    if (entry) {
      entry.count += 1;
      if (row.created_at > entry.lastSeen) entry.lastSeen = row.created_at;
    } else {
      byRule.set(key, {
        directive: row.directive,
        blockedUri: row.blocked_uri,
        documentUri: row.document_uri,
        disposition: row.disposition,
        count: 1,
        lastSeen: row.created_at,
      });
    }
  }

  return Array.from(byRule.values()).sort((a, b) => b.count - a.count);
}

/** Test hook. */
function _reset() { seen.clear(); }

module.exports = { cspReportHandler, cspReportSummary, cspReportSummaryFromDb, _reset };
