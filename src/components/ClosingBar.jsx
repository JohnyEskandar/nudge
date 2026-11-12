import { callName } from '../lib/share'
import { quietMessage } from '../lib/useAnswer'
import AnswerDone from './AnswerDone'

/**
 * Today, after "Already did it": the person has already left the list, and this says
 * what that bought (quiet), with Undo while the answer is held, an optional "How?", and
 * somewhere to note what to ask next time. It stays until put away, so nothing typed into
 * it can vanish when the answer saves.
 */
export default function ClosingBar({ closer }) {
  if (closer.phase === 'idle' || !closer.friend) return null
  return (
    <div style={{ marginBottom: 16 }}>
      {closer.error && <p className="error">{closer.error}</p>}
      <AnswerDone
        message={quietMessage(closer.answer, callName(closer.friend))}
        answer={closer}
        askHow
        friend={closer.friend}
        onDismiss={closer.phase === 'saved' ? closer.dismiss : null}
      />
    </div>
  )
}
