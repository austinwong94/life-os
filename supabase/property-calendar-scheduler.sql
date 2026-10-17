-- Runtime configuration, not a schema migration. Both Vault entries must exist.
-- The gateway key is the existing public anon JWT, never a service-role key.
-- The independent private cron secret and cutover gate authorize refreshes.
-- Keep inactive until signed-in acceptance and integration checks pass.
select cron.alter_job(
 (select jobid from cron.job where jobname='property-hourly-ical-sync'),
 command:=$job$
  select net.http_post(
   url:='https://shrmhjulhfuodtrsqhpu.supabase.co/functions/v1/property-ical-cron-sync',
   headers:=jsonb_build_object(
    'content-type','application/json',
    'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='life-os-property-gateway-anon-key'),
    'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='life-os-property-ICAL_CRON_SECRET')
   ),body:='{}'::jsonb,timeout_milliseconds:=60000
  ) where exists(select 1 from public.property_migration_control where integration_cutover_verified)
 $job$,active:=false
);
