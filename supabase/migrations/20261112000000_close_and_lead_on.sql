-- Close a nudge more easily, and see whether a reach-out led anywhere.
--
--   friends.nickname      what you call them, used in drafts and pushes ("Mom", "An")
--   friends.ask_about     "Next time, ask about..." in the user's own words: the reason
--                         the H2 reason arm puts in the push
--   interactions.outcome  "Did they write back?" after a text
--   plans                 "We made a plan": the date, then "How was it?"
--   nudge_items.copy_used which push copy the item actually got (an episode drawn for
--                         the reason arm gets plain copy when there is nothing to ask about)
--   events                the names the new screens log
--
-- Nothing here changes who is nudged, how often, the cooldown or the holdout.

alter table public.friends
  add column nickname     text check (nickname is null or length(trim(nickname)) between 1 and 40),
  add column ask_about    text check (ask_about is null or length(trim(ask_about)) between 1 and 120),
  add column ask_about_at timestamptz;

alter table public.interactions
  add column outcome    text check (outcome in ('replied', 'no_reply', 'not_yet')),
  add column outcome_at timestamptz;

alter table public.nudge_items
  add column copy_used text check (copy_used in ('plain', 'reason'));

create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  friend_id   uuid not null references public.friends (id) on delete cascade,
  on_date     date not null,
  outcome     text check (outcome in ('happened', 'didnt_happen')),
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index plans_user_idx on public.plans (user_id, on_date);

alter table public.plans enable row level security;

create policy "own plans" on public.plans
  for all
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.friends f
      where f.id = friend_id and f.user_id = (select auth.uid())
    )
  );

alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'app_opened', 'push_opened', 'push_permission',
  'friend_added', 'friend_deleted', 'friend_paused',
  'share_opened', 'call_tapped', 'reach_out_completed', 'reach_out_abandoned',
  'snoozed', 'confirm_shown', 'confirm_answered',
  'recall_shown', 'recall_answered', 'frequency_changed',
  -- added Nov 12, 2026
  'answer_undone', 'answer_detail', 'friend_let_go',
  'reply_shown', 'reply_answered',
  'plan_booked', 'plan_shown', 'plan_answered',
  'consent_given', 'ask_about_saved'
));

create or replace view public.friend_overview
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
  )                                                                 as held_out,
  -- New columns go last, so the view can be replaced in place.
  b.nickname,
  b.ask_about
from base b;
