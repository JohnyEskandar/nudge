import { useEffect, useRef, useState } from 'react'
import { recordAnswer } from './api'
import { deferred } from './deferred'
import { logEvent } from './events'

export const UNDO_MS = 5000

/**
 * One answer to "did you reach them?", held for UNDO_MS so it can be taken back, then
 * recorded through record_answer like every other answer. A more specific "how"
 * (texted, called, saw them) chosen inside the window replaces a bare "already did it";
 * chosen later, it is logged as answer_detail.
 *
 * phase: 'idle' | 'pending' | 'saved'
 *
 * `friend` may be null when one hook serves a whole list (Today): then each give()
 * names who it is about, and a new one records any answer still held for someone else.
 */
export function useAnswer(friend, { source, itemId = null, onDone } = {}) {
  const [phase, setPhase] = useState('idle')
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState(null)
  const [who, setWho] = useState(friend)
  const whoRef = useRef(friend)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const ctl = useRef(null)
  if (!ctl.current) {
    ctl.current = deferred(async (value) => {
      try {
        await recordAnswer(whoRef.current.id, value, { source, itemId })
        setPhase('saved')
        await onDoneRef.current?.(value)
      } catch (err) {
        setError(err.message)
        setPhase('idle')
      }
    }, UNDO_MS)
  }

  // Leaving the screen (or the app) records a pending answer at once.
  useEffect(() => {
    const flush = () => ctl.current.flush()
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  function give(value, person) {
    if (person && person.id !== whoRef.current?.id) {
      ctl.current.flush()
      whoRef.current = person
      setWho(person)
    }
    setError(null)
    setAnswer(value)
    setPhase('pending')
    ctl.current.start(value)
  }

  function undo() {
    if (ctl.current.undo()) {
      logEvent('answer_undone', { friendId: whoRef.current.id, itemId, props: { answer, source } })
      setAnswer(null)
      setPhase('idle')
    }
  }

  function detail(value) {
    if (ctl.current.replace(value)) {
      setAnswer(value)
      return
    }
    logEvent('answer_detail', { friendId: whoRef.current.id, itemId, props: { answer: value, source } })
    setAnswer(value)
  }

  /** Put the message away once it has been read. */
  function dismiss() {
    ctl.current.flush()
    setPhase('idle')
    setAnswer(null)
  }

  return { phase, answer, error, friend: who, give, undo, detail, dismiss }
}

/** What closing a nudge buys: quiet. */
export function quietMessage(answer, first) {
  return answer === 'not_yet'
    ? `No problem. ${first} stays on your list.`
    : `Nice. Nudge will leave ${first} alone for a while.`
}
