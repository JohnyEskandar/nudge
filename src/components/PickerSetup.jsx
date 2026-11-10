import { useEffect, useState } from 'react'
import { pickerSupport } from '../lib/contacts'

export const PICKER_PENDING_KEY = 'nudge.picker.pending'

/**
 * What to say when there is no contact picker.
 *
 * On iOS the API exists but sits behind an off-by-default Safari Feature Flag, so its
 * absence means "not turned on yet" — worth walking through. Anywhere else the absence
 * is final, and inventing a settings path would send someone hunting for something that
 * isn't there.
 *
 * Only ever rendered after an explicit tap on "Choose from my contacts". Someone who
 * just wants to paste a list is never shown a browser-settings detour.
 */
export default function PickerSetup({ onReady, onDismiss }) {
  const [support, setSupport] = useState(() => pickerSupport())
  const [checkedAndMissing, setCheckedAndMissing] = useState(false)
  const needsFlag = support.state === 'needs-flag'

  // Applying the flag needs a full restart, which destroys this screen. Remember that a
  // setup was started, so Today can pick the thread back up when the app comes back.
  useEffect(() => {
    if (needsFlag) localStorage.setItem(PICKER_PENDING_KEY, '1')
  }, [needsFlag])

  function checkAgain() {
    const next = pickerSupport()
    setSupport(next)
    if (next.state === 'supported') {
      localStorage.removeItem(PICKER_PENDING_KEY)
      onReady()
    } else {
      setCheckedAndMissing(true)
    }
  }

  if (!needsFlag) {
    return (
      <div className="notice">
        <p>
          This browser doesn&rsquo;t offer a contact picker, and there&rsquo;s no setting
          that turns one on: it&rsquo;s a phone feature. Pasting a list of names works
          right here and ends up in the same place.
        </p>
        <button className="btn-quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="notice">
      <p>
        <strong>Picking from your contacts needs one switch turned on.</strong> Apple keeps
        the contact picker behind an experimental switch in Safari&rsquo;s settings, so
        it&rsquo;s off until you turn it on. It only affects Safari, and you can turn it
        back off whenever you like.
      </p>
      <ol>
        <li>
          Open <strong>Settings → Apps → Safari</strong>
        </li>
        <li>
          Tap <strong>Advanced → Feature Flags</strong>
        </li>
        <li>
          Find <strong>Contact Picker API</strong> and turn it on
        </li>
        <li>
          Come back, then fully close Nudge (swipe it away in the app switcher) and open
          it again
        </li>
      </ol>

      {checkedAndMissing && (
        <p>
          <strong>Still not there.</strong> It&rsquo;s usually one of two things: the
          Contact Picker API switch didn&rsquo;t stay on, or Nudge was only backgrounded
          rather than fully closed. Swipe it away in the app switcher and open it fresh.
        </p>
      )}

      <p className="muted">
        You don&rsquo;t have to do any of this. Pasting a list of names works right now and
        ends up in the same place.
      </p>

      <div className="row">
        <button className="btn" style={{ width: 'auto' }} onClick={checkAgain}>
          I&rsquo;ve done this, check again
        </button>
        <button className="btn-quiet" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}
