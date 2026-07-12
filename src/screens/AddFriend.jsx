import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addFriend, DEFAULT_CADENCE, DEFAULT_STYLE } from '../lib/api'
import FriendForm from '../components/FriendForm'

export default function AddFriend() {
  const navigate = useNavigate()
  const [values, setValues] = useState({
    name: '',
    category: 'friend',
    nudgeStyle: DEFAULT_STYLE.friend,
    phone: '',
    city: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const friend = await addFriend(values)
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
        <FriendForm
          values={values}
          onChange={setValues}
          hint={`Reminds you every ${DEFAULT_CADENCE[values.category]} days. You can change this later.`}
        />

        <button className="btn" type="submit" disabled={saving || !values.name.trim()}>
          {saving ? 'Saving…' : 'Add to my people'}
        </button>
      </form>
    </>
  )
}
