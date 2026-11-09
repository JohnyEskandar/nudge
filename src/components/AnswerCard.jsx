import { useState } from 'react'
import { recordAnswer } from '../lib/api'
import { firstName } from '../lib/share'

const YES = [
  { value: 'texted', label: 'Texted' },
  { value: 'called', label: 'Called' },
  { value: 'saw_them', label: 'Saw them' },
]

/**
 * "Did you reach Maya?" with the four answers. One tap records it, from whichever door
 * it was asked at (the push landing, the next-open card, "Already did it" on Today or the
 * person's page). A yes lets the person rest; "Not yet" is kept as an answer too, and
 * never invents contact.
 */
export default function AnswerCard({ friend, question, source, itemId = null, onDone, note }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [answered, setAnswered] = useState(null)

  async function answer(value) {
    setBusy(true)
    setError(null)
    try {
      await recordAnswer(friend.id, value, { source, itemId })
      setAnswered(value)
      await onDone?.(value)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const first = firstName(friend.name)
  if (answered) {
    return (
      <div className="notice">
        {answered === 'not_yet'
          ? `No problem. ${first} stays on your list.`
          : `Noted. ${first} can rest for a while.`}
      </div>
    )
  }

  return (
    <div className="notice">
      <p style={{ marginTop: 0 }}>
        <strong>{question ?? `Did you reach ${first}?`}</strong>
        {note && <span className="muted"> {note}</span>}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {YES.map((a) => (
          <button
            key={a.value}
            className="btn btn-secondary"
            style={{ width: 'auto' }}
            disabled={busy}
            onClick={() => answer(a.value)}
          >
            {a.label}
          </button>
        ))}
        <button className="btn-quiet" disabled={busy} onClick={() => answer('not_yet')}>
          Not yet
        </button>
      </div>
    </div>
  )
}
