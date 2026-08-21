import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIOS, isStandalone } from './device'

afterEach(() => vi.unstubAllGlobals())

function stubNavigator(props) {
  vi.stubGlobal('navigator', { userAgent: '', platform: '', maxTouchPoints: 0, ...props })
}

describe('isIOS', () => {
  it('recognises an iPhone', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)' })
    expect(isIOS()).toBe(true)
  })

  it('recognises an iPad that claims to be a Mac', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 })
    expect(isIOS()).toBe(true)
  })

  it('does not mistake a real Mac for an iPad', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })
    expect(isIOS()).toBe(false)
  })

  it('is false on Android', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' })
    expect(isIOS()).toBe(false)
  })
})

describe('isStandalone', () => {
  it('is true for the iOS home-screen flag', () => {
    stubNavigator({ standalone: true })
    vi.stubGlobal('window', { navigator: { standalone: true }, matchMedia: () => ({ matches: false }) })
    expect(isStandalone()).toBe(true)
  })

  it('is true for display-mode: standalone', () => {
    vi.stubGlobal('window', { navigator: {}, matchMedia: () => ({ matches: true }) })
    expect(isStandalone()).toBe(true)
  })

  it('is false in an ordinary tab', () => {
    vi.stubGlobal('window', { navigator: {}, matchMedia: () => ({ matches: false }) })
    expect(isStandalone()).toBe(false)
  })
})
