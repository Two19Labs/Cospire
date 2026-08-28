-- Removes the Data API execute surface from the platform-managed
-- `public.rls_auto_enable()` event-trigger function.
--
-- Background. Supabase's "enforce RLS on new tables" project setting installs an
-- `ensure_rls` event trigger backed by `public.rls_auto_enable()`. The function is
-- owned by `postgres`, is not created by this repository, and ships with
-- `EXECUTE` granted to PUBLIC, which includes `anon` and `authenticated`. The
-- security advisor therefore reports it under lints 0028 and 0029 as a
-- `SECURITY DEFINER` function reachable at `/rest/v1/rpc/rls_auto_enable`.
--
-- The function is not actually invocable: PostgreSQL refuses any call outside a
-- trigger context with `0A000: trigger functions can only be called as triggers`.
-- The grant is still removed so the advisor report handed to the Client is clean
-- and a genuine finding is never buried under a known-benign one.
--
-- Revoking EXECUTE does not disable the safety net. PostgreSQL checks EXECUTE on
-- an event-trigger function when the event trigger is created, not each time it
-- fires, so `ensure_rls` keeps auto-enabling RLS on new public tables.
--
-- Guarded on existence: the function belongs to the hosted platform and is absent
-- from a fresh local stack, where this migration must still be a no-op.

do $$
begin
  if exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke execute on function public.rls_auto_enable()
      from public, anon, authenticated;
  end if;
end
$$;
