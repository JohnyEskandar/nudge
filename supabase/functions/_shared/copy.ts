// What one nudge says. One person, no day counts, no guilt about the gap, and always
// the way out for someone who already got in touch outside the app: the tap opens that
// person, where "already did it" is one button.
//
// titleFor() is mirrored by nudgeTitle() in src/lib/share.js, which onboarding shows as
// the promise. Change both together.

export type Style = 'hang' | 'check_in' | 'call' | string

export const BODY_LINES = [
  'A short hello is plenty. Already did it? Tap to say so.',
  'No reason needed, just a quick hello. Already talked? Tap to say so.',
  'One line is enough to start. Already in touch? Tap to say so.',
] as const

export function titleFor(name: string, style: Style): string {
  if (style === 'call') return `Give ${name} a call`
  if (style === 'check_in') return `Check in on ${name}`
  return `Make a plan with ${name}`
}

export function pushPayload(p: {
  friendId: string
  name: string
  style: Style
  reason: 'overdue' | 'birthday'
  itemId: string
  /** Picks the body line; anything stable per send (for example the day number). */
  seed: number
}) {
  const url = `/friend/${p.friendId}?n=${p.itemId}`
  const tag = `nudge-${p.friendId}`

  if (p.reason === 'birthday') {
    return {
      title: `It's ${p.name}'s birthday`,
      body: 'Say happy birthday. Already did? Tap to say so.',
      url,
      tag,
    }
  }

  const i = ((Math.trunc(p.seed) % BODY_LINES.length) + BODY_LINES.length) % BODY_LINES.length
  return { title: titleFor(p.name, p.style), body: BODY_LINES[i], url, tag }
}
