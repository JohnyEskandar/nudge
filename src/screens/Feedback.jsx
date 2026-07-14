import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sendFeedback } from '../lib/api'

const KINDS = [
  { value: 'problem', label: 'Something’s broken' },
  { value: 'idea', label: 'An idea' },
  { value: 'other', label: 'Something else' },
]

/**
 * The one screen that isn't about your friends — it's about the app.
 *
 * Deliberately one box and one button. Every field we add here is a field someone abandons
 * the form over, and a half-written thought we never see is worth less than a scrappy one
 * we do. Nothing is required except the words: the device details that would actually
 * explain a bug are collected in the background (see deviceContext in lib/api), because
 * asking a person to tell us whether they installed the app to their home screen is asking
 * them to debug it for us.
 */
export default function Feedback() {
  const navigate = useNavigate()
  const [kind, setKind] = useState('other')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setStatus('sending')

    try {
      await sendFeedback({ kind, message })
      setStatus('sent')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <>
        <button className="back" onClick={() => navigate('/settings')}>
          ← Settings
        </button>

        <h1>Thank you</h1>
        <p className="sub">
          It went straight to the person building this. Nudge is small enough that it will
          actually get read.
        </p>

        <button className="btn" onClick={() => navigate('/')}>
          Back to Today
        </button>

        <div className="spacer" />

        <button
          className="btn btn-secondary"
          onClick={() => {
            setMessage('')
            setKind('other')
            setStatus('idle')
          }}
        >
          Send something else
        </button>
      </>
    )
  }

  return (
    <>
      <button className="back" onClick={() => navigate('/settings')}>
        ← Settings
      </button>

      <h1>Send feedback</h1>
      <p className="sub">
        What&rsquo;s annoying, what&rsquo;s missing, what you&rsquo;d change. Half-formed is
        fine &mdash; it&rsquo;s more useful than nothing.
      </p>

      {error && <div className="error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="kind">What is it?</label>
          <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="message">Your note</label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="The notification came at a bad time…"
            maxLength={4000}
            rows={6}
            autoFocus
          />
        </div>

        <button
          className="btn"
          type="submit"
          disabled={status === 'sending' || !message.trim()}
        >
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </form>

      <p className="muted center" style={{ marginTop: 20 }}>
        Sent with your browser and notification settings, so a bug report makes sense
        without you having to explain your phone.
      </p>
    </>
  )
}
