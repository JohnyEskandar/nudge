import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  DEFAULT_CADENCE,
  deleteFriend,
  deleteInteraction,
  getFriend,
  listInteractions,
  logCatchUp,
  logOutreach,
  setCadence,
  updateFriend,
} from '../lib/api'
import { composeHangMessage, shareHangMessage } from '../lib/share'
import { dueLabel, formatDate, lastContactLabel, todayISO } from '../lib/format'
import FriendForm from '../components/FriendForm'

/**
 * Says out loud what saving will do to the reminder, so a category change never
 * moves it behind the user's back. Mirrors the rule in updateFriend.
 */
function cadenceHint(friend, draftCategory) {
  if (friend.category === draftCategory) return null

  const cadenceIsStillDefault = friend.cadence_days === DEFAULT_CADENCE[friend.category]
  return cadenceIsStillDefault
    ? `Saving also moves the reminder to every ${DEFAULT_CADENCE[draftCategory]} days.`
    : `Your ${friend.cadence_days}-day reminder stays as it is.`
}

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

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [asking, setAsking] = useState(false)
  const [sent, setSent] = useState(null) // 'shared' | 'copied', after a hang message goes out

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

  /**
   * The whole point of the app in one button: the message goes out and the outreach
   * records itself, so there is nothing left to remember to write down.
   */
  async function onAskToHang() {
    setAsking(true)
    setError(null)
    try {
      const result = await shareHangMessage(composeHangMessage(friend.name))
      if (result !== 'cancelled') {
        await logOutreach(id)
        setSent(result)
        await load() // the nudge for this friend is answered; days_overdue resets
      }
    } catch (err) {
      setError(err.message)
    }
    setAsking(false)
  }

  function startEditing() {
    setDraft({
      name: friend.name,
      category: friend.category,
      city: friend.city ?? '',
      notes: friend.notes ?? '',
    })
    setError(null)
    setEditing(true)
  }

  async function onSaveEdit(e) {
    e.preventDefault()
    setSavingEdit(true)
    setError(null)
    try {
      await updateFriend(id, draft, friend)
      // Reload before leaving the form: the cadence may have moved with the category,
      // and closing first would flash the stale name and tags for a frame.
      await load()
      setEditing(false)
    } catch (err) {
      setError(err.message)
    }
    setSavingEdit(false)
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

  // Editing takes over the screen rather than sitting alongside the read-only view —
  // otherwise notes would be on the page twice, once editable and once not.
  if (editing) {
    return (
      <>
        <button className="back" onClick={() => setEditing(false)}>
          ← Cancel
        </button>

        <h1>Edit {friend.name}</h1>

        {error && <div className="error">{error}</div>}

        <form onSubmit={onSaveEdit}>
          <FriendForm
            values={draft}
            onChange={setDraft}
            hint={cadenceHint(friend, draft.category)}
          />

          <div className="row">
            <button className="btn" type="submit" disabled={savingEdit || !draft.name.trim()}>
              {savingEdit ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </>
    )
  }

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
        <button className="btn-quiet" onClick={startEditing}>
          Edit
        </button>
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

        {sent && (
          <div className="notice">
            {sent === 'copied'
              ? 'Message copied — paste it to them. Logged as reached out today.'
              : `Logged — you reached out to ${friend.name.split(' ')[0]} today.`}
          </div>
        )}

        {!logging ? (
          <>
            <button className="btn" onClick={onAskToHang} disabled={asking}>
              {asking ? 'Opening…' : 'Ask to hang'}
            </button>
            <div className="spacer" />
            <button className="btn btn-secondary" onClick={() => setLogging(true)}>
              Log a catch-up
            </button>
          </>
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
                  <div className="timeline-date">
                    {formatDate(i.date)}
                    {i.kind === 'reached_out' && (
                      <span className="muted"> · reached out</span>
                    )}
                  </div>
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
