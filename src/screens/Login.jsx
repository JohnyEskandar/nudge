import { useState } from 'react'
import { supabase } from '../lib/supabase'

// The one-time token out of a sign-in link. The email's link points at GoTrue's
// /auth/v1/verify?token=...&type=magiclink; we also accept a bare token, and the
// post-redirect URL shapes, so that whatever the user manages to copy still works.
function tokenFromLink(input) {
  const text = input.trim()
  if (!text) return null

  try {
    const url = new URL(text)
    const q = url.searchParams
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const token = q.get('token') ?? q.get('token_hash') ?? hash.get('token_hash')
    if (token) return { token, type: q.get('type') ?? 'magiclink' }
  } catch {
    // Not a URL — fall through and treat it as a bare token.
  }

  return /^[A-Za-z0-9._-]+$/.test(text) ? { token: text, type: 'magiclink' } : null
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | verifying
  const [error, setError] = useState(null)
  const [link, setLink] = useState('')

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

  // Pasting the link is the only way to sign in a home-screen app on iOS. Tapping the
  // link in Mail opens Safari, which is a separate storage context from the installed
  // app — the session would land in Safari and the app would still be logged out.
  // verifyOtp() redeems the token directly here, so the session is created in the app.
  async function onPasteLink(e) {
    e.preventDefault()
    setError(null)

    const parsed = tokenFromLink(link)
    if (!parsed) {
      setError("That doesn't look like a sign-in link. Copy the whole link from the email.")
      return
    }

    setStatus('verifying')
    const { error: err } = await supabase.auth.verifyOtp({
      type: parsed.type,
      token_hash: parsed.token,
    })

    if (err) {
      setError(err.message)
      setStatus('sent')
      return
    }
    // onAuthStateChange in App.jsx takes it from here.
  }

  if (status === 'sent' || status === 'verifying' || status === 'paste') {
    return (
      <div style={{ paddingTop: 64 }}>
        <h1>{status === 'paste' ? 'Paste your link' : 'Check your inbox'}</h1>
        {status !== 'paste' && (
          <p className="sub">
            We sent a sign-in link to <strong>{email}</strong>.
          </p>
        )}

        {error && <div className="error">{error}</div>}

        <p className="sub">
          <strong>If you added Nudge to your home screen</strong>, don&rsquo;t tap the link
          &mdash; it opens in Safari, which can&rsquo;t sign this app in. Instead:
          long-press the link, choose <strong>Copy Link</strong>, and paste it here.
        </p>

        <form onSubmit={onPasteLink}>
          <div className="field">
            <label htmlFor="link">Paste your sign-in link</label>
            <input
              id="link"
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          <button
            className="btn"
            type="submit"
            disabled={status === 'verifying' || !link.trim()}
          >
            {status === 'verifying' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted center" style={{ marginTop: 20 }}>
          On a computer you can just tap the link in the email.
        </p>

        <button
          className="btn btn-secondary"
          onClick={() => {
            setStatus('idle')
            setLink('')
            setError(null)
          }}
        >
          Back
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

      {/* Reachable without sending an email: the built-in mailer is rate limited, and a
          link can also be issued out of band. Without this the paste box was only
          reachable via a successful send, which is exactly what fails when rate limited. */}
      <button
        className="btn btn-secondary"
        onClick={() => {
          setError(null)
          setStatus('paste')
        }}
      >
        I already have a sign-in link
      </button>
    </div>
  )
}
