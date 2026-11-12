import { useEffect, useState } from 'react'
import { answerPlan } from '../lib/api'
import { logEvent } from '../lib/events'
import { formatDate } from '../lib/format'
import { callName } from '../lib/share'

/** The day after a plan: "How was it?" Time together is the win Nudge is for. */
export default function PlanCard({ pending, onDone }) {
  const { plan, friend } = pending
  const name = callName(friend)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    logEvent('plan_shown', { friendId: friend.id })
  }, [friend.id, plan.id])

  async function answer(outcome) {
    setBusy(true)
    setError(null)
    try {
      await answerPlan(plan, outcome)
      setMessage(
        outcome === 'happened'
          ? `So glad. Nudge will leave ${name} alone for a while.`
          : `That happens. ${name} stays on your list.`,
      )
      await onDone?.()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (message) return <div className="notice" role="status" style={{ marginBottom: 16 }}>{message}</div>

  return (
    <div className="notice" style={{ marginBottom: 16 }}>
      <p style={{ marginTop: 0 }}>
        <strong>How was your plan with {name}?</strong>{' '}
        <span className="muted">({formatDate(plan.on_date)})</span>
      </p>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn-secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => answer('happened')}>
          It happened
        </button>
        <button className="btn-quiet" style={{ minHeight: 44 }} disabled={busy} onClick={() => answer('didnt_happen')}>
          It didn&rsquo;t happen
        </button>
      </div>
    </div>
  )
}
