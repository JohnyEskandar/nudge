// daily-nudge — runs once a day (pg_cron). For each user it decides whether today has a
// nudge and who it is about, records that decision, and sends one Web Push to each of the
// user's devices.
//
// Who and whether live in ../_shared/pick.ts (pure, tested, replayed over 14 days); what
// it says lives in ../_shared/copy.ts. This file only reads, writes and delivers. The order
// matters: the decision is written before anything is sent, and every send attempt, failed
// or not, gets a nudge_sends row, so the record can never be missing a push that went out.
//
// This talks the Web Push protocol directly to the browser's push service
// (Apple/Google/Mozilla), so the message is delivered by the OS and arrives with the
// tab closed and the phone locked. Nothing here depends on the app being open.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import {
  decide,
  DEFAULT_FREQUENCY,
  type Frequency,
  type FriendRow,
  type OpenEpisode,
  type PastItem,
} from '../_shared/pick.ts'
import { pushPayload } from '../_shared/copy.ts'
import { addDays, daysBetween } from '../_shared/dates.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Deliberately NOT the platform-injected SUPABASE_SERVICE_ROLE_KEY. On this project
// the runtime injects that as an `sb_secret_...` key which the API gateway and
// PostgREST both reject with "Invalid API key" — so both the caller check below and
// this admin client would fail. NUDGE_SERVICE_ROLE_KEY holds the legacy service_role
// JWT, which is the form the API actually accepts and the form pg_net sends from Vault.
const SERVICE_ROLE_KEY = Deno.env.get('NUDGE_SERVICE_ROLE_KEY')!
const VAPID_KEYS = Deno.env.get('VAPID_KEYS')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:nudge@example.com'

/** PostgREST returns at most max_rows per request (1000 by default), so read in pages. */
const PAGE = 1000
/** How far back items are read: covers the 7-day cooldown and weekly pace with room. */
const LOOKBACK_DAYS = 14

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const appServer = await webpush.ApplicationServer.new({
  contactInformation: VAPID_SUBJECT,
  vapidKeys: await webpush.importVapidKeys(JSON.parse(VAPID_KEYS), {
    extractable: false,
  }),
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
type Query = any

/** Every row a query matches, a page at a time, in a stable order. */
async function readAll<T>(build: () => Query): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data as T[]))
    if (!data || data.length < PAGE) return out
  }
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}

type SendRow = {
  item_id: string
  user_id: string
  subscription_host: string | null
  status: 'sent' | 'gone' | 'failed' | 'no_device'
  http_status: number | null
  error: string | null
}

Deno.serve(async (req) => {
  // Only the cron job (which holds the service role key) may invoke this.
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ error: 'unauthorized' }, 401)

  // An optional audience of one. The cron posts `{}` and so runs for everyone, but a test
  // can name itself and reach only its own devices.
  const body = await req.json().catch(() => ({}))
  const onlyUserId: string | undefined = body?.user_id
  const scoped = (q: Query) => (onlyUserId ? q.eq('user_id', onlyUserId) : q)

  // UTC calendar date, matching current_date in friend_overview. Per-user local dates
  // arrive with the local send hour (deploy 2).
  const today = new Date().toISOString().slice(0, 10)

  type EpisodeRow = Omit<OpenEpisode, 'friend_id'> & { user_id: string; friend_id: string | null }
  type ItemRow = Omit<PastItem, 'friend_id'> & { user_id: string; friend_id: string | null }
  let friends: (FriendRow & { user_id: string })[]
  let episodes: EpisodeRow[]
  let items: ItemRow[]
  let settings: { user_id: string; frequency: Frequency }[]
  try {
    ;[friends, episodes, items, settings] = await Promise.all([
      readAll<FriendRow & { user_id: string }>(() =>
        scoped(
          admin
            .from('friend_overview')
            .select(
              'id, user_id, name, nudge_style, days_overdue, paused, birthday_in_days, snoozed_until',
            )
            .or('days_overdue.gte.0,birthday_in_days.eq.0')
            .order('id'),
        ),
      ),
      readAll<EpisodeRow>(() =>
        scoped(
          admin
            .from('nudge_episodes')
            .select('id, user_id, friend_id, assignment, started_on, copy_variant')
            .is('closed_at', null)
            .order('id'),
        ),
      ),
      readAll<ItemRow>(() =>
        scoped(
          admin
            .from('nudge_items')
            .select('user_id, friend_id, local_date, assignment, reason')
            .gte('local_date', addDays(today, -LOOKBACK_DAYS))
            .order('id'),
        ),
      ),
      readAll<{ user_id: string; frequency: Frequency }>(() => scoped(admin.from('user_settings').select('user_id, frequency').order('user_id'))),
    ])
  } catch (err) {
    return json({ error: String(err) }, 500)
  }

  const friendsBy = groupBy(friends, (r) => r.user_id)
  const episodesBy = groupBy(episodes, (r) => r.user_id)
  const itemsBy = groupBy(items, (r) => r.user_id)
  const frequencyOf = new Map(settings.map((s) => [s.user_id, s.frequency]))
  const users = new Set([...friendsBy.keys(), ...episodesBy.keys()])

  if (users.size === 0) {
    return json({ ok: true, users_considered: 0, sent: 0, message: 'nobody due' })
  }

  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('id, user_id, subscription')
    .in('user_id', [...users])
  if (subErr) return json({ error: subErr.message }, 500)
  const subsBy = groupBy(subs ?? [], (r: { user_id: string }) => r.user_id)

  const counts = {
    users_considered: users.size,
    users_notified: 0,
    sent: 0,
    holdouts: 0,
    closed: 0,
    skipped: {} as Record<string, number>,
    send_rows: 0,
    pruned: 0,
  }
  const failures: string[] = []
  const seed = daysBetween('2026-01-01', today)

  for (const userId of users) {
    const decision = decide(
      {
        today,
        frequency: frequencyOf.get(userId) ?? DEFAULT_FREQUENCY,
        friends: friendsBy.get(userId) ?? [],
        // A friend deleted mid-episode leaves friend_id null; the picker closes it.
        openEpisodes: (episodesBy.get(userId) ?? []).map((e) => ({ ...e, friend_id: e.friend_id ?? '' })),
        recentItems: (itemsBy.get(userId) ?? []).map((i) => ({ ...i, friend_id: i.friend_id ?? '' })),
      },
      { random: Math.random, newId: () => crypto.randomUUID() },
    )

    if (decision.skipped) counts.skipped[decision.skipped] = (counts.skipped[decision.skipped] ?? 0) + 1

    try {
      for (const reason of ['not_due', 'holdout_window_end'] as const) {
        const ids = decision.close.filter((c) => c.reason === reason).map((c) => c.id)
        if (!ids.length) continue
        const { error } = await admin
          .from('nudge_episodes')
          .update({ closed_at: new Date().toISOString(), close_reason: reason })
          .in('id', ids)
        if (error) throw new Error(`close episodes: ${error.message}`)
        counts.closed += ids.length
      }
      if (decision.newEpisodes.length) {
        const { error } = await admin
          .from('nudge_episodes')
          .insert(decision.newEpisodes.map((e) => ({ ...e, user_id: userId })))
        if (error) throw new Error(`insert episodes: ${error.message}`)
      }
      if (decision.items.length) {
        const { error } = await admin
          .from('nudge_items')
          .insert(decision.items.map((i) => ({ ...i, user_id: userId })))
        if (error) throw new Error(`insert items: ${error.message}`)
      }
    } catch (err) {
      // Never push what could not be recorded: an unlogged push is the bug this fixes.
      failures.push(`${userId}: ${String(err)}`)
      continue
    }
    counts.holdouts += decision.newEpisodes.filter((e) => e.assignment === 'holdout').length

    const push = decision.push
    if (!push) continue

    const payload = pushPayload({
      friendId: push.friend.id,
      name: push.friend.name,
      style: push.friend.nudge_style,
      reason: push.reason,
      itemId: push.item_id,
      seed,
    })

    const sends: SendRow[] = []
    const devices = subsBy.get(userId) ?? []
    if (devices.length === 0) {
      sends.push({ item_id: push.item_id, user_id: userId, subscription_host: null, status: 'no_device', http_status: null, error: null })
    }

    for (const row of devices) {
      const endpoint = (row.subscription as { endpoint: string }).endpoint
      const host = (() => {
        try {
          return new URL(endpoint).host
        } catch {
          return null
        }
      })()
      try {
        const subscriber = appServer.subscribe(row.subscription as webpush.PushSubscription)
        await subscriber.pushTextMessage(JSON.stringify(payload), {})
        sends.push({ item_id: push.item_id, user_id: userId, subscription_host: host, status: 'sent', http_status: 201, error: null })
        counts.sent++
      } catch (err) {
        const status = (err as { response?: Response }).response?.status ?? null
        // 410 Gone (or 404) means the browser threw this subscription away — the user
        // uninstalled or cleared data. Drop it so we stop trying forever.
        if (err instanceof webpush.PushMessageError && err.isGone()) {
          sends.push({ item_id: push.item_id, user_id: userId, subscription_host: host, status: 'gone', http_status: status, error: null })
          await admin.from('push_subscriptions').delete().eq('id', row.id)
          counts.pruned++
        } else {
          sends.push({ item_id: push.item_id, user_id: userId, subscription_host: host, status: 'failed', http_status: status, error: String(err).slice(0, 500) })
          failures.push(`${userId}: ${String(err).slice(0, 200)}`)
        }
      }
    }

    if (sends.some((s) => s.status === 'sent')) counts.users_notified++

    const { error: logErr } = await admin.from('nudge_sends').insert(sends)
    if (logErr) failures.push(`${userId}: send log: ${logErr.message}`)
    else counts.send_rows += sends.length
  }

  return json({ ok: true, today, ...counts, failures })
})
