import { useEffect, useState } from 'react'
import { setReplyOutcome } from '../lib/api'
import { logEvent } from '../lib/events'
import { callName } from '../lib/share'
import PlanPicker from './PlanPicker'

/**
 * A day or so after a text: "Did Maya write back?" A reach-out matters most when it
 * leads on, so this is the closest the app gets to seeing that, with one tap.
 */
export default function ReplyCard({ pending, onDone }) {
  const { interaction, friend } = pending
  const name = callName(friend)
  const [phase, setPhase] = useState('ask') // 'ask' | 'plan' | 'done'
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    logEvent('reply_shown', { friendId: friend.id })
  }, [friend.id, interaction.id])

  async function answer(outcome, then) {
    setError(null)
    try {
      await setReplyOutcome(interaction, outcome)
      if (then === 'plan') return setPhase('plan')
      setMessage(
        outcome === 'replied'
          ? `Good to hear. Nudge will leave ${name} alone for a while.`
          : outcome === 'not_yet'
            ? 'Okay. Nudge will ask again another day.'
            : 'Okay. It still counts that you reached out.',
      )
      setPhase('done')
      await onDone?.()
    } catch (err) {
      setError(err.message)
    }
  }

  if (phase === 'done') return <div className="notice" role="status" style={{ marginBottom: 16 }}>{message}</div>

  return (
    <div className="notice" style={{ marginBottom: 16 }}>
      <p>
        <strong>Did {name} write back?</strong>
      </p>
      {error && <p className="error">{error}</p>}
      {phase === 'plan' ? (
        <PlanPicker
          friend={friend}
          onDone={async () => {
            setMessage(`Lovely. Nudge will ask how it went with ${name}.`)
            setPhase('done')
            await onDone?.()
          }}
        />
      ) : (
        <>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => answer('replied')}>
              Yes
            </button>
            <button className="btn btn-secondary" onClick={() => answer('replied', 'plan')}>
              We made a plan
            </button>
          </div>
          <div className="quiet-row">
            <button className="btn-quiet" onClick={() => answer('not_yet')}>
              Not yet
            </button>
            <button className="btn-quiet" onClick={() => answer('no_reply')}>
              No reply
            </button>
          </div>
        </>
      )}
    </div>
  )
}
