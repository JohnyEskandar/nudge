import { useEffect } from 'react'
import { logEvent } from '../lib/events'
import { formatDate } from '../lib/format'
import AnswerCard from './AnswerCard'

/** The next-open question about the most recent unanswered nudge (see confirm.js). */
export default function ConfirmCard({ pending, onDone }) {
  const { item, friend } = pending
  useEffect(() => {
    logEvent('confirm_shown', { friendId: friend.id, itemId: item.id })
  }, [friend.id, item.id])

  return (
    <div style={{ marginBottom: 16 }}>
      <AnswerCard
        friend={friend}
        itemId={item.id}
        source="confirm"
        note={`(from your nudge on ${formatDate(item.local_date)})`}
        onDone={onDone}
      />
    </div>
  )
}
