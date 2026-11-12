// What one nudge says. One person, no day counts, no guilt about the gap, and always
// the way out for someone who already got in touch outside the app: the tap opens that
// person, where "already did it" is one button.
//
// titleFor() is mirrored by nudgeTitle() in src/lib/share.js, which onboarding shows as
// the promise. Change both together.

export type Style = 'hang' | 'check_in' | 'call' | string

// {name} is what the user calls them. Lines never count time or name the gap, and
// several remind the user that one tap closes the nudge.
export const BODY_LINES = [
  'A short hello is plenty. Already did it? Tap to say so.',
  'No reason needed, just a quick hello. Already talked? Tap to say so.',
  'They would probably love to hear from you. Already in touch? Tap to say so.',
  '{name} might like hearing from you today.',
  'A two-line text to {name} counts.',
  'No big catch-up needed. Just say hi.',
  'Got a minute? {name} is one tap away.',
  'Saw something {name} would laugh at? Send it.',
  'A voice note works too.',
  'Ask {name} one question today.',
  'Nothing clever to say? "Hey, how are you" still lands.',
  'Already texted {name}? Tap to say so and Nudge goes quiet.',
  '{name} would probably like a photo of your day.',
] as const

export function titleFor(name: string, style: Style): string {
  if (style === 'call') return `Give ${name} a call`
  if (style === 'check_in') return `Check in on ${name}`
  return `Make a plan with ${name}`
}

export function pushPayload(p: {
  friendId: string
  name: string
  /** What the user calls them; used in place of the name when set. */
  nickname?: string | null
  /** The episode's H2 arm. 'reason' uses askAbout when there is one. */
  copyVariant?: 'plain' | 'reason'
  /** "Next time, ask about..." in the user's own words. */
  askAbout?: string | null
  style: Style
  reason: 'overdue' | 'birthday'
  itemId: string
  /** Picks the body line; anything stable per send (for example the day number). */
  seed: number
}) {
  const name = p.nickname?.trim() || p.name
  const url = `/friend/${p.friendId}?n=${p.itemId}`
  const tag = `nudge-${p.friendId}`

  if (p.reason === 'birthday') {
    return {
      title: `It's ${name}'s birthday`,
      body: 'Say happy birthday. Already did? Tap to say so.',
      url,
      tag,
      copyUsed: 'plain' as const,
    }
  }

  // The H2 reason arm: a specific thing to ask about. Without one, the push is plain and
  // records that it was, so the readout compares what people actually saw.
  const ask = p.askAbout?.trim()
  if (p.copyVariant === 'reason' && ask) {
    return {
      title: titleFor(name, p.style),
      body: `Maybe ask ${name} about ${ask}. Already in touch? Tap to say so.`,
      url,
      tag,
      copyUsed: 'reason' as const,
    }
  }

  const i = ((Math.trunc(p.seed) % BODY_LINES.length) + BODY_LINES.length) % BODY_LINES.length
  return {
    title: titleFor(name, p.style),
    body: BODY_LINES[i].replaceAll('{name}', name),
    url,
    tag,
    copyUsed: 'plain' as const,
  }
}
