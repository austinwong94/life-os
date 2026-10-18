-- Operational telemetry only: never update bookings, documents or workspace snapshots.
create table public.property_calendar_sync_status (
  owner_id uuid primary key references auth.users(id),
  run_id uuid not null,
  status text not null check (status in ('running','success','error','not_configured')),
  last_attempt_at timestamptz not null,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  block_count integer check (block_count >= 0),
  error_code text check (error_code in ('feed_unavailable','save_failed','workspace_unavailable','unexpected_failure'))
);
alter table public.property_calendar_sync_status enable row level security;
revoke all on public.property_calendar_sync_status from public, anon, authenticated;
grant select on public.property_calendar_sync_status to authenticated;
grant all on public.property_calendar_sync_status to service_role;
create policy property_calendar_sync_status_owner_read
  on public.property_calendar_sync_status for select to authenticated
  using ((select auth.uid()) = owner_id);

create function public.property_calendar_sync_begin(p_owner uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_run uuid := gen_random_uuid();
begin
  if not exists (select 1 from public.property_migration_control where owner_id=p_owner and integration_cutover_verified) then
    raise exception 'Property integration is not active';
  end if;
  insert into public.property_calendar_sync_status(owner_id,run_id,status,last_attempt_at)
  values(p_owner,v_run,'running',clock_timestamp())
  on conflict(owner_id) do update set run_id=excluded.run_id,status='running',
    last_attempt_at=excluded.last_attempt_at,last_finished_at=null,error_code=null;
  return v_run;
end;
$$;
create function public.property_calendar_sync_finish(p_owner uuid,p_run uuid,p_status text,p_blocks integer default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_finished timestamptz := clock_timestamp(); v_count integer;
begin
  if p_status not in ('success','error','not_configured') then raise exception 'Invalid calendar result'; end if;
  if p_status='success' and (p_blocks is null or p_blocks<0) then raise exception 'Missing calendar count'; end if;
  update public.property_calendar_sync_status set status=p_status,last_finished_at=v_finished,
    last_success_at=case when p_status='success' then v_finished else last_success_at end,
    block_count=case when p_status='success' then p_blocks else block_count end,
    error_code=case when p_status='error' then p_error else null end
  where owner_id=p_owner and run_id=p_run and status='running';
  get diagnostics v_count = row_count;
  return v_count=1;
end;
$$;
revoke all on function public.property_calendar_sync_begin(uuid) from public,anon,authenticated;
revoke all on function public.property_calendar_sync_finish(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.property_calendar_sync_begin(uuid) to service_role;
grant execute on function public.property_calendar_sync_finish(uuid,uuid,text,integer,text) to service_role;

-- Bootstrap only from a verified successful scheduled response, not from a browser save.
insert into public.property_calendar_sync_status(owner_id,run_id,status,last_attempt_at,last_finished_at,last_success_at,block_count)
select m.owner_id,gen_random_uuid(),'success',r.created,coalesce(b.synced,r.created),coalesce(b.synced,r.created),(x.report->>'blocks')::integer
from public.property_migration_control m
cross join lateral (
  select response.created,response.content::jsonb as body from net._http_response response
  where response.status_code=200 and not response.timed_out and response.error_msg is null
    and exists(select 1 from cron.job_run_details d join cron.job j using(jobid)
      where j.jobname='property-hourly-ical-sync' and d.status='succeeded'
        and response.created between d.start_time and d.end_time+interval '1 second')
  order by response.created desc limit 1
) r
cross join lateral jsonb_array_elements(r.body->'report') x(report)
left join lateral (select max(synced_at) synced from public.property_ical_blocks
  where user_id=m.owner_id and synced_at between r.created and r.created+interval '60 seconds') b on true
where m.integration_cutover_verified and r.body->>'ok'='true'
  and x.report->>'user'=m.owner_id::text and not (x.report ? 'fetchError' or x.report ? 'error')
  and (x.report->>'blocks') ~ '^[0-9]+$'
on conflict(owner_id) do nothing;
