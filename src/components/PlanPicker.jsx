import { useState } from 'react'
import { bookPlan } from '../lib/api'
import { localDate } from '../lib/events'

/** "We made a plan": when is it? The person rests until then, and the day after, Nudge asks how it was. */
export default function PlanPicker({ friend, onDone, onCancel }) {
  const today = localDate()
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return localDate(d)
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await bookPlan(friend.id, date)
      await onDone?.(date)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="field">
        <label htmlFor={`plan-${friend.id}`}>When is it?</label>
        <input
          id={`plan-${friend.id}`}
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn" style={{ width: 'auto' }} disabled={busy || !date} onClick={save}>
          {busy ? 'Saving…' : 'Save the plan'}
        </button>
        {onCancel && (
          <button className="btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
