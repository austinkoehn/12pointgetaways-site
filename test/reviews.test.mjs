// Unit tests for the combined guest rating (lib/reviews.mjs). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectScales, summarizeReviews, sourceList, listingLinks } from '../lib/reviews.mjs';

const many = (source, rating, n) => Array.from({ length: n }, () => ({ source, rating }));

test('no reviews, or none with a score, gives no rating', () => {
  assert.equal(summarizeReviews([]), null);
  assert.equal(summarizeReviews(undefined), null);
  assert.equal(summarizeReviews([{ source: 'AIRBNB', rating: 0 }, { source: 'VRBO' }, { source: 'AIRBNB', rating: null }]), null);
});

test('5-point reviews are averaged as they are', () => {
  assert.deepEqual(summarizeReviews([...many('AIRBNB', 5, 3), { source: 'AIRBNB', rating: 4 }]), { count: 4, average: 4.75, sources: ['AIRBNB'] });
});

test('Booking.com 10-point scores are halved before mixing with 5-point ones', () => {
  const reviews = [...many('AIRBNB', 5, 2), { source: 'VRBO', rating: 4 }, { source: 'BOOKING_DOT_COM', rating: 10 }, { source: 'BOOKING_DOT_COM', rating: 8 }];
  // (5 + 5 + 4 + 5 + 4) / 5 = 4.6
  assert.deepEqual(summarizeReviews(reviews), { count: 5, average: 4.6, sources: ['AIRBNB', 'VRBO', 'BOOKING_DOT_COM'] });
});

test('a 10-point source keeps its scale for low scores too', () => {
  // Booking.com is out of 10 because one score is above 5, so its 4 means 2 out of 5.
  const r = summarizeReviews([{ source: 'BOOKING_DOT_COM', rating: 10 }, { source: 'BOOKING_DOT_COM', rating: 4 }]);
  assert.equal(r.average, 3.5);
});

test('if Hostfully already converted Booking.com to 5 points, it is not halved again', () => {
  assert.deepEqual(detectScales([{ source: 'BOOKING_DOT_COM', rating: 5 }, { source: 'BOOKING_DOT_COM', rating: 4 }]), { BOOKING_DOT_COM: 5 });
  assert.equal(summarizeReviews([{ source: 'BOOKING_DOT_COM', rating: 5 }, { source: 'AIRBNB', rating: 4 }]).average, 4.5);
});

test('scales found across all homes apply to a home with only low scores', () => {
  const scales = detectScales([{ source: 'BOOKING_DOT_COM', rating: 9 }]);
  assert.equal(summarizeReviews([{ source: 'BOOKING_DOT_COM', rating: 5 }], scales).average, 2.5);
});

test('average is rounded to 2 decimals and out-of-range scores are ignored', () => {
  const r = summarizeReviews([...many('AIRBNB', 5, 2), { source: 'AIRBNB', rating: 4 }, { source: 'AIRBNB', rating: 42 }]);
  assert.deepEqual(r, { count: 3, average: 4.67, sources: ['AIRBNB'] });
});

test('source names read naturally', () => {
  assert.equal(sourceList(['BOOKING_DOT_COM', 'AIRBNB', 'VRBO']), 'Airbnb, Vrbo and Booking.com');
  assert.equal(sourceList(['HOSTFULLY', 'AIRBNB']), 'Airbnb and direct stays');
  assert.equal(sourceList(['AIRBNB']), 'Airbnb');
});

test('listing links: config first, then Hostfully channel links, then the Airbnb id; only real channel sites', () => {
  const links = listingLinks(
    { airbnb: '', vrbo: 'https://www.vrbo.com/1234567', booking: '' },
    [{ channel: 'VRBO', url: 'https://www.vrbo.com/999' }, { channel: 'BOOKING_DOT_COM', url: 'https://www.booking.com/hotel/us/x.html' }, { channel: 'AIRBNB', url: 'javascript:alert(1)' }],
    '5551234',
  );
  assert.deepEqual(links, { airbnb: 'https://www.airbnb.com/rooms/5551234', vrbo: 'https://www.vrbo.com/1234567', booking: 'https://www.booking.com/hotel/us/x.html' });
  assert.deepEqual(listingLinks({ airbnb: 'http://www.airbnb.com/rooms/1', booking: 'https://evil.example/booking.com' }, [], ''), {});
  assert.deepEqual(listingLinks(undefined, undefined, undefined), {});
});
