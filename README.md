# 12pointgetaways.com

Direct booking site for 12 Point Getaways. Static pages built from Hostfully listing data; checkout happens in Hostfully (Stripe, SafeGuest, rental agreement).

- `site.config.mjs` — the six homes, their intros and SEO titles, local guides, amenity labels. Edit this for content changes.
- `build/build.mjs` — builds `dist/`. With `HOSTFULLY_API_KEY` set it pulls live data from Hostfully (read-only); without it, it uses `data/fixture.json`.
- `static/styles.css` — the look.

Build locally: `node build/build.mjs`, then open `dist/index.html` through any static server.

Netlify: build command `node build/build.mjs`, publish `dist`, env var `HOSTFULLY_API_KEY` (never commit it). A nightly build hook keeps listings fresh.

Guides only go live when their `status` is `published` and every fact in them has been checked.
