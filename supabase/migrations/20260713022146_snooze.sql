-- The third door.
--
-- Until now a nudge had two exits: reach out, or log a catch-up that didn't happen.
-- The second is a lie the list then believes, so people either act or let the app rot.
-- Snoozing is the honest way to say "not now" — and "we're good" is the same mechanism
-- with a full cadence's worth of quiet, for when you simply don't need reminding yet.
--
-- A snooze pushes the due date out without inventing contact, so `last_contact_date`
-- stays truthful and the history stays clean.

alter table public.reminder_settings add column snoozed_until date;

-- days_overdue now measures from whichever comes later: the cadence coming due, or the
-- end of a snooze. With no snooze the arithmetic is exactly what it was.
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
  coalesce(li.last_interaction_date, f.created_at::date)               as last_contact_date,
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
) li on true;
