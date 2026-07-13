-- Findings from the database linter (get_advisors), fixed in one place.
--
-- 1. Every RLS policy called auth.uid() bare, which Postgres re-evaluates per row.
--    Wrapped in a scalar subquery it is evaluated once per statement and the plan gets
--    an InitPlan instead — same meaning, linear speedup on large scans.
-- 2. default_style_for() had a role-mutable search_path; every other function was pinned
--    in 20260712003211_harden_functions but this one arrived later and slipped through.

alter policy "own friends" on public.friends
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own interactions" on public.interactions
  using (exists (
    select 1 from public.friends f
    where f.id = friend_id and f.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.friends f
    where f.id = friend_id and f.user_id = (select auth.uid())
  ));

alter policy "own reminder settings" on public.reminder_settings
  using (exists (
    select 1 from public.friends f
    where f.id = friend_id and f.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.friends f
    where f.id = friend_id and f.user_id = (select auth.uid())
  ));

alter policy "own push subscriptions" on public.push_subscriptions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter function public.default_style_for(text) set search_path = public;
