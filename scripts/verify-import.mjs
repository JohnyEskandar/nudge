// Drives the import screen against the real database: paste a block, check the review
// list understood it, import, and confirm the people land with the right cadences.
//
// Usage: SUPABASE_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... APP_URL=http://localhost:5173 \
//        node scripts/verify-import.mjs
//
// Headless is fine — nothing here talks to a push service. HEADED=1 to watch.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, APP_URL = 'http://localhost:5173' } = process.env

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Need SUPABASE_URL, ANON_KEY and SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}

const EMAIL = 'import@nudge.test'
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Throws rather than exiting: everything below runs inside a try/finally, and the
// process is never allowed to end mid-run without the finally block reaching cleanup —
// this script creates a real user and real friends, and the first time it runs against
// real infrastructure a failure is the likely outcome, not the exception.
function fail(message) {
  throw new Error(message)
}

// The pasted block, and what it should become. Every awkward shape the parser claims to
// handle is in here, so a regression in any one of them fails this run.
const PASTE = [
  'Zora Vance',
  '- Bram Oyelaran +1 555 010 7788',
  '3) Ines Kowalczyk <ines@example.com>',
  '"Nadia Farouk"',
  'zora  vance',
].join('\n')

const EXPECTED = ['Zora Vance', 'Bram Oyelaran', 'Ines Kowalczyk', 'Nadia Farouk']

// Hoisted so `finally` can see whatever got created before a failure, and close/delete
// only what actually exists.
let browser
let user

try {
  // --- a user to be ------------------------------------------------------------

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  user = users?.users?.find((u) => u.email === EMAIL)
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true })
    if (error) throw error
    user = data.user
  }
  await admin.from('friends').delete().eq('user_id', user.id)
  console.log(`✓ clean test user ${EMAIL}`)

  /**
   * An admin-generated link cannot sign the app in: the client runs flowType 'pkce' and
   * auth-js rejects the implicit hash such links come back as. So redeem it here and hand
   * the browser the session directly. See verify-feedback.mjs for the long version.
   */
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
  })
  if (linkErr) throw linkErr
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token,
  })
  if (vErr) throw vErr

  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  browser = await chromium.launch({
    headless: process.env.HEADED !== '1',
    channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  })
  const page = await browser.newPage()
  page.on('console', (m) => {
    if (/error|fail/i.test(m.text())) console.log(`   [browser] ${m.text()}`)
  })
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${projectRef}-auth-token`, JSON.stringify(verified.session)],
  )

  // A brand-new user with nobody on the list is redirected into onboarding; skip that,
  // this test is about import.
  await page.addInitScript(() => window.localStorage.setItem('nudge.onboarded', '1'))

  // --- 1. paste and review -----------------------------------------------------

  await page.goto(`${APP_URL}/import`)
  await page.waitForSelector('h1:has-text("Add several at once")', { timeout: 30000 })
  console.log('✓ reached the import screen')

  await page.fill('#paste', PASTE)
  await page.click('button:has-text("Review")')
  await page.waitForSelector('#batch')

  // Matches on the prefix: each row's label is "Name, row 1 of 4", positional so it stays
  // stable while the user edits the name itself.
  const shown = await page.$$eval('input[aria-label^="Name, row"]', (els) => els.map((e) => e.value))
  if (shown.length !== EXPECTED.length) {
    fail(`review list has ${shown.length} rows, expected ${EXPECTED.length}: ${shown.join(' | ')}`)
  }
  for (const [i, name] of EXPECTED.entries()) {
    if (shown[i] !== name) {
      fail(`row ${i} is "${shown[i]}", expected "${name}"`)
    }
  }
  console.log('✓ review list parsed all five lines into four people')

  // --- 2. per-row category survives the batch selector -------------------------

  await page.selectOption('#batch', 'family')
  await page.selectOption('select[aria-label="Category for Ines Kowalczyk"]', 'mentor')
  await page.selectOption('#batch', 'abroad')

  const inesCategory = await page.inputValue('select[aria-label="Category for Ines Kowalczyk"]')
  if (inesCategory !== 'mentor') {
    fail(`a hand-set category was overwritten by the batch selector: got ${inesCategory}`)
  }
  console.log('✓ a hand-set category survived a later batch change')

  // --- 3. import ----------------------------------------------------------------

  await page.click('button:has-text("Add 4 people")')
  await page.waitForSelector('h1:has-text("My people")', { timeout: 15000 })
  console.log('✓ imported, landed on My people')

  // --- 4. what actually reached the database ------------------------------------

  const { data: overview, error: ovErr } = await admin
    .from('friend_overview')
    .select('name, category, cadence_days, phone, nudge_style')
    .eq('user_id', user.id)
  if (ovErr) fail(ovErr.message)

  if (overview.length !== 4) fail(`database has ${overview.length} friends, expected 4`)

  const byName = Object.fromEntries(overview.map((f) => [f.name, f]))
  for (const name of EXPECTED) {
    if (!byName[name]) fail(`${name} never reached the database`)
  }

  // Triggers must have seeded a cadence and a style for every row of the bulk insert.
  for (const f of overview) {
    if (!f.cadence_days) fail(`${f.name} has no cadence — the trigger missed a row`)
    if (!f.nudge_style) fail(`${f.name} has no nudge_style — the trigger missed a row`)
  }
  console.log('✓ every row got a cadence and a style from the triggers')

  if (byName['Ines Kowalczyk'].category !== 'mentor') {
    fail(`Ines imported as ${byName['Ines Kowalczyk'].category}, not the mentor set by hand`)
  }
  if (byName['Zora Vance'].category !== 'abroad') {
    fail(`Zora imported as ${byName['Zora Vance'].category}, not the abroad batch default`)
  }
  console.log('✓ categories match what the review list showed')

  if (byName['Bram Oyelaran'].phone !== '+1 555 010 7788') {
    fail(`Bram's number is ${byName['Bram Oyelaran'].phone}, expected it kept verbatim`)
  }
  if (byName['Zora Vance'].phone !== null) fail('Zora got a phone number from nowhere')
  console.log('✓ the phone was lifted out and stored unchanged')

  // --- 5. duplicates on a second run --------------------------------------------

  await page.goto(`${APP_URL}/import`)
  await page.waitForSelector('#paste')
  await page.fill('#paste', 'Zora Vance\nAnders Lindqvist')
  await page.click('button:has-text("Review")')
  await page.waitForSelector('#batch')

  // The review list renders in the time it takes to click; the friend list it is matched
  // against is a network round trip, so the duplicate flag lands a beat later. Reading the
  // checkboxes straight after #batch is a coin toss — and losing it looks exactly like a
  // real duplicate-detection bug. Wait for the state being asserted, then assert it.
  await page.waitForSelector('.friend-meta:has-text("already on your list")', { timeout: 10000 })

  const boxes = await page.$$eval('input[type="checkbox"]', (els) => els.map((e) => e.checked))
  if (boxes[0] !== false) fail('an existing friend was not unchecked in the review list')
  if (boxes[1] !== true) fail('a new person was wrongly unchecked')
  const meta = await page.locator('.card').first().locator('.friend-meta').textContent()
  if (!meta.includes('already on your list')) fail('the duplicate was not labelled')
  console.log('✓ someone already on the list arrives unchecked and labelled')

  console.log('\nPASS')
} catch (err) {
  console.error(`\nFAIL: ${err.message}`)
  process.exitCode = 1
} finally {
  // Best-effort, every step independent of the others: a browser that won't close must
  // not stop the friends from being deleted, and friends that won't delete must not stop
  // the user from being deleted. None of this may mask the original failure above —
  // exitCode only ever goes to 1 here, never back to 0.
  //
  // The two halves are guarded differently on purpose. Playwright throws, so the browser
  // gets a try/catch; supabase-js resolves with { error } and throws only on a transport
  // fault, so wrapping those in a try/catch would silently ignore every failure it was
  // meant to report — and this script's first real run is against production, where a
  // skipped delete leaves a real auth user behind.
  if (browser) {
    try {
      await browser.close()
    } catch (e) {
      console.error(`   (cleanup) failed to close the browser: ${e.message}`)
      process.exitCode = 1
    }
  }
  if (user) {
    const { error: friendsErr } = await admin.from('friends').delete().eq('user_id', user.id)
    if (friendsErr) {
      console.error(`   (cleanup) failed to delete test friends: ${friendsErr.message}`)
      process.exitCode = 1
    }
    const { error: userErr } = await admin.auth.admin.deleteUser(user.id)
    if (userErr) {
      console.error(`   (cleanup) failed to delete test user: ${userErr.message}`)
      process.exitCode = 1
    }
  }
}
