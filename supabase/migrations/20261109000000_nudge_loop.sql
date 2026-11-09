-- Every nudge closes.
--
-- Until now daily-nudge had no memory: nothing recorded that a push went out, so it named
-- the same people every day, and a reach-out made outside the app (the usual kind) was
-- invisible, so they stayed due. This migration gives the loop a memory and an ending:
--
--   user_settings      how often the user wants a nudge, and when nudging may start
--   reminder_settings  + when you last talked (a seeded clock), a staggered first due date,
--                        and "we see each other all the time" (paused)
--   nudge_episodes     one per stretch of being due; a quarter are held out (recorded,
--                        never pushed) so a nudge can be told from what would have happened
--   nudge_items        one per person picked or held out on a day, with the answer
--   nudge_sends        one per push attempt, success or not
--   events             a content-free funnel log (no names, notes, phones or messages)
--   analytics_excluded_users  test, seed and founder accounts, filled by hand
--
-- Existing rows get none of the new values, so their due dates do not move.

-- ------------------------------------------------------------- user_settings

create table public.user_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  frequency        text not null default 'few_weekly'
                   check (frequency in ('daily', 'few_weekly', 'weekly')),
  start_nudging_on date,
  updated_at       timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "own settings" on public.user_settings
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------- the clock and the stagger

alter table public.reminder_settings
  add column clock_start  date,
  add column first_due_on date,
  add column paused       boolean not null default false;

-- ------------------------------------------------------------- the nudge record

create table public.nudge_episodes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- set null, not cascade: a friend deleted mid-episode is still an episode that started.
  friend_id    uuid references public.friends (id) on delete set null,
  assignment   text not null check (assignment in ('nudged', 'holdout')),
  copy_variant text not null default 'plain' check (copy_variant in ('plain', 'reason')),
  started_on   date not null,
  closed_at    timestamptz,
  close_reason text check (close_reason in ('answered', 'not_due', 'holdout_window_end')),
  created_at   timestamptz not null default now()
);
create index nudge_episodes_open_idx
  on public.nudge_episodes (user_id, friend_id) where closed_at is null;

create table public.nudge_items (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid references public.nudge_episodes (id) on delete set null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  friend_id     uuid references public.friends (id) on delete set null,
  reason        text not null check (reason in ('overdue', 'birthday')),
  assignment    text not null check (assignment in ('nudged', 'holdout')),
  days_overdue  integer,
  local_date    date not null,
  answer        text check (answer in ('texted', 'called', 'saw_them', 'talked', 'not_yet', 'no')),
  answered_at   timestamptz,
  recall_answer text check (recall_answer in ('texted', 'called', 'saw_them', 'talked', 'not_yet', 'no')),
  recall_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index nudge_items_user_date_idx on public.nudge_items (user_id, local_date desc);
create index nudge_items_friend_idx on public.nudge_items (friend_id);
-- One push a day, enforced where two overlapping runs (the cron and a manual invoke)
-- cannot both get past it: the second run's insert fails, and it pushes nothing.
create unique index nudge_items_one_push_a_day
  on public.nudge_items (user_id, local_date) where assignment = 'nudged';

create table public.nudge_sends (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid references public.nudge_items (id) on delete set null,
  user_id           uuid not null references auth.users (id) on delete cascade,
  subscription_host text,
  status            text not null check (status in ('sent', 'gone', 'failed', 'no_device')),
  http_status       integer,
  error             text,
  sent_at           timestamptz not null default now()
);
create index nudge_sends_user_idx on public.nudge_sends (user_id, sent_at desc);

alter table public.nudge_episodes enable row level security;
alter table public.nudge_items    enable row level security;
alter table public.nudge_sends    enable row level security; -- service role only

-- The app reads its own episodes and items (to hide held-out people from Today and to
-- ask about yesterday's nudge). Only daily-nudge and record_answer write them.
create policy "read own episodes" on public.nudge_episodes
  for select using ((select auth.uid()) = user_id);
create policy "read own items" on public.nudge_items
  for select using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------- events

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Plain ids, no foreign keys: the log outlives the friend it mentions.
  friend_id   uuid,
  item_id     uuid,
  name        text not null check (name in (
                'app_opened', 'push_opened', 'push_permission',
                'friend_added', 'friend_deleted', 'friend_paused',
                'share_opened', 'call_tapped', 'reach_out_completed', 'reach_out_abandoned',
                'snoozed', 'confirm_shown', 'confirm_answered',
                'recall_shown', 'recall_answered', 'frequency_changed'
              )),
  occurred_at timestamptz not null default now(),
  local_date  date,
  tz          text,
  platform    text,
  app_version text,
  props       jsonb not null default '{}'::jsonb
);
create index events_user_idx on public.events (user_id, occurred_at desc);

alter table public.events enable row level security;

-- Insert-only: nobody reads the log back through the API.
create policy "log own events" on public.events
  for insert with check ((select auth.uid()) = user_id);

create table public.analytics_excluded_users (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  reason   text not null,
  added_at timestamptz not null default now()
);
alter table public.analytics_excluded_users enable row level security; -- no client access

-- ------------------------------------------------------------- friend_overview

drop view public.friend_overview;

create view public.friend_overview
with (security_invoker = true)
as
with base as (
  select
    f.*,
    rs.cadence_days,
    rs.snoozed_until,
    rs.clock_start,
    rs.first_due_on,
    rs.paused,
    us.start_nudging_on,
    li.last_interaction_date,
    ln.last_note,
    ln.last_note_date,
    bd.month as bd_month,
    bd.day   as bd_day,
    bd.year  as bd_year,
    case
      when rs.paused then null
      else greatest(
        case
          when li.last_interaction_date is not null
            then li.last_interaction_date + rs.cadence_days
          when rs.first_due_on is not null
            then rs.first_due_on
          else coalesce(rs.clock_start, f.created_at::date) + rs.cadence_days
        end,
        coalesce(rs.snoozed_until, '-infinity'::date),
        coalesce(us.start_nudging_on, '-infinity'::date)
      )
    end as due_on
  from public.friends f
  join public.reminder_settings rs on rs.friend_id = f.id
  left join public.user_settings us on us.user_id = f.user_id
  left join lateral (
    select max(i.date) as last_interaction_date
    from public.interactions i
    where i.friend_id = f.id
  ) li on true
  -- The latest interaction that actually said something. A bare "reached out" with no
  -- note must not wipe out the last real thing you know about them.
  left join lateral (
    select i.note as last_note, i.date as last_note_date
    from public.interactions i
    where i.friend_id = f.id and i.note is not null and length(trim(i.note)) > 0
    order by i.date desc, i.created_at desc
    limit 1
  ) ln on true
  left join lateral (
    select sd.month, sd.day, sd.year
    from public.special_dates sd
    where sd.friend_id = f.id and sd.kind = 'birthday'
    limit 1
  ) bd on true
)
select
  b.id,
  b.user_id,
  b.name,
  b.category,
  b.city,
  b.notes,
  b.phone,
  b.nudge_style,
  b.created_at,
  b.cadence_days,
  b.snoozed_until,
  b.last_interaction_date,
  b.last_note,
  b.last_note_date,
  b.bd_month                                                        as birthday_month,
  b.bd_day                                                          as birthday_day,
  b.bd_year                                                         as birthday_year,
  case when b.bd_month is not null
       then public.next_occurrence(b.bd_month, b.bd_day)
  end                                                               as birthday_on,
  case when b.bd_month is not null
       then public.next_occurrence(b.bd_month, b.bd_day) - current_date
  end                                                               as birthday_in_days,
  coalesce(b.last_interaction_date, b.clock_start, b.created_at::date) as last_contact_date,
  current_date - coalesce(b.last_interaction_date, b.clock_start, b.created_at::date)
                                                                    as days_since_contact,
  b.due_on,
  current_date - b.due_on                                           as days_overdue,
  b.paused,
  b.clock_start,
  b.first_due_on,
  -- Held out right now: not pushed, and hidden from Today, for the episode's 7 days.
  exists (
    select 1 from public.nudge_episodes e
    where e.friend_id = b.id
      and e.closed_at is null
      and e.assignment = 'holdout'
      and e.started_on > current_date - 7
  )                                                                 as held_out
from base b;

-- ------------------------------------------------------------------ the RPCs

-- Writes the seeded clock and staggered due date for people just added, in one round
-- trip. Runs as the caller, so RLS on reminder_settings decides whose rows it may touch.
create or replace function public.apply_schedule(p jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.reminder_settings rs
     set clock_start  = (x ->> 'clock_start')::date,
         first_due_on = (x ->> 'first_due_on')::date,
         paused       = coalesce((x ->> 'paused')::boolean, false)
    from jsonb_array_elements(p) x
   where rs.friend_id = (x ->> 'friend_id')::uuid;
$$;

/*
 * The one place an answer to "did you reach them?" is recorded, from any door: the push
 * landing, "Already did it" on Today, the next-open card, the Sunday recall, or the
 * question after the share sheet or a call.
 *
 * A yes becomes an interaction (so the person stops being due) unless one already covers
 * it, closes the open episode, and stamps the item. Every answer, yes or no, is an event.
 * Definer rights because the user may read but not write episodes and items; ownership is
 * checked by hand first.
 */
create or replace function public.record_answer(
  p_friend_id   uuid,
  p_answer      text,
  p_source      text,
  p_item_id     uuid default null,
  p_local_date  date default null,
  p_tz          text default null,
  p_platform    text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_date  date := coalesce(p_local_date, current_date);
  v_since date;
  v_kind  text;
  v_yes   boolean;
  v_event text;
begin
  if v_user is null or not exists (
    select 1 from public.friends f where f.id = p_friend_id and f.user_id = v_user
  ) then
    raise exception 'no such friend' using errcode = '42501';
  end if;

  if p_answer not in ('texted', 'called', 'saw_them', 'talked', 'not_yet', 'no') then
    raise exception 'unknown answer %', p_answer using errcode = '22023';
  end if;
  if p_source not in ('push', 'today', 'confirm', 'recall', 'reach_out', 'detail') then
    raise exception 'unknown source %', p_source using errcode = '22023';
  end if;

  if p_item_id is not null then
    select i.local_date into v_since
      from public.nudge_items i
     where i.id = p_item_id and i.user_id = v_user and i.friend_id = p_friend_id;
    if not found then
      raise exception 'no such nudge' using errcode = '42501';
    end if;
  end if;

  v_kind := case p_answer
              when 'texted'   then 'reached_out'
              when 'called'   then 'called'
              when 'saw_them' then 'caught_up'
              when 'talked'   then 'caught_up'
            end;
  v_yes := v_kind is not null;

  if v_yes then
    -- One answer, one interaction: a recall tick after a next-day "texted" is the same
    -- reach-out, not a second one.
    if not exists (
      select 1 from public.interactions i
       where i.friend_id = p_friend_id and i.date >= coalesce(v_since, v_date)
    ) then
      insert into public.interactions (friend_id, date, kind)
      values (p_friend_id, v_date, v_kind);
    end if;

    update public.nudge_episodes
       set closed_at = now(), close_reason = 'answered'
     where friend_id = p_friend_id and user_id = v_user and closed_at is null;
  end if;

  if p_item_id is not null then
    if p_source = 'recall' then
      update public.nudge_items set recall_answer = p_answer, recall_at = now()
       where id = p_item_id;
    else
      update public.nudge_items set answer = p_answer, answered_at = now()
       where id = p_item_id;
    end if;
  end if;

  v_event := case
               when p_source = 'recall'    then 'recall_answered'
               when p_source = 'reach_out' then
                 case when v_yes then 'reach_out_completed' else 'reach_out_abandoned' end
               else 'confirm_answered'
             end;

  insert into public.events
    (user_id, friend_id, item_id, name, local_date, tz, platform, app_version, props)
  values
    (v_user, p_friend_id, p_item_id, v_event, v_date, p_tz, p_platform, p_app_version,
     jsonb_build_object('answer', p_answer, 'source', p_source));
end;
$$;

/*
 * Several answers at once, all or nothing: the Sunday recall. Recorded one by one, a
 * failure halfway would leave some people answered, and the recall (shown until anything
 * in the week is answered) would never come back for the rest.
 *
 * p_answers: [{ friend_id, answer, item_id }]
 */
create or replace function public.record_answers(
  p_answers     jsonb,
  p_source      text,
  p_local_date  date default null,
  p_tz          text default null,
  p_platform    text default null,
  p_app_version text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a jsonb;
begin
  for a in select * from jsonb_array_elements(p_answers) loop
    perform public.record_answer(
      (a ->> 'friend_id')::uuid,
      a ->> 'answer',
      p_source,
      (a ->> 'item_id')::uuid,
      p_local_date,
      p_tz,
      p_platform,
      p_app_version
    );
  end loop;
end;
$$;

revoke all on function public.apply_schedule(jsonb) from public, anon;
revoke all on function public.record_answers(jsonb, text, date, text, text, text) from public, anon;
grant execute on function public.record_answers(jsonb, text, date, text, text, text) to authenticated;
revoke all on function public.record_answer(uuid, text, text, uuid, date, text, text, text)
  from public, anon;
grant execute on function public.apply_schedule(jsonb) to authenticated;
grant execute on function public.record_answer(uuid, text, text, uuid, date, text, text, text)
  to authenticated;
