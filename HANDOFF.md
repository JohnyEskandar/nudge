# Handoff — Nudge

Everything is **written, builds clean, and is committed**. What's left is provisioning
against the hosted Supabase project and deploying. You have the Supabase MCP; the
previous session did not, which is the only reason this isn't finished.

Supabase project ref: **`gpwbriqcbloecgqzrtsa`**
Vercel: already logged in as `johnyeskandar` (`npx vercel --prod` works).
Node: **use 22** (`nvm use 22`) — Vite 8's bundler needs `^20.19 || >=22.12`, and Node
20.16 fails with a confusing "Cannot find native binding" error.

## What's done and verified

- All four screens, the data layer, service worker, manifest, real PNG icons.
- `npm run build` and `npm run lint` are clean.
- `deno check supabase/functions/daily-nudge/index.ts` **passes** — the
  `@negrel/webpush` usage compiles, so the function will deploy.
- Local Supabase stack is running in Docker (`npx supabase stop` to kill it if you
  don't want it; it is NOT needed for the hosted path).

## What is NOT yet verified — this is the actual remaining work

Nothing has run against real Supabase data. Specifically **unverified**: the schema and
RLS actually applying, magic-link login, the overdue sort, add-friend, friend detail,
and a real push arriving.

## Remaining steps

### 1. Push the schema

Two migrations in `supabase/migrations/`:
- `20260711000001_init.sql` — tables, RLS, the cadence-seeding trigger, and the
  `friend_overview` view that computes `days_overdue`.
- `20260711000002_cron.sql` — `pg_cron` + `pg_net`, scheduling `daily-nudge` daily at
  16:00 UTC. It reads the project URL and service role key from **Vault**, so run this
  once against the project (never commit these):

```sql
select vault.create_secret('https://gpwbriqcbloecgqzrtsa.supabase.co', 'project_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

### 2. VAPID keys — the one place it's easy to go wrong

```sh
npm run vapid
```

Prints **one keypair in two forms**. They must both come from that single run:
- `VAPID_KEYS` (JWK pair) → Supabase edge function secret.
- `VITE_VAPID_PUBLIC_KEY` (base64url raw) → frontend env var.

If these don't match, `pushManager.subscribe()` still succeeds and every send then
fails with 403 — a confusing failure worth avoiding.

```sh
npx supabase secrets set VAPID_KEYS='<json>' --project-ref gpwbriqcbloecgqzrtsa
npx supabase secrets set VAPID_SUBJECT='mailto:johny4eskandar@gmail.com' --project-ref gpwbriqcbloecgqzrtsa
npx supabase functions deploy daily-nudge --project-ref gpwbriqcbloecgqzrtsa
```

### 3. Deploy to Vercel

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, then
`npx vercel --prod`. `vercel.json` already handles SPA rewrites and keeps `/sw.js`
uncached (a cached service worker is a nasty debugging trap).

### 4. QA — the three checks the user asked for

**(a) Overdue sorting.** `scripts/seed.mjs` inserts 5 friends across all four
categories with varied last-interaction dates, reads them back **through RLS as the
user** (not the service role), and asserts both the ordering and that
`days_overdue == days_since_contact - cadence_days`.

```sh
SUPABASE_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... EMAIL=johny4eskandar@gmail.com npm run seed
```

Expected order (most overdue first): Priya +110, Maya +65, Luca +5, Sam +1, Tom −30.

**(b) Real push.** `scripts/verify-push.mjs` drives a real Chromium: redeems a genuine
magic link, subscribes to the **real** push service, **closes the page**, invokes
`daily-nudge`, then reopens only to read `registration.getNotifications()`. It can only
pass if a real push reached the service worker with no app running.

Needs `npx playwright install chromium` (the user declined this twice — ask first).
Must run **headed**; headless Chromium won't talk to the push service.

**(c) Home screen install + push while closed.** Only the user can do this, on their
phone. Have them open the Vercel URL in **Safari on iOS**, Share → Add to Home Screen,
open it from the home screen, tap "Turn on reminders", force-quit the app, then trigger
`daily-nudge` and confirm the notification lands on the lock screen.

## Things worth knowing before you change anything

- **iOS has no Push API in a Safari tab at all.** `window.PushManager` is undefined
  until the app is on the home screen. `src/components/PushOptIn.jsx` detects this and
  shows install instructions *instead of* a subscribe button that could not work. Don't
  "simplify" that into a plain permission prompt.
- **New friends are measured from `created_at`, not treated as infinitely overdue.**
  Otherwise adding someone would fire a notification immediately.
- The edge function rejects any caller whose bearer token isn't the service role key,
  so `daily-nudge` can't be invoked with the anon key.
- Dead subscriptions are pruned on HTTP 410 (`PushMessageError.isGone()`).
