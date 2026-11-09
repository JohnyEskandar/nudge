// The 14-day replay: run the picker day after day, the way the cron would, and check the
// promises hold for a heavy importer (the founder's 64-due wall) and for a fresh user.
// Nobody acts on a nudge here, which is the worst case for repeats.

import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from './dates.ts'
import { decide, type Frequency, type FriendRow, type OpenEpisode, type PastItem } from './pick.ts'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const START = '2026-11-23'

function people(n: number, due: number): FriendRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Person ${String(i).padStart(2, '0')}`,
    nudge_style: 'check_in',
    days_overdue: i < due ? i : -(i + 1),
    paused: false,
    birthday_in_days: null,
    snoozed_until: null,
  }))
}

function replay(friends: FriendRow[], frequency: Frequency, seed: number, days = 14) {
  const random = mulberry32(seed)
  let id = 0
  let open: OpenEpisode[] = []
  const items: PastItem[] = []
  const pushes: { day: string; friend: string }[] = []
  const episodes: OpenEpisode[] = []
  let list = friends.map((f) => ({ ...f }))

  for (let d = 0; d < days; d++) {
    const today = addDays(START, d)
    const decision = decide(
      {
        today,
        frequency,
        friends: list.filter((f) => f.days_overdue !== null && f.days_overdue >= 0),
        openEpisodes: open,
        recentItems: items.filter((i) => daysBetween(i.local_date, today) <= 14),
      },
      { random, newId: () => `x${++id}` },
    )
    const closed = new Set(decision.close.map((c) => c.id))
    open = open.filter((e) => !closed.has(e.id)).concat(decision.newEpisodes)
    episodes.push(...decision.newEpisodes)
    for (const it of decision.items) items.push(it)
    if (decision.push) pushes.push({ day: today, friend: decision.push.friend.id })
    list = list.map((f) => ({ ...f, days_overdue: (f.days_overdue ?? 0) + 1 }))
  }
  return { pushes, episodes }
}

function assertNoRepeatWithinSeven(pushes: { day: string; friend: string }[]) {
  const last = new Map<string, string>()
  for (const p of pushes) {
    const prev = last.get(p.friend)
    if (prev) expect(daysBetween(prev, p.day)).toBeGreaterThanOrEqual(7)
    last.set(p.friend, p.day)
  }
}

describe('14-day replay', () => {
  it('a heavy importer on a few-times-a-week pace: capped, rested, never two days running', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { pushes } = replay(people(65, 64), 'few_weekly', seed)
      expect(new Set(pushes.map((p) => p.day)).size).toBe(pushes.length) // one a day at most
      expect(pushes.length).toBeGreaterThanOrEqual(5)
      expect(pushes.length).toBeLessThanOrEqual(7)
      for (let i = 1; i < pushes.length; i++) {
        expect(daysBetween(pushes[i - 1].day, pushes[i].day)).toBeGreaterThanOrEqual(2)
      }
      assertNoRepeatWithinSeven(pushes)
    }
  })

  it('daily: one push a day, fourteen different people', () => {
    const { pushes } = replay(people(65, 64), 'daily', 7)
    expect(pushes).toHaveLength(14)
    expect(new Set(pushes.map((p) => p.friend)).size).toBe(14)
  })

  it('weekly: two pushes in two weeks', () => {
    const { pushes } = replay(people(65, 64), 'weekly', 3)
    expect(pushes).toHaveLength(2)
  })

  it('a fresh user with two people due is never nudged about one of them twice in a week', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { pushes } = replay(people(5, 2), 'daily', seed)
      assertNoRepeatWithinSeven(pushes)
    }
  })

  it('holds out about a quarter of new episodes', () => {
    let held = 0
    let total = 0
    for (let seed = 1; seed <= 200; seed++) {
      const { episodes } = replay(people(65, 64), 'daily', seed)
      held += episodes.filter((e) => e.assignment === 'holdout').length
      total += episodes.length
    }
    const share = held / total
    expect(share).toBeGreaterThan(0.2)
    expect(share).toBeLessThan(0.3)
  })
})
