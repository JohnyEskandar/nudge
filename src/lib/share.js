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
 * The title the nightly push will actually use. Mirrors titleFor() in
 * supabase/functions/daily-nudge/index.ts — if you change one, change the other. Shown
 * during onboarding so the promise the app makes is the promise it keeps.
 */
export function nudgeTitle(name, style) {
  if (style === 'call') return `Give ${name} a call`
  if (style === 'check_in') return `Check in on ${name}`
  return `Make a plan with ${name}`
}

export function composeMessage(name, style) {
  const first = firstName(name)
  if (style === 'check_in') {
    return `Hey ${first} — you crossed my mind today. How have you been?`
  }
  return `Hey ${first} — it's been a while. Free to hang this week?`
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
