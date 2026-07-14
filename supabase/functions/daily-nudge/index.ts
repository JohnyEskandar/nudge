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

type Friend = {
  name: string
  days_overdue: number
  nudge_style: string
  birthday_in_days: number | null
}

const birthdaySoon = (f: Friend) => f.birthday_in_days !== null && f.birthday_in_days <= 3

function birthdayTitle(f: Friend): string {
  if (f.birthday_in_days === 0) return `It's ${f.name}'s birthday`
  if (f.birthday_in_days === 1) return `${f.name}'s birthday is tomorrow`
  return `${f.name}'s birthday is in ${f.birthday_in_days} days`
}

/** "Maya", "Maya and Tom", "Maya, Tom and 2 others" */
function nameList(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${
    names.length - 2 === 1 ? '' : 's'
  }`
}

/**
 * Not every relationship wants a hangout, so the nudge doesn't ask for one. The friend's
 * nudge_style decides what the notification actually suggests — a plan, a quiet message,
 * or the phone.
 */
function titleFor(friend: Friend): string {
  switch (friend.nudge_style) {
    case 'call':
      return `Give ${friend.name} a call`
    case 'check_in':
      return `Check in on ${friend.name}`
    default:
      return `Make a plan with ${friend.name}`
  }
}

function composeMessage(friends: Friend[]) {
  // A birthday is the strongest reason there is, so it takes the title over any amount
  // of overdue-ness; everyone else rides along in the body.
  const birthdays = friends
    .filter(birthdaySoon)
    .sort((a, b) => a.birthday_in_days! - b.birthday_in_days!)
  const overdue = friends
    .filter((f) => f.days_overdue >= 0 && !birthdaySoon(f))
    .sort((a, b) => b.days_overdue - a.days_overdue)

  if (birthdays.length > 0) {
    const b = birthdays[0]
    const others = [...birthdays.slice(1), ...overdue].map((f) => f.name)
    const base =
      b.birthday_in_days === 0
        ? `Today's the day — say happy birthday.`
        : `The best excuse there is to reach out.`
    const body =
      others.length > 0
        ? `${base} ${nameList(others)} ${others.length === 1 ? 'is' : 'are'} also waiting on a catch-up.`
        : base
    return { title: birthdayTitle(b), body, url: '/' }
  }

  if (overdue.length === 1) {
    const f = overdue[0]
    const body =
      f.days_overdue === 0
        ? `Today's a good day for it.`
        : `It's been ${f.days_overdue} day${
            f.days_overdue === 1 ? '' : 's'
          } past when you meant to catch up.`
    return { title: titleFor(f), body, url: '/' }
  }

  return {
    title: `${overdue.length} people to catch up with`,
    body: `${nameList(overdue.map((f) => f.name))} are overdue for a catch-up.`,
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

  // An optional audience of one. The cron posts `{}` and so nudges everyone, exactly as
  // before — but a test can now name itself and reach only its own devices. Without this,
  // running verify:push meant sending a real notification to every real person using the
  // app, which is a thing you can only do so many times before it stops being a test and
  // starts being spam.
  const body = await req.json().catch(() => ({}))
  const onlyUserId: string | undefined = body?.user_id

  // Service role bypasses RLS, so this sees every user's friends at once. Two reasons
  // put someone in a nudge: overdue (days_overdue >= 0), or a birthday within 3 days.
  let overdueQuery = admin
    .from('friend_overview')
    .select('user_id, name, days_overdue, nudge_style, birthday_in_days')
    .or('days_overdue.gte.0,birthday_in_days.lte.3')

  if (onlyUserId) overdueQuery = overdueQuery.eq('user_id', onlyUserId)

  const { data: overdue, error } = await overdueQuery

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const byUser = new Map<string, Friend[]>()
  for (const row of overdue ?? []) {
    const list = byUser.get(row.user_id) ?? []
    list.push({
      name: row.name,
      days_overdue: row.days_overdue,
      nudge_style: row.nudge_style,
      birthday_in_days: row.birthday_in_days,
    })
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
  const failures: string[] = []
  // Pruning deletes a real person's only way of being reminded, so it must never be a
  // silent number. Record what the push service actually said before dropping the row.
  const pruned: { host: string; status: number | null }[] = []
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
        const endpoint = (row.subscription as { endpoint: string }).endpoint
        pruned.push({
          host: new URL(endpoint).host,
          status: (err as unknown as { response?: Response }).response?.status ?? null,
        })
        await admin.from('push_subscriptions').delete().eq('id', row.id)
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
      pruned: pruned.length,
      pruned_detail: pruned,
      failures,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
