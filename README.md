# 12pointgetaways.com

Direct booking site for 12 Point Getaways. Static pages built from Hostfully listing data; checkout happens in Hostfully (Stripe, SafeGuest, rental agreement).

## Booking flow

- Each home page embeds the **Hostfully Booking Widget** (Hostfully's public script from `platform.hostfully.com`, set up in `bookingWidget()` in `build/build.mjs`). Guests pick dates and guests and see the live total (rent, fees, taxes) on our page. **Book now** sends them to Hostfully's checkout on `platform.hostfully.com` (rental agreement, Stripe, ID check). The widget only needs the property UID. No API key goes to the browser.
- The widget shows **Book now** only while the home is on Instant Booking (or Booking Request) for the Hostfully/Google channel. Otherwise it shows "Get a Quote".
- If the widget script fails to load, or JS is off, the page shows a plain "Check dates and book" link to the home's page on `book.12pointgetaways.com` instead. The small "Use our booking page" link under the widget is the same fallback.
- Only one widget per page (Hostfully limit). Widget styling overrides are in `static/styles.css` under "Hostfully booking widget".
- Rollback: in Netlify, publish the previous deploy, or revert the widget commit. Book buttons then go back to linking to `book.12pointgetaways.com`.
- The header logo is `static/logo-12pg-horizontal.png` (600×160, transparent, made for light backgrounds).

- `site.config.mjs` — the six homes, their intros and SEO titles, local guides, amenity labels. Edit this for content changes.
- `build/build.mjs` — builds `dist/`. With `HOSTFULLY_API_KEY` set it pulls live data from Hostfully (read-only); without it, it uses `data/fixture.json`.
- `static/styles.css` — the look.

Build locally: `node build/build.mjs`, then open `dist/index.html` through any static server.

Netlify: build command `node build/build.mjs`, publish `dist`, env var `HOSTFULLY_API_KEY` (never commit it). A nightly build hook keeps listings fresh.

Guides only go live when their `status` is `published` and every fact in them has been checked.
