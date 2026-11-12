import { doneMessage, pendingQuestion } from '../lib/useReachOut'

/**
 * After the share sheet, the clipboard or the dialler: "Did it go through?". Only a yes
 * is recorded as contact.
 */
export default function ReachOutPrompt({ friend, pending, done, busy, onConfirm }) {
  if (done?.id === friend.id) return <div className="notice">{doneMessage(done.yes, friend)}</div>
  if (pending?.id !== friend.id) return null
  return (
    <div className="notice">
      <p>
        <strong>{pendingQuestion(pending.how, friend)}</strong>
      </p>
      <div className="row">
        <button className="btn" style={{ width: 'auto' }} disabled={busy} onClick={() => onConfirm(friend, true)}>
          Yes
        </button>
        <button className="btn-quiet" disabled={busy} onClick={() => onConfirm(friend, false)}>
          Not yet
        </button>
      </div>
    </div>
  )
}
