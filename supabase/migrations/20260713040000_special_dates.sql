-- Reasons to reach out.
--
-- A cadence tells you it's been too long, which is a fact. A birthday is a *reason* — the
-- single most common one people actually act on — and the last thing you talked about is
-- what turns a blank "hey" into a message worth sending. Both are surfaced from data the
-- app either already has or can be told once.
--
-- Dates recur every year, so the year is optional and never used for reminding; only the
-- month and day are.

create table public.special_dates (
  id         uuid primary key default gen_random_uuid(),
  friend_id  uuid not null references public.friends (id) on delete cascade,
  kind       text not null default 'birthday'
             check (kind in ('birthday', 'anniversary', 'other')),
  label      text,                                  -- for 'other': "started at Figma"
  month      integer not null check (month between 1 and 12),
  day        integer not null check (day between 1 and 31),
  year       integer check (year between 1900 and 2200),  -- optional, informational
  created_at timestamptz not null default now()
);
create index special_dates_friend_id_idx on public.special_dates (friend_id);

-- One birthday per person; other kinds can repeat.
create unique index special_dates_one_birthday
  on public.special_dates (friend_id)
  where kind = 'birthday';

alter table public.special_dates enable row level security;

-- Ownership is inherited from the friend, exactly as interactions and reminder_settings
-- do. auth.uid() sits in a subselect so it is evaluated once per statement, not per row.
create policy "own special dates" on public.special_dates
  for all
  using (exists (
    select 1 from public.friends f
    where f.id = friend_id and f.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.friends f
    where f.id = friend_id and f.user_id = (select auth.uid())
  ));

/*
 * The next time a month/day comes round, from a given day.
 *
 * Clamped to the length of the month so a 29 February birthday lands on the 28th in a
 * common year instead of raising — make_date() would reject the date outright, and a
 * reminder that throws once every four years is worse than one that is a day early.
 */
create or replace function public.next_occurrence(
  p_month integer,
  p_day integer,
  p_from date default current_date
)
returns date
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      extract(year from p_from)::int as yr,
      p_from                         as from_date
  ),
  candidates as (
    select
      make_date(yr, p_month, least(
        p_day,
        extract(day from (make_date(yr, p_month, 1) + interval '1 month - 1 day'))::int
      )) as this_year,
      make_date(yr + 1, p_month, least(
        p_day,
        extract(day from (make_date(yr + 1, p_month, 1) + interval '1 month - 1 day'))::int
      )) as next_year,
      from_date
    from bounds
  )
  select case when this_year >= from_date then this_year else next_year end
  from candidates;
$$;

-- friend_overview grows two reasons to reach out: when their birthday next falls, and the
-- last thing you wrote down about them. The overdue maths is untouched.
drop view public.friend_overview;

create view public.friend_overview
with (security_invoker = true)
as
select
  f.id,
  f.user_id,
  f.name,
  f.category,
  f.city,
  f.notes,
  f.phone,
  f.nudge_style,
  f.created_at,
  rs.cadence_days,
  rs.snoozed_until,
  li.last_interaction_date,
  ln.last_note,
  ln.last_note_date,
  bd.month                                                              as birthday_month,
  bd.day                                                                as birthday_day,
  bd.year                                                               as birthday_year,
  case when bd.month is not null
       then public.next_occurrence(bd.month, bd.day)
  end                                                                   as birthday_on,
  case when bd.month is not null
       then public.next_occurrence(bd.month, bd.day) - current_date
  end                                                                   as birthday_in_days,
  coalesce(li.last_interaction_date, f.created_at::date)                as last_contact_date,
  current_date - coalesce(li.last_interaction_date, f.created_at::date) as days_since_contact,
  greatest(
    coalesce(li.last_interaction_date, f.created_at::date) + rs.cadence_days,
    coalesce(rs.snoozed_until, '-infinity'::date)
  )                                                                     as due_on,
  current_date - greatest(
    coalesce(li.last_interaction_date, f.created_at::date) + rs.cadence_days,
    coalesce(rs.snoozed_until, '-infinity'::date)
  )                                                                     as days_overdue
from public.friends f
join public.reminder_settings rs on rs.friend_id = f.id
left join lateral (
  select max(i.date) as last_interaction_date
  from public.interactions i
  where i.friend_id = f.id
) li on true
-- The latest interaction that actually said something. A bare "reached out" with no note
-- must not wipe out the last real thing you know about them.
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
) bd on true;
