import { addDays } from '../../supabase/functions/_shared/dates.ts'

/**
 * Did the reach-out lead anywhere? A text matters most when it turns into a reply, a call
 * or time together, so the app asks, gently and inside the app only (never a push):
 * "Did they write back?" a day or so after a text, and "How was it?" the day after a plan.
 * None of this changes who is nudged or when.
 */

const ASK_REPLY_DAYS = 4
const WAITING_DAYS = 14
const ASK_PLAN_DAYS = 7

const newestFirst = (key) => (a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0)

/** { interaction, friend } for the most recent unanswered text from 1 to 4 days ago, or null. */
export function pendingReply(interactions, friends, today) {
  const byId = new Map(friends.map((f) => [f.id, f]))
  const earliest = addDays(today, -ASK_REPLY_DAYS)
  const askable = interactions
    .filter(
      (i) =>
        i.kind === 'reached_out' &&
        (i.outcome == null || (i.outcome === 'not_yet' && !(i.outcome_at ?? '').startsWith(today))) &&
        i.date < today &&
        i.date >= earliest &&
        byId.has(i.friend_id),
    )
    .sort(newestFirst('date'))
  const interaction = askable[0]
  return interaction ? { interaction, friend: byId.get(interaction.friend_id) } : null
}

/** One person's interactions, newest first: is a text still waiting on a reply? */
export function waitingOnReply(interactions, today) {
  const latest = [...interactions].sort(newestFirst('date'))[0]
  return Boolean(
    latest &&
      latest.kind === 'reached_out' &&
      (latest.outcome == null || latest.outcome === 'not_yet') &&
      latest.date >= addDays(today, -WAITING_DAYS),
  )
}

/** { plan, friend } for an unanswered plan from 1 to 7 days ago, or null. */
export function pendingPlan(plans, friends, today) {
  const byId = new Map(friends.map((f) => [f.id, f]))
  const earliest = addDays(today, -ASK_PLAN_DAYS)
  const plan = plans
    .filter((p) => p.outcome == null && p.on_date < today && p.on_date >= earliest && byId.has(p.friend_id))
    .sort(newestFirst('on_date'))[0]
  return plan ? { plan, friend: byId.get(plan.friend_id) } : null
}
