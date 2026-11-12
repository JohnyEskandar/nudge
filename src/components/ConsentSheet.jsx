import { useState } from 'react'
import { Link } from 'react-router-dom'
import { logEvent } from '../lib/events'
import { consentKey, POLICY_VERSION } from '../lib/consent'

/**
 * Before anything else: who Nudge is for (13 and up), what it keeps, and that it is a
 * small study. Asked once per version of the policy, on each device.
 */
export default function ConsentSheet({ userId, onAccept }) {
  const [checked, setChecked] = useState(false)

  function accept() {
    try {
      localStorage.setItem(consentKey(userId), new Date().toISOString())
    } catch {
      // Private browsing: they will simply be asked again next time.
    }
    logEvent('consent_given', { props: { version: POLICY_VERSION } })
    onAccept()
  }

  return (
    <div className="legal">
      <h1>Before you start</h1>
      <p className="sub">
        Nudge keeps the people you add and your answers, so it can remind you and learn
        whether it helps. It never contacts the people on your list or reads your messages.
      </p>
      <p>
        Nudge is being tested with a small group. Its maker reads anonymous records of how
        the app is used, never names or notes, and sometimes holds a nudge back at random to
        compare fairly.
      </p>
      <label className="row consent-check" style={{ gap: 12, alignItems: 'flex-start', minHeight: 44 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ width: 24, height: 24, marginTop: 2 }}
        />
        <span>
          I&rsquo;m 13 or older, and I agree to the <Link to="/terms">Terms</Link> and{' '}
          <Link to="/privacy">Privacy</Link> policy.
        </span>
      </label>
      <div className="spacer" />
      <button className="btn" disabled={!checked} onClick={accept}>
        Agree and continue
      </button>
    </div>
  )
}
