import { DEFAULT_FREQUENCY } from '../../supabase/functions/_shared/pick.ts'

/**
 * How often a nudge may come, as the user sees it. The rules behind each live in
 * MIN_GAP_DAYS in supabase/functions/_shared/pick.ts; this is only the wording, kept in
 * one place so every promise the app makes about frequency matches what it does.
 */
export const FREQUENCIES = [
  { value: 'daily', label: 'Every day', pace: 'Once a day at most' },
  { value: 'few_weekly', label: 'A few times a week', pace: 'A few times a week at most' },
  { value: 'weekly', label: 'Once a week', pace: 'Once a week at most' },
]

export { DEFAULT_FREQUENCY }

export function frequencyFor(value) {
  return FREQUENCIES.find((f) => f.value === value) ?? FREQUENCIES.find((f) => f.value === DEFAULT_FREQUENCY)
}
