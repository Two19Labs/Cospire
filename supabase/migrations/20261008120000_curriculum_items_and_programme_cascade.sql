-- Phase 2, steps 3, 4b and 5, without video: a programme's curriculum, the
-- grant that opens it, and per-item progress.
--
-- 1. `sections` and `curriculum_items` (operating manual §4, §4.1). A
--    curriculum is an ordered list of mixed items inside ordered sections. Not a
--    lessons table. `type` already accepts 'video' so next week's video work is
--    a trigger branch, not a constraint change; until then the validation
--    trigger refuses a video row, because there is no `videos` table for
--    `ref_id` to name.
--
-- 2. N11, decided by the owner on 2026-10-08: **a programme grant cascades to
--    every item in that programme's curriculum.** Individual grants in
--    `content_access` keep working on their own as overrides. Done here, in the
--    two STABLE SECURITY DEFINER helpers every student policy already routes
--    through -- `student_has_document_grant` and `student_has_mock_grant` -- so
--    the documents table, the viewer's signed-URL mint (which runs only after
--    `documents_select_authorized` returns the row), `mocks`, `mock_sections`,
--    `mock_questions` (via `student_reaches_mock`) and `attempts_insert_own` all
--    follow without one policy being rewritten. Direct Storage reads on the
--    `documents` bucket stay admin-only (20260902201530), so there is no storage
--    policy to widen: a student's only route to the bytes is that signed URL.
--
--    Programme grants use `resource_type = 'course'`, the value the courses
--    migration and `setCourseAccessAction` already write. Only a course whose
--    `kind` is 'programme' cascades: an ARS process grant opens no curriculum,
--    and a programme moved to ARS stops cascading the moment it moves.
--
-- 3. `item_progress` (§4), per curriculum item rather than per video. Students
--    write only their own rows, only for an item in a programme they hold, and
--    only for document and text items. A test item's completion is DERIVED
--    from `attempts` (a submitted attempt on that mock) rather than stored:
--    attempts are already the truth, and the cron sweep that auto-submits an
--    expired attempt writes with the secret key, so a stored flag would need a
--    trigger on `attempts` to stay right. Deriving it cannot drift.
--
-- Additive: three new tables, five new helpers, two redefined helpers that only
-- gain an OR branch, and two cleanup triggers on existing tables. Nothing is
-- dropped or renamed.

begin;

-- ---------------------------------------------------------------------------
-- sections
-- ---------------------------------------------------------------------------

create table public.sections (
  id bigint generated always as identity primary key,
  org_id bigint not null,
  course_id bigint not null,
  title text not null,
  -- Ties break on id, as on courses, so a half-finished reorder is still a
  -- valid order rather than a corrupt one.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_title_not_blank check (btrim(title) <> ''),
  constraint sections_title_length check (char_length(title) <= 200),
  constraint sections_title_normalized check (title = btrim(title)),
  constraint sections_id_org_unique unique (id, org_id),
  -- Composite, so a section can never sit in another organisation's programme.
  -- Deleting a programme deletes its curriculum.
  constraint sections_course_fk foreign key (course_id, org_id)
    references public.courses (id, org_id) on delete cascade
);

create index sections_course_sort_idx on public.sections (course_id, sort_order, id);
create index sections_course_org_idx on public.sections (course_id, org_id);

create trigger sections_set_updated_at
before update on public.sections
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- curriculum_items
-- ---------------------------------------------------------------------------

create table public.curriculum_items (
  id bigint generated always as identity primary key,
  org_id bigint not null,
  section_id bigint not null,
  type text not null,
  -- The video, document or mock this item shows. Polymorphic like
  -- content_access.resource_id, so it is validated by trigger instead of a
  -- foreign key, and cleaned up by triggers on documents and mocks.
  ref_id bigint,
  -- A text item has no row anywhere else, so its words live here. Both columns
  -- are null for every other type, whose title comes from the row it names.
  title text,
  body text,
  sort_order integer not null default 0,
  -- Unused in V1 (manual §13.1: every item is open). Kept so clause 3.13's
  -- sequential rule costs an afternoon, not a migration.
  gating text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_items_type_valid
    check (type in ('video', 'document', 'test', 'text')),
  constraint curriculum_items_gating_valid check (gating in ('none', 'sequential')),
  constraint curriculum_items_shape check (
    case
      when type = 'text' then
        ref_id is null
        and title is not null and btrim(title) <> '' and title = btrim(title)
        and char_length(title) <= 200
        and body is not null and btrim(body) <> '' and char_length(body) <= 20000
      else
        ref_id is not null and ref_id > 0 and title is null and body is null
    end
  ),
  constraint curriculum_items_section_fk foreign key (section_id, org_id)
    references public.sections (id, org_id) on delete cascade
);

create index curriculum_items_section_sort_idx
  on public.curriculum_items (section_id, sort_order, id);
create index curriculum_items_section_org_idx on public.curriculum_items (section_id, org_id);
-- The cascade lookup: "which programmes contain this document / mock?"
create index curriculum_items_ref_idx on public.curriculum_items (type, ref_id)
  where ref_id is not null;

create trigger curriculum_items_set_updated_at
before update on public.curriculum_items
for each row execute function private.set_updated_at();

-- A curriculum belongs to a programme, never an ARS process, and an item may
-- only name a resource in its own organisation. `kind` is the only thing keeping
-- the two admin sections apart (manual §4), so it is enforced here as well as
-- filtered in the screens.
create or replace function private.validate_curriculum_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.courses
     where id = new.course_id and org_id = new.org_id and kind = 'programme'
  ) then
    raise exception 'a curriculum section may only belong to a programme';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_curriculum_section()
  from public, anon, authenticated;

create trigger sections_validate
before insert or update on public.sections
for each row execute function private.validate_curriculum_section();

create or replace function private.validate_curriculum_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'document' then
    if not exists (
      select 1 from public.documents where id = new.ref_id and org_id = new.org_id
    ) then
      raise exception 'ref_id % does not match a document in this organisation', new.ref_id;
    end if;
  elsif new.type = 'test' then
    if not exists (
      select 1 from public.mocks where id = new.ref_id and org_id = new.org_id
    ) then
      raise exception 'ref_id % does not match a mock in this organisation', new.ref_id;
    end if;
  elsif new.type = 'video' then
    -- Replaced when the videos table lands (Phase 2, VdoCipher).
    raise exception 'video items arrive with the video library';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_curriculum_item()
  from public, anon, authenticated;

create trigger curriculum_items_validate
before insert or update on public.curriculum_items
for each row execute function private.validate_curriculum_item();

-- A deleted document or mock must not leave an item pointing at nothing, which
-- would also become an access bug if an id were ever reused. Same reasoning as
-- cascade_course_grants_on_delete.
create or replace function private.cascade_curriculum_items_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.curriculum_items
   where ref_id = old.id
     and type = case tg_table_name when 'documents' then 'document' else 'test' end;
  return old;
end;
$$;

revoke execute on function private.cascade_curriculum_items_on_delete()
  from public, anon, authenticated;

create trigger documents_cascade_curriculum_items
after delete on public.documents
for each row execute function private.cascade_curriculum_items_on_delete();

create trigger mocks_cascade_curriculum_items
after delete on public.mocks
for each row execute function private.cascade_curriculum_items_on_delete();

-- ---------------------------------------------------------------------------
-- The cascade (N11)
-- ---------------------------------------------------------------------------

-- A programme the caller may read the curriculum of: an active student holding
-- a 'course' grant on a course that is still a programme.
create or replace function private.student_reaches_programme(target_course_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.student_has_course_grant(target_course_id)
     and exists (
       select 1 from public.courses where id = target_course_id and kind = 'programme'
     );
$$;

revoke execute on function private.student_reaches_programme(bigint) from public, anon;
grant execute on function private.student_reaches_programme(bigint) to authenticated;

create or replace function private.student_reaches_section(target_section_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.student_reaches_programme(course_id)
      from public.sections where id = target_section_id
  ), false);
$$;

revoke execute on function private.student_reaches_section(bigint) from public, anon;
grant execute on function private.student_reaches_section(bigint) to authenticated;

-- Does an active student hold a programme grant whose curriculum contains this
-- resource? `item_type` is the curriculum_items.type ('document', 'test', and
-- 'video' next week).
create or replace function private.student_has_programme_item(item_type text, target_ref_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.curriculum_items as item
    join public.sections as section on section.id = item.section_id
    join public.courses as course
      on course.id = section.course_id
     and course.kind = 'programme'
    join public.content_access as grant_row
      on grant_row.resource_type = 'course'
     and grant_row.resource_id = course.id
     and grant_row.org_id = course.org_id
    join public.profiles as student
      on student.id = grant_row.student_id
     and student.org_id = grant_row.org_id
    where item.type = item_type
      and item.ref_id = target_ref_id
      and grant_row.student_id = (select auth.uid())
      and student.role = 'student'
      and student.status = 'active'
  );
$$;

revoke execute on function private.student_has_programme_item(text, bigint) from public, anon;
grant execute on function private.student_has_programme_item(text, bigint) to authenticated;

-- Redefined: the original direct-grant body, unchanged, OR the cascade.
create or replace function private.student_has_document_grant(target_document_id bigint)
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
    where grant_row.resource_type = 'document'
      and grant_row.resource_id = target_document_id
      and grant_row.student_id = (select auth.uid())
      and student.role = 'student'
      and student.status = 'active'
  )
  or private.student_has_programme_item('document', target_document_id)
$$;

create or replace function private.student_has_mock_grant(target_mock_id bigint)
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
    where grant_row.resource_type = 'mock'
      and grant_row.resource_id = target_mock_id
      and grant_row.student_id = (select auth.uid())
      and student.role = 'student'
      and student.status = 'active'
  )
  or private.student_has_programme_item('test', target_mock_id);
$$;

-- ---------------------------------------------------------------------------
-- item_progress
-- ---------------------------------------------------------------------------

create table public.item_progress (
  student_id uuid not null,
  item_id bigint not null references public.curriculum_items (id) on delete cascade,
  org_id bigint not null,
  percent smallint not null default 0,
  -- Seconds into a video. Unused until video items exist.
  last_position integer,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, item_id),
  constraint item_progress_percent_valid check (percent between 0 and 100),
  constraint item_progress_position_valid check (last_position is null or last_position >= 0),
  constraint item_progress_completed_stamped check (completed = (completed_at is not null)),
  constraint item_progress_student_fk foreign key (student_id, org_id)
    references public.profiles (id, org_id) on delete restrict
);

create index item_progress_item_idx on public.item_progress (item_id);
create index item_progress_student_org_idx on public.item_progress (student_id, org_id);

create trigger item_progress_set_updated_at
before update on public.item_progress
for each row execute function private.set_updated_at();

-- A student may record progress on an item only if it is in a programme they
-- hold, in their organisation, and is a type whose progress is stored. Tests
-- are derived from attempts and refused here so the two can never disagree.
create or replace function private.student_may_record_progress(target_item_id bigint, target_org_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_student()
     and target_org_id = private.current_org_id()
     and exists (
       select 1 from public.curriculum_items
        where id = target_item_id
          and org_id = target_org_id
          and type in ('document', 'text')
          and private.student_reaches_section(section_id)
     );
$$;

revoke execute on function private.student_may_record_progress(bigint, bigint) from public, anon;
grant execute on function private.student_may_record_progress(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.sections enable row level security;
alter table public.sections force row level security;
alter table public.curriculum_items enable row level security;
alter table public.curriculum_items force row level security;
alter table public.item_progress enable row level security;
alter table public.item_progress force row level security;

-- sections: admins manage their own organisation's; a student reads a granted
-- programme's.
create policy sections_select_authorized on public.sections
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_reaches_programme(course_id))
  )
);

create policy sections_insert_admin on public.sections
for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy sections_update_admin on public.sections
for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy sections_delete_admin on public.sections
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

-- curriculum_items: the same split.
create policy curriculum_items_select_authorized on public.curriculum_items
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_reaches_section(section_id))
  )
);

create policy curriculum_items_insert_admin on public.curriculum_items
for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy curriculum_items_update_admin on public.curriculum_items
for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy curriculum_items_delete_admin on public.curriculum_items
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

-- item_progress: a student reads and writes their own; admins and the assigned
-- mentor read. Nobody writes another student's row.
create policy item_progress_select_own on public.item_progress
for select to authenticated
using (student_id = (select auth.uid()) and (select private.is_active_student()));

create policy item_progress_select_staff on public.item_progress
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (select private.is_assigned_mentor(student_id))
);

create policy item_progress_insert_own on public.item_progress
for insert to authenticated
with check (
  student_id = (select auth.uid())
  and (select private.student_may_record_progress(item_id, org_id))
);

create policy item_progress_update_own on public.item_progress
for update to authenticated
using (
  student_id = (select auth.uid())
  and (select private.student_may_record_progress(item_id, org_id))
)
with check (
  student_id = (select auth.uid())
  and (select private.student_may_record_progress(item_id, org_id))
);

create policy item_progress_delete_admin on public.item_progress
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.sections from anon, authenticated;
revoke all on table public.curriculum_items from anon, authenticated;
revoke all on table public.item_progress from anon, authenticated;
revoke all on sequence public.sections_id_seq from anon, authenticated;
revoke all on sequence public.curriculum_items_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.sections to authenticated;
grant select, insert, update, delete on table public.curriculum_items to authenticated;
grant select, insert, update, delete on table public.item_progress to authenticated;
grant usage, select on sequence public.sections_id_seq to authenticated;
grant usage, select on sequence public.curriculum_items_id_seq to authenticated;

commit;
