import { callName } from '../lib/share'
import { quietMessage, useAnswer } from '../lib/useAnswer'
import AnswerDone from './AnswerDone'

/**
 * For the reach-out that happened in Messages, where the app can't see it: one tap closes
 * the nudge. How it happened is optional, afterwards.
 */
export default function AlreadyDidIt({ friend, source, onDone, onClose }) {
  const a = useAnswer(friend, { source, onDone })

  // Today: the card leaves the list at once and the list shows the message (ClosingBar).
  if (onClose) {
    return (
      <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => onClose(friend)}>
        Already did it
      </button>
    )
  }

  if (a.phase !== 'idle') {
    return (
      <div style={{ marginTop: 12 }}>
        <AnswerDone message={quietMessage(a.answer, callName(friend))} answer={a} askHow friend={friend} />
      </div>
    )
  }

  return (
    <>
      {a.error && <p className="error">{a.error}</p>}
      <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => a.give('talked')}>
        Already did it
      </button>
    </>
  )
}
