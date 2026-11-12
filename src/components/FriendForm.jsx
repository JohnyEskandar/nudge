import { CATEGORIES, CATEGORY_LABEL, DEFAULT_CADENCE, DEFAULT_STYLE } from '../lib/categories'
import { rhythmOptions } from '../lib/rhythm'
import { REACH } from '../lib/share'
import LastTalkedField from './LastTalkedField'

/**
 * The fields that describe someone. Shared by Add and Edit so the two can't drift apart.
 *
 * The questions are the ones people actually answer: who they are to you, how often you
 * want to catch up, and how you usually reach them. Underneath they are still category,
 * cadence_days and nudge_style.
 */
export default function FriendForm({ values, onChange, hint, askLastTalked = false, askRhythm = false }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  /**
   * Who they are suggests a rhythm (family, monthly) and a way of reaching them (family,
   * a call), but only while those are still the suggestion. Once chosen deliberately,
   * changing who they are leaves them alone.
   */
  function onCategoryChange(e) {
    const category = e.target.value
    const styleWasSuggested = values.nudgeStyle === DEFAULT_STYLE[values.category]
    const rhythmWasSuggested = values.cadence == null || values.cadence === DEFAULT_CADENCE[values.category]
    onChange({
      ...values,
      category,
      nudgeStyle: styleWasSuggested ? DEFAULT_STYLE[category] : values.nudgeStyle,
      cadence: rhythmWasSuggested ? DEFAULT_CADENCE[category] : values.cadence,
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
          placeholder="Grace Okafor"
          required
          autoFocus
        />
      </div>

      <div className="field">
        <label htmlFor="nickname">What you call them (optional)</label>
        <input
          id="nickname"
          type="text"
          value={values.nickname ?? ''}
          onChange={set('nickname')}
          placeholder="Mom, Gran, An"
          maxLength={40}
        />
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Used in your drafts and nudges.
        </p>
      </div>

      <div className="field">
        <label htmlFor="category">Who are they to you?</label>
        <select id="category" value={values.category} onChange={onCategoryChange}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        {hint && (
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            {hint}
          </p>
        )}
      </div>

      {askRhythm && (
        <div className="field">
          <label htmlFor="cadence">How often do you want to catch up?</label>
          <select
            id="cadence"
            value={values.cadence ?? DEFAULT_CADENCE[values.category]}
            onChange={(e) => onChange({ ...values, cadence: Number(e.target.value) })}
          >
            {rhythmOptions(values.cadence).map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {askLastTalked && (
        <LastTalkedField
          value={values.lastTalked}
          onChange={(lastTalked) => onChange({ ...values, lastTalked })}
        />
      )}

      <div className="field">
        <label htmlFor="nudgeStyle">How do you usually reach them?</label>
        <select id="nudgeStyle" value={values.nudgeStyle} onChange={set('nudgeStyle')}>
          {REACH.map((r) => (
            <option key={r.style} value={r.style}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Always offered, not just for calls: any person can be phoned on a given week. */}
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
          With a number, calling them is one tap. Without one, you can still log the call
          yourself.
        </p>
      </div>

      <div className="field">
        <label htmlFor="birthday">Birthday (optional)</label>
        <input id="birthday" type="date" value={values.birthday} onChange={set('birthday')} />
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          On the day, Nudge reminds you once. The best excuse there is to reach out.
        </p>
      </div>

      <div className="field">
        <label htmlFor="city">City (optional)</label>
        <input id="city" type="text" value={values.city} onChange={set('city')} placeholder="Lisbon" />
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
