-- Run this only after:
--   1. the foundation migration has succeeded, and
--   2. the three users have been created in Supabase Authentication > Users.
--
-- Replace only the three UUIDs and display names below. Emails are read from
-- auth.users so profiles cannot silently diverge from the Auth identities.

with requested_users (id, role, name) as (
  values
    ('6d0efbd0-22b8-40cd-9e91-079ffc69f07d'::uuid, 'admin', 'Cospire Admin'),
    ('5a727556-0315-49d0-abeb-8b2c272d61d5'::uuid, 'mentor', 'Cospire Mentor'),
    ('c710367c-d341-4c48-b8b2-81944ef6bea7'::uuid, 'student', 'Cospire Student')
),
validated_users as (
  select
    requested.id,
    organisation.id as org_id,
    requested.role,
    requested.name,
    lower(auth_user.email) as email
  from requested_users as requested
  join auth.users as auth_user on auth_user.id = requested.id
  cross join public.orgs as organisation
  where organisation.name = 'Cospire'
    and auth_user.email is not null
),
upserted_profiles as (
  insert into public.profiles (id, org_id, role, name, email, status)
  select id, org_id, role, name, email, 'active'
  from validated_users
  on conflict (id) do update
  set
    org_id = excluded.org_id,
    role = excluded.role,
    name = excluded.name,
    email = excluded.email,
    status = excluded.status
  returning id, role, name, email, status
)
select * from upserted_profiles order by role;

-- This must return exactly one active row for each role before testing login.
select role, count(*) as active_profiles
from public.profiles
where org_id = (select id from public.orgs where name = 'Cospire')
  and status = 'active'
group by role
order by role;
