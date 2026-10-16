-- Applied additive operational namespace. Original transfer rows and user_states stay untouched.
create table public.property_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  data_type text not null default 'full_app_backup' check(data_type='full_app_backup'),
  record_key text not null default 'sunrise-villa-main' check(record_key='sunrise-villa-main'),
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(user_id,data_type,record_key), unique(id,user_id)
);
create table public.property_workspace_history (
  id bigint generated always as identity primary key,
  app_data_id uuid not null,
  user_id uuid not null references auth.users(id),
  data_type text not null,
  record_key text not null,
  data jsonb not null,
  source_updated_at timestamptz not null,
  snapshot_at timestamptz not null default now(),
  reason text not null default 'before-update',
  foreign key(app_data_id,user_id) references public.property_workspaces(id,user_id),
  unique(app_data_id,source_updated_at)
);
create table public.property_ical_blocks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  villa text not null check(villa in ('Sunrise','Windmill')),
  uid text not null default '',
  start_date text not null,
  end_date text not null,
  reservation_url text not null default '',
  synced_at timestamptz not null default now(),
  unique(user_id,villa,uid,start_date,end_date)
);
create table public.property_booking_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  source text not null default 'airbnb_email',
  status text not null default 'new' check(status in ('new','imported','dismissed')),
  guest text,villa text,arrival date,nights integer,revenue numeric,confirmation_code text,guest_count text,raw jsonb,
  created_at timestamptz not null default now(),
  unique(user_id,source,confirmation_code)
);
create table public.property_ai_usage (
  user_id uuid not null references auth.users(id),fn text not null,day date not null default current_date,calls integer not null default 0,
  primary key(user_id,fn,day)
);
create table public.property_migration_control (
  owner_id uuid primary key references auth.users(id),
  batch_id text not null references public.property_transfer_batches(batch_id),
  source_project text not null,
  local_comparison_verified boolean not null default false,
  integration_cutover_verified boolean not null default false,
  acceptance_verified boolean not null default false,
  source_paused boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.property_workspaces enable row level security;
alter table public.property_workspace_history enable row level security;
alter table public.property_ical_blocks enable row level security;
alter table public.property_booking_candidates enable row level security;
alter table public.property_ai_usage enable row level security;
alter table public.property_migration_control enable row level security;
revoke all on public.property_workspaces,public.property_workspace_history,public.property_ical_blocks,public.property_booking_candidates,public.property_ai_usage,public.property_migration_control from public,anon,authenticated;
grant select,insert,update on public.property_workspaces to authenticated;
grant select on public.property_workspace_history,public.property_ical_blocks,public.property_ai_usage,public.property_migration_control to authenticated;
grant select,update on public.property_booking_candidates to authenticated;
grant all on public.property_workspaces,public.property_workspace_history,public.property_ical_blocks,public.property_booking_candidates,public.property_ai_usage,public.property_migration_control to service_role;
grant usage,select on sequence public.property_workspace_history_id_seq,public.property_ical_blocks_id_seq to service_role;
create policy property_workspace_read on public.property_workspaces for select to authenticated using ((select auth.uid())=user_id);
create policy property_workspace_insert on public.property_workspaces for insert to authenticated with check ((select auth.uid())=user_id);
create policy property_workspace_update on public.property_workspaces for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy property_history_read on public.property_workspace_history for select to authenticated using ((select auth.uid())=user_id);
create policy property_blocks_read on public.property_ical_blocks for select to authenticated using ((select auth.uid())=user_id);
create policy property_candidates_read on public.property_booking_candidates for select to authenticated using ((select auth.uid())=user_id);
create policy property_candidates_update on public.property_booking_candidates for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy property_usage_read on public.property_ai_usage for select to authenticated using ((select auth.uid())=user_id);
create policy property_migration_read on public.property_migration_control for select to authenticated using ((select auth.uid())=owner_id);

-- Trigger-only privilege boundary: no API role can call it directly. Preserve the
-- old version atomically with every update and assign the server's version stamp.
create schema if not exists property_private;
revoke all on schema property_private from public,anon,authenticated;
create function property_private.keep_workspace_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.id<>old.id or new.user_id<>old.user_id or new.record_key<>old.record_key or new.data_type<>old.data_type then raise exception 'Property workspace identity is immutable'; end if;
  if new.data is distinct from old.data then
    insert into public.property_workspace_history(app_data_id,user_id,data_type,record_key,data,source_updated_at) values(old.id,old.user_id,old.data_type,old.record_key,old.data,old.updated_at) on conflict(app_data_id,source_updated_at) do nothing;
  end if;
  new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function property_private.keep_workspace_version() from public,anon,authenticated;
create trigger property_workspace_version before update on public.property_workspaces for each row execute function property_private.keep_workspace_version();

-- Called only by authenticated backend functions using the service role, never
-- an arbitrary client. Usage limits must be checked by the function before AI.
create function public.property_bump_ai_usage(p_user uuid,p_fn text,p_cap integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if p_cap<1 or p_cap>1000 then raise exception 'Invalid limit'; end if;
  insert into public.property_ai_usage(user_id,fn,day,calls) values(p_user,p_fn,current_date,1)
  on conflict(user_id,fn,day) do update set calls=property_ai_usage.calls+1 where property_ai_usage.calls<p_cap returning calls into n;
  return n is not null;
end $$;
revoke all on function public.property_bump_ai_usage(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.property_bump_ai_usage(uuid,text,integer) to service_role;
