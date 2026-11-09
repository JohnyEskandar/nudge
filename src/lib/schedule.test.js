import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from '../../supabase/functions/_shared/dates.ts'
import { LAST_TALKED, planSchedule, STAGGER_WINDOW_DAYS } from './schedule'

const TODAY = '2026-11-23'
const opts = (over = {}) => ({ today: TODAY, startOn: null, existingDue: [], ...over })
const many = (n, lastTalked, cadence = 60) =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, cadence, lastTalked }))

function perDay(plan) {
  const counts = new Map()
  for (const { first_due_on } of plan.values()) {
    if (first_due_on) counts.set(first_due_on, (counts.get(first_due_on) ?? 0) + 1)
  }
  return counts
}

describe('LAST_TALKED', () => {
  it('offers the five answers, one of which pauses', () => {
    expect(LAST_TALKED.map((o) => o.label)).toEqual([
      'This week',
      'This month',
      'A few months ago',
      'Longer than that',
      'We see each other all the time',
    ])
    expect(LAST_TALKED.filter((o) => o.paused).map((o) => o.value)).toEqual(['often'])
  })
})

describe('planSchedule', () => {
  it('seeds the clock from the answer', () => {
    const plan = planSchedule([{ key: 'a', cadence: 60, lastTalked: 'months' }], opts())
    expect(plan.get('a').clock_start).toBe(addDays(TODAY, -90))
    expect(plan.get('a').paused).toBe(false)
  })

  it('spreads a 60-person import of old friends over three weeks, three a day at most', () => {
    const plan = planSchedule(many(60, 'longer'), opts())
    const counts = perDay(plan)
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3)
    for (const day of counts.keys()) {
      const offset = daysBetween(TODAY, day)
      expect(offset).toBeGreaterThanOrEqual(1)
      expect(offset).toBeLessThanOrEqual(STAGGER_WINDOW_DAYS)
    }
  })

  it('brings someone you have not talked to in ages due within three weeks, not months', () => {
    const plan = planSchedule([{ key: 'a', cadence: 60, lastTalked: 'longer' }], opts())
    expect(daysBetween(TODAY, plan.get('a').first_due_on)).toBe(1)
  })

  it('keeps a recent friend near their natural date, but not all on one day', () => {
    const plan = planSchedule(many(30, 'week'), opts())
    const natural = addDays(TODAY, -3 + 60)
    for (const { first_due_on } of plan.values()) {
      expect(Math.abs(daysBetween(natural, first_due_on))).toBeLessThanOrEqual(10)
    }
    expect(Math.max(...perDay(plan).values())).toBeLessThanOrEqual(2)
  })

  it('without an answer, staggers from the day they were added', () => {
    const plan = planSchedule(many(2, null), opts())
    const dates = [...plan.values()].map((p) => p.first_due_on)
    expect(plan.get('k0').clock_start).toBeNull()
    expect(new Set(dates).size).toBe(2)
    for (const d of dates) expect(Math.abs(daysBetween(addDays(TODAY, 60), d))).toBeLessThanOrEqual(10)
  })

  it('counts the people already due on a day', () => {
    const busy = addDays(TODAY, 1)
    const plan = planSchedule([{ key: 'a', cadence: 60, lastTalked: 'longer' }], opts({ existingDue: [busy, busy] }))
    expect(plan.get('a').first_due_on).toBe(addDays(TODAY, 2))
  })

  it('never nudges about someone you see all the time', () => {
    const plan = planSchedule([{ key: 'a', cadence: 60, lastTalked: 'often' }], opts())
    expect(plan.get('a')).toEqual({ clock_start: null, first_due_on: null, paused: true })
  })

  it('starts the window at the user\'s start date', () => {
    const startOn = '2027-01-25'
    const plan = planSchedule(many(10, 'longer'), opts({ startOn }))
    for (const { first_due_on } of plan.values()) {
      expect(daysBetween(startOn, first_due_on)).toBeGreaterThanOrEqual(1)
      expect(daysBetween(startOn, first_due_on)).toBeLessThanOrEqual(STAGGER_WINDOW_DAYS)
    }
  })

  it('ignores a start date in the past', () => {
    const plan = planSchedule([{ key: 'a', cadence: 60, lastTalked: 'longer' }], opts({ startOn: '2026-01-01' }))
    expect(plan.get('a').first_due_on).toBe(addDays(TODAY, 1))
  })

  it('places the longest-waiting people first', () => {
    const plan = planSchedule(
      [
        { key: 'recent', cadence: 30, lastTalked: 'month' }, // natural = today + 15
        { key: 'ancient', cadence: 30, lastTalked: 'longer' }, // natural long past
      ],
      opts(),
    )
    expect(plan.get('ancient').first_due_on).toBe(addDays(TODAY, 1))
    expect(plan.get('recent').first_due_on).toBe(addDays(TODAY, 15))
  })
})
