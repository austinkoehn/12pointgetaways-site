// Tests for the combined rating math (lib/ratings.mjs). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineRatings, bookingTenPoint, sampleRatingsAllowed, formatAverage, formatCount, listingLinks, sourceKey } from '../lib/ratings.mjs';

const rep = (source, rating, n = 1) => Array.from({ length: n }, () => ({ source, rating }));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('mixed /5 and /10: Booking.com halved, weighted by review count', () => {
  const r = combineRatings([...rep('AIRBNB', 5, 3), ...rep('VRBO', 4), ...rep('BOOKING_DOT_COM', 10), ...rep('BOOKING_DOT_COM', 8)]);
  // (5+5+5+4+5+4) / 6
  assert.equal(r.count, 6);
  close(r.average, 28 / 6);
  assert.deepEqual(r.sources, { AIRBNB: 3, VRBO: 1, BOOKING_DOT_COM: 2 });
  assert.equal(formatAverage(r.average), '4.66');
});

test('Austin example: 120 reviews averaging 4.99', () => {
  const r = combineRatings([...rep('AIRBNB', 5, 100), ...rep('VRBO', 5, 10), ...rep('BOOKING_DOT_COM', 10, 8), ...rep('BOOKING_DOT_COM', 9, 2)]);
  assert.equal(r.count, 120);
  assert.equal(formatAverage(r.average), '4.99'); // 599/120 = 4.9916
  assert.equal(formatCount(r.count), '120 reviews');
});

test('zero reviews, or none rated, hides the rating', () => {
  assert.equal(combineRatings([]), null);
  assert.equal(combineRatings(undefined), null);
  assert.equal(combineRatings([...rep('AIRBNB', null, 3), ...rep('VRBO', 0), ...rep('BOOKING_DOT_COM', '')]), null);
});

test('missing ratings are skipped, not counted as zero', () => {
  const r = combineRatings([...rep('AIRBNB', 5, 2), ...rep('AIRBNB', null), ...rep('VRBO', undefined), { source: 'VRBO' }, ...rep('AIRBNB', 'abc')]);
  assert.equal(r.count, 2);
  assert.equal(r.average, 5);
});

test('only Airbnb, Vrbo and Booking.com count', () => {
  const r = combineRatings([...rep('AIRBNB', 5), ...rep('HOSTFULLY', 1), ...rep('FACEBOOK', 1), ...rep(null, 1)]);
  assert.equal(r.count, 1);
  assert.equal(sourceKey('HOMEAWAY'), 'VRBO');
  assert.equal(sourceKey('booking.com'), 'BOOKING_DOT_COM');
  assert.equal(sourceKey('AIRBNB_OFFICIAL'), 'AIRBNB');
});

test('Booking.com ratings all <= 5 are taken as already out of 5', () => {
  const r = combineRatings(rep('BOOKING_DOT_COM', 5, 2).concat(rep('BOOKING_DOT_COM', 4)));
  close(r.average, 14 / 3);
  assert.ok(r.warnings.some((w) => /already out of 5/.test(w)));
});

test('a /5 source rating above 5 is treated as /10; above 10 is skipped', () => {
  const r = combineRatings([...rep('AIRBNB', 10), ...rep('VRBO', 4), ...rep('AIRBNB', 11)]);
  assert.equal(r.count, 2);
  close(r.average, 4.5);
});

test('average is rounded down so it never overstates', () => {
  assert.equal(formatAverage(4.996), '4.99');
  assert.equal(formatAverage(5), '5.00');
  assert.equal(formatAverage(4.9), '4.90');
  assert.equal(formatAverage(28 / 6), '4.66');
  assert.equal(formatCount(1), '1 review');
});

test('listing links: Airbnb from Hostfully id, config wins, bad links dropped', () => {
  const d = { airbnbData: { active: true, airbnbId: '642511591613620742' } };
  assert.deepEqual(listingLinks(d, {}).links.map((l) => l.href), ['https://www.airbnb.com/rooms/642511591613620742']);
  const { links, warnings } = listingLinks(d, { vrbo: 'https://www.vrbo.com/123', bookingCom: 'http://evil.example/x', airbnb: '' });
  assert.deepEqual(links.map((l) => l.key), ['airbnb', 'vrbo']);
  assert.equal(warnings.length, 1);
  assert.deepEqual(listingLinks({ airbnbData: { active: false, airbnbId: '1' } }, {}).links, []);
  assert.deepEqual(listingLinks({}, undefined).links, []);
});

test('fetchReviews: GET only, follows cursor pages, keeps only source and rating; errors throw', async () => {
  const { fetchReviews } = await import('../build/hostfully.mjs');
  const realFetch = globalThis.fetch;
  const calls = [];
  process.env.HOSTFULLY_API_KEY ||= 'test-key';
  try {
    globalThis.fetch = async (u, opts = {}) => {
      calls.push({ u: String(u), method: opts.method || 'GET' });
      const cur = new URL(u).searchParams.get('_cursor');
      const body = cur
        ? { reviews: [{ source: 'VRBO', rating: 4, content: 'secret text', author: 'x' }], _paging: {} }
        : { reviews: [{ source: 'AIRBNB', rating: 5, content: 'secret text' }], _paging: { _nextCursor: 'abc' } };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const out = await fetchReviews('uid-1');
    assert.deepEqual(out, [{ source: 'AIRBNB', rating: 5 }, { source: 'VRBO', rating: 4 }]);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.method === 'GET' && c.u.includes('/reviews?') && c.u.includes('propertyUid=uid-1') && c.u.includes('_limit=100')));
    globalThis.fetch = async () => new Response('nope', { status: 403 });
    await assert.rejects(() => fetchReviews('uid-1'), /403/);
  } finally {
    globalThis.fetch = realFetch;
    if (process.env.HOSTFULLY_API_KEY === 'test-key') delete process.env.HOSTFULLY_API_KEY;
  }
});

// ---- merged in from PR 11's first version (test/reviews.test.mjs) ----

test('Booking.com scale is decided across all homes: a home with only low 10-point scores is still halved', () => {
  const otherHome = rep('BOOKING_DOT_COM', 9);
  const thisHome = [...rep('BOOKING_DOT_COM', 5), ...rep('AIRBNB', 5)];
  const bookingTenScale = bookingTenPoint([...otherHome, ...thisHome]);
  assert.equal(bookingTenScale, true);
  close(combineRatings(thisHome, { bookingTenScale }).average, (2.5 + 5) / 2);
  // Per-home default would have read that 5 as 5/5:
  close(combineRatings(thisHome).average, 5);
});

test('if Hostfully already converts Booking.com to 5 points, it is never halved twice', () => {
  const all = [...rep('BOOKING_DOT_COM', 5, 3), ...rep('BOOKING_DOT_COM', 4)];
  assert.equal(bookingTenPoint(all), false);
  close(combineRatings(all, { bookingTenScale: false }).average, 19 / 4);
  assert.equal(bookingTenPoint(rep('AIRBNB', 5)), undefined);
  assert.equal(bookingTenPoint(undefined), undefined);
});

test('a 10-point Booking.com keeps its scale for low scores in the same home', () => {
  close(combineRatings([...rep('BOOKING_DOT_COM', 10), ...rep('BOOKING_DOT_COM', 4)]).average, 3.5);
});

test('direct (Hostfully) reviews never change the count or average', () => {
  const r = combineRatings([...rep('AIRBNB', 4), ...rep('HOSTFULLY', 5, 10), ...rep('REVYOOS', 5), ...rep('TRIPADVISOR', 1)]);
  assert.deepEqual([r.count, r.average, r.sources], [1, 4, { AIRBNB: 1 }]);
});

test('rounding is always down, including float edge cases', () => {
  assert.equal(formatAverage(14 / 3), '4.66');
  assert.equal(formatAverage(4.999999), '4.99');
  assert.equal(formatAverage(4.6), '4.60');
  assert.equal(formatAverage(4.57), '4.57');
});

test('listing links: javascript:, http and look-alike hosts are dropped', () => {
  const { links } = listingLinks({}, { airbnb: 'javascript:alert(1)', vrbo: 'http://www.vrbo.com/1', bookingCom: 'https://evil.example/booking.com' });
  assert.deepEqual(links, []);
  assert.deepEqual(listingLinks({}, { vrbo: 'https://www.vrbo.com.evil.example/1' }).links, []);
});

test('fake sample ratings only on request, and never in production', () => {
  assert.equal(sampleRatingsAllowed({}), false);
  assert.equal(sampleRatingsAllowed({ CONTEXT: 'deploy-preview' }), false);
  assert.equal(sampleRatingsAllowed({ SHOW_SAMPLE_RATINGS: '1' }), true);
  assert.equal(sampleRatingsAllowed({ SHOW_SAMPLE_RATINGS: '1', CONTEXT: 'deploy-preview' }), true);
  assert.equal(sampleRatingsAllowed({ SHOW_SAMPLE_RATINGS: '1', CONTEXT: 'production' }), false);
  assert.equal(sampleRatingsAllowed(undefined), false);
});
