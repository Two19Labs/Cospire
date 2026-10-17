-- D41: a mock has a draft state, and a draft is invisible to students.
--
-- Operating manual section 1 rule 2 names the principle this follows: the
-- visibility of a thing a student must not see is a database policy, never an
-- `if` in a route. So `status` is checked inside the one helper every student
-- read of a mock already passes through, and no application query is changed.
--
-- Additive and expand-only:
--
--   * one column with a default, one check, one helper, one trigger;
--   * every mock that exists today is backfilled to `published`, so students
--     see exactly what they see now;
--   * `save_mock` is deliberately NOT redefined. It never mentions `status`, so
--     a create takes the column default (`draft`) and an edit leaves the status
--     where it was. Redefining a 100-line function to change nothing in it is
--     how a migration drifts from the live definition.
--
-- The one window this opens: between this migration being applied and the
-- deploy landing, a mock created by the then-deployed admin screens is a draft
-- with no publish button on screen. Nothing a student can see changes, and the
-- mock is publishable as soon as the deploy lands. A brand-new mock is invisible
-- to students until it is granted in any case.
--
-- The other half of D41 -- a mock's duration, sections, sectional timers and
-- questions are fixed once it has been attempted, while marks stay correctable
-- through the rescore path -- is already enforced by
-- `private.guard_sat_mock_structure` in `20260926103000_test_engine_attempts.sql`
-- and is not rebuilt here.

begin;

alter table public.mocks add column status text not null default 'draft';

alter table public.mocks
  add constraint mocks_status_valid check (status in ('draft', 'published'));

-- Existing mocks stay exactly as students see them today.
update public.mocks set status = 'published';

-- No index on `status`: nothing queries by it. The admin list is ordered by id
-- and shows both, and a student's visibility is decided one mock at a time by
-- primary key inside `private.mock_is_published`.

-- ---------------------------------------------------------------------------
-- The one door
-- ---------------------------------------------------------------------------

create or replace function private.mock_is_published(target_mock_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mocks
     where id = target_mock_id and status = 'published'
  );
$$;

revoke execute on function private.mock_is_published(bigint) from public, anon;
grant execute on function private.mock_is_published(bigint) to authenticated;

-- `private.student_has_mock_grant` is every student's door to a mock:
-- `mocks_select_student`, `mock_sections_select_student` and
-- `mock_questions_select_student` reach it through
-- `private.student_reaches_mock`, and `attempts_insert_own` calls it directly.
-- One clause here closes the student mock list, the mock page, a direct URL and
-- starting an attempt together.
--
-- This is the live body from `20261008120000_curriculum_items_and_programme_cascade.sql`
-- with the published test added and nothing else touched.
create or replace function private.student_has_mock_grant(target_mock_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.mock_is_published(target_mock_id)
    and (
      exists (
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
      or private.student_has_programme_item('test', target_mock_id)
    );
$$;

-- `private.student_reaches_mock` is left as it is on purpose. Its second arm --
-- "or this student has an attempt on it" -- is what keeps a sat mock and its
-- result readable, and unpublishing a mock that has attempts is refused below,
-- so that arm can never return a draft.

-- ---------------------------------------------------------------------------
-- A draft in a programme's curriculum
-- ---------------------------------------------------------------------------

-- A `test` curriculum item carries its own title, so hiding the mock alone
-- would still have shown the draft as a row in the programme's curriculum. The
-- admin arm is unchanged: admins see drafts everywhere.
drop policy curriculum_items_select_authorized on public.curriculum_items;
create policy curriculum_items_select_authorized on public.curriculum_items
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_reaches_section(section_id))
    and (type <> 'test' or (select private.mock_is_published(ref_id)))
  )
);

-- ---------------------------------------------------------------------------
-- Unpublishing a mock that has been attempted
-- ---------------------------------------------------------------------------

-- Refused, because it would hide students' own results from them: a draft is
-- invisible to a student, and their submitted attempt reads the paper back
-- through the same policies. Publishing is always allowed.
create or replace function private.guard_mock_publish_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published' and new.status = 'draft'
     and exists (select 1 from public.attempts where mock_id = old.id) then
    raise exception 'students have already sat this mock, so it cannot be returned to a draft'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_mock_publish_change() from public, anon, authenticated;

create trigger mocks_guard_publish_change
before update of status on public.mocks
for each row execute function private.guard_mock_publish_change();

commit;
