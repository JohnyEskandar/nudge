import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteFriend,
  deleteInteraction,
  getFriend,
  listInteractions,
  logCatchUp,
  setCadence,
} from '../lib/api'
import { dueLabel, formatDate, lastContactLabel, todayISO } from '../lib/format'

export default function FriendDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [friend, setFriend] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [error, setError] = useState(null)

  const [logging, setLogging] = useState(false)
  const [logDate, setLogDate] = useState(todayISO())
  const [logNote, setLogNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [cadenceDraft, setCadenceDraft] = useState('')
  const [savingCadence, setSavingCadence] = useState(false)

  const load = useCallback(async () => {
    try {
      const [f, i] = await Promise.all([getFriend(id), listInteractions(id)])
      setFriend(f)
      setInteractions(i)
      setCadenceDraft(String(f.cadence_days))
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function onLog(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await logCatchUp(id, { date: logDate, note: logNote })
      setLogNote('')
      setLogDate(todayISO())
      setLogging(false)
      await load() // re-read so days_overdue reflects the new interaction
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function onSaveCadence() {
    const n = Number(cadenceDraft)
    if (!Number.isInteger(n) || n < 1 || n > 3650) {
      setError('Cadence must be a whole number of days between 1 and 3650.')
      return
    }
    setSavingCadence(true)
    setError(null)
    try {
      await setCadence(id, n)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSavingCadence(false)
  }

  async function onDeleteFriend() {
    if (!confirm(`Remove ${friend.name} from your people? This can't be undone.`)) return
    try {
      await deleteFriend(id)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  async function onDeleteInteraction(interactionId) {
    try {
      await deleteInteraction(interactionId)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (error && !friend) {
    return (
      <>
        <button className="back" onClick={() => navigate('/')}>
          ← Back
        </button>
        <div className="error">{error}</div>
      </>
    )
  }

  if (!friend) return <div className="loading">Loading…</div>

  const due = dueLabel(friend.days_overdue)
  const cadenceChanged = cadenceDraft !== String(friend.cadence_days)

  return (
    <>
      <button className="back" onClick={() => navigate('/')}>
        ← People
      </button>

      <div className="header" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>{friend.name}</h1>
          <div className="row" style={{ gap: 8 }}>
            <span className="tag">{friend.category}</span>
            {friend.city && <span className="tag">{friend.city}</span>}
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="friend-top">
          <span className="muted">
            {lastContactLabel(friend.days_since_contact, Boolean(friend.last_interaction_date))}
          </span>
          <span className={due.due ? 'status due' : 'status'}>
            {due.due && <span className="dot" />}
            {due.text}
          </span>
        </div>

        <div className="spacer" />

        {!logging ? (
          <button className="btn" onClick={() => setLogging(true)}>
            Log a catch-up
          </button>
        ) : (
          <form onSubmit={onLog}>
            <div className="field">
              <label htmlFor="date">When</label>
              <input
                id="date"
                type="date"
                value={logDate}
                max={todayISO()}
                onChange={(e) => setLogDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="note">What did you talk about? (optional)</label>
              <textarea
                id="note"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="Caught up over coffee — she's moving in March."
              />
            </div>
            <div className="row">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setLogging(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Remind me every</h2>
        <div className="row">
          <input
            type="number"
            min="1"
            max="3650"
            value={cadenceDraft}
            onChange={(e) => setCadenceDraft(e.target.value)}
            style={{ width: 100 }}
            aria-label="Cadence in days"
          />
          <span className="muted">days</span>
          {cadenceChanged && (
            <button
              className="btn"
              style={{ width: 'auto', marginLeft: 'auto' }}
              onClick={onSaveCadence}
              disabled={savingCadence}
            >
              {savingCadence ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {friend.notes && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Notes</h2>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 15 }}>{friend.notes}</p>
        </div>
      )}

      <div className="card">
        <h2>History</h2>
        {interactions.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No catch-ups logged yet.
          </p>
        ) : (
          <ul className="timeline">
            {interactions.map((i) => (
              <li key={i.id}>
                <div>
                  <div className="timeline-date">{formatDate(i.date)}</div>
                  {i.note && <div className="timeline-note">{i.note}</div>}
                </div>
                <button
                  className="btn-danger-quiet"
                  onClick={() => onDeleteInteraction(i.id)}
                  aria-label="Delete this catch-up"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="center" style={{ marginTop: 32 }}>
        <button className="btn-danger-quiet" onClick={onDeleteFriend}>
          Remove {friend.name}
        </button>
      </div>
    </>
  )
}
