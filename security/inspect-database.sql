-- Read-only inspection. Does not change tables, policies, rows or personal data.
-- Run in the Supabase SQL editor for the Life OS project.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='user_states';

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename='user_states';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='user_states'
and grantee in ('anon','authenticated','PUBLIC');

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='user_states'
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid=to_regclass('public.user_states');

select tgname, pg_get_triggerdef(oid) as definition,
       pg_get_functiondef(tgfoid) as trigger_function
from pg_trigger where tgrelid=to_regclass('public.user_states') and not tgisinternal;
