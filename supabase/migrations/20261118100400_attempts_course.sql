-- Shared modules (`docs/design/shared-modules.md` §3 and §4; decisions 1 and
-- 2 of 2026-11-13): an attempt belongs to the programme it was taken in.
--
-- `attempts.course_id`, nullable. Set when an attempt starts from a programme
-- page; null for one started outside a programme (a direct grant), which is
-- every existing attempt and everything the deployed code writes.
-- `private.guard_attempt_write` (live body from 20260926103000, unchanged
-- otherwise) now:
--   * refuses a `course_id` whose curriculum does not hold this mock, or that
--     the student does not hold;
--   * counts `max_attempts` per student, mock and programme;
--   * fixes `course_id` for the life of the attempt, like the mock and owner,
--     except for the foreign key's SET NULL when the programme is deleted.
--
-- A test item is done in programme P only for a submitted attempt with
-- `course_id = P`; that is a read in the application, Phase 2.
--
-- Left as it is: `attempts_one_open_idx`, one open attempt per student per mock
-- across programmes, so the deployed resume-by-mock logic still finds the one
-- open paper. Phase 2 decides whether it becomes per programme.

begin;

-- Deleting a programme keeps its attempts and results, as attempts outside any
-- programme (PostgreSQL 15+ column list: org_id stays).
alter table public.attempts
  add column course_id bigint,
  add constraint attempts_course_fk foreign key (course_id, org_id)
    references public.courses (id, org_id) on delete set null (course_id);

create index attempts_course_idx on public.attempts (course_id, student_id)
  where course_id is not null;

create or replace function private.guard_attempt_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mock_allows_mobile boolean;
  mock_max_attempts integer;
  taken integer;
begin
  if tg_op = 'INSERT' then
    select allow_mobile, max_attempts
      into mock_allows_mobile, mock_max_attempts
      from public.mocks
     where id = new.mock_id;

    -- A phone attempt on a mock that forbids phones is refused here, in the
    -- database, so no route can forget to check it (operating manual §1.5).
    if mock_allows_mobile is not true and new.proctored is false then
      raise exception 'this mock does not allow attempts from a phone' using errcode = '42501';
    end if;

    -- An attempt names a programme only if that programme's curriculum holds
    -- this mock and the student holds that programme. The caller sends the id
    -- from the programme page; it is checked here, never trusted as sent.
    if new.course_id is not null then
      if not exists (
        select 1 from public.curriculum_items as item
         where item.type = 'test'
           and item.ref_id = new.mock_id
           and private.course_has_item(new.course_id, item.id)
      ) then
        raise exception 'this mock is not in that programme' using errcode = '42501';
      end if;
      if not private.is_trusted_writer()
         and not private.student_reaches_programme(new.course_id) then
        raise exception 'this programme has not been granted to you' using errcode = '42501';
      end if;
    end if;

    -- `mocks.max_attempts` means nothing unless something counts. Counted here
    -- rather than in a route, because two tabs opened at once would each pass an
    -- application check and both insert. Counting alone does not stop that
    -- either -- two transactions each see the other's row as absent -- so the
    -- count is taken under a lock on this student and this mock.
    perform pg_advisory_xact_lock(
      hashtextextended('attempts:' || new.mock_id::text || ':' || new.student_id::text, 0)
    );

    -- Per programme (decision 2): the same mock in MU and Ashoka has its own
    -- attempts. Attempts outside any programme (a direct grant) count together,
    -- as before. The lock above stays per student and mock, which is coarser
    -- and so still safe.
    select count(*)
      into taken
      from public.attempts
     where mock_id = new.mock_id
       and student_id = new.student_id
       and course_id is not distinct from new.course_id;

    if mock_max_attempts is not null and taken >= mock_max_attempts then
      raise exception 'this mock allows % attempt(s), and you have taken %',
        mock_max_attempts, taken using errcode = '42501';
    end if;

    new.started_at := now();
    new.submitted_at := null;
    new.submitted_by := null;
    new.status := 'in_progress';
    new.score := null;
    return new;
  end if;

  -- The clock, the owner and the mock are fixed for the life of the attempt.
  if new.started_at is distinct from old.started_at
     or new.student_id is distinct from old.student_id
     or new.mock_id is distinct from old.mock_id
     or new.org_id is distinct from old.org_id
     -- The programme is fixed too, except the FK's own SET NULL when that
     -- programme is deleted: then the row is already gone.
     or (
       new.course_id is distinct from old.course_id
       and not (
         new.course_id is null
         and not exists (select 1 from public.courses where id = old.course_id)
       )
     )
     or new.proctored is distinct from old.proctored then
    raise exception 'an attempt cannot be re-clocked, reassigned or re-flagged'
      using errcode = '42501';
  end if;

  -- Submission happens once and is never undone.
  if old.status = 'submitted' and new.status <> 'submitted' then
    raise exception 'a submitted attempt cannot be reopened' using errcode = '42501';
  end if;

  new.created_at := old.created_at;

  if old.status = 'submitted' then
    -- When and how it ended are history.
    new.submitted_at := old.submitted_at;
    new.submitted_by := old.submitted_by;
  elsif new.status = 'submitted' then
    if private.is_trusted_writer() then
      -- The expiry sweep may say the timer ended it, and when the clock ran
      -- out, which is earlier than the sweep ran. Never before the start, never
      -- in the future.
      new.submitted_by := coalesce(new.submitted_by, 'student');
      new.submitted_at := least(greatest(coalesce(new.submitted_at, now()), old.started_at), now());
    else
      -- A student submits by hand, now. They cannot claim the timer did it.
      new.submitted_by := 'student';
      new.submitted_at := now();
    end if;
  else
    new.submitted_at := null;
    new.submitted_by := null;
  end if;

  -- The score is scoring's to write, never a student's.
  if not private.is_trusted_writer() then
    new.score := old.score;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.guard_attempt_write() from public, anon, authenticated;

commit;
