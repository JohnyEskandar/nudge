import { supabase } from './supabase'
import { isIOS, isStandalone } from './device'

/**
 * A content-free log of what happened, for reading the test: never a name, a note, a
 * phone number or a message. Each row says what, when (in the user's own calendar and
 * time zone), on what kind of device, and from which build.
 *
 * Logging must never break the thing being logged, so logEvent never throws and is not
 * awaited by callers.
 */

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

/** Today in the user's own calendar, as YYYY-MM-DD. */
export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function platform() {
  const os = isIOS() ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop'
  return `${os}-${isStandalone() ? 'pwa' : 'web'}`
}

/** The columns every event and every answer carries. */
export function eventContext() {
  return {
    local_date: localDate(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: platform(),
    app_version: APP_VERSION,
  }
}

export function logEvent(name, { friendId = null, itemId = null, props = {} } = {}) {
  try {
    return supabase
      .from('events')
      .insert({ name, friend_id: friendId, item_id: itemId, props, ...eventContext() })
      .then(
        () => {},
        () => {},
      )
  } catch {
    return Promise.resolve()
  }
}
