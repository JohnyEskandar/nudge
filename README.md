# Nudge

A quiet place to keep track of the people you care about, and a real push
notification when it's been too long since you spoke to one of them.

React + Vite, Supabase (magic-link auth, Postgres with RLS, a scheduled edge
function), plain CSS. Installs to a phone home screen as a PWA.

## How the reminder actually works

There is no timer in the browser and no in-app toast. The chain is:

1. The browser subscribes to its push service (FCM/APNs/Mozilla) and hands back a
   `PushSubscription`. We store it in `push_subscriptions`.
2. `pg_cron` fires once a day inside Postgres and, via `pg_net`, POSTs to the
   `daily-nudge` edge function.
3. The function reads `friend_overview` with the service role, finds everyone whose
   `days_overdue >= 0`, signs a message with the VAPID private key, and POSTs it to
   each subscription's push endpoint.
4. The push service wakes the **service worker** on the device and it calls
   `showNotification()`.

Step 4 is the point: the service worker runs whether or not the app is open, so the
notification arrives with the tab closed and the phone locked.

## Data model

| table | what it holds |
| --- | --- |
| `friends` | `user_id`, name, category (friend/mentor/family/abroad), city, notes |
| `interactions` | one row per logged catch-up: `friend_id`, date, note |
| `reminder_settings` | `friend_id` → `cadence_days` |
| `push_subscriptions` | `user_id` → the browser's subscription object |

Every table has RLS scoped to `auth.uid()`. `interactions` and `reminder_settings`
have no `user_id` of their own — ownership is inherited from the friend they hang off.

`reminder_settings` is seeded by a trigger, so a friend can never exist without a
cadence. Defaults per category: friend 60, mentor 90, family 30, abroad 45.

`friend_overview` is a view (`security_invoker`) that computes

```
days_overdue = (current_date - last_contact_date) - cadence_days
```

and the friend list just sorts by it descending. A friend with no interactions yet is
measured from `created_at`, so new friends age in rather than firing a reminder the
moment you add them.

## Setup

```sh
npm install
npm run vapid          # prints VAPID_KEYS and VITE_VAPID_PUBLIC_KEY — same keypair
cp .env.example .env   # fill in Supabase URL, anon key, and the VAPID public key
```

Push the schema and deploy the function:

```sh
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase secrets set VAPID_KEYS='<the JSON from npm run vapid>'
npx supabase secrets set VAPID_SUBJECT='mailto:you@example.com'
npx supabase secrets set NUDGE_SERVICE_ROLE_KEY='<legacy service_role JWT>'
npx supabase functions deploy daily-nudge
```

### Why `NUDGE_SERVICE_ROLE_KEY` and not the built-in one

The edge runtime injects `SUPABASE_SERVICE_ROLE_KEY`, and on this project it holds a
new-style `sb_secret_...` key that the API gateway and PostgREST both reject with
"Invalid API key" — only the legacy `service_role` JWT is accepted. A function relying
on the injected variable therefore fails twice over: it rejects the cron's bearer token,
and its own database client is refused by PostgREST. So `daily-nudge` reads the key from
`NUDGE_SERVICE_ROLE_KEY` instead, which holds the legacy JWT — the same value the cron
sends from Vault, so the two match. (`SUPABASE_`-prefixed names are reserved and cannot
be set as secrets, hence the `NUDGE_` prefix.)

Get that key from `npx supabase projects api-keys --project-ref <ref>` (the one named
`service_role`, starting `eyJ...`).

The cron migration reads the project URL and service role key from Supabase Vault, so
they are never committed. Set them once:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<legacy service_role JWT>', 'service_role_key');
```

Then `npm run dev`, or deploy to Vercel (`vercel --prod`) with `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` and `VITE_VAPID_PUBLIC_KEY` set as environment variables.

## iOS

iOS only exposes the Push API to web apps that have been **added to the home screen** —
in a Safari tab `window.PushManager` does not exist at all. The app detects this and
shows Add-to-Home-Screen instructions instead of an opt-in button that could not work.
Once opened from the home screen, the button appears and push behaves normally.

## Verifying

```sh
npm run seed         # 5 friends across all categories, asserts the overdue sort
npm run verify:push  # drives a real browser, closes it, then triggers the function
```

`verify:push` subscribes to the real push service, **closes the page**, invokes
`daily-nudge`, and then reads back `registration.getNotifications()` — so it only
passes if a real notification was delivered to a service worker with no app running.
It needs `npx playwright install chromium` and must run headed; headless Chromium will
not talk to the push service.

To exercise the nightly path itself — Vault → `pg_net` → the function — without waiting
for the cron, run the trigger by hand and read the response `pg_net` recorded:

```sql
select public.trigger_daily_nudge();
select status_code, content from net._http_response order by created desc limit 1;
```
