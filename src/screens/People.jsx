import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listFriends } from '../lib/api'
import { dueLabel, lastContactLabel } from '../lib/format'

/**
 * Everyone, in one list — the reference view. Today stays focused on the handful of
 * people actually due; this is where you come to browse, search your memory, or edit
 * someone who isn't due for months.
 */
export default function People() {
  const [friends, setFriends] = useState(null)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    listFriends()
      .then(setFriends)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <>
      <button className="back" onClick={() => navigate('/')}>
        ← Today
      </button>

      <div className="header">
        <div>
          <h1>My people</h1>
          <p className="muted" style={{ margin: 0 }}>
            {friends === null
              ? ' '
              : `${friends.length} ${friends.length === 1 ? 'person' : 'people'}`}
          </p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {friends === null && <div className="loading">Loading…</div>}

      {friends?.length === 0 && (
        <div className="empty">
          <p>No one here yet.</p>
          <p className="muted">Add the first person you want to stay close to.</p>
        </div>
      )}

      {friends?.map((f) => {
        const due = dueLabel(f.days_overdue)
        return (
          <Link className="friend-card" key={f.id} to={`/friend/${f.id}`}>
            <div className="friend-top">
              <span className="friend-name">{f.name}</span>
              <span className={due.due ? 'status due' : 'status'}>
                {due.due && <span className="dot" />}
                {due.text}
              </span>
            </div>
            <div className="friend-meta">
              {lastContactLabel(f.days_since_contact, Boolean(f.last_interaction_date))}
              {f.city ? ` · ${f.city}` : ''} · every {f.cadence_days} days
            </div>
          </Link>
        )
      })}

      <button className="btn add-fab" onClick={() => navigate('/add')}>
        + Add someone
      </button>
    </>
  )
}
