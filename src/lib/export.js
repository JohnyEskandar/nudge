import { supabase } from './supabase'

/**
 * Your people and your history, in a file you keep.
 *
 * We are asking people to put years of their relationships into this app, and the honest
 * price of that is being able to walk out with all of it. Everything here is read through
 * RLS as the signed-in user, so an export can only ever contain your own rows.
 */
export async function buildExport() {
  const [{ data: friends, error: fErr }, { data: interactions, error: iErr }] =
    await Promise.all([
      supabase.from('friend_overview').select('*').order('name'),
      supabase.from('interactions').select('*').order('date', { ascending: false }),
    ])

  if (fErr) throw new Error(fErr.message)
  if (iErr) throw new Error(iErr.message)

  // Nest the history under each person rather than shipping two flat tables: the file
  // should be readable by a human, not just re-importable by a machine.
  const byFriend = new Map(friends.map((f) => [f.id, []]))
  for (const i of interactions) {
    byFriend.get(i.friend_id)?.push({ date: i.date, kind: i.kind, note: i.note })
  }

  return {
    exported_at: new Date().toISOString(),
    app: 'Nudge',
    format: 1,
    people: friends.map((f) => ({
      name: f.name,
      category: f.category,
      nudge_style: f.nudge_style,
      cadence_days: f.cadence_days,
      city: f.city,
      phone: f.phone,
      notes: f.notes,
      added_on: f.created_at?.slice(0, 10),
      last_contact: f.last_interaction_date,
      history: byFriend.get(f.id) ?? [],
    })),
  }
}

/** Hands the file to the browser, which saves it wherever the user keeps things. */
export function downloadExport(data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `nudge-export-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
