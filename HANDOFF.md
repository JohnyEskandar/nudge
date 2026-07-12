# Status — Nudge

Provisioned and deployed against the hosted Supabase project. One manual test remains,
and it is the important one.

- Supabase project ref: `gpwbriqcbloecgqzrtsa`
- Live app: **https://nudge-blush.vercel.app**
- Node: use 22 (`nvm use 22`).

Note the other Vercel aliases (`nudge-*-johnyeskandars-projects.vercel.app`) sit behind
Vercel's SSO deployment protection and return a 302 to a login page. Use the
`nudge-blush` URL on a phone; the protected ones will not work.

## Verified against the real project

- Schema applied: four tables, RLS enabled on all of them, the cadence trigger, and the
  `friend_overview` view.
- Database linter (`get_advisors`) is **clean**. It initially flagged three warnings,
  fixed in `20260711000003_harden_functions.sql`: the trigger function was exposed as a
  public RPC endpoint (Postgres grants `EXECUTE` to `PUBLIC` by default) and
  `default_cadence_for` had a mutable `search_path`.
- Magic-link login, RLS, the trigger, and the overdue maths: `npm run seed` creates the
  user, signs in through a **real magic link**, and reads back through RLS as that user.
  Ordering came out Priya +110, Maya +65, Luca +5, Sam +1, Tom −30, and
  `days_overdue == days_since_contact − cadence_days` for every row. Both assertions pass.
- `daily-nudge` deploys, boots (so the VAPID JWK import works), returns
  `{"ok":true,"users_overdue":1,...}` for the service role, and **401s the anon key**.
- The nightly path end to end: calling `public.trigger_daily_nudge()` by hand made
  `pg_net` record an HTTP 200 from the function. Vault → `pg_net` → gateway → function →
  database all line up. Cron is scheduled and active for 16:00 UTC.

## The bug that real deployment caught

The function originally read the platform-injected `SUPABASE_SERVICE_ROLE_KEY`. On this
project that variable holds a new-style `sb_secret_...` key which the API gateway and
PostgREST **both reject** with "Invalid API key" — only the legacy `service_role` JWT is
accepted. So the deployed function could never have worked: it would have rejected the
cron's bearer token (401 nightly, silently), and its own database client would have been
refused by PostgREST anyway.

It now reads `NUDGE_SERVICE_ROLE_KEY`, which holds the legacy JWT — the same value the
cron sends from Vault, so the comparison matches. See the README for the full note.
If you ever rotate keys, keep those two in sync or the nightly run goes quiet.

## What is NOT verified

**That a push notification actually arrives.** Nothing has proven this yet. The
automated test (`npm run verify:push`) was skipped because it needs a ~150MB Chromium
download. `sent: 0` in every run so far simply means no device has subscribed yet — it
is not evidence of a problem, but it is not evidence of success either.

So the only remaining check is on a phone:

1. Open **https://nudge-blush.vercel.app** in **Safari on iOS** (not Chrome).
2. Share → **Add to Home Screen**. This step is mandatory: iOS does not expose the Push
   API to a Safari tab at all, so the opt-in button only appears once the app is
   launched from the home screen.
3. Open it from the home screen, sign in as `johny4eskandar@gmail.com` (the seeded user —
   four friends are already overdue), and tap **Turn on reminders**.
4. **Force-quit the app.**
5. Fire the send: `select public.trigger_daily_nudge();` then check
   `select status_code, content from net._http_response order by created desc limit 1;` —
   `sent` should now be `1`.
6. The notification should arrive on the lock screen with the app closed.

If `sent` is 1 but nothing appears, the subscription reached APNs and the problem is on
the device (notification permissions / focus mode). If `sent` is 0, the device never
stored a subscription — check `push_subscriptions` has a row.

## Things worth knowing before changing anything

- **iOS has no Push API in a Safari tab.** `src/components/PushOptIn.jsx` detects the
  missing `window.PushManager` and shows install instructions *instead of* a subscribe
  button that could not work. Don't "simplify" it into a plain permission prompt.
- **New friends are measured from `created_at`**, not treated as infinitely overdue, so
  adding someone doesn't fire a notification immediately.
- Dead subscriptions are pruned on HTTP 410 (`PushMessageError.isGone()`).
