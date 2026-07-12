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

export async function addFriend({ name, category, city, notes, phone, nudgeStyle }) {
  const { data: session } = await supabase.auth.getUser()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not signed in.')

  // reminder_settings and nudge_style are seeded by DB triggers, so no second insert
  // here, and nudge_style may be omitted entirely.
  return unwrap(
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
  { name, category, city, notes, phone, nudgeStyle },
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

  const categoryChanged = previous.category !== category
  const cadenceIsStillDefault = previous.cadence_days === DEFAULT_CADENCE[previous.category]
  if (categoryChanged && cadenceIsStillDefault) {
    await setCadence(id, DEFAULT_CADENCE[category])
  }

  return friend
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
