import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { SUPABASE_URL, SERVICE_ROLE_KEY, VITE_VAPID_PUBLIC_KEY: KEY } = process.env
const APP = 'https://nudge-blush.vercel.app'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: l } = await admin.auth.admin.listUsers({ perPage: 1000 })
const user = l.users.find((u) => u.email === 'seed@nudge.test')
await admin.from('push_subscriptions').delete().eq('user_id', user.id)

const contexts = []
for (let i = 0; i < 3; i++) {
  const dir = await mkdtemp(join(tmpdir(), `nudge-multi${i}-`))
  const ctx = await chromium.launchPersistentContext(dir, { headless: false, channel: 'chrome', args: ['--no-first-run'] })
  await ctx.grantPermissions(['notifications'], { origin: APP })
  const page = await ctx.newPage()
  await page.goto(APP)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 20000 })
  const sub = await page.evaluate(async (key) => {
    const reg = await navigator.serviceWorker.ready
    const pad = '='.repeat((4 - (key.length % 4)) % 4)
    const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'))
    const s = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from([...raw].map((c) => c.charCodeAt(0))),
    })
    return s.toJSON()
  }, KEY)
  await admin.from('push_subscriptions').upsert({ user_id: user.id, subscription: sub }, { onConflict: 'user_id,endpoint' })
  await page.close()
  contexts.push(ctx)
  console.log(`device ${i + 1} subscribed: ${new URL(sub.endpoint).host}`)
}

const res = await fetch(`${SUPABASE_URL}/functions/v1/daily-nudge`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: user.id }),
})
console.log('\n3 devices, one invocation ->', JSON.stringify(await res.json()))

for (const [i, ctx] of contexts.entries()) {
  const p = await ctx.newPage()
  await p.goto(APP)
  const shown = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    for (let n = 0; n < 20; n++) {
      const ns = await reg.getNotifications({ tag: 'nudge-daily' })
      if (ns.length) return ns.map((x) => x.title)
      await new Promise((r) => setTimeout(r, 500))
    }
    return []
  })
  console.log(`device ${i + 1} notifications:`, JSON.stringify(shown))
  await ctx.close()
}
await admin.from('push_subscriptions').delete().eq('user_id', user.id)
