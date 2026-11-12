import { describe, expect, it } from 'vitest'
import { onToday } from './due'

const f = (over) => ({ paused: false, held_out: false, days_overdue: -5, birthday_in_days: null, ...over })

describe('onToday', () => {
  it('shows people who are due', () => {
    expect(onToday(f({ days_overdue: 0 }))).toBe(true)
    expect(onToday(f({ days_overdue: 12 }))).toBe(true)
  })
  it('never shows a paused person, even though null >= 0 is true in JavaScript', () => {
    expect(onToday(f({ paused: true, days_overdue: null }))).toBe(false)
    expect(onToday(f({ paused: true, days_overdue: null, birthday_in_days: 0 }))).toBe(false)
  })
  it('keeps held-out people off Today', () => {
    expect(onToday(f({ held_out: true, days_overdue: 3 }))).toBe(false)
  })
  it('shows a close birthday even when not due', () => {
    expect(onToday(f({ birthday_in_days: 2 }))).toBe(true)
    expect(onToday(f({ birthday_in_days: 4 }))).toBe(false)
  })
  it('leaves out people not yet due', () => {
    expect(onToday(f({ days_overdue: -1 }))).toBe(false)
  })
})
