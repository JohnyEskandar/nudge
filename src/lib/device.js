/**
 * What kind of device this is. Separate from push.js so that anything needing to know
 * what an iPhone is — the contacts picker included — doesn't have to pull in the push
 * module to find out.
 */

export function isIOS() {
  const ua = navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** True when running as an installed home-screen app rather than a browser tab. */
export function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}
