/** Human phrasing for the overdue math, shared by the list and detail screens. */
export function dueLabel(daysOverdue) {
  if (daysOverdue > 0) {
    return { text: `${plural(daysOverdue, 'day')} overdue`, due: true }
  }
  if (daysOverdue === 0) {
    return { text: 'Due today', due: true }
  }
  const inDays = Math.abs(daysOverdue)
  return { text: `In ${plural(inDays, 'day')}`, due: false }
}

export function lastContactLabel(daysSince, hasInteraction) {
  const prefix = hasInteraction ? 'Last spoke' : 'Added'
  if (daysSince === 0) return `${prefix} today`
  if (daysSince === 1) return `${prefix} yesterday`
  return `${prefix} ${plural(daysSince, 'day')} ago`
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function formatDate(iso) {
  // iso is a plain 'YYYY-MM-DD' date; parse as local so it doesn't shift a day back.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function birthdayLabel(inDays) {
  if (inDays === 0) return 'Birthday today'
  if (inDays === 1) return 'Birthday tomorrow'
  return `Birthday in ${plural(inDays, 'day')}`
}

/** "Jul 15" — a stored birthday, shown without pretending the year matters. */
export function formatMonthDay(month, day) {
  return new Date(2000, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Old notes can be long; a conversation starter should be a glance, not a document. */
export function excerpt(text, max = 90) {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

export function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
