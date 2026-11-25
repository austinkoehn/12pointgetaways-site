// Combined guest rating per home, from the reviews Hostfully has imported (Airbnb, Vrbo, Booking.com, direct).
// We only ever use each review's score and source. Review text is never shown: Hostfully's docs say imported
// Airbnb reviews are internal only under Airbnb's policy.
//
// Scales: Booking.com scores guests 1-10; Airbnb, Vrbo and Hostfully direct reviews are 1-5. Hostfully's API
// documents `rating` only as a whole number and doesn't say whether Booking.com scores are converted. So we look
// at the data: if any review from a source scores above 5, that whole source is treated as out of 10 and divided
// by 2. If every score from a source is 5 or less, it is treated as already out of 5.
// Known limit: a source whose only reviews are 10-point scores of 5 or below would be read as out of 5.

export const SOURCE_LABELS = { AIRBNB: 'Airbnb', VRBO: 'Vrbo', BOOKING_DOT_COM: 'Booking.com', HOSTFULLY: 'direct stays' };

const scoreOf = (r) => {
  const n = Number(r?.rating);
  return Number.isFinite(n) && n > 0 && n <= 10 ? n : null; // 0 / missing = no score given
};
const sourceOf = (r) => String(r?.source || 'HOSTFULLY').toUpperCase();

// { SOURCE: 5 | 10 } for every source that has at least one scored review.
export function detectScales(reviews = []) {
  const scales = {};
  for (const r of reviews) {
    const s = scoreOf(r);
    if (s == null) continue;
    const src = sourceOf(r);
    scales[src] = Math.max(scales[src] || 5, s > 5 ? 10 : 5);
  }
  return scales;
}

// -> null when there is nothing to show, else { count, average, sources: ['AIRBNB', ...] }.
// average = mean of the scores on a 5-point scale, rounded to 2 decimals. count = reviews that have a score.
export function summarizeReviews(reviews = [], scales = detectScales(reviews)) {
  let sum = 0, count = 0;
  const sources = new Set();
  for (const r of reviews || []) {
    const s = scoreOf(r);
    if (s == null) continue;
    const src = sourceOf(r);
    const scale = scales[src] || (s > 5 ? 10 : 5);
    sum += scale === 10 ? s / 2 : s;
    count++;
    sources.add(src);
  }
  if (!count) return null;
  return { count, average: Math.round((sum / count) * 100) / 100, sources: [...sources] };
}

// "Airbnb, Vrbo and Booking.com"
export function sourceList(sources = []) {
  const order = ['AIRBNB', 'VRBO', 'BOOKING_DOT_COM', 'HOSTFULLY'];
  const names = [...sources].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map((s) => SOURCE_LABELS[s] || s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '));
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// Listing page links per channel. A URL typed in site.config.mjs wins; otherwise the home's channel links in
// Hostfully; otherwise the Airbnb listing id Hostfully stores. Only https links on the channel's own site are kept.
const HOSTS = { airbnb: /(^|\.)airbnb\.[a-z.]+$/, vrbo: /(^|\.)vrbo\.com$/, booking: /(^|\.)booking\.com$/ };
const CHANNEL_KEYS = { AIRBNB: 'airbnb', VRBO: 'vrbo', BOOKING_DOT_COM: 'booking' };
export function listingLinks(configured = {}, channelLinks = [], airbnbId = '') {
  const safe = (key, u) => {
    try { const x = new URL(String(u || '')); return x.protocol === 'https:' && HOSTS[key].test(x.hostname) ? x.href : ''; } catch { return ''; }
  };
  const fromHostfully = {};
  for (const l of channelLinks || []) {
    const key = CHANNEL_KEYS[String(l?.channel || '').toUpperCase()];
    if (key && !fromHostfully[key]) fromHostfully[key] = safe(key, l.url);
  }
  const id = /^\d+$/.test(String(airbnbId || '')) ? `https://www.airbnb.com/rooms/${airbnbId}` : '';
  const out = {};
  for (const key of Object.keys(HOSTS)) {
    const u = safe(key, configured?.[key]) || fromHostfully[key] || (key === 'airbnb' ? id : '');
    if (u) out[key] = u;
  }
  return out;
}
