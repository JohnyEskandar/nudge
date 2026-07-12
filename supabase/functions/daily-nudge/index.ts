// daily-nudge — runs once a day (pg_cron), finds every user's overdue friends, and
// sends a real Web Push message to each of their subscribed devices.
//
// This talks the Web Push protocol directly to the browser's push service
// (Apple/Google/Mozilla), so the message is delivered by the OS and arrives with the
// tab closed and the phone locked. Nothing here depends on the app being open.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Deliberately NOT the platform-injected SUPABASE_SERVICE_ROLE_KEY. On this project
// the runtime injects that as an `sb_secret_...` key which the API gateway and
// PostgREST both reject with "Invalid API key" — so both the caller check below and
// this admin client would fail. NUDGE_SERVICE_ROLE_KEY holds the legacy service_role
// JWT, which is the form the API actually accepts and the form pg_net sends from Vault.
const SERVICE_ROLE_KEY = Deno.env.get('NUDGE_SERVICE_ROLE_KEY')!
const VAPID_KEYS = Deno.env.get('VAPID_KEYS')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:nudge@example.com'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const appServer = await webpush.ApplicationServer.new({
  contactInformation: VAPID_SUBJECT,
  vapidKeys: await webpush.importVapidKeys(JSON.parse(VAPID_KEYS), {
    extractable: false,
  }),
})

/** "Maya", "Maya and Tom", "Maya, Tom and 2 others" */
function nameList(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${
    names.length - 2 === 1 ? '' : 's'
  }`
}

function composeMessage(friends: { name: string; days_overdue: number }[]) {
  // Most overdue first, so the name we lead with is the one that matters most.
  const sorted = [...friends].sort((a, b) => b.days_overdue - a.days_overdue)
  const names = sorted.map((f) => f.name)

  if (sorted.length === 1) {
    const f = sorted[0]
    const body =
      f.days_overdue === 0
        ? `Today's a good day to reach out to ${f.name}.`
        : `It's been ${f.days_overdue} day${
            f.days_overdue === 1 ? '' : 's'
          } past when you meant to catch up.`
    return { title: `Reach out to ${f.name}`, body, url: '/' }
  }

  return {
    title: `${sorted.length} people to catch up with`,
    body: `${nameList(names)} are overdue for a catch-up.`,
    url: '/',
  }
}

Deno.serve(async (req) => {
  // Only the cron job (which holds the service role key) may invoke this.
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Service role bypasses RLS, so this sees every user's overdue friends at once.
  // days_overdue >= 0 means due today or already past due.
  const { data: overdue, error } = await admin
    .from('friend_overview')
    .select('user_id, name, days_overdue')
    .gte('days_overdue', 0)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const byUser = new Map<string, { name: string; days_overdue: number }[]>()
  for (const row of overdue ?? []) {
    const list = byUser.get(row.user_id) ?? []
    list.push({ name: row.name, days_overdue: row.days_overdue })
    byUser.set(row.user_id, list)
  }

  if (byUser.size === 0) {
    return new Response(
      JSON.stringify({ ok: true, users_notified: 0, sent: 0, message: 'nobody overdue' }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('id, user_id, subscription')
    .in('user_id', [...byUser.keys()])

  if (subErr) {
    return new Response(JSON.stringify({ error: subErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let sent = 0
  let pruned = 0
  const failures: string[] = []
  const notifiedUsers = new Set<string>()

  for (const row of subs ?? []) {
    const friends = byUser.get(row.user_id)
    if (!friends?.length) continue

    const payload = composeMessage(friends)

    try {
      const subscriber = appServer.subscribe(row.subscription as webpush.PushSubscription)
      await subscriber.pushTextMessage(JSON.stringify(payload), {})
      sent++
      notifiedUsers.add(row.user_id)
    } catch (err) {
      // 410 Gone (or 404) means the browser threw this subscription away — the user
      // uninstalled or cleared data. Drop it so we stop trying forever.
      if (err instanceof webpush.PushMessageError && err.isGone()) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
        pruned++
      } else {
        failures.push(String(err))
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      users_overdue: byUser.size,
      users_notified: notifiedUsers.size,
      sent,
      pruned,
      failures,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
