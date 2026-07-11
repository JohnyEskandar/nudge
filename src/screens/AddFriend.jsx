import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addFriend, CATEGORIES, DEFAULT_CADENCE } from '../lib/api'

export default function AddFriend() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('friend')
  const [city, setCity] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const friend = await addFriend({ name, category, city, notes })
      navigate(`/friend/${friend.id}`, { replace: true })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <>
      <button className="back" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <h1>Add someone</h1>
      <p className="sub">
        Nudge will remind you when it&rsquo;s been longer than usual since you spoke.
      </p>

      {error && <div className="error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sam Okafor"
            required
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="category">Category</label>
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
            Reminds you every {DEFAULT_CADENCE[category]} days. You can change this later.
          </p>
        </div>

        <div className="field">
          <label htmlFor="city">City (optional)</label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Lisbon"
          />
        </div>

        <div className="field">
          <label htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How you met, what they're working on, what to ask about…"
          />
        </div>

        <button className="btn" type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Add to my people'}
        </button>
      </form>
    </>
  )
}
