import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, freshDb } from './db.js'

const ME = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'

let db

/** Insert a friend as superuser; returns its id. created_at is `ageDays` ago. */
async function addFriend(user, { category = 'friend', ageDays = 0, name = 'Sam' } = {}) {
  const { rows } = await db.query(
    `insert into public.friends (user_id, name, category, created_at)
     values ($1, $2, $3, now() - make_interval(days => $4)) returning id`,
    [user, name, category, ageDays],
  )
  return rows[0].id
}

async function overview(friendId) {
  const { rows } = await db.query(
    `select *, due_on::text as due, (current_date)::text as today
       from public.friend_overview where id = $1`,
    [friendId],
  )
  return rows[0]
}

const days = (n) => `current_date + ${n}`

beforeAll(async () => {
  db = await freshDb()
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [ME, OTHER])
})

beforeEach(async () => {
  await db.exec(`
    delete from public.events; delete from public.nudge_items; delete from public.nudge_episodes;
    delete from public.friends; delete from public.user_settings;
  `)
})

describe('friend_overview: the clock', () => {
  it('leaves an existing person exactly where they were (created_at + cadence)', async () => {
    const id = await addFriend(ME, { ageDays: 70 }) // friend: 60-day cadence
    const f = await overview(id)
    expect(f.days_overdue).toBe(10)
    expect(f.paused).toBe(false)
    expect(f.held_out).toBe(false)
  })

  it('counts from "when did you last talk" when there is no interaction', async () => {
    const id = await addFriend(ME)
    await db.exec(`update public.reminder_settings set clock_start = ${days(-240)} where friend_id = '${id}'`)
    const f = await overview(id)
    expect(f.days_overdue).toBe(180)
    expect(f.days_since_contact).toBe(240)
  })

  it('uses the staggered first due date over the clock', async () => {
    const id = await addFriend(ME)
    await db.exec(`update public.reminder_settings
                     set clock_start = ${days(-240)}, first_due_on = ${days(5)}
                   where friend_id = '${id}'`)
    expect((await overview(id)).days_overdue).toBe(-5)
  })

  it('lets a real interaction take over from the staggered date', async () => {
    const id = await addFriend(ME)
    await db.exec(`update public.reminder_settings set first_due_on = ${days(5)} where friend_id = '${id}'`)
    await db.exec(`insert into public.interactions (friend_id, date) values ('${id}', ${days(-61)})`)
    expect((await overview(id)).days_overdue).toBe(1)
  })

  it('never makes a paused person due', async () => {
    const id = await addFriend(ME, { ageDays: 400 })
    await db.exec(`update public.reminder_settings set paused = true where friend_id = '${id}'`)
    const f = await overview(id)
    expect(f.due_on).toBeNull()
    expect(f.days_overdue).toBeNull()
  })

  it('waits for the user\'s start date', async () => {
    const id = await addFriend(ME, { ageDays: 400 })
    await db.exec(`insert into public.user_settings (user_id, start_nudging_on) values ('${ME}', ${days(30)})`)
    expect((await overview(id)).days_overdue).toBe(-30)
  })

  it('still honours a snooze', async () => {
    const id = await addFriend(ME, { ageDays: 400 })
    await db.exec(`update public.reminder_settings set snoozed_until = ${days(3)} where friend_id = '${id}'`)
    expect((await overview(id)).days_overdue).toBe(-3)
  })
})

describe('friend_overview: held_out', () => {
  async function episode(friendId, assignment, startedDaysAgo, closed = false) {
    await db.query(
      `insert into public.nudge_episodes (user_id, friend_id, assignment, started_on, closed_at)
       values ($1, $2, $3, current_date - $4::int, case when $5 then now() end)`,
      [ME, friendId, assignment, startedDaysAgo, closed],
    )
  }

  it('is true only inside an open holdout episode\'s 7 days', async () => {
    const held = await addFriend(ME, { ageDays: 70 })
    const nudged = await addFriend(ME, { ageDays: 70 })
    const stale = await addFriend(ME, { ageDays: 70 })
    const closed = await addFriend(ME, { ageDays: 70 })
    await episode(held, 'holdout', 6)
    await episode(nudged, 'nudged', 0)
    await episode(stale, 'holdout', 7)
    await episode(closed, 'holdout', 1, true)
    expect((await overview(held)).held_out).toBe(true)
    expect((await overview(nudged)).held_out).toBe(false)
    expect((await overview(stale)).held_out).toBe(false)
    expect((await overview(closed)).held_out).toBe(false)
  })
})

describe('record_answer', () => {
  async function nudge(friendId, assignment = 'nudged', daysAgo = 1) {
    const { rows: [ep] } = await db.query(
      `insert into public.nudge_episodes (user_id, friend_id, assignment, started_on)
       values ($1, $2, $3, current_date - $4::int) returning id`,
      [ME, friendId, assignment, daysAgo],
    )
    const { rows: [item] } = await db.query(
      `insert into public.nudge_items (episode_id, user_id, friend_id, reason, assignment, local_date)
       values ($1, $2, $3, 'overdue', $4, current_date - $5::int) returning id`,
      [ep.id, ME, friendId, assignment, daysAgo],
    )
    return { episodeId: ep.id, itemId: item.id }
  }

  const answer = (friendId, ans, source, itemId = null) =>
    asUser(db, ME, () =>
      db.query(`select public.record_answer($1, $2, $3, $4, current_date, 'America/Chicago', 'ios-pwa', 'test')`, [
        friendId,
        ans,
        source,
        itemId,
      ]),
    )

  it('turns a yes into an interaction, closes the episode and stamps the item', async () => {
    const id = await addFriend(ME, { ageDays: 70 })
    const { episodeId, itemId } = await nudge(id)
    await answer(id, 'texted', 'confirm', itemId)

    const { rows: inter } = await db.query(`select kind, date::text = current_date::text as today from public.interactions where friend_id = $1`, [id])
    expect(inter).toEqual([{ kind: 'reached_out', today: true }])
    const { rows: [ep] } = await db.query(`select close_reason from public.nudge_episodes where id = $1`, [episodeId])
    expect(ep.close_reason).toBe('answered')
    const { rows: [it] } = await db.query(`select answer from public.nudge_items where id = $1`, [itemId])
    expect(it.answer).toBe('texted')
    const { rows: ev } = await db.query(`select name, props, tz, platform from public.events`)
    expect(ev).toEqual([
      { name: 'confirm_answered', props: { answer: 'texted', source: 'confirm' }, tz: 'America/Chicago', platform: 'ios-pwa' },
    ])
    expect((await overview(id)).days_overdue).toBeLessThan(0)
  })

  it('maps each yes to the right interaction kind', async () => {
    for (const [ans, kind] of [
      ['called', 'called'],
      ['saw_them', 'caught_up'],
      ['talked', 'caught_up'],
    ]) {
      const id = await addFriend(ME, { ageDays: 70 })
      await answer(id, ans, 'today')
      const { rows } = await db.query(`select kind from public.interactions where friend_id = $1`, [id])
      expect(rows).toEqual([{ kind }])
    }
  })

  it('records "not yet" without inventing contact or closing the episode', async () => {
    const id = await addFriend(ME, { ageDays: 70 })
    const { episodeId, itemId } = await nudge(id)
    await answer(id, 'not_yet', 'push', itemId)
    const { rows: inter } = await db.query(`select 1 from public.interactions where friend_id = $1`, [id])
    expect(inter).toHaveLength(0)
    const { rows: [ep] } = await db.query(`select closed_at from public.nudge_episodes where id = $1`, [episodeId])
    expect(ep.closed_at).toBeNull()
  })

  it('does not count one reach-out twice when the recall agrees with the next-day card', async () => {
    const id = await addFriend(ME, { ageDays: 70 })
    const { itemId } = await nudge(id, 'nudged', 3)
    await answer(id, 'texted', 'confirm', itemId)
    await answer(id, 'talked', 'recall', itemId)
    const { rows } = await db.query(`select 1 from public.interactions where friend_id = $1`, [id])
    expect(rows).toHaveLength(1)
    const { rows: [it] } = await db.query(`select answer, recall_answer from public.nudge_items where id = $1`, [itemId])
    expect(it).toEqual({ answer: 'texted', recall_answer: 'talked' })
  })

  it('names reach-out answers for what they are', async () => {
    const id = await addFriend(ME, { ageDays: 70 })
    await answer(id, 'not_yet', 'reach_out')
    await answer(id, 'texted', 'reach_out')
    const { rows } = await db.query(`select name from public.events order by occurred_at, name`)
    expect(rows.map((r) => r.name).sort()).toEqual(['reach_out_abandoned', 'reach_out_completed'])
  })

  it('refuses someone else\'s friend', async () => {
    const theirs = await addFriend(OTHER, { ageDays: 70 })
    await expect(answer(theirs, 'texted', 'today')).rejects.toThrow(/no such friend/)
  })

  it('refuses an item that is not about that friend', async () => {
    const a = await addFriend(ME, { ageDays: 70 })
    const b = await addFriend(ME, { ageDays: 70 })
    const { itemId } = await nudge(a)
    await expect(answer(b, 'texted', 'confirm', itemId)).rejects.toThrow(/no such nudge/)
  })

  it('refuses an unknown answer', async () => {
    const id = await addFriend(ME, { ageDays: 70 })
    await expect(answer(id, 'maybe', 'today')).rejects.toThrow(/unknown answer/)
  })
})

describe('record_answers (the recall, all or nothing)', () => {
  async function item(friendId, daysAgo = 2) {
    const { rows: [it] } = await db.query(
      `insert into public.nudge_items (user_id, friend_id, reason, assignment, local_date)
       values ($1, $2, 'overdue', 'nudged', current_date - $3::int) returning id`,
      [ME, friendId, daysAgo],
    )
    return it.id
  }
  const submit = (answers) =>
    asUser(db, ME, () =>
      db.query(`select public.record_answers($1::jsonb, 'recall', current_date, 'UTC', 'ios-pwa', 'test')`, [
        JSON.stringify(answers),
      ]),
    )

  it('records every answer in one go', async () => {
    const a = await addFriend(ME, { ageDays: 70 })
    const b = await addFriend(ME, { ageDays: 70 })
    const [ia, ib] = [await item(a, 2), await item(b, 3)]
    await submit([
      { friend_id: a, answer: 'talked', item_id: ia },
      { friend_id: b, answer: 'no', item_id: ib },
    ])
    const { rows } = await db.query(`select recall_answer from public.nudge_items order by recall_answer`)
    expect(rows.map((r) => r.recall_answer)).toEqual(['no', 'talked'])
  })

  it('records none of them when one fails', async () => {
    const a = await addFriend(ME, { ageDays: 70 })
    const theirs = await addFriend(OTHER, { ageDays: 70 })
    const ia = await item(a)
    await expect(
      submit([
        { friend_id: a, answer: 'talked', item_id: ia },
        { friend_id: theirs, answer: 'no', item_id: null },
      ]),
    ).rejects.toThrow()
    const { rows } = await db.query(`select recall_at from public.nudge_items where id = $1`, [ia])
    expect(rows[0].recall_at).toBeNull()
  })
})

describe('one push a day', () => {
  it('refuses a second nudged item for the same user and day, but not a second holdout', async () => {
    const a = await addFriend(ME, { ageDays: 70 })
    const b = await addFriend(ME, { ageDays: 70 })
    const insert = (friend, assignment) =>
      db.query(
        `insert into public.nudge_items (user_id, friend_id, reason, assignment, local_date)
         values ($1, $2, 'overdue', $3, current_date)`,
        [ME, friend, assignment],
      )
    await insert(a, 'holdout')
    await insert(b, 'holdout')
    await insert(a, 'nudged')
    await expect(insert(b, 'nudged')).rejects.toThrow(/duplicate key/)
  })
})

describe('row security', () => {
  it('lets a user log their own events but never read the log back', async () => {
    await asUser(db, ME, () =>
      db.query(`insert into public.events (name, props) values ('app_opened', '{}')`),
    )
    const { rows } = await asUser(db, ME, () => db.query(`select * from public.events`))
    expect(rows).toHaveLength(0)
    const { rows: all } = await db.query(`select user_id from public.events`)
    expect(all).toEqual([{ user_id: ME }])
  })

  it('refuses an event logged as someone else', async () => {
    await expect(
      asUser(db, ME, () =>
        db.query(`insert into public.events (user_id, name) values ($1, 'app_opened')`, [OTHER]),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('shows a user their own nudge items and episodes only', async () => {
    const mine = await addFriend(ME, { ageDays: 70 })
    const theirs = await addFriend(OTHER, { ageDays: 70 })
    for (const [user, friend] of [
      [ME, mine],
      [OTHER, theirs],
    ]) {
      await db.query(
        `insert into public.nudge_items (user_id, friend_id, reason, assignment, local_date)
         values ($1, $2, 'overdue', 'nudged', current_date)`,
        [user, friend],
      )
    }
    const { rows } = await asUser(db, ME, () => db.query(`select friend_id from public.nudge_items`))
    expect(rows).toEqual([{ friend_id: mine }])
  })

  it('keeps the send log and the exclusion list away from users', async () => {
    await db.query(`insert into public.nudge_sends (user_id, status) values ($1, 'sent')`, [ME])
    await db.query(`insert into public.analytics_excluded_users (user_id, reason) values ($1, 'test')`, [ME])
    const { rows: sends } = await asUser(db, ME, () => db.query(`select * from public.nudge_sends`))
    const { rows: excl } = await asUser(db, ME, () => db.query(`select * from public.analytics_excluded_users`))
    expect(sends).toHaveLength(0)
    expect(excl).toHaveLength(0)
  })

  it('applies a schedule to the caller\'s own people only', async () => {
    const mine = await addFriend(ME)
    const theirs = await addFriend(OTHER)
    const plan = JSON.stringify([
      { friend_id: mine, clock_start: '2026-08-01', first_due_on: '2026-11-30', paused: false },
      { friend_id: theirs, clock_start: null, first_due_on: null, paused: true },
    ])
    await asUser(db, ME, () => db.query(`select public.apply_schedule($1::jsonb)`, [plan]))
    const { rows } = await db.query(
      `select friend_id, clock_start::text, first_due_on::text, paused from public.reminder_settings
        where friend_id in ($1, $2) order by friend_id = $1 desc`,
      [mine, theirs],
    )
    expect(rows).toEqual([
      { friend_id: mine, clock_start: '2026-08-01', first_due_on: '2026-11-30', paused: false },
      { friend_id: theirs, clock_start: null, first_due_on: null, paused: false },
    ])
  })

  it('keeps each user\'s settings private', async () => {
    await db.query(`insert into public.user_settings (user_id, frequency) values ($1, 'weekly')`, [OTHER])
    const { rows } = await asUser(db, ME, () => db.query(`select * from public.user_settings`))
    expect(rows).toHaveLength(0)
  })
})
