import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listFriends, snoozeFriend } from '../lib/api'
import { birthdayLabel, dueLabel, excerpt, lastContactLabel } from '../lib/format'
import { firstName } from '../lib/share'
import { sentMessage, useReachOut } from '../lib/useReachOut'
import ReachOutAction from '../components/ReachOutAction'
import SnoozeActions from '../components/SnoozeActions'
import PushOptIn from '../components/PushOptIn'
import { ONBOARDED_KEY } from './Onboarding'

/**
 * A neglected list would otherwise open as a wall of overdue cards, which is the guilt
 * the app is supposed to spare you. Today shows the few that matter most and says how
 * many are waiting; the rest are on My people whenever you want them.
 */
const TODAY_LIMIT = 3

/** A close birthday is a reason to reach out even when nothing is overdue. */
const birthdaySoon = (f) => f.birthday_in_days != null && f.birthday_in_days <= 3

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

  // An empty list teaches nobody anything. A signed-in user with nobody on it hasn't
  // started yet, so send them through the first run — unless they chose to skip it.
  useEffect(() => {
    if (friends?.length === 0 && localStorage.getItem(ONBOARDED_KEY) !== '1') {
      navigate('/welcome', { replace: true })
    }
  }, [friends, navigate])

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

  // Overdue is a fact; a birthday is a reason. Either earns a place on Today, and
  // birthdays lead — they expire, overdue-ness keeps.
  const allDue = (friends?.filter((f) => f.days_overdue >= 0 || birthdaySoon(f)) ?? []).sort(
    (a, b) => {
      if (birthdaySoon(a) !== birthdaySoon(b)) return birthdaySoon(a) ? -1 : 1
      if (birthdaySoon(a)) return a.birthday_in_days - b.birthday_in_days
      return b.days_overdue - a.days_overdue
    },
  )
  const due = allDue.slice(0, TODAY_LIMIT)
  const alsoWaiting = allDue.length - due.length
  const upcoming = friends?.filter((f) => !allDue.includes(f)) ?? []

  return (
    <>
      <div className="header">
        <div>
          <h1>Today</h1>
          <p className="muted" style={{ margin: 0 }}>
            {friends === null
              ? ' '
              : allDue.length > 0
                ? `${allDue.length} ${allDue.length === 1 ? 'person' : 'people'} to reach out to`
                : 'Nobody’s overdue. Enjoy the quiet.'}
          </p>
        </div>
        <button className="btn-quiet" onClick={() => navigate('/settings')}>
          Settings
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
            {birthdaySoon(f) ? (
              <span className="status due">🎂 {birthdayLabel(f.birthday_in_days)}</span>
            ) : (
              <span className="status due">
                <span className="dot" />
                {dueLabel(f.days_overdue).text}
              </span>
            )}
          </div>
          <div className="friend-meta">
            {lastContactLabel(f.days_since_contact, Boolean(f.last_interaction_date))}
            {f.city ? ` · ${f.city}` : ''}
          </div>

          {f.last_note && <p className="starter">Last time: “{excerpt(f.last_note)}”</p>}

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

              {f.days_overdue >= 0 && (
                <SnoozeActions
                  cadenceDays={f.cadence_days}
                  busy={busyId === f.id}
                  onSnooze={(days) => onSnooze(f, days)}
                />
              )}
            </>
          )}
        </div>
      ))}

      {/* Everyone else stays out of the way — one tap, not one scroll. */}
      {friends?.length > 0 && (
        <Link className="see-all" to="/people">
          {alsoWaiting > 0
            ? `${alsoWaiting} more ${alsoWaiting === 1 ? 'person is' : 'people are'} waiting`
            : upcoming.length > 0 && due.length > 0
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
