import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addFriend, CATEGORIES, DEFAULT_CADENCE, DEFAULT_STYLE } from '../lib/api'
import { nudgeTitle, STYLE_DESCRIPTION } from '../lib/share'
import PushOptIn from '../components/PushOptIn'

export const ONBOARDED_KEY = 'nudge.onboarded'

/**
 * The first run, which is where a tool like this lives or dies: an empty list teaches
 * nobody anything, and a cold permission prompt gets refused.
 *
 * Three steps. Name a few people you actually want to stay close to; see the exact
 * notification the app will send you about them; then, having felt what it is for, decide
 * about notifications. The push prompt comes last on purpose.
 */
export default function Onboarding() {
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('friend')
  const [added, setAdded] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function finish() {
    localStorage.setItem(ONBOARDED_KEY, '1')
    navigate('/', { replace: true })
  }

  async function onAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const friend = await addFriend({ name, category, city: '', notes: '', phone: '' })
      setAdded([...added, friend])
      setName('')
      setCategory('friend')
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  // --------------------------------------------------------------- step 1
  if (step === 1) {
    return (
      <>
        <h1>Who do you want to stay close to?</h1>
        <p className="sub">
          Start with five people you&rsquo;d hate to drift from. You can add more later, and
          nobody is told they&rsquo;re on your list.
        </p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={onAdd}>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maya Okonkwo"
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="category">How do you know them?</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              {STYLE_DESCRIPTION[DEFAULT_STYLE[category]]} Every {DEFAULT_CADENCE[category]}{' '}
              days, until you change it.
            </p>
          </div>

          <button className="btn btn-secondary" type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Adding…' : 'Add to my people'}
          </button>
        </form>

        {added.length > 0 && (
          <>
            <h2 style={{ marginTop: 32 }}>
              {added.length} {added.length === 1 ? 'person' : 'people'} so far
            </h2>
            {added.map((f) => (
              <div className="friend-card" key={f.id}>
                <div className="friend-top">
                  <span className="friend-name">{f.name}</span>
                  <span className="status">every {DEFAULT_CADENCE[f.category]} days</span>
                </div>
              </div>
            ))}

            <div className="spacer" />
            <button className="btn" onClick={() => setStep(2)}>
              Done adding
            </button>
          </>
        )}

        <div className="center" style={{ marginTop: 32 }}>
          <button className="btn-quiet" onClick={finish}>
            Skip for now
          </button>
        </div>
      </>
    )
  }

  // --------------------------------------------------------------- step 2
  // The exact notification they'll get, about a real person they just named.
  if (step === 2) {
    const first = added[0]
    const style = first.nudge_style ?? DEFAULT_STYLE[first.category]
    const cadence = DEFAULT_CADENCE[first.category]

    return (
      <>
        <h1>This is all it does</h1>
        <p className="sub">
          When it&rsquo;s been too long, your phone buzzes once. No feed, no daily digest,
          nothing else.
        </p>

        <div className="card push-preview">
          <div className="push-preview-app">NUDGE · now</div>
          <div className="push-preview-title">{nudgeTitle(first.name, style)}</div>
          <div className="push-preview-body">
            It&rsquo;s been {cadence} days past when you meant to catch up.
          </div>
        </div>

        <p className="muted" style={{ marginTop: 20 }}>
          Tap it and you&rsquo;re one button from reaching out — and Nudge writes it down for
          you, so there&rsquo;s nothing to remember. If it&rsquo;s the wrong week, snooze it;
          it never assumes you spoke when you didn&rsquo;t.
        </p>

        <div className="spacer" />
        <button className="btn" onClick={() => setStep(3)}>
          Makes sense
        </button>
      </>
    )
  }

  // --------------------------------------------------------------- step 3
  // Only now, having seen what the notification is for, do we ask for permission.
  return (
    <>
      <h1>One last thing</h1>
      <p className="sub">
        A nudge is no use if it can&rsquo;t reach you. This is the only notification Nudge
        will ever send.
      </p>

      <PushOptIn />

      <div className="spacer" />
      <button className="btn" onClick={finish}>
        Take me to my people
      </button>
    </>
  )
}
