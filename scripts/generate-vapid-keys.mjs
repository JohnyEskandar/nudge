// Generates one VAPID keypair and prints it in the two shapes the app needs:
//
//   VAPID_KEYS            - ECDSA P-256 JWK pair, consumed by @negrel/webpush's
//                           importVapidKeys() inside the edge function.
//   VITE_VAPID_PUBLIC_KEY - the same public key as a raw uncompressed point in
//                           base64url, which is the only form the browser's
//                           pushManager.subscribe({ applicationServerKey }) accepts.
//
// These MUST come from the same keypair. Mismatched keys produce a subscription
// the push service accepts but that every send then fails on with 403.

import { webcrypto } from 'node:crypto'

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
)

const exported = {
  publicKey: await webcrypto.subtle.exportKey('jwk', publicKey),
  privateKey: await webcrypto.subtle.exportKey('jwk', privateKey),
}

const raw = await webcrypto.subtle.exportKey('raw', publicKey)
const applicationServerKey = Buffer.from(raw).toString('base64url')

console.log('# --- Supabase edge function secret (supabase secrets set) ---')
console.log(`VAPID_KEYS='${JSON.stringify(exported)}'`)
console.log()
console.log('# --- Frontend .env / Vercel env var ---')
console.log(`VITE_VAPID_PUBLIC_KEY=${applicationServerKey}`)
