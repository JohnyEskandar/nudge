# Contacts Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone add many people to Nudge at once — by pasting a list of names, or by picking from their device contacts where the browser allows it.

**Architecture:** Two sources (a paste box and the Contact Picker API) both produce an identical `Candidate[]`, which a review list edits and a single bulk insert writes. Parsing is a pure module with no DOM access, so it is unit-tested directly; everything device-specific sits behind a `{ state }` union mirroring the existing `pushSupport()`.

**Tech Stack:** React 19, react-router-dom 7, Vite 8, Supabase JS 2, vitest (new), Playwright (existing).

**Spec:** `docs/superpowers/specs/2026-08-20-contacts-import-design.md`

## Global Constraints

- **Node** `>=22.12.0` (`package.json` engines). Do not lower it.
- **No new runtime dependencies.** `vitest` is the only addition and it is `devDependencies` only.
- **Phone numbers are never reformatted** — trim and collapse inner whitespace, nothing else. `friends.phone` is free text and `ReachOutAction` builds `tel:`/`sms:` from it verbatim.
- **Never silently drop input** except a line that is empty after parsing. Anything questionable arrives in the review list unchecked and labelled.
- **Use existing CSS classes only.** Available: `.app .back .btn .btn-quiet .btn-secondary .btn-danger-quiet .card .center .dot .empty .error .field .friend-card .friend-meta .friend-name .friend-top .header .loading .muted .notice .row .see-all .spacer .starter .status .sub .tag`. Do not add new CSS unless a task says to.
- **Copy tone:** quiet, honest, never guilt-inducing. Match `PushOptIn.jsx` and `Onboarding.jsx`. Use `&rsquo;` for apostrophes in JSX prose, as the existing screens do.
- **Category defaults** live in `DEFAULT_CADENCE` / `DEFAULT_STYLE` in `src/lib/api.js`. Never hardcode 30/45/60/90.
- **Lint must pass:** `npm run lint` (oxlint, `react/rules-of-hooks` is an error).
- **Commit after every task.** Do not batch commits.

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/device.js` | create | `isIOS()`, `isStandalone()` — what kind of device this is, nothing else |
| `src/lib/device.test.js` | create | Unit tests for the above |
| `src/lib/contacts.js` | create | Pure parsing + candidate shaping + picker capability |
| `src/lib/contacts.test.js` | create | Unit tests for every parsing rule |
| `src/screens/Import.jsx` | create | The import screen: paste, review, write |
| `src/components/PickerSetup.jsx` | create | Contact Picker capability walkthrough |
| `src/lib/push.js` | modify | Import the two device helpers instead of defining them |
| `src/components/PushOptIn.jsx` | modify | Import `isIOS` from `device.js` |
| `src/lib/api.js` | modify | Add `addFriends(rows)` |
| `src/App.jsx` | modify | Register `/import` |
| `src/screens/Onboarding.jsx` | modify | Link to import; seed `added` from the server |
| `src/screens/People.jsx` | modify | Link to import |
| `src/screens/FriendList.jsx` | modify | Empty-state link; "picker is ready" notice |
| `scripts/verify-import.mjs` | create | End-to-end check against the real database |
| `vite.config.js` | modify | vitest config block |
| `package.json` | modify | `vitest` devDependency, `test` script |

---

### Task 1: Device helpers + test infrastructure

Extracts the two device predicates so `contacts.js` never has to import the push module to find out what an iPhone is, and establishes vitest along the way. No behaviour change.

**Files:**
- Create: `src/lib/device.js`, `src/lib/device.test.js`
- Modify: `src/lib/push.js:15-31`, `src/components/PushOptIn.jsx:1-8`, `vite.config.js`, `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `isIOS(): boolean`, `isStandalone(): boolean` from `src/lib/device.js`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

Let npm resolve the version — do not pin one by hand, it must match Vite 8.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`, after `"lint"`:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Configure vitest**

Replace `vite.config.js` entirely:

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // The units worth testing here are pure — parsing and predicates — so there is no
    // DOM to emulate and no jsdom dependency to carry.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/device.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIOS, isStandalone } from './device'

afterEach(() => vi.unstubAllGlobals())

function stubNavigator(props) {
  vi.stubGlobal('navigator', { userAgent: '', platform: '', maxTouchPoints: 0, ...props })
}

describe('isIOS', () => {
  it('recognises an iPhone', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)' })
    expect(isIOS()).toBe(true)
  })

  it('recognises an iPad that claims to be a Mac', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })
    expect(isIOS()).toBe(true)
  })

  it('does not mistake a real Mac for an iPad', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })
    expect(isIOS()).toBe(false)
  })

  it('is false on Android', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })
    expect(isIOS()).toBe(false)
  })
})

describe('isStandalone', () => {
  it('is true for the iOS home-screen flag', () => {
    stubNavigator({ standalone: true })
    vi.stubGlobal('window', { navigator: { standalone: true }, matchMedia: () => ({ matches: false }) })
    expect(isStandalone()).toBe(true)
  })

  it('is true for display-mode: standalone', () => {
    vi.stubGlobal('window', { navigator: {}, matchMedia: () => ({ matches: true }) })
    expect(isStandalone()).toBe(true)
  })

  it('is false in an ordinary tab', () => {
    vi.stubGlobal('window', { navigator: {}, matchMedia: () => ({ matches: false }) })
    expect(isStandalone()).toBe(false)
  })
})
```

- [ ] **Step 5: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./device"`.

- [ ] **Step 6: Create the module**

Create `src/lib/device.js`, moving both functions verbatim out of `push.js`:

```js
/**
 * What kind of device this is. Separate from push.js so that anything needing to know
 * what an iPhone is — the contacts picker included — doesn't have to pull in the push
 * module to find out.
 */

export function isIOS() {
  const ua = navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** True when running as an installed home-screen app rather than a browser tab. */
export function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 8: Remove the originals from push.js**

In `src/lib/push.js`, delete the `isIOS` and `isStandalone` function definitions (currently lines 15–31) and add this import below the existing `supabase` import at the top:

```js
import { isIOS, isStandalone } from './device'
```

`pushSupport()` at line 38 keeps calling both exactly as before.

- [ ] **Step 9: Repoint the one other importer**

In `src/components/PushOptIn.jsx`, remove `isIOS,` from the `../lib/push` import list and add a separate import beneath it:

```js
import { isIOS } from '../lib/device'
```

- [ ] **Step 10: Verify nothing still reads the old location**

Run: `grep -rn "isIOS\|isStandalone" src/ | grep -v "src/lib/device"`
Expected: only the `import` line in `push.js`, the `import` line in `PushOptIn.jsx`, their call sites in `pushSupport()` and `PushOptIn.jsx:70`. No `export function isIOS` outside `device.js`.

- [ ] **Step 11: Lint and build**

Run: `npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 12: Commit**

```bash
git add src/lib/device.js src/lib/device.test.js src/lib/push.js src/components/PushOptIn.jsx vite.config.js package.json package-lock.json
git commit -m "Move the device predicates somewhere contacts can reach them

isIOS and isStandalone lived in push.js, which was fine while push was the
only thing that cared. The contacts picker needs the same answers, and
importing the push module to ask what an iPhone is would be a strange way
round. No behaviour change; vitest arrives with them, since a pure
predicate is the cheapest possible thing to test."
```

---

### Task 2: The parser

The heart of paste-based import: free text in, candidate people out. Pure, no DOM, no network.

**Files:**
- Create: `src/lib/contacts.js`, `src/lib/contacts.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `parseContacts(text: string, opts?: { category?: string }): Candidate[]`
  - `normalizeName(name: string): string`
  - `Candidate = { key: string, name: string, phone: string|null, category: string, include: boolean, note: 'duplicate'|'unlikely'|null }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/contacts.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { normalizeName, parseContacts } from './contacts'

const names = (text, opts) => parseContacts(text, opts).map((c) => c.name)

describe('parseContacts — splitting', () => {
  it('takes one person per line', () => {
    expect(names('Maya Okonkwo\nSam Okafor')).toEqual(['Maya Okonkwo', 'Sam Okafor'])
  })

  it('ignores blank lines entirely', () => {
    expect(names('Maya\n\n   \nSam')).toEqual(['Maya', 'Sam'])
  })

  it('splits a single line on commas', () => {
    expect(names('Maya, Tom, Ana')).toEqual(['Maya', 'Tom', 'Ana'])
  })

  it('leaves "Last, First" alone when there are newlines', () => {
    expect(names('Okonkwo, Maya\nOkafor, Sam')).toEqual(['Okonkwo, Maya', 'Okafor, Sam'])
  })

  it('merges a phone-only segment back into the name before it', () => {
    const [c] = parseContacts('Maya Okonkwo, +1 555 010 1234')
    expect(c.name).toBe('Maya Okonkwo')
    expect(c.phone).toBe('+1 555 010 1234')
  })

  it('handles alternating names and phones on one line', () => {
    const out = parseContacts('Maya, +1 555 010 1234, Tom, +1 555 010 9999')
    expect(out.map((c) => c.name)).toEqual(['Maya', 'Tom'])
    expect(out.map((c) => c.phone)).toEqual(['+1 555 010 1234', '+1 555 010 9999'])
  })
})

describe('parseContacts — phones', () => {
  it('lifts a phone out of the line', () => {
    const [c] = parseContacts('Sam Okafor +1 555 010 1234')
    expect(c.name).toBe('Sam Okafor')
    expect(c.phone).toBe('+1 555 010 1234')
  })

  it('needs at least seven digits', () => {
    const [c] = parseContacts('Flat 221 Baker')
    expect(c.phone).toBeNull()
    expect(c.name).toBe('Flat 221 Baker')
  })

  it('keeps the number exactly as written', () => {
    const [c] = parseContacts('Ana (555) 010-1234')
    expect(c.phone).toBe('(555) 010-1234')
  })

  it('is null when there is no number', () => {
    expect(parseContacts('Maya Okonkwo')[0].phone).toBeNull()
  })
})

describe('parseContacts — decoration', () => {
  it('strips bullet markers', () => {
    expect(names('- Maya\n* Sam\n• Ana')).toEqual(['Maya', 'Sam', 'Ana'])
  })

  it('strips numbered markers', () => {
    expect(names('1. Maya\n2) Sam')).toEqual(['Maya', 'Sam'])
  })

  it('strips emails and angle brackets', () => {
    expect(names('Sam Okafor <sam@example.com>')).toEqual(['Sam Okafor'])
  })

  it('strips surrounding quotes', () => {
    expect(names('"Ana Ruiz"')).toEqual(['Ana Ruiz'])
  })

  it('keeps an apostrophe inside a name', () => {
    expect(names("Siobhan O'Brien")).toEqual(["Siobhan O'Brien"])
  })

  it('keeps a curly apostrophe inside a name', () => {
    expect(names('Siobhan O’Brien')).toEqual(['Siobhan O’Brien'])
  })

  it('drops a line that is only an email', () => {
    expect(names('sam@example.com\nMaya')).toEqual(['Maya'])
  })
})

describe('parseContacts — candidate shape', () => {
  it('defaults the category to friend', () => {
    expect(parseContacts('Maya')[0].category).toBe('friend')
  })

  it('takes the category it is given', () => {
    expect(parseContacts('Maya', { category: 'family' })[0].category).toBe('family')
  })

  it('includes ordinary rows by default', () => {
    const [c] = parseContacts('Maya')
    expect(c.include).toBe(true)
    expect(c.note).toBeNull()
  })

  it('gives every row a distinct key', () => {
    const out = parseContacts('Maya\nSam\nAna')
    expect(new Set(out.map((c) => c.key)).size).toBe(3)
  })
})

describe('parseContacts — implausible names', () => {
  it('flags something too long, unchecked, without dropping it', () => {
    const [c] = parseContacts('x'.repeat(61))
    expect(c.note).toBe('unlikely')
    expect(c.include).toBe(false)
    expect(c.name).toHaveLength(61)
  })

  it('flags something with too many words', () => {
    const [c] = parseContacts('one two three four five six seven')
    expect(c.note).toBe('unlikely')
    expect(c.include).toBe(false)
  })

  it('leaves a normal long-ish name alone', () => {
    const [c] = parseContacts('Maria Fernanda Del Carmen Ruiz')
    expect(c.note).toBeNull()
    expect(c.include).toBe(true)
  })
})

describe('parseContacts — limits', () => {
  it('collapses duplicates within the paste, keeping the first', () => {
    const out = parseContacts('Maya Okonkwo\nmaya  okonkwo\nSam')
    expect(out.map((c) => c.name)).toEqual(['Maya Okonkwo', 'Sam'])
  })

  it('caps at 200 rows, after collapsing duplicates', () => {
    const text = Array.from({ length: 250 }, (_, i) => `Person ${i}`).join('\n')
    expect(parseContacts(text)).toHaveLength(200)
  })

  it('returns nothing for empty input', () => {
    expect(parseContacts('')).toEqual([])
    expect(parseContacts('   \n  ')).toEqual([])
  })
})

describe('normalizeName', () => {
  it('ignores case and extra whitespace', () => {
    expect(normalizeName('  Maya   OKONKWO ')).toBe('maya okonkwo')
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./contacts"`.

- [ ] **Step 3: Write the parser**

Create `src/lib/contacts.js`:

```js
/**
 * Turning a pasted blob into people.
 *
 * An installed iOS web app cannot read the address book — the Contact Picker API is
 * behind an off-by-default Safari flag and Web Share Target was never implemented — so
 * for most people the way in is text they already have somewhere: a group chat, a note,
 * an invite list. That text is messy, which is why nothing here writes anything: it
 * produces candidates for a review list, and only genuinely empty lines are dropped
 * without being shown.
 */

/** Enough digits that a house number or a year cannot pass for a phone. */
const MIN_PHONE_DIGITS = 7
const PHONE_RE = /\+?[(\d][\d\s().-]{5,}\d/g
const EMAIL_RE = /\S+@\S+\.\S+/g
const LIST_MARKER_RE = /^\s*(?:[-*•]|\d+[.)])\s*/
const EDGE_QUOTES_RE = /^["“”'‘’]+|["“”'‘’]+$/g

const MAX_CANDIDATES = 200
const UNLIKELY_MAX_CHARS = 60
const UNLIKELY_MAX_WORDS = 6

let keySeq = 0
const nextKey = () => `c${++keySeq}`

/** Case- and whitespace-insensitive, for duplicate checks on both sides. */
export function normalizeName(name) {
  return String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Leading "- ", "* ", "• ", "1. ", "3) ". */
const stripDecoration = (s) => s.replace(LIST_MARKER_RE, '').trim()

/**
 * Quotes are only stripped at the edges: an apostrophe in the middle belongs to
 * O'Brien and removing it would be a worse mistake than any it prevents.
 */
function cleanName(s) {
  return s
    .replace(EMAIL_RE, ' ')
    .replace(/[<>|;:,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EDGE_QUOTES_RE, '')
    .trim()
}

/**
 * Pulls the first phone-shaped run out of a line and hands back what's left.
 * A date written 1990-05-05 has enough digits to qualify; the review list is where
 * that gets noticed, which is cheaper than teaching this function about dates.
 */
function takePhone(line) {
  for (const match of line.match(PHONE_RE) ?? []) {
    if (match.replace(/\D/g, '').length >= MIN_PHONE_DIGITS) {
      return {
        phone: match.trim().replace(/\s+/g, ' '),
        rest: line.replace(match, ' '),
      }
    }
  }
  return { phone: null, rest: line }
}

const isUnlikelyName = (name) =>
  name.length > UNLIKELY_MAX_CHARS || name.split(' ').length > UNLIKELY_MAX_WORDS

function candidate(name, phone, category) {
  const note = isUnlikelyName(name) ? 'unlikely' : null
  return { key: nextKey(), name, phone, category, include: note === null, note }
}

/**
 * On a single line, commas separate people. Across several lines they don't — plenty of
 * lists are written "Okonkwo, Maya".
 */
function splitSegments(text) {
  const lines = text.split(/\r?\n/)
  if (lines.length > 1) return lines
  const parts = text.split(',')
  return parts.length > 1 ? mergePhoneOnly(parts) : parts
}

/**
 * "Maya Okonkwo, +1 555 010 1234" is one person, not a person and a fragment. Without
 * this the split strands the number in a segment with no name, and it is dropped
 * without anyone seeing it happen.
 */
function mergePhoneOnly(parts) {
  const merged = []
  for (const part of parts) {
    const { phone, rest } = takePhone(stripDecoration(part))
    const isPhoneOnly = phone && !cleanName(rest)
    if (isPhoneOnly && merged.length > 0) {
      merged[merged.length - 1] += `,${part}`
    } else {
      merged.push(part)
    }
  }
  return merged
}

/** Collapse same-name rows, then cap. Order of those two matters: the cap keeps 200 people. */
function dedupeAndCap(candidates) {
  const seen = new Set()
  const out = []
  for (const c of candidates) {
    const key = normalizeName(c.name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length === MAX_CANDIDATES) break
  }
  return out
}

export function parseContacts(text, { category = 'friend' } = {}) {
  const out = []
  for (const segment of splitSegments(String(text ?? ''))) {
    const { phone, rest } = takePhone(stripDecoration(segment))
    const name = cleanName(rest)
    if (name) out.push(candidate(name, phone, category))
  }
  return dedupeAndCap(out)
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, all of `contacts.test.js` plus the 7 from Task 1.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contacts.js src/lib/contacts.test.js
git commit -m "Parse a pasted list into people

Nobody can hand an iOS web app their address book, so the realistic input
is text that already exists somewhere else — a group chat, a note, an
invite list — and that text is messy. The rules here are deliberately
forgiving, and the one thing the parser never does is decide on your
behalf: everything questionable comes out flagged rather than dropped, so
the review list can show it.

The comma rule is the fiddly one. On a single line a comma separates
people; across several lines it doesn't, because plenty of lists are
written 'Okonkwo, Maya'. A segment holding only a phone number merges back
into the name before it, or 'Maya Okonkwo, +1 555 010 1234' would lose the
number silently."
```

---

### Task 3: Duplicates, picked contacts, and picker capability

The rest of `contacts.js`: matching candidates against people already on the list, reshaping the Contact Picker's output into the same `Candidate`, and reporting whether the picker exists at all.

**Files:**
- Modify: `src/lib/contacts.js`, `src/lib/contacts.test.js`

**Interfaces:**
- Consumes: `Candidate`, `normalizeName` (Task 2); `isIOS` (Task 1)
- Produces:
  - `markDuplicates(candidates: Candidate[], existingFriends: {name}[]): Candidate[]`
  - `fromPicked(picked: {name?: string[], tel?: string[]}[], opts?: { category?: string }): Candidate[]`
  - `pickerSupport(): { state: 'supported'|'needs-flag'|'unsupported' }`
  - `pickContacts(): Promise<Candidate[]>` — throws if the picker is absent or the call fails

- [ ] **Step 1: Write the failing tests**

In `src/lib/contacts.test.js`, first widen the two existing imports at the top of the
file — imports hoist, so appending new ones lower down would work but reads badly:

```js
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fromPicked,
  markDuplicates,
  normalizeName,
  parseContacts,
  pickContacts,
  pickerSupport,
} from './contacts'
```

Then append:

```js
afterEach(() => vi.unstubAllGlobals())

describe('markDuplicates', () => {
  const existing = [{ name: 'Maya Okonkwo' }, { name: 'Sam Okafor' }]

  it('flags and unchecks someone already on the list', () => {
    const [c] = markDuplicates(parseContacts('Maya Okonkwo'), existing)
    expect(c.note).toBe('duplicate')
    expect(c.include).toBe(false)
  })

  it('ignores case and spacing when matching', () => {
    const [c] = markDuplicates(parseContacts('  maya   okonkwo '), existing)
    expect(c.note).toBe('duplicate')
  })

  it('leaves someone new alone', () => {
    const [c] = markDuplicates(parseContacts('Ana Ruiz'), existing)
    expect(c.note).toBeNull()
    expect(c.include).toBe(true)
  })

  it('takes duplicate over unlikely when a row is both', () => {
    const long = 'x'.repeat(61)
    const [c] = markDuplicates(parseContacts(long), [{ name: long }])
    expect(c.note).toBe('duplicate')
  })

  it('clears the flag when a renamed row is no longer a duplicate', () => {
    const flagged = markDuplicates(parseContacts('Maya Okonkwo'), existing)
    const renamed = flagged.map((c) => ({ ...c, name: 'Maya Adeyemi' }))
    expect(markDuplicates(renamed, existing)[0].note).toBeNull()
  })

  it('copes with no existing friends', () => {
    expect(markDuplicates(parseContacts('Maya'), [])[0].note).toBeNull()
    expect(markDuplicates(parseContacts('Maya'), undefined)[0].note).toBeNull()
  })
})

describe('fromPicked', () => {
  it('takes the first name and the first number', () => {
    const [c] = fromPicked([{ name: ['Maya Okonkwo', 'M.O.'], tel: ['+1 555 010 1234', '+1 555 000'] }])
    expect(c.name).toBe('Maya Okonkwo')
    expect(c.phone).toBe('+1 555 010 1234')
  })

  it('handles a contact with no number', () => {
    expect(fromPicked([{ name: ['Ana Ruiz'] }])[0].phone).toBeNull()
  })

  it('skips a contact with no usable name', () => {
    expect(fromPicked([{ tel: ['+1 555 010 1234'] }, { name: [''] }, { name: ['Ana'] }])).toHaveLength(1)
  })

  it('applies the given category', () => {
    expect(fromPicked([{ name: ['Ana'] }], { category: 'mentor' })[0].category).toBe('mentor')
  })

  it('collapses duplicates the picker returned twice', () => {
    expect(fromPicked([{ name: ['Ana'] }, { name: ['ana'] }])).toHaveLength(1)
  })

  it('copes with nothing picked', () => {
    expect(fromPicked([])).toEqual([])
    expect(fromPicked(undefined)).toEqual([])
  })
})

describe('pickerSupport', () => {
  it('is supported when the API is present', () => {
    vi.stubGlobal('navigator', { contacts: { select: () => {} }, userAgent: '' })
    expect(pickerSupport().state).toBe('supported')
  })

  it('needs the flag on iOS when the API is missing', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)' })
    expect(pickerSupport().state).toBe('needs-flag')
  })

  it('is simply unsupported off iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' })
    expect(pickerSupport().state).toBe('unsupported')
  })
})

describe('pickContacts', () => {
  it('asks for names and numbers, allowing several', async () => {
    const select = vi.fn().mockResolvedValue([{ name: ['Ana Ruiz'], tel: ['+1 555 010 1234'] }])
    vi.stubGlobal('navigator', { contacts: { select }, userAgent: '' })

    const out = await pickContacts()
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: true })
    expect(out[0].name).toBe('Ana Ruiz')
  })

  it('returns nothing when the picker is cancelled', async () => {
    vi.stubGlobal('navigator', { contacts: { select: vi.fn().mockResolvedValue([]) }, userAgent: '' })
    expect(await pickContacts()).toEqual([])
  })

  it('throws when there is no picker', async () => {
    vi.stubGlobal('navigator', { userAgent: '' })
    await expect(pickContacts()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test`
Expected: FAIL — `fromPicked is not a function` and similar.

- [ ] **Step 3: Implement**

Append to `src/lib/contacts.js`, and add `import { isIOS } from './device'` at the top of the file:

```js
/**
 * Marks candidates who are already on the list, so importing twice doesn't quietly
 * create a second Maya. Duplicates arrive unchecked but visible — silently removing
 * them would leave someone wondering which of their names went missing.
 *
 * Re-run after a name is edited: a row renamed out of a collision loses the flag. Its
 * checkbox is left as the user last set it rather than being helpfully re-ticked.
 */
export function markDuplicates(candidates, existingFriends) {
  const taken = new Set((existingFriends ?? []).map((f) => normalizeName(f.name)))

  return candidates.map((c) => {
    const isDuplicate = taken.has(normalizeName(c.name))
    if (isDuplicate) return { ...c, note: 'duplicate', include: false }
    if (c.note === 'duplicate') {
      return { ...c, note: isUnlikelyName(c.name) ? 'unlikely' : null }
    }
    return c
  })
}

/**
 * The Contact Picker's output in the same shape the parser produces, so the review list
 * and the insert never learn where a candidate came from. Its properties are arrays —
 * a person can have several names and several numbers — and we take the first of each.
 */
export function fromPicked(picked, { category = 'friend' } = {}) {
  const out = []
  for (const contact of picked ?? []) {
    const name = cleanName(String(contact?.name?.[0] ?? ''))
    if (!name) continue
    const tel = contact?.tel?.[0]
    out.push(candidate(name, tel ? String(tel).trim().replace(/\s+/g, ' ') : null, category))
  }
  return dedupeAndCap(out)
}

/**
 * Whether this device can open a contact picker, in the same shape as pushSupport().
 *
 * 'needs-flag' is iOS specific: Safari ships the Contact Picker behind an off-by-default
 * Feature Flag, so the API's absence there means "not turned on yet", which is a
 * different thing to say than "your browser can't do this". Note there is no
 * install-state branch — unlike push, a tab and a home-screen app behave the same here.
 */
export function pickerSupport() {
  if (navigator.contacts?.select) return { state: 'supported' }
  return isIOS() ? { state: 'needs-flag' } : { state: 'unsupported' }
}

/** Opens the native picker. Only call this from a user gesture — the API requires one. */
export async function pickContacts({ category = 'friend' } = {}) {
  if (!navigator.contacts?.select) throw new Error('No contact picker on this device.')
  const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true })
  return fromPicked(picked, { category })
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/lib/contacts.js src/lib/contacts.test.js
git commit -m "Match candidates against people you already have, and against the picker

Both sources end up in one shape, so nothing downstream has to know whether
a candidate was typed or picked. Duplicates come back flagged and unchecked
rather than removed — dropping them silently leaves someone counting names
and wondering which one vanished.

pickerSupport mirrors pushSupport deliberately. 'needs-flag' only happens on
iOS, where the API's absence means the Safari flag is off rather than the
browser being incapable, and those want different words on screen."
```

---

### Task 4: The bulk insert

One statement, all-or-nothing. Includes proving against the real database that row triggers seed every row, not just the first — the assumption the whole approach rests on.

**Files:**
- Modify: `src/lib/api.js`

**Interfaces:**
- Consumes: `Candidate` (Task 2)
- Produces: `addFriends(rows: Candidate[]): Promise<Friend[]>`

- [ ] **Step 1: Prove row triggers fire per row on a multi-row insert**

This decides whether `addFriends` needs a second write. Run against the real project:

```bash
cat > /private/tmp/claude-501/-Users-johnyeskandar-Developer-Nudge/dcd38e2a-3006-4fd6-b160-2d55220d3d8f/scratchpad/check-triggers.mjs <<'EOF'
import { createClient } from '@supabase/supabase-js'
const { SUPABASE_URL, SERVICE_ROLE_KEY } = process.env
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
const user = users.users.find((u) => u.email === 'seed@nudge.test')
if (!user) throw new Error('run npm run seed first')

const names = ['ZZ Trigger A', 'ZZ Trigger B', 'ZZ Trigger C']
const { data: made, error } = await admin.from('friends').insert(
  names.map((name) => ({ user_id: user.id, name, category: 'mentor' })),
).select()
if (error) throw error

const { data: settings } = await admin
  .from('reminder_settings').select('friend_id, cadence_days')
  .in('friend_id', made.map((f) => f.id))

console.log('inserted:', made.length, 'reminder_settings rows:', settings.length)
console.log('cadences:', settings.map((s) => s.cadence_days))
console.log('nudge_style:', made.map((f) => f.nudge_style))
await admin.from('friends').delete().in('id', made.map((f) => f.id))
console.log(settings.length === 3 ? 'PASS — triggers fire per row' : 'FAIL — triggers did not fire for every row')
EOF
SUPABASE_URL=... SERVICE_ROLE_KEY=... node /private/tmp/claude-501/-Users-johnyeskandar-Developer-Nudge/dcd38e2a-3006-4fd6-b160-2d55220d3d8f/scratchpad/check-triggers.mjs
```

Expected: `PASS — triggers fire per row`, three cadences of `90` (the mentor default), three non-null styles.

**If it fails**, stop and add a second insert into `reminder_settings` inside `addFriends` before continuing, and note it in the spec.

- [ ] **Step 2: Write `addFriends`**

In `src/lib/api.js`, directly below `addFriend` (which ends at line 66):

```js
/**
 * Import's write, and the reason import is one round trip rather than N.
 *
 * Deliberately all-or-nothing. What can actually fail here is RLS, the network, or a
 * name we already rejected client-side — all of which fail every row at once, so
 * per-row bookkeeping would be machinery for a case that doesn't arise, while leaving
 * the real one ("six of ten landed") messier than writing nothing at all. A failure
 * leaves the review list untouched and retry is one tap.
 *
 * Triggers seed reminder_settings and nudge_style per row, exactly as for a single add.
 */
export async function addFriends(rows) {
  const { data: session } = await supabase.auth.getUser()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not signed in.')
  if (!rows.length) return []

  return unwrap(
    await supabase
      .from('friends')
      .insert(
        rows.map((r) => ({
          user_id: userId,
          name: r.name.trim(),
          category: r.category,
          city: null,
          notes: null,
          phone: r.phone?.trim() || null,
          nudge_style: DEFAULT_STYLE[r.category],
        })),
      )
      .select(),
  )
}
```

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.js
git commit -m "Write an imported batch in one statement

All-or-nothing on purpose. The things that can actually fail — RLS, the
network, a name already rejected client-side — fail every row at once, so
per-row handling would be machinery for a case that doesn't happen while
leaving the real one, a half-written list, harder to explain. Nothing is
written on failure and the review list is still sitting there.

Checked against the database that row triggers seed reminder_settings and
nudge_style for every row of a multi-row insert, not just the first."
```

---

### Task 5: The import screen

Paste, review, write. No picker yet — that arrives in Task 6.

**Files:**
- Create: `src/screens/Import.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `parseContacts`, `markDuplicates` (Tasks 2–3); `addFriends`, `listFriends`, `CATEGORIES`, `DEFAULT_CADENCE` (Task 4, existing)
- Produces: route `/import`, accepting `?from=welcome`

- [ ] **Step 1: Write the screen**

Create `src/screens/Import.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORIES, DEFAULT_CADENCE, addFriends, listFriends } from '../lib/api'
import { markDuplicates, parseContacts } from '../lib/contacts'

const PLACEHOLDER = `Maya Okonkwo
Sam Okafor +1 555 010 1234
Priya Raman`

const NOTE_LABEL = {
  duplicate: 'already on your list',
  unlikely: 'doesn’t look like a name',
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Adding people one at a time is where a new list stalls: you type someone, feel the
 * effort, and stop at one. This is the same act done in a batch — but nothing is
 * written until you have seen what was understood, because parsing free text is a
 * guess and a wrong guess should cost a tick box, not a person on your list.
 */
export default function Import() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromWelcome = params.get('from') === 'welcome'

  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)
  const [category, setCategory] = useState('friend')
  const [existing, setExisting] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    listFriends()
      .then(setExisting)
      .catch(() => setExisting([]))
  }, [])

  const found = useMemo(() => parseContacts(text, { category }).length, [text, category])
  const chosen = rows?.filter((r) => r.include && r.name.trim()) ?? []

  function review() {
    setError(null)
    setRows(markDuplicates(parseContacts(text, { category }), existing))
  }

  function patch(key, values) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...values } : r)))
  }

  /**
   * The batch selector moves only rows still sitting on the old default; one you set by
   * hand keeps what you chose. The same rule the nudge style follows in FriendForm and
   * the cadence follows in updateFriend.
   */
  function onBatchCategory(next) {
    setRows((rs) => rs?.map((r) => (r.category === category ? { ...r, category: next } : r)) ?? null)
    setCategory(next)
  }

  async function onImport() {
    if (!chosen.length) return
    setSaving(true)
    setError(null)
    try {
      await addFriends(chosen)
      navigate(fromWelcome ? '/welcome' : '/people', { replace: true })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <>
      <button className="back" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <h1>Add several at once</h1>
      <p className="sub">
        Paste a list of names — from a group chat, a note, anywhere. One per line. If a
        phone number is on the line, Nudge will pick it up.
      </p>

      {error && <div className="error">{error}</div>}

      {rows === null ? (
        <>
          <div className="field">
            <label htmlFor="paste">Names</label>
            <textarea
              id="paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={8}
              autoFocus
            />
          </div>

          <button className="btn" onClick={review} disabled={found === 0}>
            {found === 0 ? 'Add some names' : `Review ${plural(found, 'person', 'people')}`}
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="batch">These are mostly…</label>
            <select id="batch" value={category} onChange={(e) => onBatchCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Reminds you every {DEFAULT_CADENCE[category]} days. Change anyone below, or
              any of them later.
            </p>
          </div>

          {rows.map((r) => (
            <div className="card" key={r.key} style={{ marginBottom: 12 }}>
              <div className="row">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => patch(r.key, { include: e.target.checked })}
                  aria-label={`Add ${r.name}`}
                />
                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => patch(r.key, { name: e.target.value })}
                  onBlur={() => setRows((rs) => markDuplicates(rs, existing))}
                  aria-label="Name"
                />
              </div>

              <div className="friend-meta">
                {r.phone ? r.phone : 'No number'}
                {r.note ? ` · ${NOTE_LABEL[r.note]}` : ''}
              </div>

              <select
                value={r.category}
                onChange={(e) => patch(r.key, { category: e.target.value })}
                aria-label={`Category for ${r.name}`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="spacer" />

          <button className="btn" onClick={onImport} disabled={saving || chosen.length === 0}>
            {saving ? 'Adding…' : `Add ${plural(chosen.length, 'person', 'people')}`}
          </button>

          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn-quiet" onClick={() => setRows(null)}>
              Back to the list
            </button>
          </div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 2: Register the route**

In `src/App.jsx`, add the import beside the other screens:

```jsx
import Import from './screens/Import'
```

and the route directly after the `/add` route:

```jsx
        <Route path="/import" element={<Import />} />
```

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Look at it**

Run `npm run dev`, sign in, go to `/import`. Paste:

```
Maya Okonkwo
- Sam Okafor +1 555 010 1234
3) Priya Raman <priya@example.com>
"Ana Ruiz"
Maya Okonkwo
```

Expected: four rows (the second Maya collapsed), Sam has a number, Priya has no email in her name, Ana has no quotes. Switching "These are mostly…" moves every row; change one row by hand, switch again, and that row stays put.

**Take a screenshot and look at it.** The `add-fab` on other screens has swallowed taps before; check nothing overlaps the import button.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Import.jsx src/App.jsx
git commit -m "Add several people at once

Adding one at a time is where a new list stalls — you type someone, feel
the effort, and stop at one. This is the same act in a batch.

Nothing is written until the list has been seen. Free-text parsing is a
guess, and a wrong guess should cost a tick box rather than a person you
have to find and delete afterwards. The batch category moves only rows
still on the old default, which is the rule the nudge style and the cadence
already follow elsewhere."
```

---

### Task 6: The picker and its walkthrough

**Files:**
- Create: `src/components/PickerSetup.jsx`
- Modify: `src/screens/Import.jsx`

**Interfaces:**
- Consumes: `pickerSupport`, `pickContacts`, `markDuplicates` (Task 3)
- Produces: `PICKER_PENDING_KEY = 'nudge.picker.pending'` exported from `src/components/PickerSetup.jsx`; default export `PickerSetup({ onReady, onDismiss })`

- [ ] **Step 1: Write the walkthrough component**

Create `src/components/PickerSetup.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { pickerSupport } from '../lib/contacts'

export const PICKER_PENDING_KEY = 'nudge.picker.pending'

/**
 * What to say when there is no contact picker.
 *
 * On iOS the API exists but sits behind an off-by-default Safari Feature Flag, so its
 * absence means "not turned on yet" — worth walking through. Anywhere else the absence
 * is final, and inventing a settings path would send someone hunting for something that
 * isn't there.
 *
 * Only ever rendered after an explicit tap on "Choose from my contacts". Someone who
 * just wants to paste a list is never shown a browser-settings detour.
 */
export default function PickerSetup({ onReady, onDismiss }) {
  const [support, setSupport] = useState(() => pickerSupport())
  const [checkedAndMissing, setCheckedAndMissing] = useState(false)
  const needsFlag = support.state === 'needs-flag'

  // Applying the flag needs a full restart, which destroys this screen. Remember that a
  // setup was started, so Today can pick the thread back up when the app comes back.
  useEffect(() => {
    if (needsFlag) localStorage.setItem(PICKER_PENDING_KEY, '1')
  }, [needsFlag])

  function checkAgain() {
    const next = pickerSupport()
    setSupport(next)
    if (next.state === 'supported') {
      localStorage.removeItem(PICKER_PENDING_KEY)
      onReady()
    } else {
      setCheckedAndMissing(true)
    }
  }

  if (!needsFlag) {
    return (
      <div className="notice">
        <p>
          This browser doesn&rsquo;t offer a contact picker, and there&rsquo;s no setting
          that turns one on — it&rsquo;s a phone feature. Pasting a list of names works
          right here and ends up in the same place.
        </p>
        <button className="btn-quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="notice">
      <p>
        <strong>Picking from your contacts needs one switch turned on.</strong> Apple keeps
        the contact picker behind an experimental switch in Safari&rsquo;s settings, so
        it&rsquo;s off until you turn it on. It only affects Safari, and you can turn it
        back off whenever you like.
      </p>
      <ol>
        <li>
          Open <strong>Settings → Apps → Safari</strong>
        </li>
        <li>
          Tap <strong>Advanced → Feature Flags</strong>
        </li>
        <li>
          Find <strong>Contact Picker API</strong> and turn it on
        </li>
        <li>
          Come back, then fully close Nudge — swipe it away in the app switcher — and open
          it again
        </li>
      </ol>

      {checkedAndMissing && (
        <p>
          <strong>Still not there.</strong> It&rsquo;s usually one of two things: the
          Contact Picker API switch didn&rsquo;t stay on, or Nudge was only backgrounded
          rather than fully closed. Swipe it away in the app switcher and open it fresh.
        </p>
      )}

      <p className="muted">
        You don&rsquo;t have to do any of this. Pasting a list of names works right now and
        ends up in the same place.
      </p>

      <div className="row">
        <button className="btn" style={{ width: 'auto' }} onClick={checkAgain}>
          I&rsquo;ve done this — check again
        </button>
        <button className="btn-quiet" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into Import**

In `src/screens/Import.jsx`, extend the imports:

```jsx
import { markDuplicates, parseContacts, pickContacts, pickerSupport } from '../lib/contacts'
import PickerSetup, { PICKER_PENDING_KEY } from '../components/PickerSetup'
```

Add state beside the others:

```jsx
  const [setup, setSetup] = useState(false)
```

Add the handler below `review()`:

```jsx
  /**
   * Must stay inside the click's call stack — select() requires a user gesture, so an
   * await before it would lose the permission to open the picker at all.
   */
  async function onPick() {
    setError(null)
    if (pickerSupport().state !== 'supported') {
      setSetup(true)
      return
    }
    try {
      const picked = await pickContacts({ category })
      // Whoever got here has a working picker, so Today has nothing left to announce.
      localStorage.removeItem(PICKER_PENDING_KEY)
      if (picked.length) setRows(markDuplicates(picked, existing))
    } catch (e) {
      setError(`Couldn’t open your contacts: ${e.message}`)
    }
  }
```

In the `rows === null` branch, directly after the `Review …` button, add:

```jsx
          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn-quiet" onClick={onPick}>
              Or choose from my contacts
            </button>
          </div>

          {setup && (
            <PickerSetup
              onReady={() => {
                setSetup(false)
                onPick()
              }}
              onDismiss={() => setSetup(false)}
            />
          )}
```

- [ ] **Step 3: Lint and build**

Run: `npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Check both branches in a real browser**

Run `npm run dev` and open `/import` in desktop Chrome. Tap "Or choose from my contacts".
Expected: the `'unsupported'` notice — desktop Chrome has no picker and no flag for one. It must **not** show iOS Settings steps.

To see the `'needs-flag'` branch without an iPhone, temporarily make `pickerSupport()` return `{ state: 'needs-flag' }`, reload, confirm the walkthrough renders and "check again" shows the still-not-there message, then **revert the edit**.

- [ ] **Step 5: Commit**

```bash
git add src/components/PickerSetup.jsx src/screens/Import.jsx
git commit -m "Offer the contacts picker, and explain it when it isn't there

The Contact Picker is the same call on Android and on an iPhone whose owner
has enabled the Safari flag, so one feature detect covers both. Where it is
missing the honest answer differs: on iOS it is a switch away, everywhere
else no setting will ever produce one, and saying the wrong one wastes
somebody's afternoon in Settings.

The walkthrough only appears after an explicit tap. Nobody who just wants to
paste a list gets sent to their browser settings, and every state of it says
that pasting works right now with no setup."
```

---

### Task 7: Close the restart loop

Applying the flag requires quitting Nudge, which lands the person on Today with the walkthrough gone. Without this, the people who followed the instructions correctly are the ones with no signal that it worked.

**Files:**
- Modify: `src/screens/FriendList.jsx`

**Interfaces:**
- Consumes: `PICKER_PENDING_KEY` (Task 6), `pickerSupport` (Task 3)
- Produces: nothing

- [ ] **Step 1: Detect the return**

In `src/screens/FriendList.jsx`, add to the imports:

```jsx
import { pickerSupport } from '../lib/contacts'
import { PICKER_PENDING_KEY } from '../components/PickerSetup'
```

Add state beside `friends` and `loadError`:

```jsx
  const [pickerReady, setPickerReady] = useState(false)
```

Add this effect below the existing onboarding-redirect effect:

```jsx
  /**
   * Turning the Safari flag on means quitting the app, which loses the screen that was
   * asking for it. Someone who did exactly as they were told would otherwise come back
   * to no acknowledgement at all and have to remember why they went to Settings.
   */
  useEffect(() => {
    if (localStorage.getItem(PICKER_PENDING_KEY) !== '1') return
    if (pickerSupport().state !== 'supported') return
    localStorage.removeItem(PICKER_PENDING_KEY)
    setPickerReady(true)
  }, [])
```

- [ ] **Step 2: Show it**

Directly after `<PushOptIn />` in the JSX:

```jsx
      {pickerReady && (
        <div className="notice">
          <p>
            <strong>Your contacts picker is ready.</strong> That switch worked — you can
            pick people straight from your contacts now.
          </p>
          <div className="row">
            <button className="btn" style={{ width: 'auto' }} onClick={() => navigate('/import')}>
              Choose from my contacts
            </button>
            <button className="btn-quiet" onClick={() => setPickerReady(false)}>
              Later
            </button>
          </div>
        </div>
      )}
```

It cannot open the picker itself — `select()` needs a user gesture on the import screen — so this is one tap away rather than a memory test.

- [ ] **Step 3: Test it by hand**

Run `npm run dev`. In DevTools console: `localStorage.setItem('nudge.picker.pending','1')`, then reload.
Expected on desktop: **no** notice, because the picker still isn't supported and the key stays set for a device that might later have it.

Then stub support — in the console, `Object.defineProperty(navigator,'contacts',{value:{select(){}},configurable:true})` — and reload.
Expected: the notice appears, and `localStorage.getItem('nudge.picker.pending')` is now `null`. Reload again: the notice does not come back.

- [ ] **Step 4: Lint, build, commit**

```bash
npm run lint && npm run build
git add src/screens/FriendList.jsx
git commit -m "Pick the thread back up after the flag restart

Turning the Safari switch on requires quitting Nudge, and quitting Nudge
destroys the screen that asked for it. The result was that 'check again' was
only ever seen by people who did it wrong, while anyone who followed the
instructions came back to Today with no acknowledgement and had to remember
why they went to Settings in the first place.

Today now notices and offers the picker, one tap away."
```

---

### Task 8: Entry points

Import exists but nothing links to it yet. The empty list on day one is the moment it matters most.

**Files:**
- Modify: `src/screens/Onboarding.jsx`, `src/screens/People.jsx`, `src/screens/FriendList.jsx`

**Interfaces:**
- Consumes: route `/import` (Task 5)
- Produces: nothing

- [ ] **Step 1: Make onboarding survive the round trip**

`Onboarding` keeps `added` in component state, so returning from `/import` — or refreshing — arrives with an empty list and step 2 has no one to preview. Seed it from the server.

In `src/screens/Onboarding.jsx`, add `listFriends` to the `../lib/api` import and `useEffect` to the React import, then add below the `useState` block:

```jsx
  // added lives in component state, so a trip to /import or a stray refresh would come
  // back with nothing and leave step 2 with no one to preview.
  useEffect(() => {
    listFriends()
      .then((all) => setAdded((current) => (current.length ? current : all)))
      .catch(() => {})
  }, [])
```

- [ ] **Step 2: Offer import in the first run**

In `src/screens/Onboarding.jsx` step 1, immediately after the `</form>` closing tag (so the button sits outside the form and cannot submit it):

```jsx
        <div className="center" style={{ marginTop: 16 }}>
          <button className="btn-quiet" onClick={() => navigate('/import?from=welcome')}>
            Add several at once
          </button>
        </div>
```

Above the fold, beside the single-add form — not below the added list, where nobody with an empty list would scroll to find it.

- [ ] **Step 3: Offer it on People**

In `src/screens/People.jsx`, inside the existing empty state, after the "Add the first person" paragraph:

```jsx
          <button className="btn-quiet" onClick={() => navigate('/import')}>
            Add several at once
          </button>
```

and, for a list that already has people, directly above the `add-fab` button:

```jsx
      <div className="center" style={{ marginTop: 24 }}>
        <button className="btn-quiet" onClick={() => navigate('/import')}>
          Add several at once
        </button>
      </div>
```

- [ ] **Step 4: Offer it on the Today empty state**

In `src/screens/FriendList.jsx`, inside the `friends?.length === 0` empty state, after the "Add the first person you want to stay close to." paragraph:

```jsx
          <button className="btn-quiet" onClick={() => navigate('/import')}>
            Add several at once
          </button>
```

- [ ] **Step 5: Walk it in a browser**

Run `npm run dev`. With a fresh account: first run → "Add several at once" → paste three names → import → **lands back on the onboarding step 1** with those three people listed → "Done adding" → step 2 previews a real notification about one of them.

Then from People and from the Today empty state, confirm both links reach `/import` and that importing from there lands on `/people`.

**Take a screenshot of onboarding step 1** and check the new button doesn't collide with the form or the skip link.

- [ ] **Step 6: Lint, build, commit**

```bash
npm run lint && npm run build
git add src/screens/Onboarding.jsx src/screens/People.jsx src/screens/FriendList.jsx
git commit -m "Put import where the list is empty

The first run is the moment this matters: someone with nobody on their list
has nothing to be nudged about, so the app never gets to show what it is
for. The one-at-a-time form stays exactly as it was — the question it asks
does real work — with the faster door beside it rather than buried under the
list you haven't got yet.

Onboarding now seeds its added list from the server, so coming back from
import (or a stray refresh) doesn't land on step 2 with nobody to preview."
```

---

### Task 9: End-to-end verification

A green build has repeatedly hidden broken behaviour in this repo. This drives the real screen against the real database.

**Files:**
- Create: `scripts/verify-import.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: everything above
- Produces: `npm run verify:import`

- [ ] **Step 1: Write the script**

Create `scripts/verify-import.mjs`:

```js
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

function fail(message) {
  console.error(`\nFAIL: ${message}`)
  process.exit(1)
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

// --- a user to be ------------------------------------------------------------

const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
let user = users?.users?.find((u) => u.email === EMAIL)
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
const browser = await chromium.launch({
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

const shown = await page.$$eval('input[aria-label="Name"]', (els) => els.map((e) => e.value))
if (shown.length !== EXPECTED.length) {
  await browser.close()
  fail(`review list has ${shown.length} rows, expected ${EXPECTED.length}: ${shown.join(' | ')}`)
}
for (const [i, name] of EXPECTED.entries()) {
  if (shown[i] !== name) {
    await browser.close()
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
  await browser.close()
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

const boxes = await page.$$eval('input[type="checkbox"]', (els) => els.map((e) => e.checked))
if (boxes[0] !== false) fail('an existing friend was not unchecked in the review list')
if (boxes[1] !== true) fail('a new person was wrongly unchecked')
const meta = await page.locator('.card').first().locator('.friend-meta').textContent()
if (!meta.includes('already on your list')) fail('the duplicate was not labelled')
console.log('✓ someone already on the list arrives unchecked and labelled')

await browser.close()

// Leave the database as we found it.
await admin.from('friends').delete().eq('user_id', user.id)
await admin.auth.admin.deleteUser(user.id)

console.log('\nPASS')
```

- [ ] **Step 2: Add the script**

In `package.json` `"scripts"`, after `"verify:feedback"`:

```json
    "verify:import": "node scripts/verify-import.mjs",
```

- [ ] **Step 3: Run it**

```bash
npm run dev   # in another terminal
SUPABASE_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... npm run verify:import
```

Expected: every `✓` line, then `PASS`. If a row order assertion fails, check whether `listFriends()` ordering changed — the review list preserves paste order, but My people sorts by `days_overdue`.

- [ ] **Step 4: Document it**

In `README.md`, in the "Verifying" block, add beneath `verify:feedback`:

```
npm run verify:import    # pastes a list, checks the review list, imports, reads the rows back
```

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-import.mjs package.json README.md
git commit -m "Verify import against the real thing

Unit tests prove the parsing rules; they cannot prove the screen talks to
the database properly, and in this repo a green build has hidden broken
behaviour more than once.

The pasted block carries every awkward shape the parser claims to handle, so
a regression in any one of them fails the run. It also checks the two things
most likely to break quietly: that a hand-set category survives a later
change to the batch selector, and that the triggers seeded a cadence for
every row of the bulk insert rather than just the first."
```

---

## Done when

- `npm test` passes.
- `npm run lint && npm run build` are clean.
- `npm run verify:import` prints PASS.
- On a real iPhone with the Safari flag on, the picker opens inside the installed app — the one assumption in the spec that no amount of local testing can settle. If it does not, collapse `'needs-flag'` into `'unsupported'` in `pickerSupport()` and delete `PickerSetup`'s walkthrough branch; nothing else changes.
