import { callName } from '../lib/share'
import { quietMessage, useAnswer } from '../lib/useAnswer'
import AnswerDone from './AnswerDone'

/**
 * For the reach-out that happened in Messages, where the app can't see it: one tap closes
 * the nudge. How it happened is optional, afterwards.
 */
export default function AlreadyDidIt({ friend, source, onDone }) {
  const a = useAnswer(friend, { source, onDone })

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
