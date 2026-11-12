import { useState } from 'react'
import { saveAskAbout } from '../lib/api'
import { callName } from '../lib/share'

/**
 * "Next time, ask about..." in your own words: the reason a later nudge can give. Optional,
 * one line, and only ever seen by you (it can appear in your own notifications).
 */
export default function AskAbout({ friend, onSaved, startOpen = false }) {
  const [open, setOpen] = useState(startOpen)
  const [text, setText] = useState(friend.ask_about ?? '')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (saved) return <p className="muted">Saved for next time.</p>

  if (!open) {
    return (
      <button className="btn-quiet" onClick={() => setOpen(true)}>
        {friend.ask_about ? `Next time: ask about ${friend.ask_about}` : 'Add something to ask next time'}
      </button>
    )
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveAskAbout(friend.id, text)
      setSaved(true)
      await onSaved?.()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} style={{ marginTop: 8, width: '100%' }}>
      <div className="field">
        <label htmlFor={`ask-${friend.id}`}>Next time, ask {callName(friend)} about</label>
        <input
          id={`ask-${friend.id}`}
          type="text"
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
          placeholder="the new job, the trip, her exams"
        />
        <p className="muted">Only you see this. It may show in your own nudges.</p>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-secondary" disabled={busy}>
        {busy ? 'Saving…' : 'Save it'}
      </button>
    </form>
  )
}
