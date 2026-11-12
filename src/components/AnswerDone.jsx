import AskAbout from './AskAbout'

/**
 * After an answer: what it bought (quiet), Undo while the answer is still being held,
 * and, after a bare "Already did it", an optional "How?" that costs nothing to skip.
 */
const HOW = [
  { value: 'texted', label: 'Texted' },
  { value: 'called', label: 'Called' },
  { value: 'saw_them', label: 'Saw them' },
]

export default function AnswerDone({ message, answer, askHow = false, friend, onDismiss }) {
  return (
    <div className="notice" role="status">
      <p>{message}</p>
      {askHow && answer.answer !== 'not_yet' && (
        <div className="chips">
          <span className="muted">How?</span>
          {HOW.map((h) => (
            <button
              key={h.value}
              className={answer.answer === h.value ? 'chip chip-on' : 'chip'}
              aria-pressed={answer.answer === h.value}
              onClick={() => answer.detail(h.value)}
            >
              {h.label}
            </button>
          ))}
        </div>
      )}
      <div className="quiet-row">
        {answer.phase === 'pending' && (
          <button className="btn-quiet" onClick={answer.undo}>
            Undo
          </button>
        )}
        {friend && answer.answer !== 'not_yet' && <AskAbout key={friend.id} friend={friend} />}
        {onDismiss && (
          <button className="btn-quiet" onClick={onDismiss}>
            OK
          </button>
        )}
      </div>
    </div>
  )
}
