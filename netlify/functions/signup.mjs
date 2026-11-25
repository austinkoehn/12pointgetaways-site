// POST /api/signup: the footer "Get direct-booking deals" form.
// Validates the signup and saves it to the guest list in Supabase (public.guest_signups) by calling
// signup_api.upsert_guest_signup as the restricted guest_signup_writer role. That is the only thing it does:
// no texts, no emails, no campaign enrollment, no calls to any other service. Rows land as status 'new'.
//
// Env vars (Netlify only, never in the repo):
//   SIGNUP_DATABASE_URL  Postgres URL for the guest_signup_writer role (Supabase pooler). Missing = off.
//   SIGNUP_ENABLED       set to "false" to switch signups off. Anything else (or unset) = on.
//   SIGNUP_DB_CA_CERT    optional PEM of the Supabase CA, to verify the database certificate.
// See docs/signup.md.
import pg from 'pg';
import { EMAIL_CONSENT_TEXT, SMS_CONSENT_TEXT, MESSAGES } from '../../lib/signup-consent.mjs';

export const config = { path: '/api/signup' };

export const MAX_BODY_BYTES = 16 * 1024;
export const RATE_LIMIT = 10; // requests per IP per window
export const RATE_WINDOW_MS = 60 * 1000;

// ---------- rate limit (per function instance, best effort) ----------
const hits = new Map(); // ip -> array of timestamps
export function _resetRateLimit() { hits.clear(); }
function rateLimit(ip, now = Date.now()) {
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) {
    hits.set(ip, list);
    return Math.max(1, Math.ceil((list[0] + RATE_WINDOW_MS - now) / 1000));
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return 0;
}

// ---------- validation ----------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function normalizeEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}
// US-first E.164. Returns '' for blank, null for invalid.
export function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  if (/[^\d\s().+-]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    if (digits.startsWith('1')) return digits.length === 11 && /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? '+' + digits : null;
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? '+' + digits : null;
  }
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? '+1' + d : null;
}
const isTicked = (v) => v != null && v !== '' && v !== 'false' && v !== '0' && v !== 'off';
function safePath(v) {
  const p = String(v || '');
  return p.startsWith('/') && !p.startsWith('//') && p.length <= 300 && !/[\s<>"'\\]/.test(p) ? p : null;
}

// ---------- responses ----------
const escHtml = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function reply(req, status, ok, message, { back = '/', headers = {} } = {}) {
  const base = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers };
  if ((req.headers.get('accept') || '').includes('application/json')) {
    return new Response(JSON.stringify({ ok, message }), { status, headers: { ...base, 'Content-Type': 'application/json; charset=utf-8' } });
  }
  // No-JS fallback: a small page with the message and a link back.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${ok ? 'Signed up' : 'Signup'} | 12 Point Getaways</title>
<link rel="stylesheet" href="/styles.css"></head>
<body><main class="wrap block narrow"><h1 class="ptitle">${ok ? "You're signed up" : 'Signup not saved'}</h1>
<p class="signup-msg ${ok ? 'is-ok' : 'is-err'}">${escHtml(message)}</p>
<p><a class="btn btn-dark" href="${escHtml(back)}">Back to 12 Point Getaways</a></p></main></body></html>`;
  return new Response(html, { status, headers: { ...base, 'Content-Type': 'text/html; charset=utf-8' } });
}

async function readBody(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

function parseFields(req, text) {
  const type = (req.headers.get('content-type') || '').toLowerCase();
  if (type.includes('application/json')) {
    const obj = JSON.parse(text || '{}');
    return obj && typeof obj === 'object' ? obj : {};
  }
  return Object.fromEntries(new URLSearchParams(text));
}

// ---------- database ----------
let pool = null;
function getPool(url) {
  if (pool && pool._signupUrl === url) return pool;
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  const ssl = local ? false : process.env.SIGNUP_DB_CA_CERT ? { ca: process.env.SIGNUP_DB_CA_CERT } : { rejectUnauthorized: false };
  // Strip sslmode from the URL so the ssl option above is what applies.
  const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
  pool = new pg.Pool({ connectionString, ssl, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, query_timeout: 6000 });
  pool._signupUrl = url;
  pool.on('error', () => {});
  return pool;
}
export async function _closePool() { if (pool) { const p = pool; pool = null; await p.end(); } }

async function saveSignup(url, s) {
  const { rows } = await getPool(url).query(
    'select signup_id, was_created from signup_api.upsert_guest_signup($1, $2, $3, $4, $5, $6, $7, $8)',
    [s.email, s.phone || null, s.emailConsent, s.emailConsent ? EMAIL_CONSENT_TEXT : null,
      s.smsConsent, s.smsConsent ? SMS_CONSENT_TEXT : null, s.sourcePath, s.userAgent],
  );
  return rows[0];
}

// ---------- handler ----------
export default async function handler(req, context = {}) {
  if (req.method !== 'POST') return reply(req, 405, false, MESSAGES.method, { headers: { Allow: 'POST' } });

  const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const wait = rateLimit(ip);
  if (wait) return reply(req, 429, false, MESSAGES.rateLimited, { headers: { 'Retry-After': String(wait) } });

  const text = await readBody(req);
  if (text == null) return reply(req, 413, false, MESSAGES.tooLarge);
  let f;
  try { f = parseFields(req, text); } catch { return reply(req, 400, false, MESSAGES.badEmail); }

  let refPath = null;
  try { refPath = new URL(req.headers.get('referer') || '').pathname; } catch {}
  const sourcePath = safePath(f.source) || safePath(refPath);
  const back = sourcePath || '/';

  // Off switch: checked before anything is validated or saved.
  const dbUrl = process.env.SIGNUP_DATABASE_URL;
  if (String(process.env.SIGNUP_ENABLED || '').trim().toLowerCase() === 'false' || !dbUrl) {
    return reply(req, 503, false, MESSAGES.disabled, { back });
  }

  // Honeypot: people never see or fill this field. Pretend it worked and save nothing.
  if (String(f.website || '').trim()) return reply(req, 200, true, MESSAGES.ok, { back });

  const email = normalizeEmail(f.email);
  if (!email) return reply(req, 400, false, MESSAGES.badEmail, { back });
  const phone = normalizePhone(f.phone);
  if (phone == null) return reply(req, 400, false, MESSAGES.badPhone, { back });
  const emailConsent = isTicked(f.email_consent);
  const smsConsent = isTicked(f.sms_consent);
  if (smsConsent && !phone) return reply(req, 400, false, MESSAGES.needPhone, { back });
  if (!emailConsent && !smsConsent) return reply(req, 400, false, MESSAGES.needConsent, { back });

  try {
    await saveSignup(dbUrl, { email, phone, emailConsent, smsConsent, sourcePath, userAgent: (req.headers.get('user-agent') || '').slice(0, 512) || null });
  } catch (err) {
    console.error('signup save failed:', err.code || '', err.message);
    return reply(req, 500, false, MESSAGES.error, { back });
  }
  return reply(req, 200, true, MESSAGES.ok, { back });
}
