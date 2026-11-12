import { useEffect, useRef, useState } from 'react'
import { setPaused } from '../lib/api'
import { deferred } from '../lib/deferred'
import { logEvent } from '../lib/events'
import { callName } from '../lib/share'
import { UNDO_MS } from '../lib/useAnswer'

/**
 * The other doors out of a nudge, on every screen that shows one. Neither reaching out
 * nor pretending you did: "not now" and "next week" buy a little quiet, "we're good" buys
 * a full rhythm of it, and "let them go" ends the nudges about someone for good (the same
 * switch as "stop nudging me about them" on their page). None of them write a catch-up
 * that never happened.
 */
export default function SnoozeActions({ cadenceDays, busy, onSnooze, friend, onLetGo }) {
  const [letting, setLetting] = useState(false)
  const ctl = useRef(null)
  if (!ctl.current && friend) {
    ctl.current = deferred(async () => {
      await setPaused(friend.id, true)
      logEvent('friend_let_go', { friendId: friend.id })
      await onLetGo?.()
    }, UNDO_MS)
  }
  useEffect(() => () => ctl.current?.flush(), [])

  if (letting) {
    return (
      <div className="notice" role="status" style={{ marginTop: 12 }}>
        <p>
          Okay. Nudge won&rsquo;t bring up {callName(friend)} again. You can switch it
          back on their page.
        </p>
        <button
          className="btn-quiet"
          onClick={() => {
            if (ctl.current.undo()) {
              logEvent('answer_undone', { friendId: friend.id, props: { answer: 'let_go' } })
              setLetting(false)
            }
          }}
        >
          Undo
        </button>
      </div>
    )
  }

  return (
    <div className="quiet-row">
      <button className="btn-quiet" disabled={busy} onClick={() => onSnooze(3)}>
        Not now
      </button>
      <button className="btn-quiet" disabled={busy} onClick={() => onSnooze(7)}>
        Next week
      </button>
      <button
        className="btn-quiet"
        disabled={busy}
        onClick={() => onSnooze(cadenceDays)}
        title={`Quiet for another ${cadenceDays} days`}
      >
        We’re good
      </button>
      {friend && (
        <button
          className="btn-quiet"
          disabled={busy}
          onClick={() => {
            setLetting(true)
            ctl.current.start('let_go')
          }}
        >
          Let them go
        </button>
      )}
    </div>
  )
}
