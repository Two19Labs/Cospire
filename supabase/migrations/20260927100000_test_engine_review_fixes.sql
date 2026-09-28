-- Phase 4: fixes from the high-effort review of feat/test-engine, 2026-09-27.
-- Fix-forward on 20260926103000, which is applied. Four defects, each in the
-- database because each is reachable with a student's own session:
--
--   1. A key could leak into a live paper. Questions come from a shared bank,
--      so a student who submitted mock A could read the key of a question that
--      is also in mock B while sitting B. A key is now hidden while the student
--      has ANY open attempt on a paper containing that question.
--   2. In a sectioned paper, an untimed section could be answered before it was
--      entered and after it was left. Every section of a sectioned paper now
--      takes answers only while it is the one entered and not yet left.
--   3. `student_reaches_question` and `student_may_read_key` did not test that
--      the caller is an active student, so a disabled account kept reading
--      questions and keys through its attempts. Every helper tests it now,
--      as operating manual §4 requires.
--   4. Revoking a mock grant hid the mock, so a student's open attempt could
--      not be submitted and their past results vanished. A student now reads a
--      mock they hold a grant for OR have an attempt on; only starting a new
--      attempt still needs the grant.
--
-- Redefines four functions and replaces three policies. Adds nothing a
-- deployed build reads; drops no column.

begin;

-- An active student, in one place.
create or replace function private.is_active_student()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid()) and role = 'student' and status = 'active'
  );
$$;

revoke execute on function private.is_active_student() from public, anon;
grant execute on function private.is_active_student() to authenticated;

-- 3. Questions: through an attempt, for an active student only.
create or replace function private.student_reaches_question(target_question_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_student() and exists (
    select 1
    from public.attempts as a
    join public.mock_questions as mq on mq.mock_id = a.mock_id
    where a.student_id = (select auth.uid())
      and (
        mq.question_id = target_question_id
        or mq.question_id = (
          select parent_id from public.questions where id = target_question_id
        )
      )
  );
$$;

-- 1 and 3. Keys: after the student's own submission, and never while any paper
-- containing the question is open for them.
create or replace function private.student_may_read_key(target_question_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select target_question_id as id
    union
    select parent_id from public.questions where id = target_question_id and parent_id is not null
  )
  select private.is_active_student()
    and exists (
      select 1
      from public.attempts as a
      join public.mock_questions as mq on mq.mock_id = a.mock_id
      where a.student_id = (select auth.uid())
        and a.status = 'submitted'
        and mq.question_id in (select id from target)
    )
    and not exists (
      select 1
      from public.attempts as open_attempt
      join public.mock_questions as mq on mq.mock_id = open_attempt.mock_id
      where open_attempt.student_id = (select auth.uid())
        and open_attempt.status = 'in_progress'
        and mq.question_id in (select id from target)
    );
$$;

-- 4. A mock is readable to a student who holds its grant or has sat it.
create or replace function private.student_reaches_mock(target_mock_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.student_has_mock_grant(target_mock_id)
      or (
        private.is_active_student()
        and exists (
          select 1 from public.attempts
           where mock_id = target_mock_id and student_id = (select auth.uid())
        )
      );
$$;

revoke execute on function private.student_reaches_mock(bigint) from public, anon;
grant execute on function private.student_reaches_mock(bigint) to authenticated;

drop policy mocks_select_student on public.mocks;
create policy mocks_select_student on public.mocks
for select to authenticated
using ((select private.student_reaches_mock(id)));

drop policy mock_sections_select_student on public.mock_sections;
create policy mock_sections_select_student on public.mock_sections
for select to authenticated
using ((select private.student_reaches_mock(mock_id)));

drop policy mock_questions_select_student on public.mock_questions;
create policy mock_questions_select_student on public.mock_questions
for select to authenticated
using ((select private.student_reaches_mock(mock_id)));

-- 2. Answers: in a sectioned paper, only in the section entered and not left.
create or replace function private.guard_attempt_response_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_status text;
  attempt_mock_id bigint;
  attempt_started timestamptz;
  mock_minutes integer;
  question_section_id bigint;
  section_minutes integer;
  section_started timestamptz;
  section_closed timestamptz;
  sectioned boolean;
begin
  select a.status, a.mock_id, a.started_at, m.duration_minutes
    into attempt_status, attempt_mock_id, attempt_started, mock_minutes
    from public.attempts as a
    join public.mocks as m on m.id = a.mock_id
   where a.id = new.attempt_id;

  if attempt_status is null then
    raise exception 'that attempt does not exist' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and (new.attempt_id is distinct from old.attempt_id
          or new.question_id is distinct from old.question_id) then
    raise exception 'a response cannot be moved to another attempt or question'
      using errcode = '42501';
  end if;

  if private.is_trusted_writer() then
    if tg_op = 'UPDATE' then
      new.updated_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_correct := null;
    new.marks_awarded := null;
  else
    new.is_correct := old.is_correct;
    new.marks_awarded := old.marks_awarded;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  if attempt_status <> 'in_progress' then
    raise exception 'this attempt has been submitted' using errcode = '42501';
  end if;

  if now() > attempt_started + make_interval(mins => mock_minutes) + private.attempt_grace() then
    raise exception 'time is up for this attempt' using errcode = '42501';
  end if;

  if new.answer is not null and octet_length(new.answer::text) > 4000 then
    raise exception 'that answer is too long' using errcode = '22001';
  end if;

  select mq.mock_section_id
    into question_section_id
    from public.mock_questions as mq
   where mq.mock_id = attempt_mock_id
     and (
       mq.question_id = new.question_id
       or mq.question_id = (select q.parent_id from public.questions as q where q.id = new.question_id)
     )
   limit 1;

  if question_section_id is null then
    raise exception 'that question is not in this paper' using errcode = '42501';
  end if;

  -- A paper is sectioned when any of its sections is timed; it is then sat one
  -- section at a time, and every section -- timed or not -- takes answers only
  -- while it is the one entered and not yet left.
  select exists (
    select 1 from public.mock_sections where mock_id = attempt_mock_id and duration_minutes is not null
  ) into sectioned;

  if sectioned then
    select duration_minutes into section_minutes
      from public.mock_sections where id = question_section_id;

    select started_at, submitted_at
      into section_started, section_closed
      from public.attempt_sections
     where attempt_id = new.attempt_id
       and mock_section_id = question_section_id;

    if section_started is null
       or section_closed is not null
       or (section_minutes is not null
           and now() > section_started + make_interval(mins => section_minutes) + private.attempt_grace()) then
      raise exception 'that section is not open' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_attempt_response_write() from public, anon, authenticated;

commit;
