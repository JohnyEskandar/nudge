import { describe, expect, it } from 'vitest'
import { dueLabel } from './format'

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
