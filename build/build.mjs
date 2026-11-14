// Builds the static site into dist/. Run: node build/build.mjs
// With HOSTFULLY_API_KEY set (Netlify), listing data comes live from Hostfully; without it, from data/fixture.json.
import { mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, homes, guides, amenityLabels, highlightOrder, stayTypes } from '../site.config.mjs';
import { fetchProperties } from './hostfully.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const today = new Date().toISOString().slice(0, 10);

// ---------- helpers ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (path) => site.domain + path;
const hour = (h) => (h == null ? '' : `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`);
const money = (n) => '$' + Math.round(Number(n)).toLocaleString('en-US');
const jsonld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;

async function write(path, content) {
  const file = join(out, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

// ---------- data ----------
async function loadData() {
  const uids = homes.map((h) => h.uid);
  if (process.env.HOSTFULLY_API_KEY) {
    console.log('Pulling listings from Hostfully…');
    return fetchProperties(uids);
  }
  console.log('No HOSTFULLY_API_KEY: building from data/fixture.json');
  const fx = JSON.parse(await readFile(join(root, 'data/fixture.json'), 'utf8'));
  return uids.map((uid) => {
    const p = fx.properties.find((x) => x.uid === uid);
    if (!p) throw new Error(`fixture has no property ${uid}`);
    return p;
  });
}

function normalize(raw, cfg) {
  const d = raw.detail, a = d.availability || {}, desc = raw.description || {};
  const summaryLines = String(desc.summary || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const highlights = highlightOrder.filter((c) => raw.amenities.includes(c)).slice(0, 6).map((c) => amenityLabels[c]);
  const named = raw.amenities.filter((c) => amenityLabels[c]).map((c) => amenityLabels[c]);
  const petRule = (raw.rules || []).find((r) => r.rule === 'ALLOWS_PETS' && !/not set/i.test(r.description || ''));
  return {
    ...cfg,
    url: `/stays/${cfg.slug}/`,
    bedrooms: d.bedrooms, beds: d.beds, bathrooms: d.bathrooms, guests: a.maxGuests,
    sqft: d.area?.unitType === 'SQUARE_FEET' ? d.area.size : null,
    rate: d.pricing?.dailyRate, checkIn: a.checkInTimeStart, checkOut: a.checkOutTime, minStay: a.minimumStay,
    address: d.address || {}, bookUrl: d.webLink,
    photos: (raw.photos || []).filter((p) => p.largeScaleImageUrl).map((p) => ({ src: p.largeScaleImageUrl, alt: p.description || '' })),
    summaryLines: summaryLines.slice(1).filter((l) => !/^book now/i.test(l) && !/^ideal for/i.test(l)),
    space: desc.space || '', neighbourhood: desc.neighbourhood || '',
    amenityCount: raw.amenities.filter((c) => c.startsWith('HAS_') || c.startsWith('IS_')).length,
    highlights, namedAmenities: named, pets: !!petRule,
  };
}

const specs = (h) => [plural(h.bedrooms, 'bedroom'), plural(h.beds, 'bed'), plural(h.bathrooms, 'bath'), `sleeps ${h.guests}`].join(' · ');
const altFor = (h, p, i) => p.alt || `${h.name}, photo ${i + 1}`;

// ---------- layout ----------
function layout({ title, description, path, body, schema = [], image, noindex = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url(path)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url(path)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${schema.map(jsonld).join('\n')}
</head>
<body>
<header class="top"><div class="wrap top-in">
<a class="brand" href="/"><span class="mark">12</span><span>${esc(site.name)}</span></a>
<nav class="nav" aria-label="Main"><a href="/#stays">Stays</a><a href="/guides/">OKC guides</a><a href="/#faq">FAQ</a></nav>
<a class="btn btn-dark" href="/#stays">Book direct</a>
</div></header>
<main>
${body}
</main>
<footer class="foot"><div class="wrap foot-in">
<div class="signup">
<h2>Get direct-booking deals</h2>
<p>Open dates and returning-guest rates, a couple of emails a month.</p>
<form method="post" action="${esc(site.ghlFormAction || '#')}">
<label class="sr" for="email">Email address</label>
<input id="email" name="email" type="email" required placeholder="you@email.com" autocomplete="email">
<button class="btn btn-dark" type="submit">Sign up</button>
</form>
</div>
<div class="foot-links">
<div><h2>Stays</h2>${homesData.map((h) => `<a href="${h.url}">${esc(h.name)}</a>`).join('')}</div>
<div><h2>More</h2><a href="/guides/">OKC guides</a>${Object.entries(stayTypes).map(([k, v]) => `<a href="/stays/for/${k}/">${esc(v.label)}</a>`).join('')}<a href="/#faq">FAQ</a></div>
</div>
</div>
<div class="wrap small">© ${new Date().getFullYear()} ${esc(site.name)} · ${esc(site.city)}, ${esc(site.region)}${site.phone ? ' · ' + esc(site.phone) : ''}${site.email ? ' · ' + esc(site.email) : ''}</div>
</footer>
</body>
</html>`;
}

const orgSchema = () => ({
  '@context': 'https://schema.org', '@type': 'LodgingBusiness', '@id': url('/#org'), name: site.name, url: site.domain,
  address: { '@type': 'PostalAddress', addressLocality: site.city, addressRegion: site.region, addressCountry: 'US' },
  ...(site.phone && { telephone: site.phone }), ...(site.email && { email: site.email }),
  ...(site.sameAs.length || site.googleBusinessProfileUrl ? { sameAs: [...site.sameAs, site.googleBusinessProfileUrl].filter(Boolean) } : {}),
});
const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url(path) })) });
const faqSchema = (faq) => ({ '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

function card(h, eager = false) {
  const p = h.photos[0];
  return `<a class="card" href="${h.url}">
<div class="card-img">${p ? `<img src="${esc(p.src)}" alt="${esc(altFor(h, p, 0))}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : ''}<span class="pill">${esc(h.tag)}</span></div>
<div class="card-body"><span class="card-name">${esc(h.name)}</span><span class="muted">${esc(h.area)}</span><span class="muted">${esc(specs(h))}</span>${h.rate ? `<span class="price"><strong>from ${money(h.rate)}</strong> night</span>` : ''}</div>
</a>`;
}

const siteFaq = [
  { q: 'Why is it cheaper to book here than on Airbnb?', a: 'When you book direct there is no booking-site fee in the middle, so we pass the savings to you.' },
  { q: 'What is the cancellation policy?', a: site.cancellation },
  { q: 'Is checkout secure?', a: 'Yes. Payment runs through Stripe in our booking system. After booking you get a quick ID check and the rental agreement by email.' },
  { q: 'When are check-in and checkout?', a: 'Check-in is after 4 PM and checkout is by 11 AM.' },
];

// ---------- pages ----------
function homePage() {
  const totalGuests = Math.max(...homesData.map((h) => h.guests));
  const hero = homesData[0].photos[0];
  const body = `
<section class="wrap hero">
<div class="hero-media">${hero ? `<img src="${esc(hero.src)}" alt="${esc(altFor(homesData[0], hero, 0))}" fetchpriority="high">` : ''}</div>
<div class="hero-text">
<h1>Stay in Oklahoma City.<br>Book direct and pay less.</h1>
<p>${homesData.length} homes in northwest OKC, from a 1-bedroom near Baptist Hospital to a 4-bedroom with a hot tub that sleeps ${totalGuests}. Same homes as on Airbnb, lower price here.</p>
<a class="btn btn-blue btn-lg" href="#stays">See the homes</a>
</div>
</section>
<section class="wrap trust">
<span>Lower price than Airbnb</span><span>Instant booking, secure checkout</span><span>Full refund 14+ days before check-in</span><span>Local hosts in OKC</span>
</section>
<section id="stays" class="wrap block">
<h2>Our homes in Oklahoma City</h2>
<div class="grid cards">${homesData.map((h, i) => card(h, i < 2)).join('')}</div>
</section>
<section class="wrap block">
<h2>Find the right stay</h2>
<div class="grid tiles">${Object.entries(stayTypes).map(([k, v]) => `<a class="tile" href="/stays/for/${k}/"><strong>${esc(v.label)}</strong><span class="muted">${esc(v.blurb)}</span></a>`).join('')}</div>
</section>
<section class="wrap block">
<h2>Explore Oklahoma City</h2>
<div class="chips">${publishedGuides.map((g) => `<a class="chip" href="/guides/${g.slug}/">${esc(g.place)}</a>`).join('')}</div>
</section>
<section id="faq" class="wrap block">
<h2>Questions before you book</h2>
<div class="grid faq">${siteFaq.map((f) => `<div><h3>${esc(f.q)}</h3><p class="muted">${esc(f.a)}</p></div>`).join('')}</div>
</section>`;
  return layout({
    title: `${site.name} | Vacation rentals in Oklahoma City, book direct`,
    description: `Book ${homesData.length} homes in northwest Oklahoma City direct and pay less than Airbnb. Hot tubs, game rooms, sleeps up to ${totalGuests}. Near Lake Hefner, Chisholm Creek and Baptist Hospital.`,
    path: '/', body, image: hero?.src,
    schema: [orgSchema(), faqSchema(siteFaq), { '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: homesData.map((h, i) => ({ '@type': 'ListItem', position: i + 1, url: url(h.url), name: h.name })) }],
  });
}

function spaceHtml(text) {
  return text.split(/\n{2,}/).map((block) => {
    const t = block.trim();
    const head = t.match(/^☆+\s*(.+?)\s*☆+$/);
    if (head) return `<h3>${esc(head[1].charAt(0) + head[1].slice(1).toLowerCase())}</h3>`;
    return t ? `<p>${esc(t).replace(/\n/g, '<br>')}</p>` : '';
  }).join('');
}

function propertyPage(h) {
  const others = homesData.filter((x) => x.slug !== h.slug).slice(0, 3);
  const g5 = h.photos.slice(0, 5);
  const faq = [
    { q: `How many people does ${h.name} sleep?`, a: `Up to ${h.guests} guests, with ${plural(h.bedrooms, 'bedroom')} and ${plural(h.beds, 'bed')}.` },
    { q: 'What time are check-in and checkout?', a: `Check-in is after ${hour(h.checkIn)} and checkout is by ${hour(h.checkOut)}.` },
    { q: 'What is the cancellation policy?', a: site.cancellation },
  ];
  const guideLinks = h.guides.map((s) => publishedGuides.find((g) => g.slug === s)).filter(Boolean);
  const body = `
<div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/#stays">Oklahoma City stays</a> › ${esc(h.name)}</nav>
<h1 class="ptitle">${esc(h.name)}: ${esc(h.headline)}</h1>
<p class="muted">${esc(specs(h))}${h.sqft ? ` · ${h.sqft.toLocaleString('en-US')} sq ft` : ''}</p>
<div class="gallery">${g5.map((p, i) => `<img class="${i === 0 ? 'g-big' : 'g-sm'}" src="${esc(p.src)}" alt="${esc(altFor(h, p, i))}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`).join('')}
${h.photos.length > 5 ? `<a class="btn btn-light g-all" href="#photos">Show all ${h.photos.length} photos</a>` : ''}</div>
<div class="pgrid">
<div class="pmain">
<p class="lead">${esc(h.intro)}</p>
${h.highlights.length ? `<ul class="highlights">${h.highlights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${h.summaryLines.length ? `<section><h2>At a glance</h2><ul class="ticks">${h.summaryLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>` : ''}
${h.space ? `<section class="prose"><h2>Inside the home</h2>${spaceHtml(h.space)}</section>` : ''}
<section><h2>What this home offers</h2><ul class="amen">${h.namedAmenities.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
${h.amenityCount > h.namedAmenities.length ? `<p class="muted">Plus ${h.amenityCount - h.namedAmenities.length} more, from kitchen basics to toiletries.</p>` : ''}</section>
<section><h2>Location</h2><p>${esc(h.area)}, ${esc(h.address.city || site.city)}, ${esc(h.address.state || site.region)}. ${esc(h.neighbourhood)}</p>
${guideLinks.length ? `<p>${guideLinks.map((g) => `<a href="/guides/${g.slug}/">Guide: staying near ${esc(g.place)}</a>`).join(' · ')}</p>` : ''}</section>
<section><h2>Things to know</h2><div class="grid know">
<div><h3>House rules</h3><p class="muted">Check-in after ${hour(h.checkIn)}<br>Checkout by ${hour(h.checkOut)}${h.minStay > 1 ? `<br>${h.minStay}-night minimum` : ''}<br>No smoking or parties${h.pets ? '<br>Pets allowed (fee applies)' : ''}</p></div>
<div><h3>Booking</h3><p class="muted">Quick ID check and rental agreement by email after you book.<br>${esc(site.cancellation)}</p></div>
</div></section>
<section><h2>Questions about ${esc(h.name)}</h2>${faq.map((f) => `<h3>${esc(f.q)}</h3><p class="muted">${esc(f.a)}</p>`).join('')}</section>
${h.photos.length > 5 ? `<section id="photos"><h2>All photos</h2><div class="allphotos">${h.photos.map((p, i) => `<img src="${esc(p.src)}" alt="${esc(altFor(h, p, i))}" loading="lazy" decoding="async">`).join('')}</div></section>` : ''}
<section><h2>More homes nearby</h2><div class="grid cards small-cards">${others.map((o) => card(o)).join('')}</div></section>
</div>
<aside class="book" id="book">
<div class="book-top">${h.rate ? `<span class="book-price"><strong>from ${money(h.rate)}</strong> night</span>` : ''}<span class="badge">Lower than Airbnb</span></div>
<p class="muted small">Pick your dates on the next screen to see the exact total, including taxes.</p>
<a class="btn btn-blue btn-lg btn-block" href="${esc(h.bookUrl)}" rel="nofollow">Check dates and book</a>
<p class="muted small center">Secure checkout by Stripe · Instant booking</p>
</aside>
</div>
</div>
<div class="mobile-bar">${h.rate ? `<span><strong>from ${money(h.rate)}</strong> night</span>` : '<span></span>'}<a class="btn btn-blue" href="${esc(h.bookUrl)}" rel="nofollow">Book</a></div>`;
  const rental = {
    '@context': 'https://schema.org', '@type': 'VacationRental', '@id': url(h.url + '#rental'), name: h.name, url: url(h.url),
    identifier: h.uid, description: h.intro, brand: { '@id': url('/#org') },
    image: h.photos.slice(0, 8).map((p) => p.src),
    address: { '@type': 'PostalAddress', addressLocality: h.address.city || site.city, addressRegion: h.address.state || site.region, postalCode: h.address.zipCode, addressCountry: 'US' },
    ...(h.address.latitude && { latitude: h.address.latitude, longitude: h.address.longitude }),
    checkinTime: h.checkIn != null ? `${String(h.checkIn).padStart(2, '0')}:00:00` : undefined,
    checkoutTime: h.checkOut != null ? `${String(h.checkOut).padStart(2, '0')}:00:00` : undefined,
    containsPlace: { '@type': 'Accommodation', additionalType: 'EntirePlace', occupancy: { '@type': 'QuantitativeValue', value: h.guests },
      numberOfBedrooms: h.bedrooms, numberOfBathroomsTotal: Number(h.bathrooms),
      ...(h.sqft && { floorSize: { '@type': 'QuantitativeValue', value: h.sqft, unitCode: 'FTK' } }),
      amenityFeature: h.namedAmenities.map((n) => ({ '@type': 'LocationFeatureSpecification', name: n, value: true })) },
  };
  return layout({
    title: h.seoTitle.length + site.name.length + 3 <= 65 ? `${h.seoTitle} | ${site.name}` : h.seoTitle,
    description: `${h.intro.slice(0, 150).replace(/\s+\S*$/, '')}… Book direct for less than Airbnb.`,
    path: h.url, body, image: h.photos[0]?.src,
    schema: [rental, crumbs([['Home', '/'], ['Oklahoma City stays', '/#stays'], [h.name, h.url]]), faqSchema(faq)],
  });
}

function stayTypePage(key) {
  const t = stayTypes[key];
  const list = homesData.filter((h) => h.goodFor.includes(key));
  const path = `/stays/for/${key}/`;
  const body = `<div class="wrap block">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › ${esc(t.label)}</nav>
<h1 class="ptitle">${esc(t.label)}: Oklahoma City rentals</h1>
<p class="lead">${esc(t.blurb)} ${list.length === 1 ? 'This home is' : `These ${list.length} homes are`} the best fit, and booking direct costs less than Airbnb.</p>
<div class="grid cards">${list.map((h) => card(h)).join('')}</div>
</div>`;
  return { path, html: layout({ title: `${t.label} in Oklahoma City | ${site.name}`, description: `${t.blurb} Book direct with ${site.name}.`, path, body,
    schema: [crumbs([['Home', '/'], [t.label, path]])] }) };
}

function guidePage(g) {
  const list = g.homes.map((s) => homesData.find((h) => h.slug === s)).filter(Boolean);
  const path = `/guides/${g.slug}/`;
  const body = `<article class="wrap narrow block">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/guides/">OKC guides</a> › ${esc(g.place)}</nav>
<h1 class="ptitle">${esc(g.title)}</h1>
<p class="answer">${esc(g.answer)}</p>
<p class="muted small">Updated ${today} · Written by the ${esc(site.name)} team in Oklahoma City</p>
<section><h2>Homes near ${esc(g.place)}</h2><div class="grid cards small-cards">${list.map((h) => card(h)).join('')}</div></section>
${g.sections.map((s) => `<section><h2>${esc(s.h)}</h2><p>${esc(s.p)}</p></section>`).join('')}
<section><h2>${esc(g.place)} FAQ</h2>${g.faq.map((f) => `<h3>${esc(f.q)}</h3><p class="muted">${esc(f.a)}</p>`).join('')}</section>
</article>`;
  return { path, html: layout({ title: g.title.length + site.name.length + 3 <= 65 ? `${g.title} | ${site.name}` : g.title, description: g.answer.slice(0, 155), path, body, image: list[0]?.photos[0]?.src,
    schema: [crumbs([['Home', '/'], ['OKC guides', '/guides/'], [g.place, path]]), faqSchema(g.faq)] }) };
}

function guidesIndex() {
  const body = `<div class="wrap block"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › OKC guides</nav>
<h1 class="ptitle">Oklahoma City guides</h1><p class="lead">Where to stay near the places our guests go most, with the closest homes for each.</p>
<div class="grid tiles">${publishedGuides.map((g) => `<a class="tile" href="/guides/${g.slug}/"><strong>${esc(g.place)}</strong><span class="muted">${esc(g.answer.slice(0, 110))}…</span></a>`).join('')}</div></div>`;
  return layout({ title: `Oklahoma City guides | ${site.name}`, description: 'Where to stay near Lake Hefner, Chisholm Creek and more in Oklahoma City.', path: '/guides/', body });
}

function llmsTxt() {
  return `# ${site.name}

> ${site.name} rents ${homesData.length} vacation homes in northwest Oklahoma City, Oklahoma. Guests can book direct at ${site.domain} for less than on Airbnb, with instant booking and secure Stripe checkout.

## Policies
- Check-in after 4 PM, checkout by 11 AM
- Cancellation: ${site.cancellation}
- Guests complete an ID check and rental agreement after booking

## Homes
${homesData.map((h) => `- [${h.name}](${url(h.url)}): ${h.intro} ${specs(h)}.${h.rate ? ` From ${money(h.rate)} a night.` : ''}`).join('\n')}

## Local guides
${publishedGuides.map((g) => `- [${g.title}](${url('/guides/' + g.slug + '/')}): ${g.answer}`).join('\n')}
`;
}

function sitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${url(p)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
}

// ---------- run ----------
let homesData = [];
const publishedGuides = guides.filter((g) => g.status === 'published');

const raw = await loadData();
homesData = raw.map((r, i) => normalize(r, homes[i]));
for (const h of homesData) if (!h.photos.length) console.warn(`Warning: ${h.name} has no photos`);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'static'), out, { recursive: true });

const paths = ['/'];
await write('index.html', homePage());
for (const h of homesData) { await write(join(h.url, 'index.html'), propertyPage(h)); paths.push(h.url); }
for (const key of Object.keys(stayTypes)) { const p = stayTypePage(key); await write(join(p.path, 'index.html'), p.html); paths.push(p.path); }
await write('guides/index.html', guidesIndex()); paths.push('/guides/');
for (const g of publishedGuides) { const p = guidePage(g); await write(join(p.path, 'index.html'), p.html); paths.push(p.path); }
await write('404.html', layout({ title: `Page not found | ${site.name}`, description: 'Page not found.', path: '/404', noindex: true,
  body: `<div class="wrap block"><h1 class="ptitle">That page isn't here</h1><p><a href="/">See all homes</a></p></div>` }));
await write('sitemap.xml', sitemap(paths));
await write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${url('/sitemap.xml')}\n`);
await write('llms.txt', llmsTxt());
console.log(`Built ${paths.length} pages into dist/`);
