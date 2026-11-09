import { describe, expect, it } from 'vitest'
import { composeMessage, DRAFTS } from './share'

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
