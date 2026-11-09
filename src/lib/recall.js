import { addDays } from '../../supabase/functions/_shared/dates.ts'

export const RECALL_MAX = 6

const weekday = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
}

/** A small seeded shuffle, so the list is mixed but stays the same all week. */
function shuffled(list, seedText) {
  let h = 2166136261
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The Sunday recall: "Who did you talk to this week?" over everyone who came up in the
 * week ending Sunday, nudged and held out alike and mixed together. It is the one question
 * both groups are asked in the same words, which is what lets the test say whether a
 * nudge made a difference. Shown Sunday, or Monday if Sunday was missed; answered once.
 *
 * Returns { week, people: [{ friend, itemId }] } or null.
 */
export function recallFor(items, friends, today) {
  const day = weekday(today)
  if (day !== 0 && day !== 1) return null
  const sunday = day === 0 ? today : addDays(today, -1)
  const from = addDays(sunday, -6)

  const inWeek = items.filter((it) => it.local_date >= from && it.local_date <= sunday)
  if (inWeek.some((it) => it.recall_at)) return null

  const byId = new Map(friends.map((f) => [f.id, f]))
  const latest = new Map()
  for (const it of inWeek) {
    if (it.reason !== 'overdue' || !byId.has(it.friend_id)) continue
    const prev = latest.get(it.friend_id)
    if (!prev || it.local_date > prev.local_date) latest.set(it.friend_id, it)
  }
  if (latest.size === 0) return null

  const people = shuffled(
    [...latest.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    sunday,
  )
    .slice(0, RECALL_MAX)
    .map((it) => ({ friend: byId.get(it.friend_id), itemId: it.id }))

  return { week: sunday, people }
}
