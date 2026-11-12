/**
 * After an answer: what it bought (quiet), Undo while the answer is still being held,
 * and, after a bare "Already did it", an optional "How?" that costs nothing to skip.
 */
const HOW = [
  { value: 'texted', label: 'Texted' },
  { value: 'called', label: 'Called' },
  { value: 'saw_them', label: 'Saw them' },
]

export default function AnswerDone({ message, answer, askHow = false }) {
  return (
    <div className="notice" role="status">
      <p style={{ marginTop: 0, marginBottom: answer.phase === 'pending' || askHow ? 8 : 0 }}>
        {message}
      </p>
      {askHow && answer.answer !== 'not_yet' && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
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
      {answer.phase === 'pending' && (
        <button className="btn-quiet" onClick={answer.undo}>
          Undo
        </button>
      )}
    </div>
  )
}
