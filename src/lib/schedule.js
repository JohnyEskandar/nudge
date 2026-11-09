import { addDays, daysBetween } from '../../supabase/functions/_shared/dates.ts'

/**
 * When someone comes due for the first time.
 *
 * Two bugs used to live here. A new person's clock started the day they were added, so
 * nobody but family came due for months; and a batch import gave everyone the same start
 * and the same cadence, so sixty people came due on the same morning. Asking "when did
 * you last talk?" fixes the first; spreading first due dates across the least crowded
 * days fixes the second.
 *
 * The day counts behind each answer are estimates, not anything the user said exactly.
 */
export const LAST_TALKED = [
  { value: 'week', label: 'This week', daysAgo: 3 },
  { value: 'month', label: 'This month', daysAgo: 15 },
  { value: 'months', label: 'A few months ago', daysAgo: 90 },
  { value: 'longer', label: 'Longer than that', daysAgo: 240 },
  { value: 'often', label: 'We see each other all the time', paused: true },
]

/** Someone long overdue lands somewhere in the next three weeks. */
export const STAGGER_WINDOW_DAYS = 21
/** Someone not yet due moves at most this far from their natural date to find a quiet day. */
const NEAR_NATURAL_DAYS = 10

const answerFor = (value) => LAST_TALKED.find((o) => o.value === value) ?? null

/**
 * people: [{ key, cadence, lastTalked }] — lastTalked is a LAST_TALKED value or null.
 * today: ISO date; startOn: the user's "start nudging on" date or null; existingDue: the
 * due dates of everyone already on the list, so new people avoid crowded days too.
 *
 * Returns Map<key, { clock_start, first_due_on, paused }>, the shape apply_schedule takes.
 */
export function planSchedule(people, { today, startOn, existingDue }) {
  const start = startOn && startOn > today ? startOn : today
  const load = new Map()
  for (const d of existingDue) if (d) load.set(d, (load.get(d) ?? 0) + 1)

  const plan = new Map()
  const toPlace = []
  for (const p of people) {
    const answer = answerFor(p.lastTalked)
    if (answer?.paused) {
      plan.set(p.key, { clock_start: null, first_due_on: null, paused: true })
      continue
    }
    const clockStart = answer ? addDays(today, -answer.daysAgo) : null
    const natural = addDays(clockStart ?? today, p.cadence)
    toPlace.push({ key: p.key, clockStart, natural })
  }

  // The longest-waiting go first, so they get the earliest quiet days.
  toPlace.sort((a, b) => (a.natural < b.natural ? -1 : a.natural > b.natural ? 1 : 0))

  const firstDay = addDays(start, 1)
  for (const p of toPlace) {
    const lo = p.natural < firstDay ? firstDay : maxDate(firstDay, addDays(p.natural, -NEAR_NATURAL_DAYS))
    const target = maxDate(p.natural, firstDay)

    let best = null
    for (let i = 0; i < STAGGER_WINDOW_DAYS; i++) {
      const day = addDays(lo, i)
      const score = [load.get(day) ?? 0, Math.abs(daysBetween(target, day)), i]
      if (!best || lessThan(score, best.score)) best = { day, score }
    }

    load.set(best.day, (load.get(best.day) ?? 0) + 1)
    plan.set(p.key, { clock_start: p.clockStart, first_due_on: best.day, paused: false })
  }

  return plan
}

const maxDate = (a, b) => (a > b ? a : b)

function lessThan(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}
