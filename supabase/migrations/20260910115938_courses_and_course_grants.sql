-- Phase 5a, step 1: programmes, and the grants that reach them.
--
-- A "programme" in the Client's language is a course in this schema: one per
-- target institution per content type -- "Ashoka - aptitude prep", "Masters'
-- Union - ARS". Confirmed with the Client on 2026-09-06. Admins create them;
-- the list is never hardcoded.
--
-- This is pulled forward from Phase 2 on 2026-09-08, because ARS was moved
-- ahead of video and `ars_rounds` must carry its course_id in the migration
-- that creates it. Only the table and its grant path are built here.
-- `curriculum_items`, ordering and the builder stay in Phase 2; nothing in ARS
-- needs them.
--
-- Additive only: one new table, one new helper, one replaced trigger function
-- that gains a branch. Nothing here can break the currently deployed code, per
-- docs/implementation-plan.md.

begin;

-- Columns are exactly the set named in the operating manual §4, plus the
-- timestamps every other table in this schema carries.
create table public.courses (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  title text not null,
  -- Admin-controlled ordering of the programme list. Ties break on id, so no
  -- uniqueness is required and reordering never has to renumber the whole set.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_title_not_blank check (btrim(title) <> ''),
  constraint courses_title_length check (char_length(title) <= 200),
  constraint courses_title_normalized check (title = btrim(title)),
  -- Two programmes with the same name inside one organisation are almost
  -- always a mistake, and they are indistinguishable in the grant picker. The
  -- constraint is named so the server action can map 23505 to a sentence an
  -- admin can act on, the same way duplicate email is handled on user creation.
  constraint courses_title_unique_per_org unique (org_id, title)
);

-- The list screen is "this organisation's programmes, in admin order". id is
-- the tiebreaker and is included so the sort is fully served by the index.
create index courses_org_id_sort_order_idx
  on public.courses (org_id, sort_order, id);

create trigger courses_set_updated_at
before update on public.courses
for each row execute function private.set_updated_at();

-- Read the grant through a SECURITY DEFINER helper rather than a direct
-- content_access subquery inside the policy, per operating manual §9.7. This is
-- the sibling of private.student_has_document_grant and deliberately mirrors it
-- line for line, including the active-student check: a disabled student holds
-- their grant rows but reaches nothing.
create or replace function private.student_has_course_grant(target_course_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_access as grant_row
    join public.profiles as student
      on student.id = grant_row.student_id
     and student.org_id = grant_row.org_id
    where grant_row.resource_type = 'course'
      and grant_row.resource_id = target_course_id
      and grant_row.student_id = (select auth.uid())
      and student.role = 'student'
      and student.status = 'active'
  )
$$;

revoke execute on function private.student_has_course_grant(bigint) from public, anon;
grant execute on function private.student_has_course_grant(bigint) to authenticated;

-- content_access.resource_id is polymorphic and cannot carry a foreign key, so
-- the check that a grant names a real resource in the right organisation lives
-- here. The 'document' branch is unchanged; this migration adds the 'course'
-- branch the original function's comment anticipated.
create or replace function private.validate_content_access_resource()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource_org_id bigint;
begin
  if new.resource_type = 'document' then
    select org_id
      into resource_org_id
      from public.documents
     where id = new.resource_id;

    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing document', new.resource_id;
    end if;

    if resource_org_id <> new.org_id then
      raise exception 'a document may only be granted within its own organisation';
    end if;
  elsif new.resource_type = 'course' then
    select org_id
      into resource_org_id
      from public.courses
     where id = new.resource_id;

    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing programme', new.resource_id;
    end if;

    if resource_org_id <> new.org_id then
      raise exception 'a programme may only be granted within its own organisation';
    end if;
  end if;

  return new;
end;
$$;

-- CREATE OR REPLACE keeps the existing ACL, but the revoke is re-issued rather
-- than assumed: this function must never be callable outside its trigger.
revoke execute on function private.validate_content_access_resource()
  from public, anon, authenticated;

-- A deleted programme must not leave grants pointing at nothing. With a real
-- foreign key this would be ON DELETE CASCADE; resource_id is polymorphic, so
-- the cascade is written by hand.
--
-- Without it, a deleted programme leaves rows that display in the admin console
-- and resolve to no content -- and that would silently become an access bug the
-- day a new course reused the freed id. Nothing reuses an identity column's
-- values today, but the grant row should not be relying on that.
create or replace function private.cascade_course_grants_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.content_access
   where resource_type = 'course'
     and resource_id = old.id;

  return old;
end;
$$;

revoke execute on function private.cascade_course_grants_on_delete()
  from public, anon, authenticated;

create trigger courses_cascade_grants
after delete on public.courses
for each row execute function private.cascade_course_grants_on_delete();

alter table public.courses enable row level security;
alter table public.courses force row level security;

-- No org filter is written into the application's list query. This policy is
-- what scopes an admin to their own organisation and a student to their grants,
-- matching documents_select_authorized.
--
-- Mentors are deliberately absent. Nothing a mentor does today touches a
-- programme; when the ARS review queue lands it will need mentors to reach the
-- programmes of their assigned students, and that is an additive policy in the
-- migration that creates ars_rounds rather than a guess made here.
create policy courses_select_authorized
on public.courses
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_has_course_grant(id))
  )
);

create policy courses_insert_admin
on public.courses
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy courses_update_admin
on public.courses
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy courses_delete_admin
on public.courses
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.courses from anon, authenticated;
revoke all on sequence public.courses_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.courses to authenticated;
grant usage, select on sequence public.courses_id_seq to authenticated;

commit;
