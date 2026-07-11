import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setStatus('sending')

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })

    if (err) {
      setError(err.message)
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <div className="center" style={{ paddingTop: 80 }}>
        <h1>Check your inbox</h1>
        <p className="sub">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this device and
          you&rsquo;ll be signed straight in.
        </p>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setStatus('idle')
            setEmail('')
          }}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 72 }}>
      <h1>Nudge</h1>
      <p className="sub">
        A quiet place to keep track of the people you care about &mdash; and a gentle
        reminder when it&rsquo;s been too long.
      </p>

      {error && <div className="error">{error}</div>}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <button className="btn" type="submit" disabled={status === 'sending' || !email.trim()}>
          {status === 'sending' ? 'Sending…' : 'Send me a sign-in link'}
        </button>
      </form>

      <p className="muted center" style={{ marginTop: 20 }}>
        No password. We&rsquo;ll email you a link.
      </p>
    </div>
  )
}
