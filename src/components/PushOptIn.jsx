import { useEffect, useState } from 'react'
import {
  currentSubscription,
  enablePush,
  isIOS,
  permissionState,
  pushSupport,
} from '../lib/push'

const DISMISS_KEY = 'nudge.push.dismissed'

/**
 * Explains what notifications are for *before* triggering the browser prompt.
 * Renders nothing once the device is subscribed, or if the user dismissed it.
 */
export default function PushOptIn() {
  const [support, setSupport] = useState(null)
  const [subscribed, setSubscribed] = useState(true) // assume yes until checked, avoids a flash
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setSupport(pushSupport())
    currentSubscription()
      .then((sub) => setSubscribed(Boolean(sub) && permissionState() === 'granted'))
      .catch(() => setSubscribed(false))
  }, [])

  if (!support || subscribed || dismissed) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  // iOS in a Safari tab: there is no Push API at all until the app is on the home
  // screen, so a "turn on notifications" button here would do literally nothing.
  if (support.state === 'needs-install') {
    return (
      <div className="notice">
        <p>
          <strong>Want a nudge when it&rsquo;s been too long?</strong> On iPhone and iPad,
          notifications only work once Nudge is on your home screen.
        </p>
        <ol>
          <li>
            Tap the <strong>Share</strong> button in Safari
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>
          </li>
          <li>Open Nudge from your home screen, then turn on notifications here</li>
        </ol>
        <div className="spacer" />
        <button className="btn-quiet" onClick={dismiss}>
          Not now
        </button>
      </div>
    )
  }

  if (support.state === 'unsupported') return null

  if (permissionState() === 'denied') {
    return (
      <div className="notice">
        <p>
          Notifications are blocked for Nudge. To get reminders, re-enable them in your
          browser&rsquo;s site settings{isIOS() ? ' (Settings → Notifications → Nudge)' : ''}.
        </p>
        <button className="btn-quiet" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    )
  }

  async function onEnable() {
    setBusy(true)
    setError(null)
    const res = await enablePush()
    setBusy(false)

    if (res.ok) {
      setSubscribed(true)
      return
    }
    setError(
      res.reason === 'denied'
        ? 'You declined notifications. You can change this in your browser settings.'
        : res.reason,
    )
  }

  return (
    <div className="notice">
      <p>
        <strong>Get a gentle nudge?</strong> Once a day, Nudge can send you a notification
        when someone you care about is overdue for a catch-up. Nothing else &mdash; no
        marketing, no daily digest.
      </p>
      {error && (
        <p>
          <strong>{error}</strong>
        </p>
      )}
      <div className="row">
        <button className="btn" style={{ width: 'auto' }} onClick={onEnable} disabled={busy}>
          {busy ? 'Turning on…' : 'Turn on reminders'}
        </button>
        <button className="btn-quiet" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}
