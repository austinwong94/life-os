-- Additive integration storage only. No existing Life OS tables are altered.
begin;
create table public.lifeos_google_connections (
  user_id uuid primary key references auth.users(id),
  tokens text,
  google_subject text not null,
  calendar_id text,
  provisioning_started_at timestamptz,
  receipts jsonb not null default '{}'::jsonb,
  cursors jsonb not null default '{}'::jsonb,
  board_ids text[] not null default '{}',
  last_sync_at timestamptz,
  lock_id uuid,
  locked_until timestamptz
);
create table public.lifeos_google_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id),
  verifier text not null,
  expires_at timestamptz not null
);
alter table public.lifeos_google_connections enable row level security;
alter table public.lifeos_google_oauth_states enable row level security;
revoke all on public.lifeos_google_connections, public.lifeos_google_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.lifeos_google_connections, public.lifeos_google_oauth_states to service_role;

create function public.lifeos_google_claim_state(p_hash text)
returns setof public.lifeos_google_oauth_states language sql security invoker set search_path = '' as $$
  delete from public.lifeos_google_oauth_states where state_hash = p_hash and expires_at > now() returning *;
$$;
create function public.lifeos_google_lock(p_user uuid, p_lock uuid)
returns setof public.lifeos_google_connections language sql security invoker set search_path = '' as $$
  update public.lifeos_google_connections set lock_id = p_lock, locked_until = now() + interval '5 minutes'
  where user_id = p_user and (locked_until is null or locked_until < now()) returning *;
$$;
revoke all on function public.lifeos_google_claim_state(text), public.lifeos_google_lock(uuid,uuid) from public, anon, authenticated;
grant execute on function public.lifeos_google_claim_state(text), public.lifeos_google_lock(uuid,uuid) to service_role;
commit;
