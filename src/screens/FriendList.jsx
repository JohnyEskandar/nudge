import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listFriends, snoozeFriend } from '../lib/api'
import { supabase } from '../lib/supabase'
import { dueLabel, lastContactLabel } from '../lib/format'
import { firstName } from '../lib/share'
import { sentMessage, useReachOut } from '../lib/useReachOut'
import ReachOutAction from '../components/ReachOutAction'
import PushOptIn from '../components/PushOptIn'

/** listFriends sorts most-overdue-first, so the nearest of the not-yet-due leads. */
function nextUp(upcoming) {
  const soonest = upcoming[0]
  return `${firstName(soonest.name)} ${dueLabel(soonest.days_overdue).text.toLowerCase()}`
}

/**
 * Home is a daily ritual, not a database listing. It leads with the handful of people
 * who are actually due, each with their reach-out button right there — so the whole loop
 * (reach out → it logs itself → the clock resets) happens without drilling into anyone's
 * page. Everyone else lives one tap away on My people, so this screen never becomes the
 * list it replaced.
 */
export default function FriendList() {
  const [friends, setFriends] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      setFriends(await listFriends())
    } catch (e) {
      setLoadError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { reachOut, busyId, sent, error, setError } = useReachOut(load)

  async function onSnooze(friend, days) {
    setError(null)
    try {
      await snoozeFriend(friend.id, days)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const due = friends?.filter((f) => f.days_overdue >= 0) ?? []
  const upcoming = friends?.filter((f) => f.days_overdue < 0) ?? []

  return (
    <>
      <div className="header">
        <div>
          <h1>Today</h1>
          <p className="muted" style={{ margin: 0 }}>
            {friends === null
              ? ' '
              : due.length > 0
                ? `${due.length} ${due.length === 1 ? 'person' : 'people'} to reach out to`
                : 'Nobody’s overdue. Enjoy the quiet.'}
          </p>
        </div>
        <button className="btn-quiet" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      <PushOptIn />

      {(loadError || error) && <div className="error">{loadError || error}</div>}

      {friends === null && <div className="loading">Loading…</div>}

      {friends?.length === 0 && (
        <div className="empty">
          <p>No one here yet.</p>
          <p className="muted">Add the first person you want to stay close to.</p>
        </div>
      )}

      {due.map((f) => (
        <div className="card" key={f.id} style={{ marginBottom: 12 }}>
          <div className="friend-top">
            <Link className="friend-name" to={`/friend/${f.id}`}>
              {f.name}
            </Link>
            <span className="status due">
              <span className="dot" />
              {dueLabel(f.days_overdue).text}
            </span>
          </div>
          <div className="friend-meta">
            {lastContactLabel(f.days_since_contact, Boolean(f.last_interaction_date))}
            {f.city ? ` · ${f.city}` : ''}
          </div>

          <div className="spacer" />

          {sent?.id === f.id ? (
            <div className="notice">{sentMessage(sent.how, f.name)}</div>
          ) : (
            <>
              <ReachOutAction
                style={f.nudge_style}
                phone={f.phone}
                primary
                busy={busyId === f.id}
                onAct={(style) => reachOut(f, style)}
              />

              {/* The third door: neither reaching out nor pretending you did. */}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn-quiet" onClick={() => onSnooze(f, 3)}>
                  Not now
                </button>
                <button
                  className="btn-quiet"
                  onClick={() => onSnooze(f, f.cadence_days)}
                  title={`Quiet for another ${f.cadence_days} days`}
                >
                  We’re good
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Everyone else stays out of the way — one tap, not one scroll. */}
      {friends?.length > 0 && (
        <Link className="see-all" to="/people">
          {upcoming.length > 0 && due.length > 0
            ? `All ${friends.length} people — next up ${nextUp(upcoming)}`
            : `All ${friends.length} people`}
          <span aria-hidden="true"> →</span>
        </Link>
      )}

      <button className="btn add-fab" onClick={() => navigate('/add')}>
        + Add someone
      </button>
    </>
  )
}
