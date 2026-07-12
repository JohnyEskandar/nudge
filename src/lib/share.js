/**
 * Asking someone to hang is the app's primary action, and it has to leave the app to
 * happen — the conversation lives in Messages or WhatsApp, not here.
 *
 * We have no phone numbers (a friend is just a row you typed), so we can't build an
 * `sms:` link. The share sheet solves that: the user picks the person and the app in
 * one gesture, and iOS fills the message in for them.
 */

export function composeHangMessage(name) {
  const first = name.trim().split(/\s+/)[0]
  return `Hey ${first} — it's been a while. Free to hang this week?`
}

/**
 * Opens the share sheet, falling back to the clipboard where it doesn't exist
 * (desktop browsers, mostly).
 *
 * Resolves 'shared' | 'copied' when the message got out, and 'cancelled' when the user
 * backed out of the sheet — the caller must not log outreach on 'cancelled'.
 */
export async function shareHangMessage(text) {
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
