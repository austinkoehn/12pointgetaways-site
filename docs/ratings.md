# Combined guest rating

Each home's page shows one rating built from all of its guest reviews on Airbnb, Vrbo and Booking.com, for example:

> ★ 4.99 · 120 reviews from guests on Airbnb, Vrbo and Booking.com
> See reviews on Airbnb · Vrbo · Booking.com

The same "★ 4.99 · 120 reviews" line is on the home's card on the main page and in "More homes nearby".
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
     reviews arrive on. So per home: if **any** Booking.com rating is above 5, all of that home's Booking.com ratings
     are treated as out of 10 and halved (10 → 5.0, 9 → 4.5). If none is above 5, they're taken as already out of 5
     and the build logs a warning. (Edge case: a home whose only Booking.com reviews are genuinely 5/10 or lower would
     be overstated; with real data that's unlikely, and the warning shows when it happens.)
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

Local and preview builds without `HOSTFULLY_API_KEY` use `data/fixture.json`, which has **fake sample ratings**
(`reviews` arrays: source and score only) so the feature can be seen. Those pages show a red "sample data" tag
next to the rating, and the log says `[SAMPLE DATA]`. On the production deploy (`CONTEXT=production`) sample
ratings are never used, so fake numbers can't go live even if the key were missing.

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

## Rollback

Revert the PR's merge commit on `main` (or publish the previous production deploy in Netlify). The rating lines and
links disappear; nothing else changes. To hide just one home's rating there's no switch; reverting is the off switch.
