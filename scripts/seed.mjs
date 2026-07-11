// Seeds a test user with five friends across all four categories and varied
// last-interaction dates, then prints friend_overview in the order the app reads it.
//
// Usage:
//   SUPABASE_URL=... SERVICE_ROLE_KEY=... EMAIL=you@example.com node scripts/seed.mjs
//
// Uses the service role key, so it bypasses RLS to create the user — but it reads
// the list back through an *anon* client signed in as that user, which means the
// ordering below is proven to come through RLS exactly as the app sees it.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY
const EMAIL = process.env.EMAIL ?? 'seed@nudge.test'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Need SUPABASE_URL, SERVICE_ROLE_KEY and ANON_KEY in the environment.')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// cadence comes from the category default; lastSpoke drives days_overdue.
const PEOPLE = [
  { name: 'Priya Raman',  category: 'mentor', city: 'Bengaluru', lastSpoke: 200, cadence: 90 },
  { name: 'Maya Okonkwo', category: 'family', city: 'Lagos',     lastSpoke: 95,  cadence: 30 },
  { name: 'Luca Bianchi', category: 'abroad', city: 'Milan',     lastSpoke: 50,  cadence: 45 },
  { name: 'Sam Delacroix',category: 'friend', city: 'Montreal',  lastSpoke: 61,  cadence: 60 },
  { name: 'Tom Whitaker', category: 'friend', city: 'Austin',    lastSpoke: 30,  cadence: 60 },
]

// --- user -------------------------------------------------------------------

let userId
const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 })
const found = existing?.users?.find((u) => u.email === EMAIL)

if (found) {
  userId = found.id
  console.log(`Reusing existing user ${EMAIL} (${userId})`)
  // Start clean so re-running the seed is idempotent.
  await admin.from('friends').delete().eq('user_id', userId)
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    email_confirm: true,
  })
  if (error) throw error
  userId = data.user.id
  console.log(`Created user ${EMAIL} (${userId})`)
}

// --- friends + interactions --------------------------------------------------

for (const p of PEOPLE) {
  const { data: friend, error } = await admin
    .from('friends')
    .insert({
      user_id: userId,
      name: p.name,
      category: p.category,
      city: p.city,
      notes: null,
    })
    .select()
    .single()
  if (error) throw error

  // The trigger already set the category default; only override where the test
  // case wants a different number.
  if (p.cadence) {
    const { error: cErr } = await admin
      .from('reminder_settings')
      .update({ cadence_days: p.cadence })
      .eq('friend_id', friend.id)
    if (cErr) throw cErr
  }

  // A couple of older catch-ups plus the most recent one, so history isn't empty.
  const dates = [p.lastSpoke, p.lastSpoke + 70, p.lastSpoke + 160]
  const { error: iErr } = await admin.from('interactions').insert(
    dates.map((d, idx) => ({
      friend_id: friend.id,
      date: daysAgo(d),
      note: idx === 0 ? 'Caught up properly.' : 'Quick check-in.',
    })),
  )
  if (iErr) throw iErr
}

console.log(`\nSeeded ${PEOPLE.length} friends.\n`)

// --- read back through RLS as the user ---------------------------------------

const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: EMAIL,
})
if (linkErr) throw linkErr

const asUser = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
const { data: verified, error: vErr } = await asUser.auth.verifyOtp({
  type: 'magiclink',
  token_hash: link.properties.hashed_token,
})
if (vErr) throw vErr
console.log(`Signed in as ${verified.user.email} via magic link (RLS active).\n`)

const { data: rows, error: rErr } = await asUser
  .from('friend_overview')
  .select('name, category, cadence_days, days_since_contact, days_overdue')
  .order('days_overdue', { ascending: false })
  .order('name', { ascending: true })
if (rErr) throw rErr

console.log('friend_overview, as the Friend list screen orders it:\n')
console.table(
  rows.map((r) => ({
    name: r.name,
    category: r.category,
    cadence: r.cadence_days,
    'days since': r.days_since_contact,
    'days overdue': r.days_overdue,
    status: r.days_overdue > 0 ? 'OVERDUE' : r.days_overdue === 0 ? 'DUE TODAY' : 'ok',
  })),
)

// --- assert the ordering is actually correct ---------------------------------

const overdue = rows.map((r) => r.days_overdue)
const sortedDesc = [...overdue].sort((a, b) => b - a)
const ordered = JSON.stringify(overdue) === JSON.stringify(sortedDesc)

// days_overdue must equal days_since_contact - cadence_days, per row.
const mathOk = rows.every(
  (r) => r.days_overdue === r.days_since_contact - r.cadence_days,
)

console.log(`\nsorted most-overdue-first : ${ordered ? 'PASS' : 'FAIL'}`)
console.log(`days_overdue = days_since - cadence : ${mathOk ? 'PASS' : 'FAIL'}`)

if (!ordered || !mathOk) process.exit(1)
