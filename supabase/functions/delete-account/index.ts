// delete-account — erases the caller's account and everything hanging off it.
//
// Deleting an auth user needs the service role, which must never reach the browser, so
// this runs server-side. The caller is identified *only* by the access token they send:
// we never take a user id from the request body, because that would let anyone delete
// anyone. Every table's user_id references auth.users on delete cascade, so removing the
// user removes their friends, interactions, reminder settings and push subscriptions with
// it — nothing is left behind to orphan.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Same reasoning as daily-nudge: the platform-injected SUPABASE_SERVICE_ROLE_KEY is a
// new-style sb_secret_... key that PostgREST and the gateway reject. This is the legacy
// service_role JWT they accept.
const SERVICE_ROLE_KEY = Deno.env.get('NUDGE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return json({ error: 'unauthorized' }, 401)

  // A service-role key is technically a valid JWT, but it identifies no user — refuse it
  // rather than letting it through to something ambiguous.
  if (token === SERVICE_ROLE_KEY) return json({ error: 'unauthorized' }, 401)

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return json({ error: 'unauthorized' }, 401)

  const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id)
  if (delErr) return json({ error: delErr.message }, 500)

  return json({ ok: true, deleted: data.user.id })
})
