import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteAccount } from '../lib/api'
import { buildExport, downloadExport } from '../lib/export'
import { disablePush } from '../lib/push'
import { supabase } from '../lib/supabase'

/**
 * Where the things you do rarely live: leave, take your data with you, or erase it.
 *
 * Export and deletion are not paperwork. We are asking people to put years of their
 * relationships in here, and the price of that trust is being able to take it all out and
 * to be forgotten completely.
 */
export default function Settings() {
  const navigate = useNavigate()
  const [email, setEmail] = useState(null)
  const [busy, setBusy] = useState(null) // 'export' | 'delete'
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  async function onExport() {
    setBusy('export')
    setError(null)
    try {
      downloadExport(await buildExport())
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  async function onDelete() {
    setBusy('delete')
    setError(null)
    try {
      // Let go of the push subscription first: once the account is gone we can no longer
      // reach the row, and the device would keep a dead subscription forever.
      await disablePush().catch(() => {})
      await deleteAccount()
      await supabase.auth.signOut()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  return (
    <>
      <button className="back" onClick={() => navigate('/')}>
        ← Today
      </button>

      <h1>Settings</h1>
      <p className="sub">{email ?? ' '}</p>

      {error && <div className="error">{error}</div>}

      {/* First, because it's the only thing on this screen we're asking *of* you. */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Send feedback</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Nudge is new and shared with a handful of people. If something is annoying or
          broken, telling us is how it gets fixed.
        </p>
        <button className="btn btn-secondary" onClick={() => navigate('/feedback')}>
          Tell us what you think
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Your data</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Everyone you track and every catch-up you&rsquo;ve logged, as a file you keep.
        </p>
        <button className="btn btn-secondary" onClick={onExport} disabled={busy === 'export'}>
          {busy === 'export' ? 'Preparing…' : 'Export my people and history'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Account</h2>
        <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      <div className="card">
        <h2>Delete account</h2>
        {!confirming ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Erases your account, everyone on your list, and every catch-up you&rsquo;ve
              logged. It cannot be undone — export first if you might want any of it.
            </p>
            <button className="btn-danger-quiet" onClick={() => setConfirming(true)}>
              Delete my account
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              This is permanent. Type <strong>delete</strong> to confirm.
            </p>
            <div className="field">
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="delete"
                aria-label="Type delete to confirm"
                autoFocus
              />
            </div>
            <div className="row">
              <button
                className="btn"
                onClick={onDelete}
                disabled={typed.trim().toLowerCase() !== 'delete' || busy === 'delete'}
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete everything'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setConfirming(false)
                  setTyped('')
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
