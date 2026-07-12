import { CATEGORIES } from '../lib/api'

/**
 * The four fields that describe a friend. Shared by Add and Edit so the two can't
 * drift apart — a field added here shows up in both.
 */
export default function FriendForm({ values, onChange, hint }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  return (
    <>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          type="text"
          value={values.name}
          onChange={set('name')}
          placeholder="Sam Okafor"
          required
          autoFocus
        />
      </div>

      <div className="field">
        <label htmlFor="category">Category</label>
        <select id="category" value={values.category} onChange={set('category')}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        {hint && (
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            {hint}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="city">City (optional)</label>
        <input
          id="city"
          type="text"
          value={values.city}
          onChange={set('city')}
          placeholder="Lisbon"
        />
      </div>

      <div className="field">
        <label htmlFor="notes">Notes (optional)</label>
        <textarea
          id="notes"
          value={values.notes}
          onChange={set('notes')}
          placeholder="How you met, what they're working on, what to ask about…"
        />
      </div>
    </>
  )
}
