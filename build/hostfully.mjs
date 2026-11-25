// Read-only Hostfully client used at build time. Same API and header as the koehn-ops hostfully-sync function.
// Only GET requests; nothing in Hostfully changes.
const API = 'https://api.hostfully.com/api/v3.3';

async function get(path, params = {}) {
  const key = process.env.HOSTFULLY_API_KEY;
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(u, { headers: { 'X-HOSTFULLY-APIKEY': key, Accept: 'application/json' } });
    if (r.status === 429 || r.status >= 500) {
      // Honor Retry-After (seconds) when Hostfully sends it, otherwise back off 3s, 6s, 9s.
      const ra = Number(r.headers.get('retry-after'));
      await new Promise((res) => setTimeout(res, ra > 0 ? Math.min(ra, 60) * 1000 : 3000 * (attempt + 1)));
      continue;
    }
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
    });
  }
  return properties;
}

// Guest reviews for one home (GET /reviews, cursor pages of 100). Keeps only source and rating: review text is never
// kept or shown (see docs/ratings.md). Throws on API errors; the build catches that and hides the rating.
export async function fetchReviews(uid) {
  const reviews = await allPages('/reviews', 'reviews', { propertyUid: uid });
  return reviews.map((r) => ({ source: r.source, rating: r.rating }));
}
