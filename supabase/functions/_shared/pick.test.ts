import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from './dates.ts'
import { decide, type FriendRow, type OpenEpisode, type PastItem, type UserState } from './pick.ts'

const TODAY = '2026-11-23'

function friend(over: Partial<FriendRow> & { id: string }): FriendRow {
  return {
    name: over.id.toUpperCase(),
    nudge_style: 'check_in',
    days_overdue: 0,
    paused: false,
    birthday_in_days: null,
    snoozed_until: null,
    ...over,
  }
}

function state(over: Partial<UserState> = {}): UserState {
  return {
    today: TODAY,
    frequency: 'daily',
    friends: [],
    openEpisodes: [],
    recentItems: [],
    ...over,
  }
}

/** random() returns each value in turn, then 0.99 forever (nudged, plain). */
function deps(randoms: number[] = []) {
  let n = 0
  let id = 0
  return {
    random: () => (n < randoms.length ? randoms[n++] : 0.99),
    newId: () => `id-${++id}`,
  }
}

const nudgedItem = (friend_id: string, local_date: string): PastItem => ({
  friend_id,
  local_date,
  assignment: 'nudged',
  reason: 'overdue',
})

describe('dates', () => {
  it('adds days across a month end', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('counts days between two dates', () => {
    expect(daysBetween('2026-11-16', '2026-11-23')).toBe(7)
    expect(daysBetween('2026-11-23', '2026-11-16')).toBe(-7)
  })
})

describe('closing episodes', () => {
  it('closes a holdout episode once its 7-day window has passed', () => {
    const old: OpenEpisode = {
      id: 'e1',
      friend_id: 'a',
      assignment: 'holdout',
      started_on: addDays(TODAY, -7),
      copy_variant: 'plain',
    }
    const recent: OpenEpisode = { ...old, id: 'e2', friend_id: 'b', started_on: addDays(TODAY, -6) }
    const d = decide(
      state({ friends: [friend({ id: 'a' }), friend({ id: 'b' })], openEpisodes: [old, recent] }),
      deps(),
    )
    expect(d.close).toEqual([{ id: 'e1', reason: 'holdout_window_end' }])
  })

  it('closes episodes whose friend is gone, paused or no longer due', () => {
    const ep = (id: string, friend_id: string): OpenEpisode => ({
      id,
      friend_id,
      assignment: 'nudged',
      started_on: addDays(TODAY, -2),
      copy_variant: 'plain',
    })
    const d = decide(
      state({
        friends: [
          friend({ id: 'paused', paused: true, days_overdue: null }),
          friend({ id: 'early', days_overdue: -4 }),
          friend({ id: 'due', days_overdue: 3 }),
        ],
        openEpisodes: [ep('e1', 'gone'), ep('e2', 'paused'), ep('e3', 'early'), ep('e4', 'due')],
      }),
      deps(),
    )
    expect(d.close.map((c) => c.id).sort()).toEqual(['e1', 'e2', 'e3'])
    expect(d.close.every((c) => c.reason === 'not_due')).toBe(true)
  })
})

describe('how often', () => {
  it('sends nothing more once someone was nudged today', () => {
    const d = decide(
      state({
        friends: [friend({ id: 'a' }), friend({ id: 'b' })],
        recentItems: [nudgedItem('a', TODAY)],
      }),
      deps(),
    )
    expect(d.push).toBeNull()
    expect(d.skipped).toBe('already_today')
  })

  it('a few times a week waits a day between nudges', () => {
    const yesterday = state({
      frequency: 'few_weekly',
      friends: [friend({ id: 'a' }), friend({ id: 'b' })],
      recentItems: [nudgedItem('a', addDays(TODAY, -1))],
    })
    expect(decide(yesterday, deps()).skipped).toBe('frequency')

    const twoDaysAgo = { ...yesterday, recentItems: [nudgedItem('a', addDays(TODAY, -2))] }
    expect(decide(twoDaysAgo, deps()).push?.friend.id).toBe('b')
  })

  it('weekly waits seven days', () => {
    const s = state({
      frequency: 'weekly',
      friends: [friend({ id: 'a' }), friend({ id: 'b' })],
      recentItems: [nudgedItem('a', addDays(TODAY, -6))],
    })
    expect(decide(s, deps()).skipped).toBe('frequency')
    expect(
      decide({ ...s, recentItems: [nudgedItem('a', addDays(TODAY, -7))] }, deps()).push,
    ).not.toBeNull()
  })

  it('daily nudges every day', () => {
    const s = state({
      friends: [friend({ id: 'a' }), friend({ id: 'b' })],
      recentItems: [nudgedItem('a', addDays(TODAY, -1))],
    })
    expect(decide(s, deps()).push?.friend.id).toBe('b')
  })
})

describe('birthdays', () => {
  it('pushes a birthday on the day, past the frequency gate, with no episode or draw', () => {
    const d = decide(
      state({
        frequency: 'weekly',
        friends: [friend({ id: 'a' }), friend({ id: 'bday', days_overdue: -20, birthday_in_days: 0 })],
        recentItems: [nudgedItem('a', addDays(TODAY, -1))],
      }),
      deps([0.0]),
    )
    expect(d.push?.friend.id).toBe('bday')
    expect(d.push?.reason).toBe('birthday')
    expect(d.newEpisodes).toEqual([])
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toMatchObject({ reason: 'birthday', episode_id: null, assignment: 'nudged' })
  })

  it('does not push a birthday on the days before it', () => {
    const d = decide(
      state({ friends: [friend({ id: 'bday', days_overdue: -20, birthday_in_days: 2 })] }),
      deps(),
    )
    expect(d.push).toBeNull()
  })

  it('respects a snooze', () => {
    const d = decide(
      state({
        friends: [
          friend({
            id: 'bday',
            days_overdue: -3,
            birthday_in_days: 0,
            snoozed_until: addDays(TODAY, 3),
          }),
        ],
      }),
      deps(),
    )
    expect(d.push).toBeNull()
  })

  it('does not push a birthday for someone being held out', () => {
    const d = decide(
      state({
        friends: [friend({ id: 'bday', days_overdue: 3, birthday_in_days: 0 })],
        openEpisodes: [
          { id: 'e1', friend_id: 'bday', assignment: 'holdout', started_on: addDays(TODAY, -2), copy_variant: 'plain' },
        ],
      }),
      deps(),
    )
    expect(d.push).toBeNull()
  })

  it('does not push a birthday for someone nudged in the last 7 days', () => {
    const d = decide(
      state({
        friends: [friend({ id: 'bday', days_overdue: 3, birthday_in_days: 0 })],
        recentItems: [nudgedItem('bday', addDays(TODAY, -1))],
      }),
      deps(),
    )
    expect(d.push).toBeNull()
  })

  it('stays quiet before the user\'s start date, birthdays included', () => {
    const d = decide(
      state({
        startOn: addDays(TODAY, 10),
        friends: [friend({ id: 'bday', days_overdue: -10, birthday_in_days: 0 })],
      }),
      deps(),
    )
    expect(d.push).toBeNull()
  })

  it('respects a pause', () => {
    const d = decide(
      state({ friends: [friend({ id: 'bday', paused: true, days_overdue: null, birthday_in_days: 0 })] }),
      deps(),
    )
    expect(d.push).toBeNull()
  })
})

describe('who', () => {
  it('never names someone nudged in the last 7 days', () => {
    const s = state({
      friends: [friend({ id: 'a', days_overdue: 50 })],
      recentItems: [nudgedItem('a', addDays(TODAY, -6))],
    })
    expect(decide(s, deps()).push).toBeNull()
    expect(decide(s, deps()).skipped).toBe('nobody_eligible')
    const s7 = { ...s, recentItems: [nudgedItem('a', addDays(TODAY, -7))] }
    expect(decide(s7, deps()).push?.friend.id).toBe('a')
  })

  it('skips someone who is being held out', () => {
    const d = decide(
      state({
        friends: [friend({ id: 'held', days_overdue: 40 }), friend({ id: 'b', days_overdue: 1 })],
        openEpisodes: [
          {
            id: 'e1',
            friend_id: 'held',
            assignment: 'holdout',
            started_on: addDays(TODAY, -2),
            copy_variant: 'plain',
          },
        ],
      }),
      deps(),
    )
    expect(d.push?.friend.id).toBe('b')
  })

  it('skips paused and not-yet-due people', () => {
    const d = decide(
      state({
        friends: [
          friend({ id: 'p', paused: true, days_overdue: null }),
          friend({ id: 'early', days_overdue: -1 }),
        ],
      }),
      deps(),
    )
    expect(d.push).toBeNull()
  })

  it('rotates: never nudged first, then least recently, then most overdue, then name', () => {
    const friends = [
      friend({ id: 'recent', days_overdue: 90 }),
      friend({ id: 'older', days_overdue: 10 }),
      friend({ id: 'fresh-b', days_overdue: 5 }),
      friend({ id: 'fresh-a', days_overdue: 5, name: 'AAA' }),
      friend({ id: 'fresh-big', days_overdue: 30 }),
    ]
    const recentItems = [nudgedItem('recent', addDays(TODAY, -8)), nudgedItem('older', addDays(TODAY, -12))]
    const order: string[] = []
    let s = state({ friends, recentItems })
    for (let i = 0; i < 5; i++) {
      const d = decide(s, deps())
      order.push(d.push!.friend.id)
      s = { ...s, friends: s.friends.filter((f) => f.id !== d.push!.friend.id) }
    }
    expect(order).toEqual(['fresh-big', 'fresh-a', 'fresh-b', 'older', 'recent'])
  })

  it('names one person and records one item', () => {
    const d = decide(
      state({ friends: [friend({ id: 'a' }), friend({ id: 'b' }), friend({ id: 'c' })] }),
      deps(),
    )
    expect(d.push).not.toBeNull()
    expect(d.items.filter((i) => i.assignment === 'nudged')).toHaveLength(1)
  })
})

describe('episodes and the holdout', () => {
  it('joins an open nudged episode without a new draw', () => {
    const ep: OpenEpisode = {
      id: 'e1',
      friend_id: 'a',
      assignment: 'nudged',
      started_on: addDays(TODAY, -8),
      copy_variant: 'reason',
    }
    const d = decide(state({ friends: [friend({ id: 'a' })], openEpisodes: [ep] }), deps([0.0]))
    expect(d.newEpisodes).toEqual([])
    expect(d.items[0]).toMatchObject({ episode_id: 'e1', assignment: 'nudged' })
    expect(d.push?.copy_variant).toBe('reason')
  })

  it('holds out a new episode on a draw under 0.25 and nudges the next person', () => {
    const d = decide(
      state({ friends: [friend({ id: 'a', days_overdue: 9 }), friend({ id: 'b', days_overdue: 1 })] }),
      deps([0.1, 0.3]),
    )
    expect(d.newEpisodes.map((e) => [e.friend_id, e.assignment])).toEqual([
      ['a', 'holdout'],
      ['b', 'nudged'],
    ])
    expect(d.items.map((i) => [i.friend_id, i.assignment])).toEqual([
      ['a', 'holdout'],
      ['b', 'nudged'],
    ])
    expect(d.push?.friend.id).toBe('b')
    expect(d.items[1].episode_id).toBe(d.newEpisodes[1].id)
    expect(d.push?.item_id).toBe(d.items[1].id)
  })

  it('records plain copy while there is no reason copy to test', () => {
    const d = decide(state({ friends: [friend({ id: 'a' })] }), deps([0.5, 0.2]))
    expect(d.newEpisodes[0].copy_variant).toBe('plain')
  })

  it('draws the copy variant per episode once the reason arm is on', () => {
    const on = (r: number[]) => ({ ...deps(r), reasonArm: true })
    expect(decide(state({ friends: [friend({ id: 'a' })] }), on([0.5, 0.2])).newEpisodes[0].copy_variant).toBe('reason')
    expect(decide(state({ friends: [friend({ id: 'a' })] }), on([0.5, 0.7])).newEpisodes[0].copy_variant).toBe('plain')
  })

  it('records holdouts even when nobody is left to push', () => {
    const d = decide(state({ friends: [friend({ id: 'a' })] }), deps([0.1]))
    expect(d.push).toBeNull()
    expect(d.newEpisodes[0].assignment).toBe('holdout')
    expect(d.skipped).toBe('nobody_eligible')
  })

  it('starts episodes on today', () => {
    const d = decide(state({ friends: [friend({ id: 'a' })] }), deps())
    expect(d.newEpisodes[0].started_on).toBe(TODAY)
    expect(d.items[0].local_date).toBe(TODAY)
  })
})
