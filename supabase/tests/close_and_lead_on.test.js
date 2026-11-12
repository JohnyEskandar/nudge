import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, freshDb } from './db.js'

const ME = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'
let db

async function addFriend(user, name = 'Sam') {
  const { rows } = await db.query(
    `insert into public.friends (user_id, name, category) values ($1, $2, 'friend') returning id`,
    [user, name],
  )
  return rows[0].id
}

beforeAll(async () => {
  db = await freshDb()
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [ME, OTHER])
})

beforeEach(async () => {
  await db.exec(`delete from public.events; delete from public.plans; delete from public.friends;`)
})

describe('new events are accepted', () => {
  for (const name of [
    'answer_undone', 'answer_detail', 'friend_let_go', 'reply_shown', 'reply_answered',
    'plan_booked', 'plan_shown', 'plan_answered', 'consent_given', 'ask_about_saved',
  ]) {
    it(name, async () => {
      await asUser(db, ME, () => db.query(`insert into public.events (name) values ($1)`, [name]))
    })
  }
  it('still refuses an unknown name', async () => {
    await expect(
      asUser(db, ME, () => db.query(`insert into public.events (name) values ('made_up')`)),
    ).rejects.toThrow(/check/)
  })
})

describe('what you call them and what to ask about', () => {
  it('shows nickname and ask_about in friend_overview', async () => {
    const id = await addFriend(ME, 'Nguyen Van An')
    await db.query(`update public.friends set nickname = 'An', ask_about = 'the new job' where id = $1`, [id])
    const { rows } = await db.query(`select nickname, ask_about from public.friend_overview where id = $1`, [id])
    expect(rows[0]).toEqual({ nickname: 'An', ask_about: 'the new job' })
  })
})

describe('did they write back', () => {
  it('lets a user record the outcome of their own reach-out', async () => {
    const id = await addFriend(ME)
    const { rows: [i] } = await db.query(
      `insert into public.interactions (friend_id, kind) values ($1, 'reached_out') returning id`,
      [id],
    )
    await asUser(db, ME, () =>
      db.query(`update public.interactions set outcome = 'replied', outcome_at = now() where id = $1`, [i.id]),
    )
    const { rows } = await db.query(`select outcome from public.interactions where id = $1`, [i.id])
    expect(rows[0].outcome).toBe('replied')
  })

  it('refuses an unknown outcome', async () => {
    const id = await addFriend(ME)
    await expect(
      db.query(`insert into public.interactions (friend_id, kind, outcome) values ($1, 'reached_out', 'maybe')`, [id]),
    ).rejects.toThrow(/check/)
  })
})

describe('plans', () => {
  it('belong to the user who booked them', async () => {
    const mine = await addFriend(ME)
    const theirs = await addFriend(OTHER)
    await asUser(db, ME, () =>
      db.query(`insert into public.plans (friend_id, on_date) values ($1, current_date + 3)`, [mine]),
    )
    await expect(
      asUser(db, ME, () =>
        db.query(`insert into public.plans (friend_id, on_date) values ($1, current_date + 3)`, [theirs]),
      ),
    ).rejects.toThrow(/row-level security/)
    const { rows } = await asUser(db, OTHER, () => db.query(`select * from public.plans`))
    expect(rows).toHaveLength(0)
  })

  it('record how it went', async () => {
    const id = await addFriend(ME)
    const { rows: [p] } = await asUser(db, ME, () =>
      db.query(`insert into public.plans (friend_id, on_date) values ($1, current_date - 1) returning id`, [id]),
    )
    await asUser(db, ME, () =>
      db.query(`update public.plans set outcome = 'happened', answered_at = now() where id = $1`, [p.id]),
    )
    const { rows } = await db.query(`select outcome, user_id from public.plans`)
    expect(rows).toEqual([{ outcome: 'happened', user_id: ME }])
  })
})

describe('copy actually used', () => {
  it('is recorded per pushed item', async () => {
    const id = await addFriend(ME)
    await db.query(
      `insert into public.nudge_items (user_id, friend_id, reason, assignment, local_date, copy_used)
       values ($1, $2, 'overdue', 'nudged', current_date, 'reason')`,
      [ME, id],
    )
    await expect(
      db.query(
        `insert into public.nudge_items (user_id, friend_id, reason, assignment, local_date, copy_used)
         values ($1, $2, 'overdue', 'holdout', current_date, 'fancy')`,
        [ME, id],
      ),
    ).rejects.toThrow(/check/)
  })
})
