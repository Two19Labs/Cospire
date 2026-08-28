begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;

select extensions.plan(23);

select extensions.has_table('public', 'orgs', 'orgs exists');
select extensions.has_table('public', 'profiles', 'profiles exists');
select extensions.has_table('public', 'mentor_assignments', 'mentor_assignments exists');
select extensions.has_table('public', 'content_access', 'content_access exists');

select extensions.policies_are(
  'public',
  'orgs',
  array['orgs_select_own', 'orgs_update_admin'],
  'orgs has only the intended policies'
);
select extensions.policies_are(
  'public',
  'profiles',
  array[
    'profiles_delete_admin',
    'profiles_insert_admin',
    'profiles_select_authorized',
    'profiles_update_admin'
  ],
  'profiles has only the intended policies'
);
select extensions.policies_are(
  'public',
  'mentor_assignments',
  array[
    'mentor_assignments_delete_admin',
    'mentor_assignments_insert_admin',
    'mentor_assignments_select_authorized',
    'mentor_assignments_update_admin'
  ],
  'mentor_assignments has only the intended policies'
);
select extensions.policies_are(
  'public',
  'content_access',
  array[
    'content_access_delete_admin',
    'content_access_insert_admin',
    'content_access_select_authorized'
  ],
  'content_access has only the intended policies'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'mentor@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'student@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'unassigned@example.test'),
  ('00000000-0000-0000-0000-000000000005', 'other-admin@example.test');

insert into public.orgs (name) values ('Other organisation');

insert into public.profiles (id, org_id, role, name, email)
select seed.id, organisation.id, seed.role, seed.name, seed.email
from (
  values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Cospire', 'admin', 'Admin', 'admin@example.test'),
    ('00000000-0000-0000-0000-000000000002'::uuid, 'Cospire', 'mentor', 'Mentor', 'mentor@example.test'),
    ('00000000-0000-0000-0000-000000000003'::uuid, 'Cospire', 'student', 'Student', 'student@example.test'),
    ('00000000-0000-0000-0000-000000000004'::uuid, 'Cospire', 'student', 'Unassigned', 'unassigned@example.test'),
    ('00000000-0000-0000-0000-000000000005'::uuid, 'Other organisation', 'admin', 'Other Admin', 'other-admin@example.test')
) as seed(id, org_name, role, name, email)
join public.orgs as organisation on organisation.name = seed.org_name;

insert into public.mentor_assignments (org_id, mentor_id, student_id, assigned_by)
select id,
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001'
from public.orgs where name = 'Cospire';

insert into public.content_access (
  org_id,
  student_id,
  resource_type,
  resource_id,
  granted_by
)
select id,
  '00000000-0000-0000-0000-000000000003',
  'document',
  101,
  '00000000-0000-0000-0000-000000000001'
from public.orgs where name = 'Cospire';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select extensions.results_eq(
  $$ select count(*) from public.profiles $$,
  array[4::bigint],
  'an admin sees profiles in their organisation only'
);
select extensions.results_eq(
  $$ select count(*) from public.orgs $$,
  array[1::bigint],
  'an admin sees only their organisation'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select extensions.results_eq(
  $$ select count(*) from public.profiles $$,
  array[2::bigint],
  'a mentor sees themself and their assigned student'
);
select extensions.results_eq(
  $$ select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000004' $$,
  array[0::bigint],
  'a mentor cannot see an unassigned student'
);
select extensions.results_eq(
  $$ select count(*) from public.content_access $$,
  array[1::bigint],
  'a mentor sees access records for their assigned student'
);
select extensions.throws_ok(
  $$
    insert into public.content_access (
      org_id,
      student_id,
      resource_type,
      resource_id,
      granted_by
    )
    select org_id,
      '00000000-0000-0000-0000-000000000003',
      'document',
      102,
      '00000000-0000-0000-0000-000000000001'
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000002'
  $$,
  '42501',
  'new row violates row-level security policy for table "content_access"',
  'a mentor cannot grant content access'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select extensions.results_eq(
  $$ select count(*) from public.profiles $$,
  array[1::bigint],
  'a student sees only their own profile'
);
select extensions.results_eq(
  $$ select count(*) from public.content_access $$,
  array[1::bigint],
  'a student sees their own content access'
);
select extensions.results_eq(
  $$ select count(*) from public.mentor_assignments $$,
  array[1::bigint],
  'a student sees their own mentor assignment'
);

reset role;
update public.profiles
set status = 'disabled'
where id = '00000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select extensions.results_eq(
  $$ select count(*) from public.profiles $$,
  array[0::bigint],
  'a disabled student cannot read their profile'
);
select extensions.results_eq(
  $$ select count(*) from public.content_access $$,
  array[0::bigint],
  'a disabled student cannot read content access'
);
select extensions.results_eq(
  $$ select count(*) from public.mentor_assignments $$,
  array[0::bigint],
  'a disabled student cannot read their mentor assignment'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
delete from public.profiles
where id = '00000000-0000-0000-0000-000000000001';

select extensions.results_eq(
  $$ select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000001' $$,
  array[1::bigint],
  'an admin cannot delete their own profile'
);

reset role;
set local role anon;

select extensions.throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  'permission denied for table profiles',
  'anonymous users cannot read profiles'
);
select extensions.throws_ok(
  $$ select private.current_app_role() $$,
  '42501',
  'permission denied for schema private',
  'anonymous users cannot call private policy helpers'
);

reset role;

select * from extensions.finish();
rollback;
