/** The version of the privacy policy and terms people agree to. Bump it to ask again. */
export const POLICY_VERSION = '2026-11-12'

export const consentKey = (userId) => `nudge.consent.${userId}.${POLICY_VERSION}`
