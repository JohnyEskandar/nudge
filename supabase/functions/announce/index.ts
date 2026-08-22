// announce — a one-off broadcast to every subscribed device.
//
// Deliberately separate from daily-nudge, and deliberately not scheduled. A nudge is
// about a person you are drifting from; this is the app talking about itself, which is
// a different thing and must never be able to pass for the former. Two consequences:
// it carries its own notification tag, so it cannot collapse into or replace a pending
// daily nudge, and nothing in the database calls it — it only ever fires because a
// human ran it by hand.
//
// The app promises, at the moment it asks for notification permission, that a nudge is
// the only thing it will send (see Onboarding step 3 and PushOptIn). Every use of this
// function spends a little of that promise. It exists because the current audience is
// seven people the author knows personally; it is not a marketing channel and should
// not become one.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// The same secret daily-nudge uses. Since the August 2026 key rotation this holds a
// new-style `sb_secret_...` key rather than the legacy service_role JWT.
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

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // Only someone holding the service key may broadcast. Same check as daily-nudge.
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const title = String(body?.title ?? '').trim()
  const message = String(body?.body ?? '').trim()
  const url = String(body?.url ?? '/')

  // Two safety rails, both learned from daily-nudge: an audience of one for testing on
  // your own device first, and a dry run that counts the blast radius without firing.
  const onlyUserId: string | undefined = body?.user_id
  const dryRun = body?.dry_run === true

  if (!title || !message) return json({ error: 'title and body are both required' }, 400)

  let query = admin.from('push_subscriptions').select('id, user_id, subscription')
  if (onlyUserId) query = query.eq('user_id', onlyUserId)

  const { data: subs, error } = await query
  if (error) return json({ error: error.message }, 500)

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      would_send: subs?.length ?? 0,
      scoped_to_user: onlyUserId ?? null,
      title,
      body: message,
    })
  }

  let sent = 0
  const pruned: string[] = []
  const failures: string[] = []

  for (const row of subs ?? []) {
    try {
      const subscriber = appServer.subscribe(row.subscription as webpush.PushSubscription)
      await subscriber.pushTextMessage(
        // Its own tag: a daily nudge uses 'nudge-daily', and sharing that would let an
        // announcement quietly replace a real reminder on the lock screen.
        JSON.stringify({ title, body: message, url, tag: 'nudge-announce' }),
        {},
      )
      sent++
    } catch (err) {
      // 410/404 means the browser threw the subscription away. Drop it, same as
      // daily-nudge, so we stop trying forever.
      if (err instanceof webpush.PushMessageError && err.isGone()) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
        pruned.push(row.id)
      } else {
        failures.push(String(err))
      }
    }
  }

  return json({ ok: true, targeted: subs?.length ?? 0, sent, pruned: pruned.length, failures })
})
