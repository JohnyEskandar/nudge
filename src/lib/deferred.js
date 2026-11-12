/**
 * Undo beats confirm. An answer is held for a few seconds before it is recorded, so a
 * mistaken tap costs one more tap instead of a wrong record, and no answer ever needs an
 * "Are you sure?". Leaving the screen records it at once (flush), so nothing is lost.
 *
 * deferred(commit, ms) → { start(value), replace(value), undo(), flush(), pending() }
 */
export function deferred(commit, ms) {
  let value = null
  let timer = null

  function clear() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function fire() {
    clear()
    const v = value
    value = null
    if (v !== null) commit(v)
  }

  return {
    start(v) {
      clear()
      value = v
      timer = setTimeout(fire, ms)
    },
    /** A more specific answer chosen inside the window (e.g. "Texted" after "Already did it"). */
    replace(v) {
      if (value === null) return false
      value = v
      return true
    },
    undo() {
      if (value === null) return false
      clear()
      value = null
      return true
    },
    flush() {
      if (value !== null) fire()
    },
    pending: () => value !== null,
  }
}
