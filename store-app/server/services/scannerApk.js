/**
 * Keeps the scanner APK on the Railway volume in step with a URL.
 *
 * WHY THIS EXISTS: a Railway volume cannot be written to from outside the
 * running service, so there has to be some path from "EAS produced a build" to
 * "the file is on the disk". The alternative considered was an admin-only
 * upload endpoint, which works but means whoever publishes a release has to
 * obtain an access token and make an authenticated POST. Setting a variable in
 * the Railway dashboard is a thing the operator already knows how to do.
 *
 * SCANNER_APK_SOURCE_URL is the single source of truth. Change it to a new EAS
 * artifact URL, redeploy, and the new build replaces the old one. Leave it
 * unset and nothing happens at all, which is the correct behaviour before the
 * first build exists.
 *
 * Idempotent by recording the URL it last fetched next to the file. Without
 * that marker the choice is between "download 80MB on every boot", which on a
 * platform that restarts containers freely is wasteful and slow, and "only
 * download if the file is missing", which makes replacing a build require
 * deleting a file by hand on a disk nobody can reach.
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const logger = require('../utils/logger');

const APK_PATH = process.env.SCANNER_APK_PATH || '/data/quaderp-scanner.apk';
const MARKER_PATH = `${APK_PATH}.source`;

/** An APK is a zip; anything this small is an error page that arrived with a 200. */
const MIN_PLAUSIBLE_BYTES = 1_000_000;

async function readMarker() {
  try {
    return (await fsp.readFile(MARKER_PATH, 'utf8')).trim();
  } catch {
    return null;
  }
}

/**
 * Fetch the configured build onto the volume if it is not already there.
 *
 * Never throws and never blocks startup on failure: the API serving a shop's
 * till must not refuse to boot because a download of an optional companion app
 * did not work.
 *
 * @returns {Promise<{ status: string, bytes?: number }>}
 */
async function ensureScannerApk() {
  const url = (process.env.SCANNER_APK_SOURCE_URL || '').trim();
  if (!url) return { status: 'not-configured' };

  if (!/^https:\/\//i.test(url)) {
    logger.warn('[scanner-apk] SCANNER_APK_SOURCE_URL is not an https url; ignoring');
    return { status: 'bad-url' };
  }

  try {
    if ((await readMarker()) === url && fs.existsSync(APK_PATH)) {
      return { status: 'already-current' };
    }

    logger.info('[scanner-apk] Fetching the scanner build onto the volume');
    await fsp.mkdir(path.dirname(APK_PATH), { recursive: true });

    const tmp = `${APK_PATH}.incoming`;
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      logger.error({ status: response.status }, '[scanner-apk] Source URL did not return a build');
      return { status: 'fetch-failed' };
    }

    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmp));
    const { size } = await fsp.stat(tmp);

    if (size < MIN_PLAUSIBLE_BYTES) {
      await fsp.unlink(tmp).catch(() => {});
      logger.error({ bytes: size }, '[scanner-apk] Source URL returned something too small to be a build');
      return { status: 'too-small', bytes: size };
    }

    /* Rename rather than writing in place, and write the marker only after the
       rename succeeds. A download that dies halfway therefore leaves the
       previous working APK untouched, and a customer downloading during a
       replacement gets one file or the other, never a mixture. */
    await fsp.rename(tmp, APK_PATH);
    await fsp.writeFile(MARKER_PATH, url, 'utf8');

    logger.info({ bytes: size }, '[scanner-apk] Scanner build is on the volume');
    return { status: 'updated', bytes: size };
  } catch (err) {
    logger.error({ err }, '[scanner-apk] Could not put the scanner build on the volume');
    return { status: 'error' };
  }
}

module.exports = { ensureScannerApk, APK_PATH };
