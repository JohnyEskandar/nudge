import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listFriends, snoozeFriend } from '../lib/api'
import { supabase } from '../lib/supabase'
import { dueLabel, lastContactLabel } from '../lib/format'
import { sentMessage, useReachOut } from '../lib/useReachOut'
import ReachOutAction from '../components/ReachOutAction'
import PushOptIn from '../components/PushOptIn'

/**
 * Home is a daily ritual, not a database listing. It leads with the handful of people
 * who are actually due, each with their reach-out button right there — so the whole loop
 * (reach out → it logs itself → the clock resets) happens without drilling into anyone's
 * page. Everyone else waits quietly below.
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

      {upcoming.length > 0 && (
        <>
          <h2 style={{ marginTop: 28 }}>Coming up</h2>
          {upcoming.map((f) => (
            <Link className="friend-card" key={f.id} to={`/friend/${f.id}`}>
              <div className="friend-top">
                <span className="friend-name">{f.name}</span>
                <span className="status">{dueLabel(f.days_overdue).text}</span>
              </div>
              <div className="friend-meta">
                {lastContactLabel(f.days_since_contact, Boolean(f.last_interaction_date))}
                {f.city ? ` · ${f.city}` : ''} · every {f.cadence_days} days
              </div>
            </Link>
          ))}
        </>
      )}

      <button className="btn add-fab" onClick={() => navigate('/add')}>
        + Add someone
      </button>
    </>
  )
}
