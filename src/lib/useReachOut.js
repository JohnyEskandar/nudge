import { useRef, useState } from 'react'
import { recordAnswer } from './api'
import { logEvent } from './events'
import { composeMessage, firstName, shareMessage } from './share'

/**
 * The reach-out loop, in one place for Today and the person's page.
 *
 * Opening the share sheet, copying a message or tapping Call proves nothing: the sheet can
 * be dismissed after picking an app, a copied message may never be pasted, a call may not
 * connect. So none of them log a contact any more. Each is noted as an event, and then the
 * app asks "Did it go through?" — only a yes is recorded, through the same record_answer
 * every other answer uses.
 *
 * `onDone` runs after a yes so the caller can reload; the person drops out of "due"
 * because the cadence has genuinely reset.
 */
export function useReachOut(onDone) {
  const [busyId, setBusyId] = useState(null)
  const [pending, setPending] = useState(null) // { id, how: 'shared' | 'copied' | 'called' }
  const [done, setDone] = useState(null) // { id, yes }
  const [error, setError] = useState(null)
  const inFlight = useRef(false)

  async function reachOut(friend, style) {
    // One reach-out at a time: a double tap must not open two sheets or log two calls.
    if (inFlight.current || pending?.id === friend.id) return
    inFlight.current = true
    setBusyId(friend.id)
    setError(null)
    setDone(null)
    try {
      if (style === 'call') {
        if (!friend.phone) {
          setError(`No number for ${firstName(friend.name)} yet. Add one, or log the call.`)
          return
        }
        // The <a href="tel:"> is doing the dialling; this only notes the tap.
        logEvent('call_tapped', { friendId: friend.id })
        setPending({ id: friend.id, how: 'called' })
      } else {
        const how = await shareMessage(composeMessage(friend.name, style, { category: friend.category }))
        if (how === 'cancelled') return
        logEvent('share_opened', { friendId: friend.id, props: { how, style } })
        setPending({ id: friend.id, how })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  /** The answer to "Did it go through?". */
  async function confirm(friend, yes) {
    if (inFlight.current) return
    const how = pending?.how
    inFlight.current = true
    setBusyId(friend.id)
    setError(null)
    try {
      await recordAnswer(friend.id, yes ? (how === 'called' ? 'called' : 'texted') : 'not_yet', {
        source: 'reach_out',
      })
      setPending(null)
      setDone({ id: friend.id, yes })
      if (yes) await onDone?.()
    } catch (err) {
      setError(err.message)
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  return { reachOut, confirm, busyId, pending, done, error, setError }
}

/** The question after the share sheet, the clipboard or the dialler. */
export function pendingQuestion(how, name) {
  const first = firstName(name)
  if (how === 'called') return `Did you get through to ${first}?`
  if (how === 'copied') return `Message copied. Paste it to ${first}, then come back: did it go through?`
  return `Did your message to ${first} go through?`
}

/** What to say after the answer. */
export function doneMessage(yes, name) {
  const first = firstName(name)
  return yes
    ? `Lovely. Hope it turns into a real catch-up with ${first}.`
    : `No problem. ${first} stays on your list.`
}
