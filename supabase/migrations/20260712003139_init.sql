-- Nudge: schema, RLS, and overdue computation.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tables

create table public.friends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  category   text not null check (category in ('friend', 'mentor', 'family', 'abroad')),
  city       text,
  notes      text,
  created_at timestamptz not null default now()
);
create index friends_user_id_idx on public.friends (user_id);

create table public.interactions (
  id         uuid primary key default gen_random_uuid(),
  friend_id  uuid not null references public.friends (id) on delete cascade,
  date       date not null default current_date,
  note       text,
  created_at timestamptz not null default now()
);
create index interactions_friend_id_date_idx on public.interactions (friend_id, date desc);

create table public.reminder_settings (
  friend_id    uuid primary key references public.friends (id) on delete cascade,
  cadence_days integer not null check (cadence_days between 1 and 3650)
);

-- The browser's PushSubscription, stored whole. `endpoint` is pulled out as a
-- generated column so re-subscribing the same device updates instead of duplicating.
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  subscription jsonb not null,
  endpoint     text generated always as (subscription ->> 'endpoint') stored,
  created_at   timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ------------------------------------------------- default cadence per category

create or replace function public.default_cadence_for(category text)
returns integer
language sql
immutable
as $$
  select case category
    when 'friend' then 60
    when 'mentor' then 90
    when 'family' then 30
    when 'abroad' then 45
    else 60
  end;
$$;

-- Every friend gets reminder settings automatically, so a friend can never exist
-- without a cadence.
create or replace function public.seed_reminder_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reminder_settings (friend_id, cadence_days)
  values (new.id, public.default_cadence_for(new.category))
  on conflict (friend_id) do nothing;
  return new;
end;
$$;

create trigger friends_seed_reminder_settings
  after insert on public.friends
  for each row execute function public.seed_reminder_settings();

-- ---------------------------------------------------------------- RLS

alter table public.friends            enable row level security;
alter table public.interactions       enable row level security;
alter table public.reminder_settings  enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "own friends" on public.friends
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Interactions and reminder_settings have no user_id of their own; ownership is
-- inherited from the friend they hang off.
create policy "own interactions" on public.interactions
  for all
  using (exists (
    select 1 from public.friends f where f.id = friend_id and f.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.friends f where f.id = friend_id and f.user_id = auth.uid()
  ));

create policy "own reminder settings" on public.reminder_settings
  for all
  using (exists (
    select 1 from public.friends f where f.id = friend_id and f.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.friends f where f.id = friend_id and f.user_id = auth.uid()
  ));

create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- overdue view

-- One row per friend with last contact and how overdue they are. A friend with no
-- interactions yet is measured from created_at, so new friends age in naturally
-- rather than being instantly overdue or never overdue.
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
