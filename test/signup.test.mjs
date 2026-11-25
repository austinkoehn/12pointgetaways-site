// Tests for the footer signup function (netlify/functions/signup.mjs) and the Supabase migration.
// Run: npm test
// The database tests need a throwaway LOCAL Postgres superuser URL, e.g.
//   SIGNUP_TEST_ADMIN_URL=postgres://postgres:pw@localhost:5432/postgres npm test
// They create a temporary database, apply supabase/migrations/*_guest_signups.sql, run the function against it
// as the restricted guest_signup_writer role, and drop the database afterwards. They refuse any non-local host.
// Without SIGNUP_TEST_ADMIN_URL the database tests are skipped and the rest still run.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import pg from 'pg';
import handler, { _resetRateLimit, _closePool, normalizePhone, normalizeEmail, RATE_LIMIT } from '../netlify/functions/signup.mjs';
import { EMAIL_CONSENT_TEXT, SMS_CONSENT_TEXT, MESSAGES } from '../lib/signup-consent.mjs';

const root = new URL('..', import.meta.url);
let ipSeq = 0;
const nextIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

function post(fields, { json = true, ip = nextIp(), headers = {}, body } = {}) {
  const req = new Request('https://12pointgetaways.com/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'signup-test/1.0', ...(json ? { Accept: 'application/json' } : {}), ...headers },
    body: body ?? new URLSearchParams(fields).toString(),
  });
  return handler(req, { ip });
}
const good = (extra = {}) => ({ source: '/stays/stratford-4br-hot-tub-pool-table/', email: 'Guest@Example.com', email_consent: 'yes', ...extra });

// ---------- record every outbound connection attempt ----------
const outbound = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (...a) => { outbound.push(['fetch', String(a[0])]); throw new Error('outbound fetch blocked in tests'); };
for (const [name, mod] of [['http', http], ['https', https]]) {
  const orig = mod.request;
  mod.request = (...a) => { outbound.push([name, String(a[0]?.host || a[0])]); return orig(...a); };
}
const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const o = typeof a[0] === 'object' ? a[0] : { port: a[0], host: a[1] };
  outbound.push(['tcp', `${o.host || 'localhost'}:${o.port || o.path || ''}`]);
  return realConnect.apply(this, a);
};

const ENV_KEYS = ['SIGNUP_ENABLED', 'SIGNUP_DATABASE_URL', 'SIGNUP_DB_CA_CERT'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function setEnv(vars) { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, vars); }
after(() => { setEnv(Object.fromEntries(Object.entries(savedEnv).filter(([, v]) => v != null))); globalThis.fetch = realFetch; });

// A URL that would fail if anything tried to use it (nothing listens on port 1).
const DEAD_DB = 'postgres://guest_signup_writer:x@127.0.0.1:1/none';

describe('request handling (no database)', () => {
  beforeEach(() => { _resetRateLimit(); setEnv({ SIGNUP_DATABASE_URL: DEAD_DB }); });

  test('POST only: GET gets 405 with Allow: POST', async () => {
    const r = await handler(new Request('https://x/api/signup', { headers: { Accept: 'application/json' } }), { ip: nextIp() });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('allow'), 'POST');
  });

  test('body over 16 KB is refused with 413', async () => {
    const r = await post(null, { body: 'email=a%40b.co&x=' + 'a'.repeat(17 * 1024) });
    assert.equal(r.status, 413);
  });

  test('SIGNUP_ENABLED=false gives the polite message (JSON and plain page)', async () => {
    setEnv({ SIGNUP_ENABLED: 'false', SIGNUP_DATABASE_URL: DEAD_DB });
    const r = await post(good());
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { ok: false, message: MESSAGES.disabled });
    const h = await post(good(), { json: false });
    assert.equal(h.status, 503);
    assert.match(h.headers.get('content-type'), /text\/html/);
    assert.ok((await h.text()).includes("Signups aren't available right now"));
  });

  test('missing SIGNUP_DATABASE_URL gives the polite message', async () => {
    setEnv({});
    const r = await post(good());
    assert.equal(r.status, 503);
    assert.equal((await r.json()).message, MESSAGES.disabled);
  });

  test('honeypot: filled "website" field looks like success but saves nothing', async () => {
    // DEAD_DB would make any save fail with 500, so a 200 here proves no save was attempted.
    const r = await post(good({ website: 'http://spam.example' }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, message: MESSAGES.ok });
  });

  test(`rate limit: ${RATE_LIMIT} per minute per IP, then 429 with Retry-After`, async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < RATE_LIMIT; i++) assert.notEqual((await post({ email: 'bad' }, { ip })).status, 429);
    const r = await post(good(), { ip });
    assert.equal(r.status, 429);
    const wait = Number(r.headers.get('retry-after'));
    assert.ok(wait >= 1 && wait <= 60, `Retry-After ${wait}`);
    assert.equal((await r.json()).message, MESSAGES.rateLimited);
    assert.notEqual((await post({ email: 'bad' }, { ip: '203.0.113.8' })).status, 429, 'other IPs unaffected');
  });

  test('validation messages', async () => {
    assert.equal((await (await post(good({ email: 'nope' }))).json()).message, MESSAGES.badEmail);
    assert.equal((await (await post(good({ phone: '12345' }))).json()).message, MESSAGES.badPhone);
    assert.equal((await (await post(good({ email_consent: '', sms_consent: 'yes' }))).json()).message, MESSAGES.needPhone);
    assert.equal((await (await post(good({ email_consent: '' }))).json()).message, MESSAGES.needConsent);
  });

  test('no-JS post gets an HTML page linking back to the source page', async () => {
    const r = await post(good({ website: 'x' }), { json: false });
    const html = await r.text();
    assert.match(html, /href="\/stays\/stratford-4br-hot-tub-pool-table\/"/);
  });

  test('phone and email normalizing', () => {
    assert.equal(normalizePhone('(405) 555-0123'), '+14055550123');
    assert.equal(normalizePhone('1-405-555-0123'), '+14055550123');
    assert.equal(normalizePhone('+1 405 555 0123'), '+14055550123');
    assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
    assert.equal(normalizePhone(''), '');
    assert.equal(normalizePhone('555-0123'), null);
    assert.equal(normalizePhone('405-555-012a'), null);
    assert.equal(normalizeEmail('  Guest@Example.COM '), 'guest@example.com');
    assert.equal(normalizeEmail('no-at-sign'), null);
  });

  test('function source makes no outbound calls besides the database', async () => {
    const src = await readFile(new URL('netlify/functions/signup.mjs', root), 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|twilio|stayfi|highlevel|leadconnector|\bghl|sendgrid|nodemailer|https?:\/\/(?!12pointgetaways)/i);
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    assert.deepEqual(imports.sort(), ['../../lib/signup-consent.mjs', 'pg']);
  });

  test('built footer uses the same consent text the function stores, and nothing points at GHL', async () => {
    const html = await readFile(new URL('dist/index.html', root), 'utf8').catch(() => null);
    if (!html) return; // run `npm run build` first to include this check
    const esc = (t) => t.replace(/&/g, '&amp;');
    assert.ok(html.includes(esc(EMAIL_CONSENT_TEXT)));
    assert.ok(html.includes(esc(SMS_CONSENT_TEXT)));
    assert.match(html, /<form class="signup-form" method="post" action="\/api\/signup"/);
    assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
    const cfg = await readFile(new URL('site.config.mjs', root), 'utf8');
    assert.doesNotMatch(cfg + html, /\bghl|ghlFormAction|gohighlevel|leadconnector/i);
  });
});

// ---------- database tests (local throwaway Postgres only) ----------
const ADMIN_URL = process.env.SIGNUP_TEST_ADMIN_URL;
describe('saving to Postgres (migration + function)', { skip: !ADMIN_URL && 'set SIGNUP_TEST_ADMIN_URL to a local Postgres to run' }, () => {
  let admin, db, dbName, writerUrl, dbAdminUrl;
  const rows = async () => (await db.query('select * from public.guest_signups order by created_at')).rows;

  before(async () => {
    const u = new URL(ADMIN_URL);
    if (!['localhost', '127.0.0.1', '::1'].includes(u.hostname)) throw new Error('SIGNUP_TEST_ADMIN_URL must be a local Postgres');
    admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    dbName = 'signup_test_' + Date.now();
    await admin.query(`create database ${dbName}`);
    // Stand-ins for Supabase's built-in API roles, so the migration's REVOKEs run as they would there.
    for (const r of ['anon', 'authenticated', 'service_role']) {
      await admin.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${r}') then create role ${r} nologin; end if; end $$`);
    }
    u.pathname = '/' + dbName;
    dbAdminUrl = u.toString();
    db = new pg.Client({ connectionString: dbAdminUrl });
    await db.connect();
    const dir = new URL('supabase/migrations/', root);
    const file = (await readdir(dir)).find((f) => f.endsWith('_guest_signups.sql'));
    await db.query(await readFile(new URL(file, dir), 'utf8'));
    await db.query("alter role guest_signup_writer with login password 'local-test-only'");
    const w = new URL(dbAdminUrl); w.username = 'guest_signup_writer'; w.password = 'local-test-only';
    writerUrl = w.toString();
  });
  after(async () => {
    await _closePool();
    await db?.end();
    if (admin) {
      try {
        await admin.query(`drop database if exists ${dbName} with (force)`);
        // The role is cluster-wide; leave it if another local database still uses it.
        await admin.query('drop role if exists guest_signup_writer').catch(() => {});
      } finally {
        await admin.end();
      }
    }
  });
  beforeEach(async () => { _resetRateLimit(); setEnv({ SIGNUP_DATABASE_URL: writerUrl }); await db.query('truncate public.guest_signups'); });

  test('valid signup creates one parked row with the exact consent text', async () => {
    const r = await post(good({ phone: '(405) 555-0123', sms_consent: 'yes' }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, message: MESSAGES.ok });
    const all = await rows();
    assert.equal(all.length, 1);
    const g = all[0];
    assert.equal(g.email, 'guest@example.com');
    assert.equal(g.phone, '+14055550123');
    assert.equal(g.status, 'new');
    assert.equal(g.email_consent, true);
    assert.equal(g.email_consent_text, EMAIL_CONSENT_TEXT);
    assert.equal(g.sms_consent, true);
    assert.equal(g.sms_consent_text, SMS_CONSENT_TEXT);
    assert.ok(g.email_consented_at && g.sms_consented_at && g.created_at && g.updated_at);
    assert.equal(g.source_path, '/stays/stratford-4br-hot-tub-pool-table/');
    assert.equal(g.user_agent, 'signup-test/1.0');
  });

  test('no-JS form post saves too', async () => {
    const r = await post(good(), { json: false });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /You&#39;re on the list|You're on the list/);
    assert.equal((await rows()).length, 1);
  });

  test('repeat email (any case) updates the same row, no duplicate', async () => {
    await post(good());
    const first = (await rows())[0];
    await new Promise((r) => setTimeout(r, 20));
    await post(good({ email: '  GUEST@example.com ', source: '/' }));
    const all = await rows();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, first.id);
    assert.equal(all[0].source_path, '/');
    assert.ok(all[0].updated_at > first.updated_at);
    assert.equal(+all[0].created_at, +first.created_at);
  });

  test('phone without the text box is stored with no text consent', async () => {
    await post(good({ phone: '405-555-0199' }));
    const g = (await rows())[0];
    assert.equal(g.phone, '+14055550199');
    assert.equal(g.sms_consent, false);
    assert.equal(g.sms_consent_text, null);
    assert.equal(g.sms_consented_at, null);
  });

  test('consent is never silently removed; an opt-in adds it', async () => {
    await post(good({ phone: '4055550123', sms_consent: 'yes' }));
    const before = (await rows())[0];
    // Same person signs up again with only the email box and a different phone.
    await post(good({ phone: '4055550999' }));
    let g = (await rows())[0];
    assert.equal(g.sms_consent, true);
    assert.equal(g.sms_consent_text, SMS_CONSENT_TEXT);
    assert.equal(+g.sms_consented_at, +before.sms_consented_at);
    assert.equal(g.phone, '+14055550123', 'consented number is not swapped for one without consent');
    // Text box only: email consent stays.
    await post(good({ email_consent: '', phone: '4055550123', sms_consent: 'yes' }));
    g = (await rows())[0];
    assert.equal(g.email_consent, true);
    assert.equal(g.email_consent_text, EMAIL_CONSENT_TEXT);
    // Email-only person later opts in to texts: consent added.
    await post(good({ email: 'second@example.com' }));
    await post(good({ email: 'second@example.com', email_consent: '', phone: '4055550111', sms_consent: 'yes' }));
    const s = (await rows()).find((x) => x.email === 'second@example.com');
    assert.equal(s.email_consent, true);
    assert.equal(s.sms_consent, true);
    assert.equal(s.phone, '+14055550111');
  });

  test('repeat signup does not reset a status someone already moved past new', async () => {
    await post(good());
    await db.query("update public.guest_signups set status = 'contacted'");
    await post(good({ phone: '4055550123', sms_consent: 'yes' }));
    assert.equal((await rows())[0].status, 'contacted');
  });

  test('honeypot saves nothing to the database', async () => {
    await post(good({ website: 'spam' }));
    assert.equal((await rows()).length, 0);
  });

  test('locked down: writer role can only call the function; anon/authenticated get nothing', async () => {
    const w = new pg.Client({ connectionString: writerUrl });
    await w.connect();
    await assert.rejects(w.query('select * from public.guest_signups'), /permission denied/);
    await assert.rejects(w.query("insert into public.guest_signups (email) values ('x@y.co')"), /permission denied/);
    await w.end();
    for (const role of ['anon', 'authenticated']) {
      await db.query('begin');
      await db.query(`set local role ${role}`);
      await assert.rejects(db.query('select * from public.guest_signups'), /permission denied/);
      await db.query('rollback');
      await db.query('begin');
      await db.query(`set local role ${role}`);
      await assert.rejects(db.query("select * from signup_api.upsert_guest_signup('a@b.co', null, true, 't', false, null, '/', 'ua')"), /permission denied/);
      await db.query('rollback');
    }
    const rls = await db.query("select relrowsecurity from pg_class where oid = 'public.guest_signups'::regclass");
    assert.equal(rls.rows[0].relrowsecurity, true);
    const pol = await db.query("select count(*)::int n from pg_policies where tablename = 'guest_signups'");
    assert.equal(pol.rows[0].n, 0);
  });

  test('database refuses bad data even if called directly', async () => {
    const w = new pg.Client({ connectionString: writerUrl });
    await w.connect();
    const call = (args) => w.query('select * from signup_api.upsert_guest_signup($1,$2,$3,$4,$5,$6,$7,$8)', args);
    await assert.rejects(call(['bad', null, true, 't', false, null, '/', 'ua']), /invalid email/);
    await assert.rejects(call(['a@b.co', '555', true, 't', false, null, '/', 'ua']), /invalid phone/);
    await assert.rejects(call(['a@b.co', null, false, null, true, 't', '/', 'ua']), /needs a phone/);
    await assert.rejects(call(['a@b.co', null, false, null, false, null, '/', 'ua']), /at least one consent/);
    await w.end();
  });

  test('database unreachable: polite error, nothing crashes', async () => {
    setEnv({ SIGNUP_DATABASE_URL: DEAD_DB });
    const r = await post(good());
    assert.equal(r.status, 500);
    assert.equal((await r.json()).message, MESSAGES.error);
  });
});

// ---------- no outbound calls ----------
test('no outbound calls: no HTTP(S)/fetch at all, and TCP only to the local test database', () => {
  const nonDb = outbound.filter(([kind, target]) => kind !== 'tcp' || !/^(localhost|127\.0\.0\.1|::1):/.test(target));
  assert.deepEqual(nonDb, []);
});
