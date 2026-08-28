begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant usage on schema public to authenticated;

create table public.orgs (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orgs_name_not_blank check (btrim(name) <> ''),
  constraint orgs_name_unique unique (name)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id bigint not null references public.orgs (id) on delete restrict,
  role text not null,
  name text not null,
  email text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_id_org_id_unique unique (id, org_id),
  constraint profiles_role_valid check (role in ('admin', 'mentor', 'student')),
  constraint profiles_status_valid check (status in ('active', 'disabled')),
  constraint profiles_name_not_blank check (btrim(name) <> ''),
  constraint profiles_email_normalized check (
    email = lower(btrim(email)) and position('@' in email) > 1
  )
);

create unique index profiles_email_unique_idx on public.profiles (lower(email));
create index profiles_org_id_role_idx on public.profiles (org_id, role);

create table public.mentor_assignments (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete cascade,
  mentor_id uuid not null,
  student_id uuid not null,
  assigned_by uuid not null,
  created_at timestamptz not null default now(),
  constraint mentor_assignments_different_people check (mentor_id <> student_id),
  constraint mentor_assignments_student_unique unique (student_id),
  constraint mentor_assignments_pair_unique unique (mentor_id, student_id),
  constraint mentor_assignments_mentor_org_fkey
    foreign key (mentor_id, org_id)
    references public.profiles (id, org_id)
    on delete cascade,
  constraint mentor_assignments_student_org_fkey
    foreign key (student_id, org_id)
    references public.profiles (id, org_id)
    on delete cascade,
  constraint mentor_assignments_assigner_org_fkey
    foreign key (assigned_by, org_id)
    references public.profiles (id, org_id)
    on delete restrict
);

create index mentor_assignments_org_id_idx
  on public.mentor_assignments (org_id);
create index mentor_assignments_mentor_id_idx
  on public.mentor_assignments (mentor_id);
create index mentor_assignments_assigned_by_idx
  on public.mentor_assignments (assigned_by);

create table public.content_access (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete cascade,
  student_id uuid not null,
  resource_type text not null,
  resource_id bigint not null,
  granted_by uuid not null,
  created_at timestamptz not null default now(),
  constraint content_access_resource_type_valid check (
    resource_type in ('course', 'video', 'document', 'mock')
  ),
  constraint content_access_resource_id_positive check (resource_id > 0),
  constraint content_access_grant_unique
    unique (student_id, resource_type, resource_id),
  constraint content_access_student_org_fkey
    foreign key (student_id, org_id)
    references public.profiles (id, org_id)
    on delete cascade,
  constraint content_access_granter_org_fkey
    foreign key (granted_by, org_id)
    references public.profiles (id, org_id)
    on delete restrict
);

create index content_access_org_id_idx on public.content_access (org_id);
create index content_access_granted_by_idx on public.content_access (granted_by);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger orgs_set_updated_at
before update on public.orgs
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid())
    and p.status = 'active'
$$;

create or replace function private.current_org_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id
  from public.profiles as p
  where p.id = (select auth.uid())
    and p.status = 'active'
$$;

create or replace function private.is_admin_of_org(target_org_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.org_id = target_org_id
      and p.role = 'admin'
      and p.status = 'active'
  )
$$;

create or replace function private.is_assigned_mentor(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mentor_assignments as assignment
    join public.profiles as mentor
      on mentor.id = assignment.mentor_id
     and mentor.org_id = assignment.org_id
    where assignment.student_id = target_student_id
      and assignment.mentor_id = (select auth.uid())
      and mentor.role = 'mentor'
      and mentor.status = 'active'
  )
$$;

revoke execute on function private.current_app_role() from public, anon;
revoke execute on function private.current_org_id() from public, anon;
revoke execute on function private.is_admin_of_org(bigint) from public, anon;
revoke execute on function private.is_assigned_mentor(uuid) from public, anon;

grant execute on function private.current_app_role() to authenticated;
grant execute on function private.current_org_id() to authenticated;
grant execute on function private.is_admin_of_org(bigint) to authenticated;
grant execute on function private.is_assigned_mentor(uuid) to authenticated;

create or replace function private.validate_mentor_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mentor_role text;
  mentor_status text;
  student_role text;
  student_status text;
  assigner_role text;
  assigner_status text;
begin
  select role, status
    into mentor_role, mentor_status
    from public.profiles
   where id = new.mentor_id and org_id = new.org_id;

  select role, status
    into student_role, student_status
    from public.profiles
   where id = new.student_id and org_id = new.org_id;

  select role, status
    into assigner_role, assigner_status
    from public.profiles
   where id = new.assigned_by and org_id = new.org_id;

  if mentor_role is distinct from 'mentor' or mentor_status is distinct from 'active' then
    raise exception 'mentor_id must reference an active mentor in the same organisation';
  end if;

  if student_role is distinct from 'student' or student_status is distinct from 'active' then
    raise exception 'student_id must reference an active student in the same organisation';
  end if;

  if assigner_role is distinct from 'admin' or assigner_status is distinct from 'active' then
    raise exception 'assigned_by must reference an active admin in the same organisation';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_mentor_assignment()
  from public, anon, authenticated;

create trigger mentor_assignments_validate_roles
before insert or update on public.mentor_assignments
for each row execute function private.validate_mentor_assignment();

create or replace function private.validate_content_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_role text;
  student_status text;
  granter_role text;
  granter_status text;
begin
  select role, status
    into student_role, student_status
    from public.profiles
   where id = new.student_id and org_id = new.org_id;

  select role, status
    into granter_role, granter_status
    from public.profiles
   where id = new.granted_by and org_id = new.org_id;

  if student_role is distinct from 'student' or student_status is distinct from 'active' then
    raise exception 'student_id must reference an active student in the same organisation';
  end if;

  if granter_role is distinct from 'admin' or granter_status is distinct from 'active' then
    raise exception 'granted_by must reference an active admin in the same organisation';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_content_access()
  from public, anon, authenticated;

create trigger content_access_validate_roles
before insert or update on public.content_access
for each row execute function private.validate_content_access();

insert into public.orgs (name)
values ('Cospire')
on conflict (name) do nothing;

alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.mentor_assignments enable row level security;
alter table public.content_access enable row level security;

alter table public.orgs force row level security;
alter table public.profiles force row level security;
alter table public.mentor_assignments force row level security;
alter table public.content_access force row level security;

create policy orgs_select_own
on public.orgs
for select
to authenticated
using (id = (select private.current_org_id()));

create policy orgs_update_admin
on public.orgs
for update
to authenticated
using ((select private.is_admin_of_org(id)))
with check ((select private.is_admin_of_org(id)));

create policy profiles_select_authorized
on public.profiles
for select
to authenticated
using (
  (
    id = (select auth.uid())
    and org_id = (select private.current_org_id())
  )
  or (select private.is_admin_of_org(org_id))
  or (
    role = 'student'
    and (select private.is_assigned_mentor(id))
  )
);

create policy profiles_insert_admin
on public.profiles
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy profiles_update_admin
on public.profiles
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy profiles_delete_admin
on public.profiles
for delete
to authenticated
using (
  id <> (select auth.uid())
  and (select private.is_admin_of_org(org_id))
);

create policy mentor_assignments_select_authorized
on public.mentor_assignments
for select
to authenticated
using (
  (
    (
      mentor_id = (select auth.uid())
      or student_id = (select auth.uid())
    )
    and org_id = (select private.current_org_id())
  )
  or (select private.is_admin_of_org(org_id))
);

create policy mentor_assignments_insert_admin
on public.mentor_assignments
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy mentor_assignments_update_admin
on public.mentor_assignments
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy mentor_assignments_delete_admin
on public.mentor_assignments
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

create policy content_access_select_authorized
on public.content_access
for select
to authenticated
using (
  (
    student_id = (select auth.uid())
    and org_id = (select private.current_org_id())
  )
  or (select private.is_admin_of_org(org_id))
  or (select private.is_assigned_mentor(student_id))
);

create policy content_access_insert_admin
on public.content_access
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy content_access_delete_admin
on public.content_access
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.orgs from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.mentor_assignments from anon, authenticated;
revoke all on table public.content_access from anon, authenticated;

revoke all on sequence public.orgs_id_seq from anon, authenticated;
revoke all on sequence public.mentor_assignments_id_seq from anon, authenticated;
revoke all on sequence public.content_access_id_seq from anon, authenticated;

grant select, update on table public.orgs to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.mentor_assignments to authenticated;
grant select, insert, delete on table public.content_access to authenticated;

grant usage, select on sequence public.mentor_assignments_id_seq to authenticated;
grant usage, select on sequence public.content_access_id_seq to authenticated;

commit;
