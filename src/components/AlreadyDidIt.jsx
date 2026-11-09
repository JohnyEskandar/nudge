import { useState } from 'react'
import AnswerCard from './AnswerCard'

/**
 * For the reach-out that happened in Messages, where the app can't see it: one quiet
 * button that opens the same answers the push and the next-open card use.
 */
export default function AlreadyDidIt({ friend, source, onDone }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button className="btn-quiet" onClick={() => setOpen(true)} style={{ marginTop: 12 }}>
        Already did it
      </button>
    )
  }
  return (
    <div style={{ marginTop: 12 }}>
      <AnswerCard friend={friend} source={source} question="How did you get in touch?" onDone={onDone} />
    </div>
  )
}
