/**
 * Utils.gs
 * =============================================================================
 * Small, reusable helpers: ID/token generation, sanitization (XSS defense),
 * JSON responses, date formatting, device detection.
 * No business logic here — keep it generic.
 * =============================================================================
 */

/** Characters used for human-friendly random suffixes (no confusing 0/O/1/I). */
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a short random string (default 4 chars) from SAFE_CHARS.
 * Used as the unguessable suffix on QR tokens.
 */
function randomSuffix(len) {
  len = len || 4;
  var out = '';
  for (var i = 0; i < len; i++) {
    out += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
  }
  return out;
}

/**
 * Build a unique, mostly-readable QR token.
 *   makeToken('TASK001', 'STU001')  ->  'TASK001-STU001-K7Q2'
 * The random suffix prevents a pupil from guessing a neighbour's token.
 */
function makeToken(taskId, entitySeq) {
  return [taskId, entitySeq, randomSuffix(4)].join('-');
}

/**
 * Generate a sequential-style ID with a prefix, e.g. nextId('TASK', existing).
 * Looks at existing IDs, finds the highest number, returns prefix + zero-padded.
 */
function nextId(prefix, existingIds) {
  var max = 0;
  (existingIds || []).forEach(function (id) {
    var m = String(id).match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + pad(max + 1, 3);
}

/** Zero-pad a number to n digits: pad(7,3) -> '007'. */
function pad(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/** Generate a globally-unique log id (timestamp + randomness). */
function uid(prefix) {
  return (prefix || 'L') + '-' + Date.now().toString(36) + '-' + randomSuffix(3);
}

/**
 * Sanitize a string for safe storage/display. Strips tags and dangerous chars.
 * This is the first line of XSS defense (the frontend also escapes on render).
 */
function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/<\/?[^>]+(>|$)/g, '') // strip HTML tags
    .replace(/[<>]/g, '')           // strip stray angle brackets
    .trim()
    .slice(0, 2000);                // hard length cap
}

/** Validate a URL is http/https only (blocks javascript: and data: URIs). */
function cleanUrl(value) {
  var v = String(value || '').trim();
  if (!/^https?:\/\//i.test(v)) return '';
  return v.replace(/[<>"]/g, '').slice(0, 2000);
}

/** Standard JSON success response for the Web App. */
function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data === undefined ? null : data }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Standard JSON error response. */
function jsonErr(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: String(message), code: code || 'ERROR' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Format a Date (or now) as an ISO-ish string in the sheet's timezone. */
function nowIso() {
  return new Date().toISOString();
}

/** Rough device type from a user-agent string. */
function deviceFromUA(ua) {
  ua = String(ua || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'mobile';
  if (!ua) return 'unknown';
  return 'desktop';
}

/** Escape a string for safe insertion into HTML (used by the redirect/verify pages). */
function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Simple non-cryptographic hash for PINs (good enough for a school kiosk). */
function hashPin(pin) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'qrams-salt::' + String(pin)
  );
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
