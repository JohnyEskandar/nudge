import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/** The browser wants applicationServerKey as a Uint8Array, not the base64url string. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

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

/**
 * On iOS, PushManager only exists inside a home-screen web app — in a Safari tab it
 * is simply absent. So an unsupported result on iOS means "not installed yet",
 * which is a different message than "your browser can't do this at all".
 */
export function pushSupport() {
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  if (supported) return { state: 'supported' }
  if (isIOS() && !isStandalone()) return { state: 'needs-install' }
  return { state: 'unsupported' }
}

export function permissionState() {
  if (!('Notification' in window)) return 'default'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

/** Is this device already subscribed and saved server-side? */
export async function currentSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/**
 * Must be called from a user gesture — iOS rejects permission requests that aren't.
 * Returns { ok } or { ok: false, reason }.
 */
export async function enablePush() {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'VITE_VAPID_PUBLIC_KEY is not set in this build.' }
  }

  const { state } = pushSupport()
  if (state !== 'supported') return { ok: false, reason: state }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  const reg = await navigator.serviceWorker.ready

  // Reuse an existing subscription if the browser already has one; re-subscribing
  // with a different key throws.
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const { data: userRes } = await supabase.auth.getUser()
  const userId = userRes?.user?.id
  if (!userId) return { ok: false, reason: 'Not signed in.' }

  // Keyed on (user_id, endpoint) so the same device re-subscribing updates in place.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, subscription: sub.toJSON() },
      { onConflict: 'user_id,endpoint' },
    )

  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
