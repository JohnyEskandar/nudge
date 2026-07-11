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

// A genuine magic link. We navigate the browser to it rather than forging a session,
// so the real Login -> redirect -> session path is what gets exercised.
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: EMAIL,
  options: { redirectTo: APP_URL },
})
if (linkErr) throw linkErr

const origin = new URL(APP_URL).origin

// Headless Chromium does not talk to the push service; we need a real browser
// process. It still runs unattended.
const browser = await chromium.launch({
  headless: false,
  args: ['--no-first-run', '--disable-features=Translate'],
})
const ctx = await browser.newContext()
await ctx.grantPermissions(['notifications'], { origin })

const page = await ctx.newPage()
page.on('console', (m) => {
  const t = m.text()
  if (/error|fail/i.test(t)) console.log(`   [browser] ${t}`)
})

// Follow the magic link exactly as a user clicking it in their inbox would.
await page.goto(link.properties.action_link)
await page.waitForSelector('text=People', { timeout: 30000 })
console.log('✓ magic link redeemed — signed in, friend list rendered')

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

const res = await fetch(`${SUPABASE_URL}/functions/v1/daily-nudge`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
})
const body = await res.json()
console.log(`daily-nudge -> ${res.status} ${JSON.stringify(body)}\n`)

if (!res.ok || body.sent < 1) {
  console.error('FAIL: function did not report sending a push')
  await browser.close()
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

await browser.close()

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
