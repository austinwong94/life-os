-- Applied backend helpers. Callback secrets never enter the application bundle.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create function public.property_callback_secret(p_name text) returns text language sql security definer set search_path='' as $$
  select decrypted_secret from vault.decrypted_secrets where name='life-os-property-'||p_name and p_name in ('ICAL_CRON_SECRET','INGEST_SECRET','DIGEST_SECRET') limit 1
$$;
revoke all on function public.property_callback_secret(text) from public,anon,authenticated;
grant execute on function public.property_callback_secret(text) to service_role;
do $$ declare secret_name text; begin
  foreach secret_name in array array['ICAL_CRON_SECRET','INGEST_SECRET','DIGEST_SECRET'] loop
    if not exists(select 1 from vault.secrets where name='life-os-property-'||secret_name) then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'life-os-property-'||secret_name,'Private property callback authentication');
    end if;
  end loop;
end $$;
create function public.property_replace_ical_blocks(p_user uuid,p_blocks jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if not exists(select 1 from public.property_workspaces where user_id=p_user) or jsonb_typeof(p_blocks)<>'array' or jsonb_array_length(p_blocks)>3000 then raise exception 'Invalid property refresh'; end if;
  if exists(select 1 from jsonb_array_elements(p_blocks) b where b->>'user_id' is distinct from p_user::text or b->>'villa' not in ('Sunrise','Windmill') or (b->>'start_date')::date>=(b->>'end_date')::date or b->>'start_date' is null or b->>'end_date' is null) then raise exception 'Invalid property blocks'; end if;
  perform pg_advisory_xact_lock(hashtextextended('life-os-property-ical:'||p_user,0));
  delete from public.property_ical_blocks where user_id=p_user;
  insert into public.property_ical_blocks(user_id,villa,uid,start_date,end_date,reservation_url)
  select p_user,b->>'villa',coalesce(b->>'uid',''),b->>'start_date',b->>'end_date',coalesce(b->>'reservation_url','') from jsonb_array_elements(p_blocks) b on conflict do nothing;
  get diagnostics n=row_count;return n;
end $$;
revoke all on function public.property_replace_ical_blocks(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.property_replace_ical_blocks(uuid,jsonb) to service_role;
select cron.schedule('property-nightly-snapshot','0 18 * * *',$job$
  insert into public.property_workspace_history(app_data_id,user_id,data_type,record_key,data,source_updated_at,reason)
  select id,user_id,data_type,record_key,data,updated_at,'nightly' from public.property_workspaces on conflict(app_data_id,source_updated_at) do nothing;
$job$);
-- Unlike the old history cleanup, this never expires booking/document recovery.
select cron.schedule('property-scheduler-log-cleanup','30 18 * * *',$job$
  delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname in ('property-nightly-snapshot','property-scheduler-log-cleanup','property-hourly-ical-sync')) and end_time < now()-interval '30 days';
$job$);
select cron.schedule('property-hourly-ical-sync','7 * * * *',$job$
  select net.http_post(url:='https://shrmhjulhfuodtrsqhpu.supabase.co/functions/v1/property-ical-cron-sync',headers:=jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='life-os-property-ICAL_CRON_SECRET')),body:='{}'::jsonb,timeout_milliseconds:=60000)
  where exists(select 1 from public.property_migration_control where integration_cutover_verified);
$job$);
-- Do not run a second OTA integration until source/new-job ownership is verified.
select cron.alter_job((select jobid from cron.job where jobname='property-hourly-ical-sync'),active:=false);
