/**
 * "How often do you want to catch up?" People think in rhythms, not day counts, so the
 * choice is in words. What is stored is unchanged: cadence_days.
 */
export const RHYTHMS = [
  { days: 7, label: 'Every week' },
  { days: 14, label: 'Every couple of weeks' },
  { days: 30, label: 'Every month' },
  { days: 45, label: 'Every 6 weeks' },
  { days: 60, label: 'Every couple of months' },
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Twice a year' },
]

export function rhythmLabel(days) {
  const known = RHYTHMS.find((r) => r.days === days)
  if (known) return known.label
  if (days % 7 === 0) return `Every ${days / 7} weeks`
  return `Every ${days} days`
}

/** The standard choices, plus the current one if it was set by hand. */
export function rhythmOptions(current) {
  if (current == null || RHYTHMS.some((r) => r.days === current)) return RHYTHMS
  return [...RHYTHMS, { days: current, label: rhythmLabel(current) }].sort((a, b) => a.days - b.days)
}
