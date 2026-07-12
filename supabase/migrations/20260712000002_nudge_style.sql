-- Not every relationship wants a hangout. A mentor wants a check-in, family wants a
-- call, and a friend three timezones away wants neither. The style belongs to the
-- friend, so the button on their card and the wording of the nightly push both follow
-- from it rather than assuming everyone should be invited out.
--
-- Phone is optional and only earns its keep for people you actually call: with it,
-- `call` one-taps into a real dial; without it, the app asks once or lets you log
-- the call by hand.

alter table public.friends add column phone text;
alter table public.friends add column nudge_style text
  check (nudge_style in ('hang', 'check_in', 'call'));

create or replace function public.default_style_for(category text)
returns text
language sql
immutable
as $$
  select case category
    when 'friend' then 'hang'
    when 'mentor' then 'check_in'
    when 'family' then 'call'
    when 'abroad' then 'check_in'
    else 'hang'
  end;
$$;

update public.friends set nudge_style = public.default_style_for(category);

-- Same guarantee as the cadence: a friend can never exist without a style, whether or
-- not the client sends one.
create or replace function public.default_nudge_style()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.nudge_style is null then
    new.nudge_style := public.default_style_for(new.category);
  end if;
  return new;
end;
$$;

create trigger friends_default_nudge_style
  before insert on public.friends
  for each row execute function public.default_nudge_style();

alter table public.friends alter column nudge_style set not null;

-- A call is a third kind of contact, and worth telling apart in the history.
alter table public.interactions drop constraint interactions_kind_check;
alter table public.interactions add constraint interactions_kind_check
  check (kind in ('caught_up', 'reached_out', 'called'));

-- The view has to carry the new columns; the overdue maths is unchanged. It has to be
-- dropped rather than replaced: `create or replace view` can only append columns, not
-- slot them in beside the ones they belong with.
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
  li.last_interaction_date,
  coalesce(li.last_interaction_date, f.created_at::date)          as last_contact_date,
  current_date - coalesce(li.last_interaction_date, f.created_at::date) as days_since_contact,
  (current_date - coalesce(li.last_interaction_date, f.created_at::date)) - rs.cadence_days
                                                                  as days_overdue
from public.friends f
join public.reminder_settings rs on rs.friend_id = f.id
left join lateral (
  select max(i.date) as last_interaction_date
  from public.interactions i
  where i.friend_id = f.id
) li on true;
