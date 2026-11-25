# Footer signup: "Get direct-booking deals"

The signup box in every page footer saves guests to our own guest list in Supabase (project **koehn-ops**).
GoHighLevel is not used for guests (Austin's decision, Nov 14, 2026).

## What it does

1. A guest enters an email (required), optionally a mobile number, and ticks one or both boxes:
   - **Email consent:** "Email me deals and open dates from 12 Point Getaways, a couple of emails a month. Unsubscribe anytime."
   - **Text consent:** "Text me too. I agree to get recurring marketing texts from 12 Point Getaways about deals and open dates at the mobile number above. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of booking."

   Both boxes start unticked. At least one must be ticked. Ticking the text box needs a mobile number.
   The wording lives in one place, `lib/signup-consent.mjs`; the page shows it and the database stores the same string.
   There is no privacy page on the site yet, so the text consent doesn't link one. Add a link when a privacy page exists.
2. The form posts to `/api/signup` (`netlify/functions/signup.mjs`, a Netlify Function).
   - With JavaScript the page stays put and shows the result under the button (green for success, red for errors).
     The message area has a fixed height, so nothing moves.
   - Without JavaScript it's a normal form post and the function answers with a small "You're signed up" / "Signup not saved" page
     with a link back.
3. The function checks the request, then calls `signup_api.upsert_guest_signup(...)` in Supabase as the restricted
   `guest_signup_writer` role. That's all it does: **no texts, no emails, no campaign enrollment, no calls to Twilio, StayFi,
   GHL or anything else.** New rows land with `status = 'new'` (parked). Outreach starts only as a separate, deliberate step.

### Checks in the function

| Check | Result |
|---|---|
| Not a POST | 405, `Allow: POST` |
| More than 10 requests a minute from one IP | 429 with `Retry-After` (seconds). Counted per function instance, so it's best effort. |
| Body over 16 KB | 413 |
| `SIGNUP_ENABLED=false` or no `SIGNUP_DATABASE_URL` | 503, "Signups aren't available right now. Please try again later." |
| Hidden honeypot field `website` filled in (bots) | Looks like success, saves nothing |
| Bad email / bad phone / text box without phone / no box ticked | 400 with a plain message |
| Database error | 500, "Something went wrong on our end. Please try again later." (logged without the guest's details) |

Phones are saved in E.164 (`+14055550123`). 10-digit US numbers, with or without `1`, and `+` international numbers are accepted.

### Repeat signups (upsert on lowercased email)

- Same email in any case updates the one row; it never makes a duplicate.
- A ticked box adds that consent (or refreshes its text and time). **An unticked box never removes a consent.**
- A phone with the text box unticked is stored with no text consent.
- If the row already has text consent, a new number without a new text opt-in is not saved, so a consent never moves to a
  number it wasn't given for. Ticking the text box with a new number moves the consent to that number.
- `status` is not reset on a repeat signup (someone already past `new` stays where they are).
- `source_path` and `user_agent` show the latest signup; `created_at` stays the first.

Removing a consent (unsubscribe, STOP) is a separate, explicit step, not something this form can do.

## The table: `public.guest_signups`

Created by `supabase/migrations/20261125170000_guest_signups.sql`. Nothing existing is changed.

| Column | Notes |
|---|---|
| `id` | uuid |
| `email` | lowercased, unique |
| `phone` | E.164 or null |
| `email_consent`, `email_consent_text`, `email_consented_at` | consent flag, exact wording shown, when given |
| `sms_consent`, `sms_consent_text`, `sms_consented_at` | same for texts (needs a phone) |
| `source_path` | page the signup came from, e.g. `/stays/stratford-4br-hot-tub-pool-table/` |
| `user_agent` | browser string (max 512 chars) |
| `status` | `'new'` on insert (parked) |
| `created_at`, `updated_at` | timestamps |

Locked down:
- Row level security is on with **no policies**, and all table rights are revoked from `anon` and `authenticated`,
  so the public Supabase API keys can't read or write it.
- The upsert function is `SECURITY DEFINER` in its own schema, `signup_api`, which the Supabase REST API doesn't expose.
  Only `guest_signup_writer` can execute it.
- `guest_signup_writer` can do one thing: call that function. It can't select, insert, update or delete on the table.
  The migration creates it `NOLOGIN`, with `connection limit 5` and a 5 s statement timeout.
- The database also re-checks the email, the phone format and the consent rules, so bad data is refused even if the function is bypassed.

Why a database role and not a Supabase API key: Supabase's built-in keys are either public (`anon`) or full access
(`service_role`). A dedicated Postgres role that can only run one function is the narrowest key we can give the website, and it can
be switched off on its own without touching any other app. The service role key is **not** used.

## Env vars (Netlify only, never in the repo)

| Name | Value |
|---|---|
| `SIGNUP_DATABASE_URL` | `postgresql://guest_signup_writer.<project-ref>:<password>@<pooler-host>:6543/postgres` (Supabase > Connect > Transaction pooler, with the user swapped for `guest_signup_writer.<project-ref>`). Missing = signups off. |
| `SIGNUP_ENABLED` | `false` switches signups off. Unset or anything else = on (if the URL is set). |
| `SIGNUP_DB_CA_CERT` | Optional. Supabase's CA certificate (PEM, from Database settings > SSL). When set, the database certificate is verified. When not set, the connection is still encrypted but the certificate isn't checked. |

Set them for the **Production** context only. Deploy previews then show the polite "not available right now" message and never
write to the real guest list.

## Go live (one time)

1. Supabase (koehn-ops) > SQL editor: run `supabase/migrations/20261125170000_guest_signups.sql`.
2. Same SQL editor, give the writer role a login with a long random password (from a password manager; don't paste it in Slack or the repo):
   `alter role guest_signup_writer with login password '<long random password>';`
3. Netlify > Site configuration > Environment variables, Production context only, marked secret:
   `SIGNUP_DATABASE_URL` as above, and `SIGNUP_ENABLED=true`. Optional: `SIGNUP_DB_CA_CERT`.
4. Merge the PR. After the production deploy, sign up once with your own email and check the row in Table Editor > `guest_signups` (`status` = `new`).

## Off switch

Any one of these, fastest first:
1. Netlify: set `SIGNUP_ENABLED=false` (or delete `SIGNUP_DATABASE_URL`) and redeploy (Deploys > Trigger deploy). The form stays and shows
   "Signups aren't available right now". The rest of the page is unaffected.
2. Supabase SQL editor, takes effect on the next request:
   `revoke execute on function signup_api.upsert_guest_signup(text, text, boolean, text, boolean, text, text, text) from guest_signup_writer;`
   (Undo with `grant execute ... to guest_signup_writer;`.)
3. Kill the key: `alter role guest_signup_writer nologin;` then
   `select pg_terminate_backend(pid) from pg_stat_activity where usename = 'guest_signup_writer';`
   Rotate by setting a new password and updating `SIGNUP_DATABASE_URL`.

## Rollback

- Code: revert the PR's merge commit on `main` (`git revert -m 1 <merge sha>`, in a PR), or in Netlify publish the previous production deploy.
- Database (only if you want it gone; the table keeps whatever signups came in):
  ```sql
  drop function if exists signup_api.upsert_guest_signup(text, text, boolean, text, boolean, text, text, text);
  drop schema if exists signup_api;
  drop role if exists guest_signup_writer;
  -- Deletes the signups themselves. Export them first:
  -- drop table if exists public.guest_signups;
  ```

## Tests

`npm test` runs `test/signup.test.mjs`. Without a database it checks POST only, the 16 KB cap, the off switch, the honeypot, the rate limit,
validation, the no-JS page, phone and email normalizing, that the function calls nothing but the database, and that the built footer shows the
same consent text the function stores (run `npm run build` first).

With a throwaway **local** Postgres it also applies the migration and runs the function against it as `guest_signup_writer`:

```
SIGNUP_TEST_ADMIN_URL=postgres://postgres:<pw>@localhost:5432/postgres npm test
```

It creates and drops its own database and refuses any non-local host. It never connects to Supabase.
