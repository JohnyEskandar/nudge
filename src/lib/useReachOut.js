import { useState } from 'react'
import { logContact } from './api'
import { composeMessage, firstName, shareMessage } from './share'

/**
 * The app's core loop, in one place: the message goes out (or the phone dials) and the
 * contact records itself, so there is nothing left to remember to write down.
 *
 * Both screens use this — the Today list, where several people are on screen at once and
 * each needs its own busy state, and the detail screen, where there is only ever one.
 * Keeping it here is what stops the two drifting apart.
 *
 * `onDone` is called after a successful contact so the caller can reload; the friend
 * drops out of "due" because the cadence has genuinely reset.
 */
export function useReachOut(onDone) {
  const [busyId, setBusyId] = useState(null)
  const [sent, setSent] = useState(null) // { id, how: 'shared' | 'copied' | 'called' }
  const [error, setError] = useState(null)

  async function reachOut(friend, style) {
    setBusyId(friend.id)
    setError(null)
    try {
      if (style === 'call') {
        if (!friend.phone) {
          // Nothing to dial. Rather than a dead end, say so — they can add a number on
          // the friend's page, or log the call they're about to make.
          setError(`No number for ${firstName(friend.name)} yet — add one, or log the call.`)
          setBusyId(null)
          return
        }
        // The <a href="tel:"> is doing the dialling; this only records it.
        await logContact(friend.id, 'called')
        setSent({ id: friend.id, how: 'called' })
      } else {
        const how = await shareMessage(composeMessage(friend.name, style))
        if (how === 'cancelled') {
          setBusyId(null)
          return
        }
        await logContact(friend.id, 'reached_out')
        setSent({ id: friend.id, how })
      }
      await onDone?.()
    } catch (err) {
      setError(err.message)
    }
    setBusyId(null)
  }

  return { reachOut, busyId, sent, error, setError }
}

/** What to say after a contact went out. */
export function sentMessage(how, name) {
  const first = firstName(name)
  if (how === 'copied') return 'Message copied — paste it to them. Logged as reached out today.'
  if (how === 'called') return `Logged — you called ${first} today.`
  return `Logged — you reached out to ${first} today.`
}
