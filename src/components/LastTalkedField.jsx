import { LAST_TALKED } from '../lib/schedule'

/**
 * "When did you last talk?" — the answer starts this person's clock, so a friend you
 * haven't spoken to in a year comes up in the next few weeks rather than in two months,
 * and someone you see all the time is never nudged about at all.
 */
export default function LastTalkedField({ id = 'lastTalked', value, onChange, label }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label ?? 'When did you last talk?'}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not sure</option>
        {LAST_TALKED.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {value === 'often' && (
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Nudge won&rsquo;t remind you about them. You can change that on their page.
        </p>
      )}
    </div>
  )
}
