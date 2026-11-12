import { describe, expect, it } from 'vitest'
import { pendingPlan, pendingReply, waitingOnReply } from './leadOn'

const TODAY = '2026-11-25'
const friend = (id) => ({ id, name: id.toUpperCase() })
const text = (id, friend_id, date, over = {}) => ({ id, friend_id, date, kind: 'reached_out', outcome: null, ...over })

describe('pendingReply', () => {
  it('asks whether they wrote back, a day after a text', () => {
    const p = pendingReply([text('i1', 'a', '2026-11-24')], [friend('a')], TODAY)
    expect(p.interaction.id).toBe('i1')
    expect(p.friend.id).toBe('a')
  })
  it('never asks on the day of the text', () => {
    expect(pendingReply([text('i1', 'a', TODAY)], [friend('a')], TODAY)).toBeNull()
  })
  it('stops asking after four days', () => {
    expect(pendingReply([text('i1', 'a', '2026-11-21')], [friend('a')], TODAY)).not.toBeNull()
    expect(pendingReply([text('i1', 'a', '2026-11-20')], [friend('a')], TODAY)).toBeNull()
  })
  it('only asks about texts, once', () => {
    expect(pendingReply([text('i1', 'a', '2026-11-24', { kind: 'called' })], [friend('a')], TODAY)).toBeNull()
    expect(pendingReply([text('i1', 'a', '2026-11-24', { outcome: 'replied' })], [friend('a')], TODAY)).toBeNull()
  })
  it('asks again after "not yet", but not after "no reply"', () => {
    expect(pendingReply([text('i1', 'a', '2026-11-23', { outcome: 'not_yet' })], [friend('a')], TODAY)).not.toBeNull()
    expect(pendingReply([text('i1', 'a', '2026-11-23', { outcome: 'no_reply' })], [friend('a')], TODAY)).toBeNull()
  })
  it('does not ask twice in one day after "not yet"', () => {
    const answeredToday = text('i1', 'a', '2026-11-23', { outcome: 'not_yet', outcome_at: '2026-11-25T09:00:00' })
    expect(pendingReply([answeredToday], [friend('a')], TODAY)).toBeNull()
  })
  it('skips people since deleted and picks the most recent text', () => {
    const items = [text('i1', 'gone', '2026-11-24'), text('i2', 'a', '2026-11-22'), text('i3', 'b', '2026-11-23')]
    expect(pendingReply(items, [friend('a'), friend('b')], TODAY).interaction.id).toBe('i3')
  })
})

describe('waitingOnReply', () => {
  it('is true for two weeks after a text with no reply recorded', () => {
    expect(waitingOnReply([text('i1', 'a', '2026-11-20')], TODAY)).toBe(true)
    expect(waitingOnReply([text('i1', 'a', '2026-11-20', { outcome: 'not_yet' })], TODAY)).toBe(true)
    expect(waitingOnReply([text('i1', 'a', '2026-11-20', { outcome: 'replied' })], TODAY)).toBe(false)
    expect(waitingOnReply([text('i1', 'a', '2026-11-10')], TODAY)).toBe(false)
  })
  it('looks only at the latest contact', () => {
    const later = { id: 'i2', friend_id: 'a', date: '2026-11-22', kind: 'caught_up', outcome: null }
    expect(waitingOnReply([later, text('i1', 'a', '2026-11-20')], TODAY)).toBe(false)
  })
})

describe('pendingPlan', () => {
  const plan = (id, friend_id, on_date, over = {}) => ({ id, friend_id, on_date, outcome: null, ...over })
  it('asks how it was the day after', () => {
    expect(pendingPlan([plan('p1', 'a', '2026-11-24')], [friend('a')], TODAY).plan.id).toBe('p1')
    expect(pendingPlan([plan('p1', 'a', TODAY)], [friend('a')], TODAY)).toBeNull()
  })
  it('stops asking after a week, and asks once', () => {
    expect(pendingPlan([plan('p1', 'a', '2026-11-17')], [friend('a')], TODAY)).toBeNull()
    expect(pendingPlan([plan('p1', 'a', '2026-11-24', { outcome: 'happened' })], [friend('a')], TODAY)).toBeNull()
  })
})
