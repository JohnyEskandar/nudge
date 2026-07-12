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

## Push is verified

`npm run verify:push` **passes against the live site**. It redeemed a real magic link,
subscribed to a real FCM endpoint, **closed the page**, invoked `daily-nudge`
(`sent: 1`), and then read back the notification the service worker had displayed with
no app running:

```
4 people to catch up with
Priya Raman, Maya Okonkwo and 2 others are overdue for a catch-up.
```

The test subscription has been deleted, so `push_subscriptions` is empty again and your
phone will be the only subscriber.

## Two bugs the real run caught

1. **Magic links went to `localhost:3000`.** `Login.jsx` passes
   `emailRedirectTo: window.location.origin`, but Supabase silently ignores a redirect
   that is not on the allow-list and falls back to the Site URL — which was still the
   default `http://localhost:3000`. Login was therefore broken on the deployed site.
   Fixed: Site URL is now `https://nudge-blush.vercel.app` and the allow-list covers it
   plus `localhost:5173` for dev. (An off-list redirect still falls back rather than
   being honoured, so this is not an open redirect.)
2. **`verify:push` could never have passed as written.** It used
   `browser.newContext()`, which is incognito-like, and Chrome disables the Push API in
   incognito — `subscribe()` fails with "Registration failed - permission denied"
   regardless of granted permissions. It now uses `launchPersistentContext`.

## Verified on a real iPhone

Done, on 2026-07-11. The app was installed to the home screen, notifications turned on
(a genuine `web.push.apple.com` subscription appeared in `push_subscriptions`), the app
was **force-quit**, and `select public.trigger_daily_nudge();` returned
`{"ok":true,"users_overdue":1,"users_notified":1,"sent":1,"failures":[]}`. The
notification arrived on the lock screen. Vault → `pg_net` → edge function → APNs →
service worker, with no app running, on the real device.

## Open: sign-in is not ready for other people

Magic-link sign-in **cannot work in an installed iOS app** and this is not fixable by
tweaking it. Mail opens the link in Safari, which is a separate storage context from the
home-screen app, so the PKCE verifier (and the resulting session) land in the wrong
place. The login screen therefore has a "paste your sign-in link" path, which redeems
the token with `verifyOtp` *inside* the app. That works, but it is a workaround and no
friend should be asked to do it.

Compounding it, the free tier's built-in mailer allows only a couple of emails an hour
and forbids email-template editing, so the clean fix (a 6-digit code typed into the app)
needs a real SMTP provider first.

Options discussed, none implemented yet:

- **6-digit code by email** (needs Brevo/SendGrid single-sender SMTP; no domain
  required). Passwordless and immune to the iOS trap, since nothing leaves the app.
- **Google OAuth.** One tap, but OAuth redirects inside an iOS standalone PWA are
  historically flaky — same class of bug as the one above; would need testing.
- **Email + password, confirmations off.** Nothing is ever emailed. Simplest and
  certain, but abandons the passwordless design.
- **Anonymous accounts.** Zero friction, but the account is bound to one browser: no
  second device, and clearing site data destroys the friend list.

Note `mailer_autoconfirm` is still `false` and signups still send email, so the
password option is not half-applied — the project config is untouched on this front.

<details>
<summary>Original phone-test steps (kept for reference)</summary>

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

</details>

## Things worth knowing before changing anything

- **iOS has no Push API in a Safari tab.** `src/components/PushOptIn.jsx` detects the
  missing `window.PushManager` and shows install instructions *instead of* a subscribe
  button that could not work. Don't "simplify" it into a plain permission prompt.
- **New friends are measured from `created_at`**, not treated as infinitely overdue, so
  adding someone doesn't fire a notification immediately.
- Dead subscriptions are pruned on HTTP 410 (`PushMessageError.isGone()`).
