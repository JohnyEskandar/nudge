import { callName } from '../lib/share'
import { quietMessage, useAnswer } from '../lib/useAnswer'
import AnswerDone from './AnswerDone'

const YES = [
  { value: 'texted', label: 'Texted' },
  { value: 'called', label: 'Called' },
  { value: 'saw_them', label: 'Saw them' },
]

/**
 * "Did you reach Maya?" with the four answers. One tap answers, from whichever door it
 * was asked at (the push landing or the next-open card); a few seconds of Undo replace
 * any "Are you sure?". A yes lets the person rest; "Not yet" is kept as an answer too, and
 * never invents contact. The question and the four answers are what the test reads, so
 * they stay exactly as they are.
 */
export default function AnswerCard({ friend, question, source, itemId = null, onDone, note, prominent }) {
  const a = useAnswer(friend, { source, itemId, onDone })
  const first = callName(friend)

  if (a.phase !== 'idle') {
    return <AnswerDone message={quietMessage(a.answer, first)} answer={a} friend={friend} />
  }

  return (
    <div className="notice">
      <p style={{ marginTop: 0 }}>
        <strong>{question ?? `Did you reach ${first}?`}</strong>
        {note && <span className="muted"> {note}</span>}
      </p>
      {a.error && <p className="error">{a.error}</p>}
      <div className={prominent ? 'answer-grid' : 'row'} style={prominent ? undefined : { flexWrap: 'wrap', gap: 8 }}>
        {YES.map((y) => (
          <button
            key={y.value}
            className="btn btn-secondary"
            style={prominent ? undefined : { width: 'auto' }}
            onClick={() => a.give(y.value)}
          >
            {y.label}
          </button>
        ))}
        <button className="btn-quiet" onClick={() => a.give('not_yet')}>
          Not yet
        </button>
      </div>
    </div>
  )
}
