import { describe, expect, it } from 'vitest'
import { dueLabel, lastContactLabel } from './format'

describe('dueLabel', () => {
  it('never counts how late you are', () => {
    for (const n of [0, 1, 40, 400]) {
      const label = dueLabel(n)
      expect(label.due).toBe(true)
      expect(label.text).not.toMatch(/\d|overdue/i)
    }
  })
  it('says when someone is coming up', () => {
    expect(dueLabel(-12)).toEqual({ text: 'In 12 days', due: false })
    expect(dueLabel(-1)).toEqual({ text: 'Tomorrow', due: false })
  })
  it('says plainly when nudges are off for someone', () => {
    expect(dueLabel(null)).toEqual({ text: 'No nudges', due: false })
  })
})

describe('lastContactLabel', () => {
  it('names the day, never a count of days', () => {
    const label = lastContactLabel('2026-11-03')
    expect(label).toMatch(/^Last in touch /)
    expect(label).not.toMatch(/ago|days?\b/i)
  })
  it('says plainly when nothing is logged yet', () => {
    expect(lastContactLabel(null)).toBe('Nothing logged yet')
  })
})
