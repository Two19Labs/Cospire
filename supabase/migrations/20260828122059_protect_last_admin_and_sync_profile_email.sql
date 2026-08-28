-- Two integrity rules found missing during the Phase 0 security audit.
--
-- 1. An organisation must always keep at least one active admin.
--
--    `profiles_delete_admin` already refuses to let an admin delete their own
--    row, so self-lockout was considered for DELETE. UPDATE was left open, and
--    an admin could set their own `role` to 'student' or their own `status` to
--    'disabled' and leave the organisation with zero active admins. Nothing in
--    the application can recover from that: creating users, assigning mentors
--    and granting content all require an admin, so the only way back is a
--    human editing the database directly.
--
--    Enforced in the database rather than the admin console because the console
--    is not the only writer: Server Actions, the bulk import in clause 2.1, and
--    any future tooling all reach the same table.
--
-- 2. `profiles.email` must match the Auth identity it belongs to.
--
--    `profiles_update_admin` let an admin change `profiles.email` freely while
--    sign-in continues to use `auth.users.email`. The two could drift, leaving
--    a user whose displayed address is not the address they log in with, which
--    is a genuinely confusing thing to debug from a support request.
--
--    The bootstrap SQL already read the address from `auth.users` for exactly
--    this reason. This makes that guarantee hold for every writer, not just
--    that one script.

begin;

create or replace function private.enforce_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_admins int;
begin
  -- Only a row that was an active admin can remove the last one.
  if old.role <> 'admin' or old.status <> 'active' then
    return null;
  end if;

  -- An UPDATE that leaves the row an active admin of the same organisation
  -- changes nothing about admin coverage.
  if tg_op = 'UPDATE'
     and new.role = 'admin'
     and new.status = 'active'
     and new.org_id = old.org_id then
    return null;
  end if;

  -- Runs after the row change, so this count is the post-change state.
  select count(*)
    into remaining_admins
    from public.profiles
   where org_id = old.org_id
     and role = 'admin'
     and status = 'active';

  if remaining_admins = 0 then
    raise exception
      'organisation % would be left with no active admin', old.org_id
      using errcode = 'restrict_violation',
            hint = 'promote another active admin in this organisation first';
  end if;

  return null;
end;
$$;

revoke execute on function private.enforce_last_admin()
  from public, anon, authenticated;

-- A constraint trigger so a multi-statement transaction that temporarily dips
-- to zero admins can still succeed, provided it ends with at least one.
create constraint trigger profiles_keep_one_active_admin
after update or delete on public.profiles
deferrable initially immediate
for each row execute function private.enforce_last_admin();

create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_email text;
begin
  select lower(btrim(u.email))
    into auth_email
    from auth.users as u
   where u.id = new.id;

  if auth_email is null or auth_email = '' then
    raise exception
      'no Auth identity with an email address exists for profile %', new.id
      using errcode = 'foreign_key_violation',
            hint = 'create the user in Supabase Auth before inserting a profile';
  end if;

  new.email := auth_email;
  return new;
end;
$$;

revoke execute on function private.sync_profile_email()
  from public, anon, authenticated;

create trigger profiles_sync_email
before insert or update on public.profiles
for each row execute function private.sync_profile_email();

commit;
