import { useEffect, useState } from 'react'
import { recordAnswer } from '../lib/api'
import { logEvent } from '../lib/events'

/**
 * Sunday's one question: "Who did you talk to this week?" over everyone who came up,
 * nudged or not, mixed together (see recall.js). Ticked people count as talked to;
 * everyone else is recorded as a no, so a skipped name and a "no" are not confused.
 */
export default function RecallCard({ recall, onDone }) {
  const [ticked, setTicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    logEvent('recall_shown', { props: { week: recall.week, count: recall.people.length } })
  }, [recall.week, recall.people.length])

  function toggle(id) {
    setTicked((t) => {
      const next = new Set(t)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      for (const { friend, itemId } of recall.people) {
        await recordAnswer(friend.id, ticked.has(friend.id) ? 'talked' : 'no', {
          source: 'recall',
          itemId,
        })
      }
      setFinished(true)
      await onDone?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (finished) return <div className="notice" style={{ marginBottom: 16 }}>Thanks. See you next Sunday.</div>

  return (
    <div className="notice" style={{ marginBottom: 16 }}>
      <p style={{ marginTop: 0 }}>
        <strong>Who did you talk to this week?</strong> Any way counts: a text, a call, in
        person.
      </p>
      {error && <p className="error">{error}</p>}
      {recall.people.map(({ friend }) => (
        <label key={friend.id} className="row" style={{ gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={ticked.has(friend.id)} onChange={() => toggle(friend.id)} />
          {friend.name}
        </label>
      ))}
      <button className="btn" style={{ width: 'auto' }} disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : ticked.size ? 'Done' : 'None of them'}
      </button>
    </div>
  )
}
