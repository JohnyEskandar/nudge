import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  birthdayISO,
  DEFAULT_CADENCE,
  deleteFriend,
  deleteInteraction,
  getFriend,
  listInteractions,
  logCatchUp,
  setCadence,
  snoozeFriend,
  updateFriend,
} from '../lib/api'
import { NUDGE_STYLES } from '../lib/share'
import {
  birthdayLabel,
  dueLabel,
  excerpt,
  formatDate,
  formatMonthDay,
  lastContactLabel,
  todayISO,
} from '../lib/format'
import { sentMessage, useReachOut } from '../lib/useReachOut'
import ReachOutAction from '../components/ReachOutAction'
import SnoozeActions from '../components/SnoozeActions'
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

  // The same reach-out loop the Today list uses.
  const { reachOut, busyId, sent, error: reachError, setError: setReachError } = useReachOut(load)

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

  async function onSnooze(days) {
    setError(null)
    setReachError(null)
    try {
      await snoozeFriend(id, days)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  function startEditing() {
    setDraft({
      name: friend.name,
      category: friend.category,
      nudgeStyle: friend.nudge_style,
      phone: friend.phone ?? '',
      birthday: birthdayISO(friend),
      city: friend.city ?? '',
      notes: friend.notes ?? '',
    })
    setError(null)
    setReachError(null)
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
            {friend.birthday_month && (
              <span className="tag">
                🎂 {formatMonthDay(friend.birthday_month, friend.birthday_day)}
              </span>
            )}
          </div>
        </div>
        <button className="btn-quiet" onClick={startEditing}>
          Edit
        </button>
      </div>

      {(error || reachError) && <div className="error">{error || reachError}</div>}

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

        {friend.birthday_in_days != null && friend.birthday_in_days <= 14 && (
          <div className="reason">🎂 {birthdayLabel(friend.birthday_in_days)}</div>
        )}

        {friend.last_note && (
          <p className="starter">Last time: “{excerpt(friend.last_note)}”</p>
        )}

        <div className="spacer" />

        {sent?.id === friend.id && (
          <div className="notice">{sentMessage(sent.how, friend.name)}</div>
        )}

        {!logging ? (
          <>
            <ReachOutAction
              style={friend.nudge_style}
              phone={friend.phone}
              primary
              busy={busyId === friend.id}
              onAct={(style) => reachOut(friend, style)}
            />

            {/* Some weeks a hang friend just gets a text, and a call friend a message. */}
            <div className="row" style={{ marginTop: 12 }}>
              {NUDGE_STYLES.filter((s) => s !== friend.nudge_style).map((s) => (
                <ReachOutAction
                  key={s}
                  style={s}
                  phone={friend.phone}
                  busy={busyId === friend.id}
                  onAct={(style) => reachOut(friend, style)}
                />
              ))}
            </div>

            {/* The third door, only when there is a nudge to answer. */}
            {due.due && (
              <SnoozeActions
                cadenceDays={friend.cadence_days}
                busy={busyId === friend.id}
                onSnooze={onSnooze}
              />
            )}

            <div className="spacer" />
            <button className="btn-quiet" onClick={() => setLogging(true)}>
              Log a catch-up that already happened
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
                    {i.kind === 'reached_out' && <span className="muted"> · reached out</span>}
                    {i.kind === 'called' && <span className="muted"> · called</span>}
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
