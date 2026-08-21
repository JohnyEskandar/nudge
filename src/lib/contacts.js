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

import { isIOS } from './device'

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
    .replace(/[<>|;:]/g, ' ')
    .replace(/,\s*$/, ' ')
    .replace(/^\s*,\s*/, ' ')
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
 *
 * Blank lines are dropped *before* the count, because a trailing newline is invisible and
 * you get one from nearly everywhere: a spreadsheet cell copy (Excel and Sheets append
 * \r\n), a copied line in Notes, or just pressing Enter after pasting. Counting it would
 * make "Maya, Tom, Ana\n" look like a multi-line list and turn three people into one
 * person named after all three.
 */
function splitSegments(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length > 1) return lines
  const parts = (lines[0] ?? '').split(',')
  return parts.length > 1 ? mergePhoneOnly(parts) : parts
}

/**
 * "Maya Okonkwo, +1 555 010 1234" is one person, not a person and a fragment. Without
 * this the split strands the number in a segment with no name, and it is dropped
 * without anyone seeing it happen.
 *
 * A phone-only segment merges backward into a preceding name if one exists.
 * If there's no preceding segment but a following segment exists, it merges
 * forward instead — this prevents leading phones from being dropped silently.
 */
function mergePhoneOnly(parts) {
  const merged = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const { phone, rest } = takePhone(stripDecoration(part))
    const isPhoneOnly = phone && !cleanName(rest)
    if (isPhoneOnly) {
      if (merged.length > 0) {
        // Merge backward into the preceding segment, but only if it doesn't already have a phone
        const lastSegment = merged[merged.length - 1]
        const { phone: lastPhone } = takePhone(stripDecoration(lastSegment))
        if (!lastPhone) {
          merged[merged.length - 1] += `,${part}`
        }
        // If the preceding segment already has a phone, drop this one (already flagged)
      } else if (i + 1 < parts.length) {
        // Merge forward into the following segment
        parts[i + 1] = `${part},${parts[i + 1]}`
      }
      // If no preceding or following segment, drop this phone-only segment (no name to attach to)
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

/**
 * Marks candidates who are already on the list, so importing twice doesn't quietly
 * create a second Maya. Duplicates arrive unchecked but visible — silently removing
 * them would leave someone wondering which of their names went missing.
 *
 * Re-run after a name is edited, which is why it only ever unticks a row on the
 * *transition* into duplicate status. Ticking a duplicate back on is a real choice —
 * you may well want this person twice — and re-running the check over the whole list
 * because some other row was edited must not quietly undo it. After the first flag the
 * checkbox belongs to the user, in both directions.
 */
export function markDuplicates(candidates, existingFriends) {
  const taken = new Set((existingFriends ?? []).map((f) => normalizeName(f.name)))

  return candidates.map((c) => {
    const isDuplicate = taken.has(normalizeName(c.name))
    if (isDuplicate) {
      if (c.note === 'duplicate') return c // already flagged; the checkbox is theirs now
      return { ...c, note: 'duplicate', include: false }
    }
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
