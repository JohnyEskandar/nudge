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
