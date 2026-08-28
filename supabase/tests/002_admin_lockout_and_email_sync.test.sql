-- Covers the two integrity rules added by
-- 20260828122059_protect_last_admin_and_sync_profile_email.sql.
--
-- Both were found by the Phase 0 security audit: an admin could remove their own
-- admin rights and leave the organisation with nobody able to administer it, and
-- profiles.email could be edited to something other than the address the account
-- actually signs in with.
--
-- The negative cases matter as much as the positive ones. A rule that blocks
-- lockout but also blocks a legitimate admin handover would be swapped out the
-- first time someone leaves the team.

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;

select extensions.plan(9);

-- Fixtures. Written as the table owner, since these stand in for rows that Auth
-- and the bootstrap SQL would have created.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin.one@example.com', 'x', now(), now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin.two@example.com', 'x', now(), now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'learner@example.com', 'x', now(), now(), now());

insert into public.orgs (name) values ('Lockout Test Org');

insert into public.profiles (id, org_id, role, name, email, status)
select 'aaaaaaaa-0000-0000-0000-000000000001', o.id, 'admin', 'Admin One',
       'admin.one@example.com', 'active'
from public.orgs as o where o.name = 'Lockout Test Org';

insert into public.profiles (id, org_id, role, name, email, status)
select 'aaaaaaaa-0000-0000-0000-000000000003', o.id, 'student', 'Learner',
       'learner@example.com', 'active'
from public.orgs as o where o.name = 'Lockout Test Org';

-- The email column is derived from auth.users, not from what the caller supplied.
select extensions.is(
  (select email from public.profiles
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'admin.one@example.com',
  'a new profile takes its email from the Auth identity'
);

select extensions.lives_ok(
  $$ update public.profiles set email = 'someone.else@example.com'
      where id = 'aaaaaaaa-0000-0000-0000-000000000003' $$,
  'an email change is accepted rather than erroring'
);

select extensions.is(
  (select email from public.profiles
    where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'learner@example.com',
  'but it is overwritten with the Auth address, so the two cannot drift'
);

-- The sole admin cannot remove their own admin rights, by either route.
select extensions.throws_ok(
  $$ update public.profiles set role = 'student'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23001',
  null,
  'the only admin cannot demote themselves'
);

select extensions.throws_ok(
  $$ update public.profiles set status = 'disabled'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23001',
  null,
  'the only admin cannot disable themselves'
);

select extensions.throws_ok(
  $$ delete from public.profiles
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23001',
  null,
  'the only admin cannot be deleted'
);

-- Nothing above should have taken effect.
select extensions.is(
  (select count(*)::int from public.profiles as p
    join public.orgs as o on o.id = p.org_id
   where o.name = 'Lockout Test Org' and p.role = 'admin' and p.status = 'active'),
  1,
  'the organisation still has exactly one active admin'
);

-- A genuine handover must still work: promote a second admin, then step down.
insert into public.profiles (id, org_id, role, name, email, status)
select 'aaaaaaaa-0000-0000-0000-000000000002', o.id, 'admin', 'Admin Two',
       'admin.two@example.com', 'active'
from public.orgs as o where o.name = 'Lockout Test Org';

select extensions.lives_ok(
  $$ update public.profiles set role = 'student'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'an admin may step down once another active admin exists'
);

select extensions.is(
  (select count(*)::int from public.profiles as p
    join public.orgs as o on o.id = p.org_id
   where o.name = 'Lockout Test Org' and p.role = 'admin' and p.status = 'active'),
  1,
  'the replacement admin is still in place after the handover'
);

select * from extensions.finish();
rollback;
