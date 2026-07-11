-- Schedules daily-nudge to run once a day.
--
-- Supabase has no config-file cron: scheduling lives in the database via pg_cron,
-- and the HTTP call out to the edge function is made by pg_net.
--
-- The project URL and service role key are read from Supabase Vault at call time,
-- so no secret is ever written into this migration. Populate them once with:
--
--   select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'project_url');
--   select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_daily_nudge()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into service_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if project_url is null or service_key is null then
    raise exception 'vault secrets project_url / service_role_key are not set';
  end if;

  perform net.http_post(
    url     := project_url || '/functions/v1/daily-nudge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- Only the scheduler (and the postgres owner) should be able to fire this; it holds
-- the service role key. Revoke it from the API-facing roles.
revoke all on function public.trigger_daily_nudge() from public, anon, authenticated;

-- 16:00 UTC daily — late morning in the US, late afternoon in Europe. pg_cron
-- always schedules in UTC; change this expression to move the send time.
select cron.unschedule('daily-nudge') where exists (
  select 1 from cron.job where jobname = 'daily-nudge'
);

select cron.schedule(
  'daily-nudge',
  '0 16 * * *',
  $$ select public.trigger_daily_nudge(); $$
);
