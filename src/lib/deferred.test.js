import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from './deferred'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('deferred', () => {
  it('commits after the undo window', async () => {
    const commit = vi.fn()
    const d = deferred(commit, 5000)
    d.start('talked')
    vi.advanceTimersByTime(4999)
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledWith('talked')
    expect(d.pending()).toBe(false)
  })

  it('never commits once undone', () => {
    const commit = vi.fn()
    const d = deferred(commit, 5000)
    d.start('talked')
    expect(d.undo()).toBe(true)
    vi.advanceTimersByTime(10000)
    expect(commit).not.toHaveBeenCalled()
  })

  it('commits straight away when flushed (leaving the screen)', () => {
    const commit = vi.fn()
    const d = deferred(commit, 5000)
    d.start('texted')
    d.flush()
    expect(commit).toHaveBeenCalledWith('texted')
    vi.advanceTimersByTime(10000)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('lets a more specific answer replace the pending one', () => {
    const commit = vi.fn()
    const d = deferred(commit, 5000)
    d.start('talked')
    d.replace('called')
    vi.advanceTimersByTime(5000)
    expect(commit).toHaveBeenCalledWith('called')
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('has nothing to undo or flush when idle', () => {
    const commit = vi.fn()
    const d = deferred(commit, 5000)
    expect(d.undo()).toBe(false)
    d.flush()
    expect(commit).not.toHaveBeenCalled()
  })
})
