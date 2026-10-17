-- Preserve user-supplied browser exports independently of cloud snapshots.
create table public.property_browser_backups (
 owner_id uuid not null references auth.users(id),
 source_owner_id uuid not null,
 source_project text not null check(source_project ~ '^[a-z]{20}$'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$' and sha256=encode(sha256(convert_to(payload_text,'UTF8')),'hex')),
 payload_text text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload=payload_text::jsonb and payload->>'ownerId'=source_owner_id::text),
 comparison jsonb not null check(jsonb_typeof(comparison)='object' and comparison->>'sha256'=sha256 and comparison->>'owner_id'=owner_id::text and comparison->>'source_owner_id'=source_owner_id::text and comparison->>'source_project'=source_project),
 preserved_at timestamptz not null default now(),
 primary key(owner_id,sha256),
 check(owner_id<>source_owner_id)
);
alter table public.property_browser_backups enable row level security;
revoke all on public.property_browser_backups from public,anon,authenticated;
grant select on public.property_browser_backups to authenticated;
grant all on public.property_browser_backups to service_role;
create policy property_browser_backups_owner_read on public.property_browser_backups for select to authenticated using((select auth.uid())=owner_id);
