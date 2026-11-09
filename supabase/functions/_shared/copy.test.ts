import { describe, expect, it } from 'vitest'
import { BODY_LINES, pushPayload } from './copy.ts'

const base = { friendId: 'f1', name: 'Maya Okonkwo', itemId: 'i1', seed: 0 }

describe('pushPayload', () => {
  it('names one person in the title, by style', () => {
    expect(pushPayload({ ...base, style: 'call', reason: 'overdue' }).title).toBe(
      'Give Maya Okonkwo a call',
    )
    expect(pushPayload({ ...base, style: 'check_in', reason: 'overdue' }).title).toBe(
      'Check in on Maya Okonkwo',
    )
    expect(pushPayload({ ...base, style: 'hang', reason: 'overdue' }).title).toBe(
      'Make a plan with Maya Okonkwo',
    )
  })

  it('leads with the birthday on the day', () => {
    const p = pushPayload({ ...base, style: 'hang', reason: 'birthday' })
    expect(p.title).toBe("It's Maya Okonkwo's birthday")
    expect(p.body).toMatch(/happy birthday/i)
  })

  it('opens that person, carrying the item so the tap can be counted', () => {
    const p = pushPayload({ ...base, style: 'hang', reason: 'overdue' })
    expect(p.url).toBe('/friend/f1?n=i1')
    expect(p.tag).toBe('nudge-f1')
  })

  it('rotates the body line by seed and covers every line', () => {
    const seen = new Set(
      BODY_LINES.map((_, i) => pushPayload({ ...base, style: 'hang', reason: 'overdue', seed: i }).body),
    )
    expect(seen.size).toBe(BODY_LINES.length)
    expect(pushPayload({ ...base, style: 'hang', reason: 'overdue', seed: BODY_LINES.length }).body).toBe(
      BODY_LINES[0],
    )
  })

  it('never counts days, shames a gap or uses a long dash', () => {
    const all = [
      ...BODY_LINES,
      pushPayload({ ...base, style: 'hang', reason: 'birthday' }).body,
    ]
    for (const line of all) {
      expect(line).not.toMatch(/—/)
      expect(line).not.toMatch(/\d+\s*day/i)
      expect(line).not.toMatch(/a while|overdue|been too long/i)
    }
  })
})
