# 12pointgetaways.com

Direct booking site for 12 Point Getaways. Static pages built from Hostfully listing data; checkout happens in Hostfully (Stripe, SafeGuest, rental agreement).

## Booking flow

- Each home page embeds the **Hostfully Booking Widget** (Hostfully's public script from `platform.hostfully.com`, set up in `bookingWidget()` in `build/build.mjs`). We use it only for dates, guests and the live total (rent, fees, taxes). The widget's own name/email fields and submit button are hidden.
- **Book now** is our own button. It opens the home's page on `book.12pointgetaways.com` with `arrival`, `departure` and `guests` filled in (Hostfully's documented URL params). The guest enters name and email once there, then goes on to checkout (services/upsells such as a pet fee, rental agreement, Stripe). Hostfully's widget submit (`platform.hostfully.com/book.jsp`) lands on that same page anyway, so we skip it and don't ask for name and email twice.
- The widget form is never submitted, even with the Enter key. No API key goes to the browser.
- If the widget script fails to load, or JS is off, the page shows a plain "Check dates and book" link to the home's page on `book.12pointgetaways.com` instead. The small "Use our booking page" link under the widget is the same fallback.
- Only one widget per page (Hostfully limit). Widget styling overrides are in `static/styles.css` under "Hostfully booking widget".
- Rollback: in Netlify, publish the previous deploy, or revert the widget commit. Book buttons then go back to linking to `book.12pointgetaways.com`.
- The header logo is `static/logo-12pg-horizontal.png` (547×120, tightly cropped, transparent, made for light backgrounds). After merge it's also served at https://12pointgetaways.com/logo-12pg-horizontal.png for the Hostfully booking-site header.

- `site.config.mjs` — the six homes, their intros and SEO titles, local guides, amenity labels. Edit this for content changes.
- `build/build.mjs` — builds `dist/`. With `HOSTFULLY_API_KEY` set it pulls live data from Hostfully (read-only); without it, it uses `data/fixture.json`.
- `static/styles.css` — the look.

Build locally: `node build/build.mjs`, then open `dist/index.html` through any static server.

Netlify: build command `node build/build.mjs`, publish `dist`, env var `HOSTFULLY_API_KEY` (never commit it). A nightly build hook keeps listings fresh.

Guides only go live when their `status` is `published` and every fact in them has been checked.
