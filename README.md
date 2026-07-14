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
npm run seed             # 5 friends across all categories, asserts the overdue sort
npm run verify:push      # drives a real browser, closes it, then triggers the function
npm run verify:feedback  # walks Today → Settings → Send feedback, then audits the RLS
```

`verify:push` subscribes to the real push service, **closes the page**, invokes
`daily-nudge`, and then reads back `registration.getNotifications()` — so it only
passes if a real notification was delivered to a service worker with no app running.

It invokes `daily-nudge` with `{ "user_id": … }`, which scopes the fan-out to the test
user. Without that, running the test sent a real notification to **every real person using
the app** — the cron still nudges everybody, because it posts `{}`.

Two things it needs, both learned the hard way:

- It must run **headed**. Headless Chromium will not talk to the push service.
- It must use a **persistent profile**. Chrome disables the Push API in incognito, and
  a plain `browser.newContext()` is incognito-like — `pushManager.subscribe()` fails
  with `Registration failed - permission denied` however many permissions you grant.
  The script uses `launchPersistentContext` for this reason.

### Signing a test browser in

**Navigating to an admin-generated magic link does not sign the app in.** The client runs
`flowType: 'pkce'`, and auth-js *rejects* a link that comes back as an implicit
`#access_token=…` hash — "Not a valid PKCE flow url" — leaving you on the login screen
with no error shown. Links minted by `auth.admin.generateLink()` carry no code challenge,
so GoTrue always returns that shape.

Real sign-ins are unaffected: Google and an emailed link opened in the same browser both
come back as `?code=`, and the paste-a-link box calls `verifyOtp` directly. But a test has
to redeem the token itself and hand the browser the session:

```js
const { data } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
await page.addInitScript(([k, v]) => localStorage.setItem(k, v),
  [`sb-${projectRef}-auth-token`, JSON.stringify(data.session)])
```

That key and that shape — plain JSON, no wrapper — are what auth-js reads on boot. See
`scripts/verify-feedback.mjs`.

## Feedback

`feedback` is the app's return path: a note, a kind (`problem` / `idea` / `other`), and a
`context` blob captured automatically. The context is the point — "it never notified me"
is three different bugs depending on whether the app is installed to the home screen, and
`timezone` is there because every due date is currently computed in UTC.

RLS lets you insert and read *your own* notes and nothing else, so read them with the
service role:

```sql
select created_at, kind, message,
       context->>'installed'   as installed,
       context->>'timezone'    as tz,
       context->>'user_agent'  as ua
from public.feedback
order by created_at desc;
```

It cascades off `auth.users`, so deleting an account takes the person's feedback with it.
That is deliberate: the alternative is telling someone they were forgotten while keeping
something they wrote.

## Auth

**Google sign-in is the main path**, and on an installed iOS app it is the only one that
works cleanly. A magic link cannot sign in a home-screen web app: Mail opens the link in
Safari, which has a *separate storage context* from the installed app, so the session —
and with PKCE, the `code_verifier` — lands where the app cannot see it. OAuth redirects
back into the same context, so it does not have this problem. (Verified on a real
iPhone: tapping "Continue with Google" from the home-screen app signs in and stays in
the app.)

Email sign-in is kept as a fallback, with a "paste your sign-in link" box for the iOS
case. It is a workaround, not the front door.

Setting Google up: create an OAuth client (Web) in Google Cloud — free, no billing
account needed — with the redirect URI `https://<ref>.supabase.co/auth/v1/callback` and
`supabase.co` as an authorized domain, then set `external_google_*` in the project's
auth config. Supabase links a Google identity to an existing user when the verified
email matches, so signing in with Google after having used a magic link lands on the
same account rather than creating a second one.

### Redirect allow-list

Supabase silently ignores any redirect that is not on the project's allow-list and falls
back to the **Site URL**, which defaults to `http://localhost:3000`. If sign-in links
land on localhost from the deployed site, that is why. Both the Site URL and the
allow-list must name the deployed origin.

To exercise the nightly path itself — Vault → `pg_net` → the function — without waiting
for the cron, run the trigger by hand and read the response `pg_net` recorded. **This
nudges every overdue user for real**, so it is not a dry run:

```sql
select public.trigger_daily_nudge();
select status_code, content from net._http_response order by created desc limit 1;
```

### Pruning

A push service answering 404/410 means the browser threw the subscription away, so
`daily-nudge` deletes the row — otherwise it would push at a dead endpoint forever. That
delete is the only thing standing between a person and their reminders, so the response
reports `pruned_detail: [{ host, status }]` rather than a bare count. If a real endpoint
ever starts getting pruned, that is where it will show up.
