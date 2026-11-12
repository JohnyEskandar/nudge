/** A close birthday is a reason to reach out even when nothing is due. */
export const birthdaySoon = (f) => f.birthday_in_days != null && f.birthday_in_days <= 3

/**
 * Who belongs on Today: due, or with a birthday in the next few days. Never someone paused
 * ("we see each other all the time", "let them go"), whose days_overdue is null, and
 * null >= 0 is true in JavaScript. Never someone held out of this week's nudges either.
 */
export function onToday(f) {
  if (f.paused || f.held_out) return false
  const due = f.days_overdue != null && f.days_overdue >= 0
  return due || birthdaySoon(f)
}
