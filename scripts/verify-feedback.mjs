// Proves the feedback path end-to-end, in a real browser against the real database.
//
// A green build has repeatedly hidden broken behaviour in this app, so nothing here is
// mocked: it signs in with a genuine magic link, walks the real UI (Today → Settings →
// Send feedback → type → send), and only then reads the row back with the service role.
//
// The second half is the one that matters. `feedback` holds what people say about the app,
// which may well be about *other people*, and it is the newest table in the schema — so we
// prove, not assume, that one user cannot read another's notes and cannot forge one in
// someone else's name.
//
// Usage: SUPABASE_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... APP_URL=http://localhost:5173 \
//        node scripts/verify-feedback.mjs

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, APP_URL } = process.env
for (const [k, v] of Object.entries({ SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, APP_URL })) {
  if (!v) {
    console.error(`Missing ${k}`)
    process.exit(1)
  }
}

const AUTHOR = 'seed@nudge.test' // writes the feedback
const OTHER = 'today@nudge.test' // must never see it

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const fail = (msg) => {
  console.error(`\nFAIL: ${msg}`)
  process.exit(1)
}

// --- the two test users -----------------------------------------------------

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listErr) throw listErr

async function userFor(email) {
  const found = list.users.find((u) => u.email === email)
  if (found) return found
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw error
  return data.user
}

const author = await userFor(AUTHOR)
const other = await userFor(OTHER)

// The walk below starts on Today, and Today sends a user with an empty list straight to
// /welcome. Without this the script races that redirect — it clicks through on the frame
// before the friend fetch resolves, and "✓ signed in, on Today" means nothing.
const { count: friendCount } = await admin
  .from('friends')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', author.id)
if (!friendCount) fail(`${AUTHOR} has no friends, so Today redirects to /welcome. Run: npm run seed`)

// A message unique to this run, so the row we read back is unambiguously the one the
// browser just wrote and not a leftover from a previous verification.
const MESSAGE = `The 3-day snooze is too short — verify run ${Date.now()}`

// --- 1. the real UI, in a real browser --------------------------------------

/**
 * A genuine session, redeemed from a genuine one-time token — but handed to the browser
 * through storage rather than by navigating the link.
 *
 * Navigating it does not work, and the reason is worth knowing: the app runs
 * `flowType: 'pkce'`, and auth-js *rejects* a magic link that comes back as an implicit
 * `#access_token=…` hash ("Not a valid PKCE flow url"). Links minted by generateLink carry
 * no code challenge, so GoTrue always returns that shape. Real sign-ins are unaffected —
 * Google and an emailed link opened in the same browser both come back as `?code=`, and
 * the paste-a-link box calls verifyOtp directly — but a test cannot borrow that door.
 */
async function sessionFor(email) {
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: l, error: e } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (e) throw e
  const { data, error: vErr } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: l.properties.hashed_token,
  })
  if (vErr) throw vErr
  return { client: anon, session: data.session }
}

const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
const { session } = await sessionFor(AUTHOR)
console.log('✓ session minted for the author')

// Headless is fine here — unlike verify:push, nothing in this flow talks to a push
// service, and a headed window is a window a passing human can click "Continue with
// Google" in, which is exactly what happened the first time this ran. HEADED=1 to watch.
const browser = await chromium.launch({
  headless: process.env.HEADED !== '1',
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
})
const page = await browser.newPage()
page.on('console', (m) => {
  if (/error|fail/i.test(m.text())) console.log(`   [browser] ${m.text()}`)
})

// Exactly where auth-js looks, in exactly the shape it writes: JSON, no wrapper.
await page.addInitScript(
  ([key, value]) => window.localStorage.setItem(key, value),
  [`sb-${projectRef}-auth-token`, JSON.stringify(session)],
)

await page.goto(APP_URL)
await page.waitForSelector('h1:has-text("Today")', { timeout: 30000 })
console.log('✓ signed in, on Today')

await page.click('button:has-text("Settings")')
await page.waitForSelector('h1:has-text("Settings")')

await page.click('button:has-text("Tell us what you think")')
await page.waitForSelector('h1:has-text("Send feedback")')
console.log('✓ reached feedback from Settings')

// Send must be unavailable until there are actually words to send.
if (!(await page.isDisabled('button:has-text("Send")'))) {
  await browser.close()
  fail('Send was enabled with an empty message')
}

await page.selectOption('#kind', 'idea')
await page.fill('#message', MESSAGE)
await page.click('button:has-text("Send")')

await page.waitForSelector('h1:has-text("Thank you")', { timeout: 15000 })
console.log('✓ sent, thank-you shown')

await page.screenshot({ path: 'scripts/.feedback-sent.png' })
await browser.close()

// --- 2. did it actually land, with the context? -----------------------------

const { data: rows, error: readErr } = await admin
  .from('feedback')
  .select('*')
  .eq('message', MESSAGE)
if (readErr) throw readErr
if (rows.length !== 1) fail(`expected 1 feedback row, found ${rows.length}`)

const row = rows[0]
if (row.user_id !== author.id) fail(`row belongs to ${row.user_id}, not the author`)
if (row.kind !== 'idea') fail(`kind is "${row.kind}", expected "idea"`)

// The whole point of collecting context automatically: a bug report has to be legible
// without the person having to describe their own phone.
const KEYS = ['user_agent', 'installed', 'push_supported', 'notification_permission', 'timezone']
for (const key of KEYS) {
  if (!(key in row.context)) fail(`context is missing ${key}`)
}
console.log('✓ row landed, owned by the author, with device context:')
console.log(
  `   installed=${row.context.installed} · push=${row.context.push_supported} · ` +
    `permission=${row.context.notification_permission} · tz=${row.context.timezone}`,
)

// --- 3. RLS: nobody else may read it, or forge one ---------------------------

const { client: asOther } = await sessionFor(OTHER)
const { data: seen, error: seenErr } = await asOther.from('feedback').select('*')
if (seenErr) fail(`the other user's read errored unexpectedly: ${seenErr.message}`)
if (seen.length !== 0) fail(`RLS LEAK: the other user can read ${seen.length} feedback row(s)`)
console.log('✓ RLS: the other user reads 0 rows')

const { error: forgeErr } = await asOther
  .from('feedback')
  .insert({ user_id: author.id, kind: 'other', message: 'forged' })
if (!forgeErr) fail('RLS LEAK: the other user forged feedback in the author’s name')
if (forgeErr.code !== '42501') fail(`forge was blocked, but with ${forgeErr.code}, not 42501`)
console.log('✓ RLS: writing feedback as someone else is rejected (42501)')

const { client: asAuthor } = await sessionFor(AUTHOR)
const { data: own } = await asAuthor.from('feedback').select('*').eq('message', MESSAGE)
if (own?.length !== 1) fail('the author cannot read their own feedback back')
console.log('✓ RLS: the author reads their own note back')

// Leave the table as we found it.
await admin.from('feedback').delete().eq('message', MESSAGE)
await admin.from('feedback').delete().eq('user_id', other.id)

console.log('\nPASS')
