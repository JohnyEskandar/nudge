-- Reaching out and actually catching up are different events, but both answer the
-- nudge — you did the thing it asked — so both reset the cadence. friend_overview
-- reads the latest interaction whatever its kind, and needs no change.
--
-- Existing rows were all hand-logged catch-ups, which is what the default records.

alter table public.interactions
  add column kind text not null default 'caught_up'
  check (kind in ('caught_up', 'reached_out'));
