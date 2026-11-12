import { describe, expect, it } from 'vitest'
import { callName, composeMessage, DRAFTS, REACH } from './share'

describe('composeMessage', () => {
  it('greets the person by first name', () => {
    expect(composeMessage('Maya Okonkwo', 'check_in', { seed: 0 })).toMatch(/Maya/)
    expect(composeMessage('Maya Okonkwo', 'check_in', { seed: 0 })).not.toMatch(/Okonkwo/)
  })

  it('never names the gap or uses a long dash', () => {
    for (const lines of Object.values(DRAFTS)) {
      for (const line of lines) {
        expect(line).not.toMatch(/—/)
        expect(line).not.toMatch(/a while|been too long|long time/i)
      }
    }
  })

  it('rotates openers by seed', () => {
    const seen = new Set(DRAFTS.check_in.map((_, i) => composeMessage('Sam', 'check_in', { seed: i })))
    expect(seen.size).toBe(DRAFTS.check_in.length)
  })

  it('opens with thanks for a mentor', () => {
    expect(composeMessage('Ana Li', 'check_in', { category: 'mentor', seed: 0 })).toMatch(/thank/i)
  })
})

describe('callName', () => {
  it('uses what you call them when set', () => {
    expect(callName({ name: 'Grace Okafor', nickname: 'Mom' })).toBe('Mom')
    expect(callName({ name: 'Nguyen Van An', nickname: 'An' })).toBe('An')
  })
  it('falls back to the first word of the name', () => {
    expect(callName({ name: 'Maya Okonkwo', nickname: null })).toBe('Maya')
  })
})

describe('drafts use what you call them', () => {
  it('greets by nickname', () => {
    expect(composeMessage('Grace Okafor', 'check_in', { nickname: 'Mom', seed: 0 })).toMatch(/Mom/)
  })
})

describe('REACH', () => {
  it('asks how you usually reach them in plain words, over the stored styles', () => {
    expect(REACH.map((r) => r.style).sort()).toEqual(['call', 'check_in', 'hang'])
    expect(REACH.map((r) => r.label)).toEqual(['Text them', 'Call them', 'Meet up'])
  })
})
