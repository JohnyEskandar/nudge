/**
 * The third door out of a nudge, on every screen that shows one. Neither reaching out
 * nor pretending you did: "not now" and "next week" buy a little quiet, and "we're good"
 * buys a full cadence of it. None of them write a catch-up that never happened.
 */
export default function SnoozeActions({ cadenceDays, busy, onSnooze }) {
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <button className="btn-quiet" disabled={busy} onClick={() => onSnooze(3)}>
        Not now
      </button>
      <button className="btn-quiet" disabled={busy} onClick={() => onSnooze(7)}>
        Next week
      </button>
      <button
        className="btn-quiet"
        disabled={busy}
        onClick={() => onSnooze(cadenceDays)}
        title={`Quiet for another ${cadenceDays} days`}
      >
        We’re good
      </button>
    </div>
  )
}
