# 12pointgetaways.com

Direct booking site for 12 Point Getaways. Static pages built from Hostfully listing data; checkout happens in Hostfully (Stripe, SafeGuest, rental agreement).

## Booking flow

- Each home page embeds the **Hostfully Booking Widget** (Hostfully's public script from `platform.hostfully.com`, set up in `bookingWidget()` in `build/build.mjs`). We use it only for dates, guests and the live total (rent, fees, taxes). The widget's own name/email fields and submit button are hidden.
- **Book now** is our own button. It opens the home's page on `book.12pointgetaways.com` with `arrival`, `departure` and `guests` filled in (Hostfully's documented URL params). The guest enters name and email once there, then goes on to checkout (services/upsells such as a pet fee, rental agreement, Stripe). Hostfully's widget submit (`platform.hostfully.com/book.jsp`) lands on that same page anyway, so we skip it and don't ask for name and email twice.
- The widget form is never submitted, even with the Enter key. No API key goes to the browser.
- **Never blocks the page.** The plain "Check dates and book" link (to the home's page on `book.12pointgetaways.com`) is in the HTML from the start. Hostfully's two scripts load async in the background, and the link is swapped for the widget only once the widget has actually rendered its form. If the scripts fail or hang, or the widget's data calls fail, the link stays after 8 seconds (`WIDGET_TIMEOUT_MS`). The footer and sticky bar never wait on Hostfully.
- **Minimum stay:** Book now reads the widget's min-stay value for the chosen dates and shows "Minimum stay is N nights…" instead of sending a too-short stay to the booking page.
- Only one widget per page (Hostfully limit). Widget styling overrides are in `static/styles.css` under "Hostfully booking widget".
- Rollback: revert the PR's **merge commit** on `main` (`git revert -m 1 <merge sha>` in a PR), or in Netlify publish the previous production deploy. Book buttons then go back to plain links to `book.12pointgetaways.com`. There's no feature flag; rollback is the off switch.
- The header logo is `static/logo-12pg-horizontal.png` (547×120, tightly cropped, transparent, made for light backgrounds). After merge it's also served at https://12pointgetaways.com/logo-12pg-horizontal.png for the Hostfully booking-site header.

- `site.config.mjs` — the six homes, their intros and SEO titles, local guides, amenity labels. Edit this for content changes.
- `build/build.mjs` — builds `dist/`. With `HOSTFULLY_API_KEY` set it pulls live data from Hostfully (read-only); without it, it uses `data/fixture.json`.
- `static/styles.css` — the look.
- `lib/ratings.mjs` — each home's combined guest rating ("★ 4.99 · 120 reviews") from its Airbnb, Vrbo and Booking.com reviews in Hostfully, on a 5-point scale, plus links to those listings. Numbers and links only, never review text. Math, fallback and how to fill the Vrbo/Booking.com links (`listingLinks` in `site.config.mjs`): [docs/ratings.md](docs/ratings.md).
- `netlify/functions/signup.mjs` + `lib/signup-consent.mjs` — the footer "Get direct-booking deals" signup. Saves to our own guest list in Supabase (`public.guest_signups`, migration in `supabase/migrations/`), parked as `new`, and sends nothing. Off switch: `SIGNUP_ENABLED=false` or no `SIGNUP_DATABASE_URL`. Full details, env vars and rollback: [docs/signup.md](docs/signup.md).

Build locally: `node build/build.mjs`, then open `dist/index.html` through any static server. Tests: `npm test` (see docs/signup.md and docs/ratings.md).

Netlify: build command `node build/build.mjs`, publish `dist`, functions in `netlify/functions`, env vars `HOSTFULLY_API_KEY`, `SIGNUP_DATABASE_URL`, `SIGNUP_ENABLED` (never commit them). A nightly build hook keeps listings fresh.

Guides only go live when their `status` is `published` and every fact in them has been checked.
