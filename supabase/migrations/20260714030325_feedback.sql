-- Feedback: the only way the app can hear back.
--
-- Nudge is shared by link to a handful of people. If it annoys them, or a nudge never
-- arrives, or the wording lands wrong, the app has no way of learning that today — the
-- person just stops opening it. This table is the return path.
--
-- Context is captured automatically because the interesting part is the part nobody
-- thinks to mention: "it never notified me" means something completely different on an
-- installed iOS app with permission denied than in a desktop tab that was never asked.

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'other'
             check (kind in ('problem', 'idea', 'other')),
  message    text not null check (length(btrim(message)) between 1 and 4000),
  context    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- You can write feedback and read your own back; nobody can read anyone else's. There is
-- deliberately no update or delete policy — a sent note is sent, and the row is only ever
-- read by us. (auth.uid() in a subselect: evaluated once per statement, not once per row.)
create policy "insert own feedback" on public.feedback
  for insert
  with check (user_id = (select auth.uid()));

create policy "read own feedback" on public.feedback
  for select
  using (user_id = (select auth.uid()));

-- Cascading off auth.users keeps the promise Settings makes: deleting the account erases
-- everything. Losing the feedback with it is the cost of that promise, and it is the right
-- side to err on — the alternative is telling someone they were forgotten while keeping
-- something they wrote.
