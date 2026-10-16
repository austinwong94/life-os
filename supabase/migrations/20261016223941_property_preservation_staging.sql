-- Immutable import staging, not the active villa workspace.
-- Version assigned by Supabase when applied with explicit transfer approval.
-- Never restore a source database over Life OS user_states.
create table public.property_transfer_batches (
  batch_id text primary key check (batch_id ~ '^[a-f0-9]{64}$'),
  owner_id uuid not null references auth.users(id),
  source_project text not null check (source_project ~ '^[a-z]{20}$'),
  source_owner_id uuid not null,
  manifest jsonb not null check (jsonb_typeof(manifest)='object'),
  staged_at timestamptz not null default now(),
  unique (batch_id,owner_id),
  unique (batch_id,owner_id,source_owner_id)
);
create table public.property_transfer_records (
  batch_id text not null,
  owner_id uuid not null,
  resource text not null check (resource in ('public.app_data','public.app_data_history','public.bookings','public.ical_blocks','public.booking_candidates','public.ai_usage')),
  source_key text not null check (length(source_key) between 1 and 200),
  source_owner_id uuid,
  owner_assignment text not null check (owner_assignment in ('verified-source-owner','legacy-project-scoped')),
  payload_text text not null,
  payload jsonb not null check (jsonb_typeof(payload)='object' and payload=payload_text::jsonb),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$' and sha256=encode(sha256(convert_to(payload_text,'UTF8')),'hex')),
  primary key (batch_id,resource,source_key),
  foreign key (batch_id,owner_id) references public.property_transfer_batches(batch_id,owner_id),
  foreign key (batch_id,owner_id,source_owner_id) references public.property_transfer_batches(batch_id,owner_id,source_owner_id),
  check ((owner_assignment='legacy-project-scoped' and source_owner_id is null and resource='public.booking_candidates' and not (payload ? 'user_id')) or (owner_assignment='verified-source-owner' and source_owner_id is not null and payload->>'user_id' is not distinct from source_owner_id::text))
);
create index property_transfer_batches_owner on public.property_transfer_batches(owner_id);
create index property_transfer_records_owner on public.property_transfer_records(owner_id,batch_id);
alter table public.property_transfer_batches enable row level security;
alter table public.property_transfer_records enable row level security;
revoke all on public.property_transfer_batches,public.property_transfer_records from public,anon,authenticated;
grant select on public.property_transfer_batches,public.property_transfer_records to authenticated;
grant all on public.property_transfer_batches,public.property_transfer_records to service_role;
create policy property_transfer_batches_owner_read on public.property_transfer_batches for select to authenticated using ((select auth.uid())=owner_id);
create policy property_transfer_records_owner_read on public.property_transfer_records for select to authenticated using ((select auth.uid())=owner_id);
-- No authenticated INSERT/UPDATE/DELETE policy: preserved source copies are immutable.
