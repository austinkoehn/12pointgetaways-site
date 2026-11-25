# Combined guest rating

Each home's page shows one rating built from all of its guest reviews on Airbnb, Vrbo and Booking.com, for example:

> ★ 4.99 · 120 reviews from guests on Airbnb, Vrbo and Booking.com
> See reviews on Airbnb · Vrbo · Booking.com

The same "★ 4.99 · 120 reviews" line is in the home's booking box and on its card (main page, "More homes nearby",
stay-type and guide pages). Cards have no links because the whole card is already a link.
The links open the home's listing on that site in a new tab (`rel="nofollow noopener"`).

Code: `lib/ratings.mjs` (math and links), `fetchReviews()` in `build/hostfully.mjs` (data), `addRatings()`,
`ratingBlock()` and `ratingCardLine()` in `build/build.mjs` (page output), `.rating`/`.prating` in `static/styles.css`.
Tests: `test/ratings.test.mjs` (`npm test`).

## What we do not show

- **No review text** from Airbnb, Vrbo or Booking.com. Their terms don't allow republishing guests' reviews (Hostfully
  notes Airbnb reviews it imports "cannot be shared publicly"). `fetchReviews()` throws the text away as soon as it
  arrives and keeps only `source` and `rating`; the build never sees anything else.
- **No schema.org `aggregateRating`** in the VacationRental JSON-LD. Google's review snippet guidelines say ratings must
  be collected by the site itself and not pulled in from other sites, so marking up these aggregated third-party
  numbers risks a structured-data manual action. The rating is plain visible text only.
- No browser-side API calls. Everything is computed at build time and written into the static HTML.

## Data source

At build time, with `HOSTFULLY_API_KEY` set (Netlify), for each home:

`GET https://api.hostfully.com/api/v3.3/reviews?propertyUid=<uid>&_limit=100` and the next pages via `_cursor` /
`_paging._nextCursor` (up to 50 pages). GET only, one home at a time; 429/5xx retries honor `Retry-After`
(capped at 60 s) or back off 3, 6, 9 s. We don't pass `source`: the API's `source` filter doesn't list Airbnb, so we
read all reviews and keep the three channels ourselves.

Response shape (Hostfully OpenAPI, `ReviewApi3Dto`): `reviews[]` with `source` (string), `rating` (integer),
`content`, `author`, `date`, `ratingCategories[]`, ...; `_paging._nextCursor`.

`GET /reviews/statistics` (one `averageRating` and `totalReviewsCount` per home) is not used: it mixes every
source and its scale isn't documented, so we compute from the individual reviews to keep the math exact.

## The math

1. Keep reviews whose source is Airbnb (`AIRBNB`), Vrbo (`VRBO`, also `HOMEAWAY`) or Booking.com (`BOOKING_DOT_COM`).
   Direct (`HOSTFULLY`), Facebook, Tripadvisor and Revyoos reviews are not counted (list: `RATING_SOURCES`).
2. Skip reviews with no rating (null, empty, 0, not a number). They are not counted at all, not counted as 0.
3. Put every rating on a 5-point scale:
   - Booking.com scores out of 10. Hostfully's API says `rating` is an integer but not which scale Booking.com
     reviews arrive on. So the build looks at **every home's** Booking.com ratings together (`bookingTenPoint()`):
     if any is above 5, all Booking.com ratings are treated as out of 10 and halved (10 → 5.0, 9 → 4.5). If none is
     above 5, they're taken as already out of 5 (so they are never halved twice) and the build logs a warning. The log
     line `Booking.com ratings read as out of 10` (or 5) shows which one each build used. Deciding across all homes
     means a home whose few Booking.com reviews happen to be 5/10 or lower is still read correctly. (Remaining edge
     case: if every Booking.com review we have is 5/10 or lower, they'd be read as out of 5. Very unlikely.)
   - Airbnb and Vrbo score out of 5. A rating above 5 there can only be a 10-point score, so that one review is halved
     (warning logged).
   - Anything above 10 is invalid and skipped (warning logged).
4. Average = sum of the normalized ratings / number of rated reviews. Each review counts once, so a platform with more
   reviews weighs more (weighted by review count).
5. Shown with 2 decimals, **rounded down** (4.996 shows 4.99, never 5.00), so we never show more than guests gave.

Example: 100 Airbnb 5s, 10 Vrbo 5s, 8 Booking.com 10s and 2 Booking.com 9s = (110×5 + 8×5 + 2×4.5) / 120 = 4.9917 →
"★ 4.99 · 120 reviews".

Note: these numbers won't exactly match what each site shows. Airbnb rounds its own average and may hide old or
removed reviews; Booking.com drops reviews after 36 months. Ours covers every rated review Hostfully has imported.

## Fallback

- If the reviews call fails for a home (error, 403, timeout), the build logs `Warning: <home>: reviews not loaded,
  rating hidden` and carries on. That home simply has no rating line. The build never fails because of reviews.
- A home with no rated reviews shows no rating (log: `Rating <home>: none, hidden`).
- Every build logs each home's result, e.g. `Rating Stratford: 4.97 from 38 ({"AIRBNB":31,...})`.

### Builds without the Hostfully key

Without `HOSTFULLY_API_KEY` there are no real reviews, so by default **no ratings are shown at all** (log: `No real
review data ... ratings left off`). That way made-up numbers can't reach the live site by accident, for example from a
local build deployed by hand or a missing key.

`data/fixture.json` has **fake sample ratings** (`reviews` arrays: source and score only) for seeing the design. They
are used only when you ask for them on purpose: `SHOW_SAMPLE_RATINGS=1 node build/build.mjs`. Those pages show a red
"sample data" tag next to every rating and the log says `[SAMPLE DATA]`. Even with that set, a production deploy
(`CONTEXT=production`) never uses them (`sampleRatingsAllowed()` in `lib/ratings.mjs`).

## Listing links

- **Airbnb**: automatic. Hostfully's property details include `airbnbData.airbnbId` (when `airbnbData.active` isn't
  false); the link is `https://www.airbnb.com/rooms/<airbnbId>`.
- **Vrbo and Booking.com**: Hostfully's property data has no listing id or URL for these (`vrboData` and
  `bookingDotComData` hold only settings), so they come from `listingLinks` in `site.config.mjs`, keyed by the home's
  slug. To add one: open the listing on vrbo.com / booking.com, copy the full https URL from the address bar (drop
  any `?` tracking part) and paste it in, e.g.

  ```js
  'stratford-4br-hot-tub-pool-table': { airbnb: '', vrbo: 'https://www.vrbo.com/1234567', bookingCom: 'https://www.booking.com/hotel/us/example.html' },
  ```

  A value here always wins over Hostfully (use it to fix a wrong Airbnb link). Blank = no link. Links that aren't
  https on the right site (airbnb.*, vrbo.com, booking.com) are dropped with a build warning.

## Off switch and rollback

- **Off switch:** set `RATINGS_ENABLED=false` in Netlify's environment variables and trigger a deploy. Every rating and
  listing-link line disappears and no review calls are made. Delete the variable (or set it to `true`) to bring them back.
- **Quick rollback:** in Netlify, publish the previous production deploy.
- **Full rollback:** revert the PR's merge commit on `main`. Nothing in Hostfully or Netlify settings changes either way;
  the feature only reads data.
- To hide just one home's link, blank it in `listingLinks`. There's no per-home switch for the rating.
