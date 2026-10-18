-- Final source snapshots remain separate from operational Properties and original migration batches.
create table public.property_retirement_backups (
  owner_id uuid not null references auth.users(id),
  source_project text not null check (source_project ~ '^[a-z]{20}$'),
  base_batch_id text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  payload_text text not null,
  payload jsonb not null check (
    jsonb_typeof(payload)='object' and payload=payload_text::jsonb
    and payload->>'format'='life-os-property-preservation-v1'
    and payload->>'source_project'=source_project
  ),
  captured_at timestamptz not null,
  preserved_at timestamptz not null default now(),
  primary key (owner_id,source_project,sha256),
  foreign key (base_batch_id,owner_id) references public.property_transfer_batches(batch_id,owner_id),
  check (sha256=encode(sha256(convert_to(payload_text,'UTF8')),'hex'))
);
create index property_retirement_backups_batch on public.property_retirement_backups(base_batch_id,owner_id);
alter table public.property_retirement_backups enable row level security;
revoke all on public.property_retirement_backups from public,anon,authenticated;
grant select on public.property_retirement_backups to authenticated;
grant all on public.property_retirement_backups to service_role;
create policy property_retirement_backups_owner_read on public.property_retirement_backups
  for select to authenticated using ((select auth.uid())=owner_id);
