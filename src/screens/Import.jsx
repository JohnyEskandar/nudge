import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORIES, DEFAULT_CADENCE, addFriends, listFriends } from '../lib/api'
import { markDuplicates, parseContacts, pickContacts, pickerSupport } from '../lib/contacts'
import PickerSetup, { PICKER_PENDING_KEY } from '../components/PickerSetup'
import LastTalkedField from '../components/LastTalkedField'
import { CATEGORY_LABEL } from '../lib/categories'
import { rhythmLabel } from '../lib/rhythm'

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
  const [lastTalked, setLastTalked] = useState(null)
  const [existing, setExisting] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [setup, setSetup] = useState(false)

  /**
   * The same list twice: state to re-render on, and a ref for onPick to read.
   *
   * onPick is async and spends seconds parked on the native picker, so the `existing`
   * it closed over at click time is very likely stale by the time it resolves — and
   * unlike a paste, its rows are set *after* the effect below has already run and
   * no-opped on a null `rows`, so nothing would ever re-check them.
   */
  const existingRef = useRef([])

  useEffect(() => {
    listFriends()
      .then((all) => {
        existingRef.current = all
        setExisting(all)
      })
      .catch(() => setExisting([]))
  }, [])

  /**
   * Rows can exist before the friend list does — a paste reviewed while the fetch is
   * still in flight, or a picker the user opened straight away — and a name edited in
   * the review list can turn a row into a duplicate or out of one. Both are the same act,
   * so both come through here.
   */
  function recheckDuplicates() {
    setRows((rs) => (rs ? markDuplicates(rs, existing) : rs))
  }

  // Keyed on the list rather than on the fetch, so it does not matter which of the two
  // lands first: whichever is second re-checks against the other. `existing` is set at
  // most once, so this runs once.
  useEffect(recheckDuplicates, [existing])

  const found = useMemo(() => parseContacts(text, { category }).length, [text, category])
  const chosen = rows?.filter((r) => r.include && r.name.trim()) ?? []

  function review() {
    setError(null)
    setRows(markDuplicates(parseContacts(text, { category }), existing))
  }

  /**
   * Must stay inside the click's call stack — select() requires a user gesture, so an
   * await before it would lose the permission to open the picker at all.
   */
  async function onPick() {
    setError(null)
    if (pickerSupport().state !== 'supported') {
      setSetup(true)
      return
    }
    try {
      const picked = await pickContacts({ category })
      // Whoever got here has a working picker, so Today has nothing left to announce.
      localStorage.removeItem(PICKER_PENDING_KEY)
      if (picked.length) setRows(markDuplicates(picked, existingRef.current))
    } catch (e) {
      setError(`Couldn’t open your contacts: ${e.message}`)
    }
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
      await addFriends(chosen, { lastTalked, source: fromWelcome ? 'onboarding_import' : 'import' })
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
        Paste a list of names from a group chat, a note, anywhere. One per line. If a
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

          <div className="center" style={{ marginTop: 16 }}>
            <button className="btn-quiet" onClick={onPick}>
              Or choose from my contacts
            </button>
          </div>

          {setup && (
            <PickerSetup
              onReady={() => {
                setSetup(false)
                onPick()
              }}
              onDismiss={() => setSetup(false)}
            />
          )}
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="batch">These are mostly…</label>
            <select id="batch" value={category} onChange={(e) => onBatchCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              They come up {rhythmLabel(DEFAULT_CADENCE[category]).toLowerCase()}. Change
              anyone below, or any of them later.
            </p>
          </div>

          <LastTalkedField
            id="batchLastTalked"
            label="When did you last talk to most of them?"
            value={lastTalked}
            onChange={setLastTalked}
          />
          <p className="muted" style={{ marginTop: -8 }}>
            Nudge spreads them over the next few weeks, so they never all come up at once.
          </p>

          {rows.map((r, i) => (
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
                  onBlur={recheckDuplicates}
                  aria-label={`Name, row ${i + 1} of ${rows.length}`}
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
                    {CATEGORY_LABEL[c]}
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
