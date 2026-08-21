import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORIES, DEFAULT_CADENCE, addFriends, listFriends } from '../lib/api'
import { markDuplicates, parseContacts } from '../lib/contacts'

const PLACEHOLDER = `Maya Okonkwo
Sam Okafor +1 555 010 1234
Priya Raman`

const NOTE_LABEL = {
  duplicate: 'already on your list',
  unlikely: 'doesn’t look like a name',
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Adding people one at a time is where a new list stalls: you type someone, feel the
 * effort, and stop at one. This is the same act done in a batch — but nothing is
 * written until you have seen what was understood, because parsing free text is a
 * guess and a wrong guess should cost a tick box, not a person on your list.
 */
export default function Import() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromWelcome = params.get('from') === 'welcome'

  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)
  const [category, setCategory] = useState('friend')
  const [existing, setExisting] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    listFriends()
      .then(setExisting)
      .catch(() => setExisting([]))
  }, [])

  const found = useMemo(() => parseContacts(text, { category }).length, [text, category])
  const chosen = rows?.filter((r) => r.include && r.name.trim()) ?? []

  function review() {
    setError(null)
    setRows(markDuplicates(parseContacts(text, { category }), existing))
  }

  function patch(key, values) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...values } : r)))
  }

  /**
   * The batch selector moves only rows still sitting on the old default; one you set by
   * hand keeps what you chose. The same rule the nudge style follows in FriendForm and
   * the cadence follows in updateFriend.
   */
  function onBatchCategory(next) {
    setRows((rs) => rs?.map((r) => (r.category === category ? { ...r, category: next } : r)) ?? null)
    setCategory(next)
  }

  async function onImport() {
    if (!chosen.length) return
    setSaving(true)
    setError(null)
    try {
      await addFriends(chosen)
      navigate(fromWelcome ? '/welcome' : '/people', { replace: true })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <>
      <button className="back" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <h1>Add several at once</h1>
      <p className="sub">
        Paste a list of names — from a group chat, a note, anywhere. One per line. If a
        phone number is on the line, Nudge will pick it up.
      </p>

      {error && <div className="error">{error}</div>}

      {rows === null ? (
        <>
          <div className="field">
            <label htmlFor="paste">Names</label>
            <textarea
              id="paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={8}
              autoFocus
            />
          </div>

          <button className="btn" onClick={review} disabled={found === 0}>
            {found === 0 ? 'Add some names' : `Review ${plural(found, 'person', 'people')}`}
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="batch">These are mostly…</label>
            <select id="batch" value={category} onChange={(e) => onBatchCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Reminds you every {DEFAULT_CADENCE[category]} days. Change anyone below, or
              any of them later.
            </p>
          </div>

          {rows.map((r) => (
            <div className="card" key={r.key} style={{ marginBottom: 12 }}>
              <div className="row">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => patch(r.key, { include: e.target.checked })}
                  aria-label={`Add ${r.name}`}
                />
                <input
                  type="text"
                  value={r.name}
                  onChange={(e) => patch(r.key, { name: e.target.value })}
                  onBlur={() => setRows((rs) => markDuplicates(rs, existing))}
                  aria-label="Name"
                />
              </div>

              <div className="friend-meta">
                {r.phone ? r.phone : 'No number'}
                {r.note ? ` · ${NOTE_LABEL[r.note]}` : ''}
              </div>

              <select
                value={r.category}
                onChange={(e) => patch(r.key, { category: e.target.value })}
                aria-label={`Category for ${r.name}`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="spacer" />

          <button className="btn" onClick={onImport} disabled={saving || chosen.length === 0}>
            {saving ? 'Adding…' : `Add ${plural(chosen.length, 'person', 'people')}`}
          </button>

          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn-quiet" onClick={() => setRows(null)}>
              Back to the list
            </button>
          </div>
        </>
      )}
    </>
  )
}
