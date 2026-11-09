import { describe, expect, it } from 'vitest'
import { MIN_GAP_DAYS } from '../../supabase/functions/_shared/pick.ts'
import { DEFAULT_FREQUENCY, FREQUENCIES, frequencyFor } from './frequency'

describe('frequency wording', () => {
  it('has words for exactly the paces the picker knows', () => {
    expect(FREQUENCIES.map((f) => f.value).sort()).toEqual(Object.keys(MIN_GAP_DAYS).sort())
  })
  it('falls back to the default pace', () => {
    expect(frequencyFor(undefined).value).toBe(DEFAULT_FREQUENCY)
  })
})
