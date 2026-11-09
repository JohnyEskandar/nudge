// Who, if anyone, today's nudge is about. One user at a time, no I/O.
//
// Every nudge closes: it names one person, that person rests for a week whatever happens,
// and the user chooses how often there is a nudge at all. A quarter of new episodes are
// held out (recorded, never pushed) so the test can tell a nudge from what would have
// happened anyway. This file is pure so the rules can be tested and replayed day by day;
// daily-nudge does the reading and writing around it.

import { daysBetween } from './dates.ts'

export type Frequency = 'daily' | 'few_weekly' | 'weekly'
export type Assignment = 'nudged' | 'holdout'
export type CopyVariant = 'plain' | 'reason'
export type Reason = 'overdue' | 'birthday'

/** Placeholder until the founder sets the default (Sun Nov 15). */
export const DEFAULT_FREQUENCY: Frequency = 'few_weekly'
export const COOLDOWN_DAYS = 7
export const HOLDOUT_RATE = 0.25
export const HOLDOUT_WINDOW_DAYS = 7
/** Least number of days between two nudges, by frequency. */
export const MIN_GAP_DAYS: Record<Frequency, number> = { daily: 1, few_weekly: 2, weekly: 7 }

export type FriendRow = {
  id: string
  name: string
  nudge_style: string
  /** null when paused ("we see each other all the time"). */
  days_overdue: number | null
  paused: boolean
  birthday_in_days: number | null
  snoozed_until: string | null
}

export type OpenEpisode = {
  id: string
  friend_id: string
  assignment: Assignment
  started_on: string
  copy_variant: CopyVariant
}

export type PastItem = {
  friend_id: string
  local_date: string
  assignment: Assignment
  reason: Reason
}

export type UserState = {
  today: string
  frequency: Frequency
  /** Everyone due, plus anyone with a birthday today. */
  friends: FriendRow[]
  openEpisodes: OpenEpisode[]
  /** Items from at least the last COOLDOWN_DAYS days. */
  recentItems: PastItem[]
}

export type NewEpisode = OpenEpisode
export type NewItem = {
  id: string
  episode_id: string | null
  friend_id: string
  reason: Reason
  assignment: Assignment
  days_overdue: number | null
  local_date: string
}

export type Decision = {
  close: { id: string; reason: 'holdout_window_end' | 'not_due' }[]
  newEpisodes: NewEpisode[]
  items: NewItem[]
  push: { item_id: string; friend: FriendRow; reason: Reason; copy_variant: CopyVariant } | null
  skipped: null | 'already_today' | 'frequency' | 'nobody_eligible'
}

export type Deps = { random: () => number; newId: () => string }

const isDue = (f: FriendRow) => !f.paused && f.days_overdue !== null && f.days_overdue >= 0

export function decide(s: UserState, deps: Deps): Decision {
  const d: Decision = { close: [], newEpisodes: [], items: [], push: null, skipped: null }
  const byId = new Map(s.friends.map((f) => [f.id, f]))

  // ---- close what is over, whether or not anyone is nudged today
  const open = new Map<string, OpenEpisode>()
  for (const ep of s.openEpisodes) {
    const f = byId.get(ep.friend_id)
    if (!f || !isDue(f)) {
      d.close.push({ id: ep.id, reason: 'not_due' })
    } else if (
      ep.assignment === 'holdout' &&
      daysBetween(ep.started_on, s.today) >= HOLDOUT_WINDOW_DAYS
    ) {
      d.close.push({ id: ep.id, reason: 'holdout_window_end' })
    } else {
      open.set(ep.friend_id, ep)
    }
  }

  // ---- when each person (and the user) was last nudged
  const lastNudged = new Map<string, string>()
  let lastAny: string | null = null
  for (const it of s.recentItems) {
    if (it.assignment !== 'nudged') continue
    const prev = lastNudged.get(it.friend_id)
    if (!prev || it.local_date > prev) lastNudged.set(it.friend_id, it.local_date)
    if (!lastAny || it.local_date > lastAny) lastAny = it.local_date
  }

  if (lastAny === s.today) {
    d.skipped = 'already_today'
    return d
  }

  // ---- a birthday is once, on the day, and outranks the user's pace
  const snoozedPast = (f: FriendRow) => f.snoozed_until !== null && f.snoozed_until > s.today
  const birthday = s.friends
    .filter((f) => f.birthday_in_days === 0 && !f.paused && !snoozedPast(f))
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  if (birthday) {
    const item: NewItem = {
      id: deps.newId(),
      episode_id: null,
      friend_id: birthday.id,
      reason: 'birthday',
      assignment: 'nudged',
      days_overdue: birthday.days_overdue,
      local_date: s.today,
    }
    d.items.push(item)
    d.push = { item_id: item.id, friend: birthday, reason: 'birthday', copy_variant: 'plain' }
    return d
  }

  if (lastAny && daysBetween(lastAny, s.today) < MIN_GAP_DAYS[s.frequency]) {
    d.skipped = 'frequency'
    return d
  }

  // ---- candidates, in rotation order
  const rested = (f: FriendRow) => {
    const last = lastNudged.get(f.id)
    return !last || daysBetween(last, s.today) >= COOLDOWN_DAYS
  }
  const candidates = s.friends
    .filter((f) => isDue(f) && rested(f) && open.get(f.id)?.assignment !== 'holdout')
    .sort((a, b) => {
      const la = lastNudged.get(a.id) ?? ''
      const lb = lastNudged.get(b.id) ?? ''
      if (la !== lb) return la < lb ? -1 : 1 // never ('') first, then least recent
      if (a.days_overdue !== b.days_overdue) return b.days_overdue! - a.days_overdue!
      return a.name.localeCompare(b.name)
    })

  for (const f of candidates) {
    let ep = open.get(f.id)
    if (!ep) {
      ep = {
        id: deps.newId(),
        friend_id: f.id,
        assignment: deps.random() < HOLDOUT_RATE ? 'holdout' : 'nudged',
        copy_variant: deps.random() < 0.5 ? 'reason' : 'plain',
        started_on: s.today,
      }
      d.newEpisodes.push(ep)
    }

    const item: NewItem = {
      id: deps.newId(),
      episode_id: ep.id,
      friend_id: f.id,
      reason: 'overdue',
      assignment: ep.assignment,
      days_overdue: f.days_overdue,
      local_date: s.today,
    }
    d.items.push(item)

    if (ep.assignment === 'nudged') {
      d.push = { item_id: item.id, friend: f, reason: 'overdue', copy_variant: ep.copy_variant }
      return d
    }
  }

  d.skipped = 'nobody_eligible'
  return d
}

