import { supabase } from './supabase'

export const CATEGORIES = ['friend', 'mentor', 'family', 'abroad']

export const DEFAULT_CADENCE = {
  friend: 60,
  mentor: 90,
  family: 30,
  abroad: 45,
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

export async function addFriend({ name, category, city, notes }) {
  const { data: session } = await supabase.auth.getUser()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not signed in.')

  // reminder_settings is seeded by a DB trigger, so no second insert here.
  return unwrap(
    await supabase
      .from('friends')
      .insert({
        user_id: userId,
        name: name.trim(),
        category,
        city: city?.trim() || null,
        notes: notes?.trim() || null,
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
export async function updateFriend(id, { name, category, city, notes }, previous) {
  const friend = unwrap(
    await supabase
      .from('friends')
      .update({
        name: name.trim(),
        category,
        city: city?.trim() || null,
        notes: notes?.trim() || null,
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
      .insert({ friend_id: friendId, date, note: note?.trim() || null })
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
