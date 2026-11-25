// Read-only Hostfully client used at build time. Same API and header as the koehn-ops hostfully-sync function.
// Only GET requests; nothing in Hostfully changes.
const API = 'https://api.hostfully.com/api/v3.3';

async function get(path, params = {}) {
  const key = process.env.HOSTFULLY_API_KEY;
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(u, { headers: { 'X-HOSTFULLY-APIKEY': key, Accept: 'application/json' } });
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 3000 * (attempt + 1))); continue; }
    if (r.status === 404) return null;
    const text = await r.text();
    if (!r.ok) throw new Error(`Hostfully GET ${path} -> ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`Hostfully GET ${path} kept failing`);
}

async function allPages(path, key, params = {}) {
  const out = [];
  let cursor = '';
  for (let i = 0; i < 50; i++) {
    const d = await get(path, { ...params, _limit: '100', _cursor: cursor });
    if (!d) break;
    out.push(...(d[key] || []));
    cursor = d._paging?._nextCursor || '';
    if (!cursor) break;
  }
  return out;
}

// Returns the same shape as data/fixture.json, for the listed property uids only.
export async function fetchProperties(uids) {
  const properties = [];
  for (const uid of uids) {
    const detail = await get(`/properties/${uid}`);
    if (!detail) throw new Error(`Hostfully has no property ${uid}`);
    const descs = await get('/property-descriptions', { propertyUid: uid });
    const desc = (descs?.propertyDescriptions || []).find((d) => (d.locale || 'en_US').startsWith('en')) || descs?.propertyDescriptions?.[0] || {};
    const photos = await allPages('/photos', 'photos', { propertyUid: uid });
    const amen = await get('/amenities', { propertyUid: uid });
    const rules = await get('/property-rules', { propertyUid: uid });
    properties.push({
      uid,
      detail: detail.property ?? detail,
      description: desc,
      photos: photos.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)),
      amenities: (amen?.amenities || []).map((a) => a.amenity),
      rules: rules?.propertyRules || [],
      ...(await reviewData(uid, detail.property?.name ?? detail.name ?? uid)),
    });
  }
  return properties;
}

// Reviews (score and source only) and the home's listing links on Airbnb/Vrbo/Booking.com.
// Optional extras: if Hostfully fails here the build still succeeds and that home simply shows no rating/links.
async function reviewData(uid, name) {
  const out = { reviews: null, channelLinks: [] };
  try {
    const all = await allPages('/reviews', 'reviews', { propertyUid: uid });
    out.reviews = all.map((r) => ({ source: r.source, rating: r.rating })); // text deliberately dropped
    const stats = await get('/reviews/statistics', { propertyUid: uid }).catch(() => null);
    if (stats?.statistics) console.log(`  ${name}: ${all.length} reviews from Hostfully (Hostfully's own statistics: ${stats.statistics.totalReviewsCount} reviews, average ${stats.statistics.averageRating})`);
  } catch (e) {
    console.warn(`Warning: couldn't load reviews for ${name}, its rating is left off: ${e.message}`);
  }
  try {
    const links = await get('/property-channel-links', { propertyUid: uid });
    out.channelLinks = (links?.propertyChannelLinks || []).map((l) => ({ channel: l.channel, url: l.url }));
  } catch (e) {
    console.warn(`Warning: couldn't load listing links for ${name}: ${e.message}`);
  }
  return out;
}
