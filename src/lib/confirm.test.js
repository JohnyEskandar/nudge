import { describe, expect, it } from 'vitest'
import { pendingConfirm } from './confirm'

const TODAY = '2026-11-25'
const friend = (id, over = {}) => ({ id, name: id.toUpperCase(), last_interaction_date: null, ...over })
const item = (id, friend_id, local_date, over = {}) => ({
  id,
  friend_id,
  local_date,
  assignment: 'nudged',
  reason: 'overdue',
  answer: null,
  ...over,
})

describe('pendingConfirm', () => {
  it('asks about yesterday\'s nudge', () => {
    const p = pendingConfirm([item('i1', 'a', '2026-11-24')], [friend('a')], TODAY)
    expect(p).toEqual({ item: expect.objectContaining({ id: 'i1' }), friend: expect.objectContaining({ id: 'a' }) })
  })

  it('waits until the day after: never asks about today\'s nudge', () => {
    expect(pendingConfirm([item('i1', 'a', TODAY)], [friend('a')], TODAY)).toBeNull()
  })

  it('stops asking after three days', () => {
    expect(pendingConfirm([item('i1', 'a', '2026-11-22')], [friend('a')], TODAY)).not.toBeNull()
    expect(pendingConfirm([item('i1', 'a', '2026-11-21')], [friend('a')], TODAY)).toBeNull()
  })

  it('never asks about a held-out person', () => {
    const items = [item('i1', 'a', '2026-11-24', { assignment: 'holdout' })]
    expect(pendingConfirm(items, [friend('a')], TODAY)).toBeNull()
  })

  it('does not ask twice', () => {
    const items = [item('i1', 'a', '2026-11-24', { answer: 'not_yet' })]
    expect(pendingConfirm(items, [friend('a')], TODAY)).toBeNull()
  })

  it('does not ask when the contact is already logged', () => {
    const items = [item('i1', 'a', '2026-11-24')]
    expect(pendingConfirm(items, [friend('a', { last_interaction_date: '2026-11-24' })], TODAY)).toBeNull()
    expect(pendingConfirm(items, [friend('a', { last_interaction_date: '2026-11-20' })], TODAY)).not.toBeNull()
  })

  it('skips someone since deleted', () => {
    expect(pendingConfirm([item('i1', 'gone', '2026-11-24')], [friend('a')], TODAY)).toBeNull()
  })

  it('asks about the most recent one only', () => {
    const items = [item('i1', 'a', '2026-11-22'), item('i2', 'b', '2026-11-24'), item('i3', 'c', '2026-11-23')]
    expect(pendingConfirm(items, [friend('a'), friend('b'), friend('c')], TODAY).item.id).toBe('i2')
  })
})
