import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listFriends, listRecentItems, snoozeFriend } from '../lib/api'
import { birthdayLabel, dueLabel, excerpt, lastContactLabel } from '../lib/format'
import { firstName } from '../lib/share'
import { useReachOut } from '../lib/useReachOut'
import { localDate } from '../lib/events'
import { pendingConfirm } from '../lib/confirm'
import { recallFor } from '../lib/recall'
import ReachOutAction from '../components/ReachOutAction'
import ReachOutPrompt from '../components/ReachOutPrompt'
import AlreadyDidIt from '../components/AlreadyDidIt'
import ConfirmCard from '../components/ConfirmCard'
import RecallCard from '../components/RecallCard'
import SnoozeActions from '../components/SnoozeActions'
import PushOptIn from '../components/PushOptIn'
import { ONBOARDED_KEY } from './Onboarding'
import { pickerSupport } from '../lib/contacts'
import { PICKER_PENDING_KEY } from '../components/PickerSetup'

/**
 * A neglected list would otherwise open as a wall of overdue cards, which is the guilt
 * the app is supposed to spare you. Today shows the few that matter most and says how
 * many are waiting; the rest are on My people whenever you want them.
 */
const TODAY_LIMIT = 3

/** A close birthday is a reason to reach out even when nothing is overdue. */
const birthdaySoon = (f) => f.birthday_in_days != null && f.birthday_in_days <= 3

/**
 * Someone turned the Safari flag on and came back. The flag only takes effect after a
 * force-quit, and a force-quit always lands on Today, so Today is the only screen that
 * can ever pick this thread up again — which is the entire reason the pending key exists.
 */
const pickerJustArrived = () =>
  localStorage.getItem(PICKER_PENDING_KEY) === '1' && pickerSupport().state === 'supported'

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
  const [items, setItems] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [pickerReady, setPickerReady] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      // The nudge record is a nicety on this screen; Today must still load without it.
      const [f, i] = await Promise.all([listFriends(), listRecentItems().catch(() => [])])
      setFriends(f)
      setItems(i)
    } catch (e) {
      setLoadError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // An empty list teaches nobody anything. A signed-in user with nobody on it hasn't
  // started yet, so send them through the first run — unless they chose to skip it.
  //
  // It stands down for a picker waiting to be acknowledged, because those two are on a
  // collision course: "Add several at once" is offered *inside* onboarding, so someone
  // can reach the walkthrough having added nobody, and the force-quit it asks for lands
  // them here with zero friends. Redirecting would bounce them off the only screen that
  // reads the pending key, and the switch they just went and turned on would never be
  // mentioned again. Acknowledging the notice clears the key and flips pickerReady —
  // hence the dependency — so the redirect resumes on the very next render.
  useEffect(() => {
    if (pickerJustArrived()) return
    if (friends?.length === 0 && localStorage.getItem(ONBOARDED_KEY) !== '1') {
      navigate('/welcome', { replace: true })
    }
  }, [friends, navigate, pickerReady])

  /**
   * Turning the Safari flag on means quitting the app, which loses the screen that was
   * asking for it. Someone who did exactly as they were told would otherwise come back
   * to no acknowledgement at all and have to remember why they went to Settings.
   */
  useEffect(() => {
    if (pickerJustArrived()) setPickerReady(true)
  }, [])

  /**
   * Cleared on the tap, not on the render. Today can be unmounted out from under this
   * notice — any navigation away does it — and clearing on render would burn the one
   * signal we have that someone went and turned the flag on. It is also what lets the
   * onboarding redirect above through again.
   */
  function acknowledgePicker(then) {
    localStorage.removeItem(PICKER_PENDING_KEY)
    // Navigating away? Leave pickerReady alone and go. Flipping it first commits a
    // render in the sync lane while react-router is still deferring its own location
    // update inside a transition — Today is briefly still mounted with the key already
    // gone, the redirect effect re-runs, and a replace to /welcome swallows the /import
    // we were on our way to. Which is exactly this button's job.
    if (then) return then()
    setPickerReady(false)
  }

  const { reachOut, confirm, busyId, pending, done, error, setError } = useReachOut(load)

  async function onSnooze(friend, days) {
    setError(null)
    try {
      await snoozeFriend(friend.id, days)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  // Due is a fact; a birthday is a reason. Either earns a place on Today, and birthdays
  // lead: they expire, being due keeps. Someone held out of this week's nudges (a quarter
  // of new nudges, to measure what a nudge changes) stays off Today too, or the app
  // would still be nudging them.
  const allDue = (
    friends?.filter((f) => !f.held_out && (f.days_overdue >= 0 || birthdaySoon(f))) ?? []
  ).sort(
    (a, b) => {
      if (birthdaySoon(a) !== birthdaySoon(b)) return birthdaySoon(a) ? -1 : 1
      if (birthdaySoon(a)) return a.birthday_in_days - b.birthday_in_days
      return b.days_overdue - a.days_overdue
    },
  )
  const due = allDue.slice(0, TODAY_LIMIT)
  const alsoWaiting = allDue.length - due.length
  // Only people not yet due, so "next up" never names someone being held out.
  const upcoming = friends?.filter((f) => f.days_overdue != null && f.days_overdue < 0) ?? []

  const today = localDate()
  const recall = friends ? recallFor(items, friends, today) : null
  const confirmable = friends && !recall ? pendingConfirm(items, friends, today) : null

  return (
    <>
      <div className="header">
        <div>
          <h1>Today</h1>
          <p className="muted" style={{ margin: 0 }}>
            {friends === null
              ? ' '
              : allDue.length > 0
                ? 'Who’s up for a hello'
                : 'Nobody’s up today. Enjoy the quiet.'}
          </p>
        </div>
        <button className="btn-quiet" onClick={() => navigate('/settings')}>
          Settings
        </button>
      </div>

      <PushOptIn />

      {pickerReady && (
        <div className="notice">
          <p>
            <strong>Your contacts picker is ready.</strong> That switch worked, so you can
            pick people straight from your contacts now.
          </p>
          <div className="row">
            <button className="btn" style={{ width: 'auto' }} onClick={() => acknowledgePicker(() => navigate('/import'))}>
              Choose from my contacts
            </button>
            <button className="btn-quiet" onClick={() => acknowledgePicker()}>
              Later
            </button>
          </div>
        </div>
      )}

      {(loadError || error) && <div className="error">{loadError || error}</div>}

      {friends === null && <div className="loading">Loading…</div>}

      {recall && <RecallCard key={recall.week} recall={recall} onDone={load} />}
      {confirmable && (
        <ConfirmCard key={confirmable.item.id} pending={confirmable} onDone={load} />
      )}

      {friends?.length === 0 && (
        <div className="empty">
          <p className="empty-title">Who would you miss?</p>
          <p className="muted">
            Add them here: family, old friends, anyone you&rsquo;d hate to lose touch with.
          </p>
          <button className="btn btn-secondary" onClick={() => navigate('/import')}>
            Add several at once
          </button>
        </div>
      )}

      {due.map((f, i) => (
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

          {pending?.id === f.id || done?.id === f.id ? (
            <ReachOutPrompt
              friend={f}
              pending={pending}
              done={done}
              busy={busyId === f.id}
              onConfirm={confirm}
            />
          ) : (
            <>
              <ReachOutAction
                style={f.nudge_style}
                phone={f.phone}
                // One filled button per screen: the person at the top.
                primary={i === 0}
                busy={busyId === f.id}
                onAct={(style) => reachOut(f, style)}
              />

              <AlreadyDidIt friend={f} source="today" onDone={load} />

              {/* Birthdays too: "not this week" has to be sayable about anyone on Today. */}
              <SnoozeActions
                cadenceDays={f.cadence_days}
                busy={busyId === f.id}
                onSnooze={(days) => onSnooze(f, days)}
              />
            </>
          )}
        </div>
      ))}

      {/* Everyone else stays out of the way — one tap, not one scroll. */}
      {friends?.length > 0 && (
        <Link className="see-all" to="/people">
          {alsoWaiting > 0
            ? 'Everyone else'
            : upcoming.length > 0 && due.length > 0
              ? `All your people · next up ${nextUp(upcoming)}`
              : 'All your people'}
          <span aria-hidden="true"> →</span>
        </Link>
      )}

      <div className="add-bar">
        <button className="btn btn-secondary" onClick={() => navigate('/add')}>
          Add someone
        </button>
      </div>
    </>
  )
}
