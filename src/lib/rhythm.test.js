import { describe, expect, it } from 'vitest'
import { DEFAULT_CADENCE } from './categories'
import { RHYTHMS, rhythmLabel, rhythmOptions } from './rhythm'

describe('rhythm', () => {
  it('offers a plain-language choice for every category default', () => {
    for (const days of Object.values(DEFAULT_CADENCE)) {
      expect(RHYTHMS.map((r) => r.days)).toContain(days)
    }
  })

  it('names a rhythm in words, not a raw day count', () => {
    expect(rhythmLabel(30)).toBe('Every month')
    expect(rhythmLabel(7)).toBe('Every week')
  })

  it('keeps an unusual rhythm someone set by hand', () => {
    expect(rhythmLabel(21)).toBe('Every 3 weeks')
    expect(rhythmLabel(10)).toBe('Every 10 days')
    expect(rhythmOptions(10).map((o) => o.days)).toContain(10)
    expect(rhythmOptions(30).filter((o) => o.days === 30)).toHaveLength(1)
  })
})
