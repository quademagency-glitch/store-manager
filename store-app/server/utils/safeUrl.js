/**
 * Outbound requests to addresses a customer chose (webhook endpoints).
 *
 * Until 8 October 2026 a business could register any URL, and the delivery's
 * response body (2,000 characters) was stored where that business can read
 * it. Pointing a webhook at an internal address therefore read internal
 * services back out: server-side request forgery.
 *
 * Two checks, because one is not enough:
 *  - when the URL is saved: https, no credentials, not an internal name or
 *    a private address literal;
 *  - when connecting: the address DNS actually returned must be public. A
 *    name can resolve to a public address when saved and to 127.0.0.1 when
 *    used (DNS rebinding), so only the connect-time check is decisive.
 * Redirects are not followed: a public endpoint could otherwise bounce the
 * request inward.
 */
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const blocked = new net.BlockList();
for (const [range, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(range, prefix, 'ipv4');
for (const [range, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96],
]) blocked.addSubnet(range, prefix, 'ipv6');

/** True for an address it is safe to send a customer-directed request to. */
function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

const INTERNAL_NAMES = /(^|\.)(localhost|local|internal|localdomain|home|lan|intranet|corp)$/i;

/** Why this URL cannot be a webhook endpoint, or null when it can. */
function webhookUrlProblem(value) {
  let url;
  try { url = new URL(String(value)); } catch { return 'Enter a full URL, starting with https://'; }
  if (url.protocol !== 'https:') return 'Webhook URLs must start with https://';
  if (url.username || url.password) return 'Webhook URLs cannot contain a username or password.';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) ? !isPublicAddress(host) : (INTERNAL_NAMES.test(host) || !host.includes('.'))) {
    return 'Webhook URLs must point to a public internet address.';
  }
  return null;
}

/** dns.lookup that refuses to hand back a non-public address. */
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family }];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || list.length === 0) {
      const refused = new Error(`Refused to connect to a non-public address for ${hostname}`);
      refused.code = 'ENONPUBLIC';
      return callback(refused);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

const agents = {
  'http:': new http.Agent({ lookup: publicLookup }),
  'https:': new https.Agent({ lookup: publicLookup }),
};

/**
 * Options for node-fetch that keep a customer-directed request public:
 * connect-time address checks, and no redirects. Address literals skip DNS,
 * so callers must also check the URL itself with assertPublicTarget.
 */
const publicFetchOptions = {
  agent: (parsed) => agents[parsed.protocol],
  redirect: 'manual',
};

/** Throws for a URL whose host is a non-public address literal or internal name. */
function assertPublicTarget(value) {
  const url = new URL(String(value));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) ? !isPublicAddress(host) : INTERNAL_NAMES.test(host)) {
    const refused = new Error('Refused to send to a non-public address.');
    refused.code = 'ENONPUBLIC';
    throw refused;
  }
}

module.exports = { isPublicAddress, webhookUrlProblem, publicLookup, publicFetchOptions, assertPublicTarget };
