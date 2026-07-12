-- Hardening pass over the functions created in the init migration, prompted by the
-- Supabase database linter.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, so both of these were
-- reachable as REST RPC endpoints (/rest/v1/rpc/...) by the anon role.

-- A trigger function has no business being callable directly. Calling it over REST
-- would error anyway ("trigger functions can only be called as triggers"), but it
-- is SECURITY DEFINER, so it should not be exposed at all. EXECUTE is only checked
-- when the trigger is created, not per row, so the trigger keeps working.
revoke all on function public.seed_reminder_settings() from public, anon, authenticated;

-- Pin the search_path so the function's meaning can't be changed by the caller's
-- search_path. The body is a bare CASE over a text argument and resolves nothing by
-- name, so an empty search_path is sufficient.
alter function public.default_cadence_for(text) set search_path = '';
