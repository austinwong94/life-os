-- Applied: do not relocate/drop the network extension; shared dependency review remains
-- a separate gate. These trigger-only functions do not need client execution.
alter function public.set_updated_at() set search_path='';
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
