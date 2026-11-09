import { addDays } from '../../supabase/functions/_shared/dates.ts'

/** Ask about a nudge for this many days after it, then let it go. */
const ASK_FOR_DAYS = 3

/**
 * The next-open question: "Did you reach Maya?" about the most recent nudge from before
 * today that nobody has answered, provided the contact isn't already logged. Most
 * reach-outs happen in Messages, where the app cannot see them, so this is how they are
 * counted at all. Held-out people are never asked about here (only in the Sunday recall),
 * so the two groups are compared on the same question.
 *
 * Returns { item, friend } or null.
 */
export function pendingConfirm(items, friends, today) {
  const byId = new Map(friends.map((f) => [f.id, f]))
  const earliest = addDays(today, -ASK_FOR_DAYS)

  const candidates = items
    .filter(
      (it) =>
        it.assignment === 'nudged' &&
        it.answer == null &&
        it.local_date < today &&
        it.local_date >= earliest,
    )
    .sort((a, b) => (a.local_date < b.local_date ? 1 : a.local_date > b.local_date ? -1 : 0))

  for (const item of candidates) {
    const friend = byId.get(item.friend_id)
    if (!friend) continue
    if (friend.last_interaction_date && friend.last_interaction_date >= item.local_date) continue
    return { item, friend }
  }
  return null
}
