import { describe, expect, it } from 'vitest'
import { recallFor, RECALL_MAX } from './recall'

// 2026-11-29 is a Sunday.
const SUNDAY = '2026-11-29'
const friend = (id) => ({ id, name: id.toUpperCase() })
const item = (id, friend_id, local_date, over = {}) => ({
  id,
  friend_id,
  local_date,
  assignment: 'nudged',
  reason: 'overdue',
  recall_at: null,
  ...over,
})

describe('recallFor', () => {
  it('shows on Sunday, mixing nudged and held-out people from the past week', () => {
    const items = [
      item('i1', 'a', '2026-11-23'),
      item('i2', 'b', '2026-11-25', { assignment: 'holdout' }),
      item('i3', 'c', SUNDAY),
    ]
    const r = recallFor(items, [friend('a'), friend('b'), friend('c')], SUNDAY)
    expect(r.week).toBe(SUNDAY)
    expect(r.people.map((p) => p.friend.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('still shows on Monday for the week that ended Sunday, and not on Tuesday', () => {
    const items = [item('i1', 'a', '2026-11-24')]
    expect(recallFor(items, [friend('a')], '2026-11-30').week).toBe(SUNDAY)
    expect(recallFor(items, [friend('a')], '2026-12-01')).toBeNull()
    expect(recallFor(items, [friend('a')], '2026-11-28')).toBeNull()
  })

  it('leaves out items from before the week', () => {
    const r = recallFor([item('i1', 'a', '2026-11-22'), item('i2', 'b', '2026-11-23')], [friend('a'), friend('b')], SUNDAY)
    expect(r.people.map((p) => p.friend.id)).toEqual(['b'])
  })

  it('leaves out birthdays, which are not part of the test', () => {
    const r = recallFor([item('i1', 'a', '2026-11-24', { reason: 'birthday' })], [friend('a')], SUNDAY)
    expect(r).toBeNull()
  })

  it('lists each person once, against their latest item', () => {
    const r = recallFor(
      [item('i1', 'a', '2026-11-23'), item('i2', 'a', '2026-11-27')],
      [friend('a')],
      SUNDAY,
    )
    expect(r.people).toEqual([{ friend: friend('a'), itemId: 'i2' }])
  })

  it('is answered once a week', () => {
    const items = [item('i1', 'a', '2026-11-24', { recall_at: '2026-11-29T18:00:00Z' }), item('i2', 'b', '2026-11-25')]
    expect(recallFor(items, [friend('a'), friend('b')], SUNDAY)).toBeNull()
  })

  it('caps the list, with a stable order for the week', () => {
    const ids = 'abcdefghij'.split('')
    const items = ids.map((id, n) => item(`i${n}`, id, '2026-11-25'))
    const friends = ids.map(friend)
    const r1 = recallFor(items, friends, SUNDAY)
    const r2 = recallFor(items, friends, '2026-11-30')
    expect(r1.people).toHaveLength(RECALL_MAX)
    expect(r2.people.map((p) => p.itemId)).toEqual(r1.people.map((p) => p.itemId))
  })

  it('skips people since deleted', () => {
    expect(recallFor([item('i1', 'gone', '2026-11-25')], [friend('a')], SUNDAY)).toBeNull()
  })
})
