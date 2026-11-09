/**
 * Reaching out has to leave the app to happen — the conversation lives in Messages or
 * on a call, not here. What leaves, and in what tone, depends on the person: a mentor
 * doesn't want to be invited out, and family would rather hear your voice.
 *
 * For the two message styles we have no phone number to build an `sms:` link with, so
 * the share sheet does the work: the user picks the person and the app in one gesture,
 * and iOS fills the message in for them.
 */

export const NUDGE_STYLES = ['hang', 'check_in', 'call']

export const STYLE_LABEL = {
  hang: 'Ask to hang',
  check_in: 'Send a check-in',
  call: 'Give them a call',
}

/** What the friend's card says about how you keep in touch with them. */
export const STYLE_DESCRIPTION = {
  hang: 'Nudges will suggest making a plan.',
  check_in: 'Nudges will suggest a quiet message, no plans attached.',
  call: 'Nudges will suggest picking up the phone.',
}

export function firstName(name) {
  return name.trim().split(/\s+/)[0]
}

/**
 * The title the push will actually use, shown during onboarding so the promise the app
 * makes is the promise it keeps. One function for both, so they cannot drift.
 */
export { titleFor as nudgeTitle } from '../../supabase/functions/_shared/copy.ts'

/**
 * Openers that are easy to answer and never mention the gap: "it's been a while" makes
 * the other person do the work of forgiving it. They rotate so the same words don't go
 * to everyone. {first} is the friend's first name. Never a long dash, never branded.
 */
export const DRAFTS = {
  check_in: [
    'Hey {first}, you crossed my mind today. How have you been?',
    "Hi {first}! What's been the best part of your month?",
    "Hey {first}, how's everything going with you?",
  ],
  hang: [
    'Hey {first}! Want to find a time to catch up soon?',
    'Hey {first}, how are you? Up for a call or a coffee sometime soon?',
  ],
  // Mentors: thanks first, no ask (the early-career networkers' opener).
  mentor: [
    'Hi {first}, I was thinking about some advice you gave me and wanted to say thank you. How have you been?',
  ],
}

/**
 * The draft that goes into the share sheet. `seed` picks the opener (the day of the
 * month by default, so it changes as the days do).
 */
export function composeMessage(name, style, { category, seed = new Date().getDate() } = {}) {
  const lines = category === 'mentor' ? DRAFTS.mentor : style === 'check_in' ? DRAFTS.check_in : DRAFTS.hang
  const line = lines[((seed % lines.length) + lines.length) % lines.length]
  return line.replace('{first}', firstName(name))
}

/**
 * Opens the share sheet, falling back to the clipboard where it doesn't exist
 * (desktop browsers, mostly).
 *
 * Resolves 'shared' | 'copied' when the message got out, and 'cancelled' when the user
 * backed out of the sheet — the caller must not log outreach on 'cancelled'.
 */
export async function shareMessage(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (err) {
      // Backing out of the sheet rejects with AbortError; anything else is a real
      // failure and should fall through to the clipboard rather than lose the message.
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }

  await navigator.clipboard.writeText(text)
  return 'copied'
}

/**
 * The call action is a real link rather than a scripted navigation: an installed iOS web
 * app will not reliably dial from `window.location.href`, but it always follows an
 * `<a href="tel:">`. Without a number there is nothing to dial, and the caller falls back
 * to asking for one.
 */
export function telHref(phone) {
  return phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null
}
