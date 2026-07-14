// End-to-end proof that push is real.
//
// Drives a real Chromium against the running app:
//   1. signs in (real GoTrue session)
//   2. subscribes to push -> a REAL endpoint at the browser's push service (FCM)
//   3. CLOSES THE PAGE  <-- the app is no longer running
//   4. invokes the daily-nudge edge function, which signs a VAPID message and
//      POSTs it to that push service
//   5. the push service wakes the service worker, which calls showNotification()
//   6. reopens a page and reads registration.getNotifications() to see it landed
//
// Step 3 is the point of the whole thing: the notification is delivered with no
// page open. Nothing here is a toast or a setTimeout.
//
// Usage: SUPABASE_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... APP_URL=... EMAIL=...
//        node scripts/verify-push.mjs

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, APP_URL, EMAIL, VAPID_PUBLIC_KEY } =
  process.env
for (const [k, v] of Object.entries({
  SUPABASE_URL,
  ANON_KEY,
  SERVICE_ROLE_KEY,
  APP_URL,
  EMAIL,
  VAPID_PUBLIC_KEY,
})) {
  if (!v) {
    console.error(`Missing ${k}`)
    process.exit(1)
  }
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: userRow, error: uErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (uErr) throw uErr
const user = userRow.users.find((u) => u.email === EMAIL)
if (!user) throw new Error(`No user ${EMAIL}. Run scripts/seed.mjs first.`)

/**
 * A genuine session, redeemed from a genuine one-time token — but handed to the browser
 * through storage rather than by navigating the link.
 *
 * This script used to open the link itself, and that quietly stopped working: the app runs
 * `flowType: 'pkce'`, and auth-js *rejects* a link that comes back as an implicit
 * `#access_token=…` hash ("Not a valid PKCE flow url"). Links minted by generateLink carry
 * no code challenge, so GoTrue always returns that shape, and the browser just sat on the
 * login screen. Real sign-ins never hit this — Google and an emailed link opened in the
 * same browser both come back as `?code=`, and the paste-a-link box calls verifyOtp
 * directly — but a test cannot borrow that door. Auth is not what this script is proving;
 * push is.
 */
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: EMAIL,
})
if (linkErr) throw linkErr

const { data: redeemed, error: otpErr } = await anon.auth.verifyOtp({
  type: 'magiclink',
  token_hash: link.properties.hashed_token,
})
if (otpErr) throw otpErr

const origin = new URL(APP_URL).origin
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]

// Three constraints, all real:
//   - headless Chromium does not talk to the push service, so this must be headed.
//   - `channel: 'chrome'` drives the Chrome already installed on the machine, which
//     avoids Playwright's ~150MB browser download entirely.
//   - it must be a PERSISTENT profile. A normal browser.newContext() is incognito-like,
//     and Chrome disables the Push API outright in incognito: pushManager.subscribe()
//     fails with "Registration failed - permission denied" no matter what permissions
//     are granted. Only a persistent profile can hold a real push registration.
const userDataDir = await mkdtemp(join(tmpdir(), 'nudge-push-'))
const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--no-first-run', '--disable-features=Translate'],
})
await ctx.grantPermissions(['notifications'], { origin })

// Exactly where auth-js looks, in exactly the shape it writes: plain JSON, no wrapper.
await ctx.addInitScript(
  ([key, value]) => window.localStorage.setItem(key, value),
  [`sb-${projectRef}-auth-token`, JSON.stringify(redeemed.session)],
)

const page = await ctx.newPage()
page.on('console', (m) => {
  const t = m.text()
  if (/error|fail/i.test(t)) console.log(`   [browser] ${t}`)
})

await page.goto(APP_URL)
await page.waitForSelector('h1:has-text("Today")', { timeout: 30000 })
console.log('✓ signed in — Today rendered')

await page.waitForFunction(() => navigator.serviceWorker.controller !== null, {
  timeout: 20000,
})
console.log('✓ service worker active')

// Real subscribe: this call goes out to the push service and returns its endpoint.
const sub = await page.evaluate(async (key) => {
  const reg = await navigator.serviceWorker.ready
  function b64(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4)
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
  }
  const s = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64(key),
  })
  return s.toJSON()
}, VAPID_PUBLIC_KEY)

console.log(`✓ real push subscription: ${sub.endpoint.slice(0, 60)}…`)

// Persist it exactly as the app does.
const { error: upErr } = await admin
  .from('push_subscriptions')
  .upsert({ user_id: user.id, subscription: sub }, { onConflict: 'user_id,endpoint' })
if (upErr) throw upErr
console.log('✓ subscription saved to push_subscriptions')

// ---- close the app completely --------------------------------------------
await page.close()
console.log('\n✓ PAGE CLOSED — no app running. Triggering the scheduled function…\n')

// Scoped to this test user. The cron posts {} and still nudges everybody; naming a user
// here means running this script cannot send a real notification to a real person's phone,
// which it did every single time before.
const res = await fetch(`${SUPABASE_URL}/functions/v1/daily-nudge`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ user_id: user.id }),
})
const body = await res.json()
console.log(`daily-nudge -> ${res.status} ${JSON.stringify(body)}\n`)

if (!res.ok || body.sent < 1) {
  console.error('FAIL: function did not report sending a push')
  await ctx.close()
  process.exit(1)
}

// ---- did the service worker actually show a notification? ------------------
// Reopen a page only to *read* the notifications the SW created while nothing
// was open. The SW ran on its own; this is just how we observe the result.
const probe = await ctx.newPage()
await probe.goto(APP_URL)

const shown = await probe.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready
  for (let i = 0; i < 30; i++) {
    const ns = await reg.getNotifications({ tag: 'nudge-daily' })
    if (ns.length) return ns.map((n) => ({ title: n.title, body: n.body }))
    await new Promise((r) => setTimeout(r, 1000))
  }
  return []
})

await ctx.close()

// The browser profile was a temp dir that no longer exists, so this subscription is now a
// dead endpoint. Leave it behind and the nightly cron keeps pushing at it until the push
// service finally answers 410 — noise in the failure counts of every run after this one.
await admin.from('push_subscriptions').delete().eq('user_id', user.id)

if (!shown.length) {
  console.error('FAIL: no notification was displayed by the service worker')
  process.exit(1)
}

console.log('✓ REAL NOTIFICATION DELIVERED while the app was closed:\n')
for (const n of shown) {
  console.log(`   ┌─────────────────────────────────────`)
  console.log(`   │ ${n.title}`)
  console.log(`   │ ${n.body}`)
  console.log(`   └─────────────────────────────────────`)
}
console.log('\nPASS')
