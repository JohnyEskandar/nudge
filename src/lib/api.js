import { supabase } from './supabase'

export const CATEGORIES = ['friend', 'mentor', 'family', 'abroad']

export const DEFAULT_CADENCE = {
  friend: 60,
  mentor: 90,
  family: 30,
  abroad: 45,
}

/** Mirrors default_style_for() in the database, which fills this in if we don't. */
export const DEFAULT_STYLE = {
  friend: 'hang',
  mentor: 'check_in',
  family: 'call',
  abroad: 'check_in',
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

/**
 * Every friend with their cadence and how overdue they are, most overdue first.
 * days_overdue > 0 means we're past due; <= 0 means still within cadence.
 */
export async function listFriends() {
  return unwrap(
    await supabase
      .from('friend_overview')
      .select('*')
      .order('days_overdue', { ascending: false })
      .order('name', { ascending: true }),
  )
}

export async function getFriend(id) {
  return unwrap(await supabase.from('friend_overview').select('*').eq('id', id).single())
}

export async function addFriend({ name, category, city, notes, phone, nudgeStyle, birthday }) {
  const { data: session } = await supabase.auth.getUser()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not signed in.')

  // reminder_settings and nudge_style are seeded by DB triggers, so no second insert
  // here, and nudge_style may be omitted entirely.
  const friend = unwrap(
    await supabase
      .from('friends')
      .insert({
        user_id: userId,
        name: name.trim(),
        category,
        city: city?.trim() || null,
        notes: notes?.trim() || null,
        phone: phone?.trim() || null,
        nudge_style: nudgeStyle ?? DEFAULT_STYLE[category],
      })
      .select()
      .single(),
  )

  if (birthday) await saveBirthday(friend.id, birthday)
  return friend
}

/**
 * One birthday per person, stored as month/day (the year is kept but only informational —
 * reminders recur). Replace rather than upsert: the uniqueness lives in a partial index
 * (`where kind = 'birthday'`), which PostgREST's on_conflict can't target.
 */
export async function saveBirthday(friendId, isoDate) {
  const { error } = await supabase
    .from('special_dates')
    .delete()
    .eq('friend_id', friendId)
    .eq('kind', 'birthday')
  if (error) throw new Error(error.message)

  if (!isoDate) return null

  const [year, month, day] = isoDate.split('-').map(Number)
  return unwrap(
    await supabase
      .from('special_dates')
      .insert({ friend_id: friendId, kind: 'birthday', month, day, year })
      .select()
      .single(),
  )
}

/** The stored birthday as the ISO string a date input wants, or '' when unknown. */
export function birthdayISO(friend) {
  if (!friend.birthday_month || !friend.birthday_year) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${friend.birthday_year}-${pad(friend.birthday_month)}-${pad(friend.birthday_day)}`
}

/**
 * Category seeds the cadence at insert time (see the friends_seed_reminder_settings
 * trigger), so changing it later should usually move the reminder too — but only when
 * the cadence is still sitting at the old category's default. A cadence the user set by
 * hand is a deliberate choice and survives a re-categorisation untouched.
 *
 * `previous` is the friend_overview row being edited: it carries both the old category
 * and the current cadence_days.
 */
export async function updateFriend(
  id,
  { name, category, city, notes, phone, nudgeStyle, birthday },
  previous,
) {
  const friend = unwrap(
    await supabase
      .from('friends')
      .update({
        name: name.trim(),
        category,
        city: city?.trim() || null,
        notes: notes?.trim() || null,
        phone: phone?.trim() || null,
        nudge_style: nudgeStyle,
      })
      .eq('id', id)
      .select()
      .single(),
  )

  if ((birthday ?? '') !== birthdayISO(previous)) {
    await saveBirthday(id, birthday || null)
  }

  const categoryChanged = previous.category !== category
  const cadenceIsStillDefault = previous.cadence_days === DEFAULT_CADENCE[previous.category]
  if (categoryChanged && cadenceIsStillDefault) {
    await setCadence(id, DEFAULT_CADENCE[category])
  }

  return friend
}

/**
 * The part of a bug report nobody thinks to include, and that we would ask for badly.
 *
 * "It never notified me" is three different bugs depending on this: an iOS app opened in a
 * Safari tab has no Push API at all, an installed one with permission 'denied' cannot be
 * asked again, and a desktop tab that was never asked is simply working as designed. The
 * timezone is here because every due-date in the app is currently computed in UTC, so a
 * complaint about a nudge landing on the wrong day is only legible next to where the
 * person actually is.
 */
function deviceContext() {
  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

  return {
    user_agent: navigator.userAgent,
    installed,
    push_supported: 'PushManager' in window,
    notification_permission:
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
  }
}

/**
 * The app's return path. Without it a tester who finds Nudge annoying, or who never got a
 * nudge at all, just quietly stops opening it and we learn nothing from the one cohort we
 * have.
 */
export async function sendFeedback({ kind, message }) {
  const { data: session } = await supabase.auth.getUser()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not signed in.')

  return unwrap(
    await supabase
      .from('feedback')
      .insert({
        user_id: userId,
        kind,
        message: message.trim(),
        context: deviceContext(),
      })
      .select()
      .single(),
  )
}

/**
 * Erases the account for good. Only the service role can delete an auth user, so the work
 * happens in the delete-account edge function; it identifies the caller from this access
 * token alone, never from anything we send it. Every table cascades off auth.users, so
 * one delete takes the lot.
 */
export async function deleteAccount() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Not signed in.')

  // invoke() sends the signed-in user's access token, which is the only thing the
  // function trusts to decide whose account this is.
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw new Error(error.message)
}

export async function deleteFriend(id) {
  const { error } = await supabase.from('friends').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listInteractions(friendId) {
  return unwrap(
    await supabase
      .from('interactions')
      .select('*')
      .eq('friend_id', friendId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  )
}

export async function logCatchUp(friendId, { date, note }) {
  return unwrap(
    await supabase
      .from('interactions')
      .insert({ friend_id: friendId, date, note: note?.trim() || null, kind: 'caught_up' })
      .select()
      .single(),
  )
}

/**
 * Recorded when you send someone a message or place a call, so reaching out and writing
 * it down are the same gesture — there is no separate bookkeeping step to forget.
 *
 * It's a proxy: we know the message went to the share sheet and the call went to the
 * dialler, not that either landed. Close enough, and the entry can be removed from the
 * history like any other if it didn't.
 */
export async function logContact(friendId, kind) {
  return unwrap(
    await supabase
      .from('interactions')
      .insert({
        friend_id: friendId,
        date: new Date().toISOString().slice(0, 10),
        kind, // 'reached_out' | 'called'
        note: null,
      })
      .select()
      .single(),
  )
}

export async function deleteInteraction(id) {
  const { error } = await supabase.from('interactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * The third door out of a nudge. "Reach out" and "log a catch-up" were the only two, so
 * saying "not now" meant logging contact that never happened — a lie the list then
 * believes. A snooze pushes the due date out and leaves the history honest.
 *
 * days: 3 or 7 for "not now"; a friend's full cadence for "we're good".
 */
export async function snoozeFriend(friendId, days) {
  const until = new Date()
  until.setDate(until.getDate() + days)

  return unwrap(
    await supabase
      .from('reminder_settings')
      .update({ snoozed_until: until.toISOString().slice(0, 10) })
      .eq('friend_id', friendId)
      .select()
      .single(),
  )
}

export async function setCadence(friendId, cadenceDays) {
  return unwrap(
    await supabase
      .from('reminder_settings')
      .update({ cadence_days: cadenceDays })
      .eq('friend_id', friendId)
      .select()
      .single(),
  )
}
