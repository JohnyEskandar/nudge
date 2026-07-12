import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  DEFAULT_CADENCE,
  deleteFriend,
  deleteInteraction,
  getFriend,
  listInteractions,
  logCatchUp,
  logContact,
  setCadence,
  updateFriend,
} from '../lib/api'
import {
  composeMessage,
  firstName,
  NUDGE_STYLES,
  shareMessage,
  STYLE_LABEL,
  telHref,
} from '../lib/share'
import { dueLabel, formatDate, lastContactLabel, todayISO } from '../lib/format'
import FriendForm from '../components/FriendForm'

/**
 * Says out loud what saving will do to the reminder, so a category change never
 * moves it behind the user's back. Mirrors the rule in updateFriend.
 */
/**
 * Calling is a link so the phone actually dials; the other styles are buttons that open
 * the share sheet. Both record the contact through the same handler.
 */
function ReachOutAction({ style, phone, primary, busy, onAct }) {
  const className = primary ? 'btn' : 'btn btn-secondary'

  if (style === 'call' && phone) {
    return (
      <a className={className} href={telHref(phone)} onClick={() => onAct('call')}>
        {STYLE_LABEL.call}
      </a>
    )
  }

  return (
    <button className={className} onClick={() => onAct(style)} disabled={busy}>
      {busy && primary ? 'Opening…' : STYLE_LABEL[style]}
    </button>
  )
}

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
   * The whole point of the app in one button: the contact goes out and records itself,
   * so there is nothing left to remember to write down. What "goes out" means depends on
   * the friend — a message for hang and check-in, the dialler for call.
   */
  async function onReachOut(style) {
    setAsking(true)
    setError(null)
    try {
      if (style === 'call') {
        if (!friend.phone) {
          // Nothing to dial. Rather than a dead end, let them record the call they're
          // about to make, or add a number from the edit form.
          setError(`No number for ${firstName(friend.name)} yet — add one, or log the call.`)
          setAsking(false)
          return
        }
        // The link itself is doing the dialling; this only records it.
        await logContact(id, 'called')
        setSent('called')
      } else {
        const result = await shareMessage(composeMessage(friend.name, style))
        if (result === 'cancelled') {
          setAsking(false)
          return
        }
        await logContact(id, 'reached_out')
        setSent(result)
      }
      await load() // the nudge for this friend is answered; days_overdue resets
    } catch (err) {
      setError(err.message)
    }
    setAsking(false)
  }

  function startEditing() {
    setDraft({
      name: friend.name,
      category: friend.category,
      nudgeStyle: friend.nudge_style,
      phone: friend.phone ?? '',
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
  const first = firstName(friend.name)
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
            {sent === 'copied' &&
              'Message copied — paste it to them. Logged as reached out today.'}
            {sent === 'shared' && `Logged — you reached out to ${first} today.`}
            {sent === 'called' && `Logged — you called ${first} today.`}
          </div>
        )}

        {!logging ? (
          <>
            <ReachOutAction
              style={friend.nudge_style}
              phone={friend.phone}
              primary
              busy={asking}
              onAct={onReachOut}
            />

            {/* Some weeks a hang friend just gets a text, and a call friend a message. */}
            <div className="row" style={{ marginTop: 12 }}>
              {NUDGE_STYLES.filter((s) => s !== friend.nudge_style).map((s) => (
                <ReachOutAction
                  key={s}
                  style={s}
                  phone={friend.phone}
                  busy={asking}
                  onAct={onReachOut}
                />
              ))}
            </div>

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
