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
      pushPayload({ ...base, style: 'hang', reason: 'overdue', seed: 0 }).body,
    )
  })

  it('has a dozen lines, some naming the person, none left with a placeholder', () => {
    expect(BODY_LINES.length).toBeGreaterThanOrEqual(12)
    const bodies = BODY_LINES.map((_, i) => pushPayload({ ...base, style: 'hang', reason: 'overdue', seed: i }).body)
    expect(bodies.some((b) => b.includes('Maya'))).toBe(true)
    expect(bodies.every((b) => !b.includes('{'))).toBe(true)
  })

  it('uses what you call them', () => {
    const p = pushPayload({ ...base, nickname: 'Mom', style: 'call', reason: 'overdue' })
    expect(p.title).toBe('Give Mom a call')
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

  it('reason arm: suggests what to ask about, in the user\'s words', () => {
    const p = pushPayload({ ...base, style: 'check_in', reason: 'overdue', copyVariant: 'reason', askAbout: 'the new job' })
    expect(p.body).toBe('Maybe ask Maya Okonkwo about the new job. Already in touch? Tap to say so.')
    expect(p.copyUsed).toBe('reason')
  })

  it('reason arm with nothing to ask about falls back to plain, and says so', () => {
    const p = pushPayload({ ...base, style: 'check_in', reason: 'overdue', copyVariant: 'reason', askAbout: null })
    expect(BODY_LINES.map((l) => l.replaceAll('{name}', 'Maya Okonkwo'))).toContain(p.body)
    expect(p.copyUsed).toBe('plain')
  })

  it('plain arm never uses the ask-about line', () => {
    const p = pushPayload({ ...base, style: 'check_in', reason: 'overdue', copyVariant: 'plain', askAbout: 'the new job' })
    expect(p.body).not.toMatch(/new job/)
    expect(p.copyUsed).toBe('plain')
  })
})

