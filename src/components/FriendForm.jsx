import { CATEGORIES, DEFAULT_STYLE } from '../lib/api'
import { NUDGE_STYLES, STYLE_DESCRIPTION, STYLE_LABEL } from '../lib/share'

/**
 * The fields that describe a friend. Shared by Add and Edit so the two can't drift
 * apart — a field added here shows up in both.
 */
export default function FriendForm({ values, onChange, hint }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  /**
   * Category suggests a style (family → call, mentor → check-in), but only while the
   * style is still whatever the old category suggested. Once it's been chosen
   * deliberately, changing category leaves it alone — the same rule the cadence follows.
   */
  function onCategoryChange(e) {
    const category = e.target.value
    const styleWasSuggested = values.nudgeStyle === DEFAULT_STYLE[values.category]
    onChange({
      ...values,
      category,
      nudgeStyle: styleWasSuggested ? DEFAULT_STYLE[category] : values.nudgeStyle,
    })
  }

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
        <select id="category" value={values.category} onChange={onCategoryChange}>
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
        <label htmlFor="nudgeStyle">How you keep in touch</label>
        <select id="nudgeStyle" value={values.nudgeStyle} onChange={set('nudgeStyle')}>
          {NUDGE_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABEL[s]}
            </option>
          ))}
        </select>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {STYLE_DESCRIPTION[values.nudgeStyle]}
        </p>
      </div>

      {/* Always offered, not just for the call style: any friend can be phoned on a
          given week, and hiding the field left the "Give them a call" button telling you
          to add a number with nowhere to add it. */}
      <div className="field">
        <label htmlFor="phone">Phone (optional)</label>
        <input
          id="phone"
          type="tel"
          value={values.phone}
          onChange={set('phone')}
          placeholder="+1 555 010 1234"
        />
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          With a number, calling them is one tap and logs itself. Without one, you can
          still log the call yourself.
        </p>
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
