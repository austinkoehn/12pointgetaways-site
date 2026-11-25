// Combined guest rating for each home, from the reviews Hostfully has imported from Airbnb, Vrbo and Booking.com.
// Pure functions only (no network) so the math can be unit tested. See docs/ratings.md.
//
// Only the numbers leave this file: a count and an average. Review text is never read here or shown on the site,
// because the platforms' terms don't allow republishing their reviews.

// Hostfully `source` values we count, and the label we show. Anything else (direct, Facebook, ...) is left out.
export const RATING_SOURCES = {
  AIRBNB: 'Airbnb',
  VRBO: 'Vrbo',
  BOOKING_DOT_COM: 'Booking.com',
};

// Map Hostfully's source string to one of RATING_SOURCES, tolerating spelling variants (HOMEAWAY, BOOKING_COM, ...).
export function sourceKey(source) {
  const s = String(source || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (s.includes('AIRBNB')) return 'AIRBNB';
  if (s.includes('VRBO') || s.includes('HOMEAWAY')) return 'VRBO';
  if (s.startsWith('BOOKING')) return 'BOOKING_DOT_COM';
  return null;
}

const usable = (r) => typeof r === 'number' ? Number.isFinite(r) && r > 0 : r != null && r !== '' && Number.isFinite(Number(r)) && Number(r) > 0;

// Turns a list of reviews ({ source, rating }) into { count, average, sources: { AIRBNB: n, ... }, warnings }.
// - Reviews with no rating (null, '', 0, not a number) are skipped and not counted.
// - Everything is put on a 5-point scale. Booking.com scores guests out of 10. Hostfully's API doesn't say whether it
//   passes them through as /10 or converts them, so we decide per source: if any Booking.com rating is above 5, all
//   Booking.com ratings for that home are treated as /10 and halved; if none is above 5 they're taken as already /5.
//   For Airbnb and Vrbo (both /5) a rating above 5 can only mean /10, so that one review is halved.
//   Ratings above 10 are not valid on any scale and are skipped.
// - The average is weighted by review count: sum of all normalized ratings / number of rated reviews.
// Returns null when there is nothing to show.
export function combineRatings(reviews = []) {
  const warnings = [];
  const bySource = {};
  for (const r of reviews || []) {
    const key = sourceKey(r?.source);
    if (!key || !usable(r.rating)) continue;
    const n = Number(r.rating);
    if (n > 10) { warnings.push(`skipped ${key} rating ${n} (above 10)`); continue; }
    (bySource[key] ||= []).push(n);
  }
  let sum = 0, count = 0;
  const sources = {};
  for (const [key, list] of Object.entries(bySource)) {
    const tenScale = key === 'BOOKING_DOT_COM' && list.some((n) => n > 5);
    if (key === 'BOOKING_DOT_COM' && !tenScale) warnings.push(`Booking.com ratings all 5 or under, taken as already out of 5`);
    for (const n of list) {
      const halve = tenScale || n > 5;
      if (halve && key !== 'BOOKING_DOT_COM') warnings.push(`${key} rating ${n} above 5, treated as out of 10`);
      sum += halve ? n / 2 : n;
    }
    count += list.length;
    sources[key] = list.length;
  }
  if (!count) return null;
  return { count, average: sum / count, sources, warnings };
}

// "4.99". Rounded DOWN to 2 decimals so we never show more than guests actually gave (4.996 shows 4.99, not 5.00).
export function formatAverage(avg) {
  const floored = Math.floor(avg * 100 + 1e-9) / 100;
  return floored.toFixed(2);
}

export const formatCount = (n) => `${Number(n).toLocaleString('en-US')} review${n === 1 ? '' : 's'}`;

// Listing links shown next to the rating. Hostfully gives us the Airbnb listing id; Vrbo and Booking.com links come
// from site.config.mjs (listingLinks) until Hostfully exposes them. A config value always wins. Blank = no link.
const HOSTS = { airbnb: /(^|\.)airbnb\.[a-z.]+$/, vrbo: /(^|\.)vrbo\.com$/, bookingCom: /(^|\.)booking\.com$/ };
export const LINK_LABELS = { airbnb: 'Airbnb', vrbo: 'Vrbo', bookingCom: 'Booking.com' };

export function listingLinks(detail = {}, configLinks = {}) {
  const out = [];
  const warnings = [];
  const airbnbId = detail?.airbnbData?.active !== false ? String(detail?.airbnbData?.airbnbId || '').trim() : '';
  const fromHostfully = { airbnb: /^\d+$/.test(airbnbId) ? `https://www.airbnb.com/rooms/${airbnbId}` : '' };
  for (const key of Object.keys(LINK_LABELS)) {
    const raw = String(configLinks?.[key] || fromHostfully[key] || '').trim();
    if (!raw) continue;
    let u;
    try { u = new URL(raw); } catch { warnings.push(`${key} link is not a URL: ${raw}`); continue; }
    if (u.protocol !== 'https:' || !HOSTS[key].test(u.hostname)) { warnings.push(`${key} link is not an https ${LINK_LABELS[key]} URL: ${raw}`); continue; }
    out.push({ key, label: LINK_LABELS[key], href: u.href });
  }
  return { links: out, warnings };
}
