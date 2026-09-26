-- Phase 4, slice 4.1: the tables a mock attempt lives in, and the access model
-- that lets a student reach a mock at all.
--
-- Nothing before this migration gives a student any route to a test. `mocks`,
-- `mock_sections` and `mock_questions` are admin-only, and `questions` and
-- `question_keys` have no student policy whatsoever. That was deliberate: the
-- answer key is the thing that must never leak, so no door was opened until
-- there was something to gate it on. This migration opens exactly two:
--
--   1. a student reads a mock, its sections and its questions **only while they
--      hold a grant and have an attempt open or submitted**;
--   2. a student reads an answer key **only for a question in an attempt of
--      their own that has already been submitted**.
--
-- Everything else stays shut. A student never reads `questions` directly, never
-- reads another student's attempt, and never reads a key before submitting.
--
-- **The timer is server-authoritative** (operating manual §1.1). `started_at` is
-- written by `now()` in a trigger and can never be changed afterwards, by anyone.
-- The client countdown is decoration; submission validates elapsed time against
-- these columns. A student who tampers with a clock changes nothing.
--
-- **A phone attempt is permanently unproctored** (§1.5). `proctored` is set at
-- insert and frozen. `allow_mobile = false` on the mock refuses the attempt
-- outright, in the database, not in a route.
--
-- Additive: five new tables, six helpers, one redefined trigger function. It
-- drops and renames nothing, so the currently deployed code keeps working.

begin;

-- ---------------------------------------------------------------------------
-- Granting a mock
-- ---------------------------------------------------------------------------

-- `content_access.resource_type` has accepted 'mock' since the foundation
-- migration, but nothing ever validated one: a grant naming a mock that does not
-- exist, or one belonging to another organisation, was accepted in silence.
-- Documents and programmes are both checked; this adds the third case before
-- anything starts writing mock grants.
--
-- Redefined rather than altered, because the function is append-only like the
-- rest: the previous body handled 'document' and 'course' and is reproduced
-- here unchanged.
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
    select org_id into resource_org_id from public.documents where id = new.resource_id;
    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing document', new.resource_id;
    end if;
    if resource_org_id <> new.org_id then
      raise exception 'a document may only be granted within its own organisation';
    end if;

  elsif new.resource_type = 'course' then
    select org_id into resource_org_id from public.courses where id = new.resource_id;
    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing programme', new.resource_id;
    end if;
    if resource_org_id <> new.org_id then
      raise exception 'a programme may only be granted within its own organisation';
    end if;

  elsif new.resource_type = 'mock' then
    select org_id into resource_org_id from public.mocks where id = new.resource_id;
    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing mock', new.resource_id;
    end if;
    if resource_org_id <> new.org_id then
      raise exception 'a mock may only be granted within its own organisation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_content_access_resource()
  from public, anon, authenticated;

-- The same shape as student_has_document_grant. An inactive or non-student
-- profile holds no grant, whatever content_access says.
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
  );
$$;

revoke execute on function private.student_has_mock_grant(bigint) from public, anon;
grant execute on function private.student_has_mock_grant(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- attempts
-- ---------------------------------------------------------------------------

create table public.attempts (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  mock_id bigint not null,
  student_id uuid not null,
  -- Written by the server, never by a client, and never changed afterwards.
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status text not null default 'in_progress',
  -- Null until scored. Slice 4.3 fills it.
  score numeric(8, 2),
  -- False for a phone, for ever. Surfaced to the student and to admins.
  proctored boolean not null default true,
  -- How the attempt ended, for the student's own record: by hand, or by the
  -- scheduled sweep when the clock ran out.
  submitted_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attempts_status_valid check (status in ('in_progress', 'submitted')),
  constraint attempts_submitted_by_valid
    check (submitted_by is null or submitted_by in ('student', 'timer')),
  -- The two must agree. A submitted attempt has a time; an open one has none.
  constraint attempts_submitted_stamped check ((status = 'submitted') = (submitted_at is not null)),
  constraint attempts_submitted_by_stamped check ((submitted_at is null) = (submitted_by is null)),
  constraint attempts_submitted_after_start
    check (submitted_at is null or submitted_at >= started_at),
  constraint attempts_score_only_when_submitted
    check (score is null or submitted_at is not null),
  constraint attempts_id_org_unique unique (id, org_id),
  constraint attempts_mock_fk foreign key (mock_id, org_id)
    references public.mocks (id, org_id) on delete restrict,
  constraint attempts_student_fk foreign key (student_id, org_id)
    references public.profiles (id, org_id) on delete restrict
);

-- A student's own list, newest first, and the admin's view of one mock.
create index attempts_student_idx on public.attempts (student_id, started_at desc);
create index attempts_mock_idx on public.attempts (mock_id, started_at desc);
create index attempts_org_status_idx on public.attempts (org_id, status);
-- The sweep in slice 4.5 asks for open attempts only, so the index is partial:
-- the table grows for ever and the open set stays small.
create index attempts_open_idx on public.attempts (started_at)
  where status = 'in_progress';

-- ---------------------------------------------------------------------------
-- attempt_sections
-- ---------------------------------------------------------------------------

-- One row per section entered. Sectional timing needs a start per section per
-- attempt, and there is nowhere else to put it.
create table public.attempt_sections (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts (id) on delete cascade,
  mock_section_id bigint not null references public.mock_sections (id) on delete restrict,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint attempt_sections_submitted_after_start
    check (submitted_at is null or submitted_at >= started_at),
  -- A section is entered once per attempt. Re-entering resumes the same row,
  -- so the clock cannot be restarted by navigating away and back.
  constraint attempt_sections_once unique (attempt_id, mock_section_id)
);

create index attempt_sections_attempt_idx on public.attempt_sections (attempt_id);

-- ---------------------------------------------------------------------------
-- attempt_responses
-- ---------------------------------------------------------------------------

create table public.attempt_responses (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete restrict,
  -- The student's answer, in the same shape `question_keys.correct_answer`
  -- uses, so scoring compares like with like. Null means seen and not answered,
  -- which is not the same as never opened.
  answer jsonb,
  marked_for_review boolean not null default false,
  -- Filled by scoring in slice 4.3, never by the student.
  is_correct boolean,
  marks_awarded numeric(6, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attempt_responses_once unique (attempt_id, question_id),
  -- Scoring fills both or neither.
  constraint attempt_responses_scored_together
    check ((is_correct is null) = (marks_awarded is null))
);

create index attempt_responses_attempt_idx on public.attempt_responses (attempt_id);
-- Rescoring asks "which attempts answered this question", so the question leads.
create index attempt_responses_question_idx on public.attempt_responses (question_id);

-- ---------------------------------------------------------------------------
-- proctor_events
-- ---------------------------------------------------------------------------

-- Warn and log, never auto-submit (§13.1). A Windows notification stealing
-- focus must not end a real student's exam.
create table public.proctor_events (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts (id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),

  constraint proctor_events_type_valid
    check (event_type in ('fullscreen_exit', 'tab_hidden', 'window_blur', 'copy', 'paste'))
);

create index proctor_events_attempt_idx on public.proctor_events (attempt_id, occurred_at);

-- ---------------------------------------------------------------------------
-- rescore_events
-- ---------------------------------------------------------------------------

-- Annexure A: the system "records that a rescore took place". Questions stay
-- editable, so any change to a key, an option set or a marks value rescores the
-- attempts it affects, and this is the record that it happened.
create table public.rescore_events (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  question_id bigint not null references public.questions (id) on delete restrict,
  changed_by uuid,
  occurred_at timestamptz not null default now(),
  attempts_affected integer not null default 0,
  -- What changed, so an admin reading the log a month later knows why.
  reason text,

  constraint rescore_events_affected_valid check (attempts_affected >= 0),
  constraint rescore_events_reason_length check (reason is null or char_length(reason) <= 500),
  constraint rescore_events_changed_by_fk foreign key (changed_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

create index rescore_events_question_idx on public.rescore_events (question_id, occurred_at desc);
create index rescore_events_org_idx on public.rescore_events (org_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- The guards: what a client may and may not change
-- ---------------------------------------------------------------------------

-- Row policies cannot limit *which columns* a role changes, so a trigger does
-- it, and the trigger is what the tests aim at.
--
-- On insert the server decides everything that matters: the clock starts at
-- now(), the attempt is open, it is unscored. `proctored` is the one field a
-- caller may set, because only the caller knows it is a phone -- and it may only
-- ever be set to false, never claimed true by a client that says so.
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

    -- `mocks.max_attempts` means nothing unless something counts. Counted here
    -- rather than in a route, because two tabs opened at once would each pass an
    -- application check and both insert.
    select count(*)
      into taken
      from public.attempts
     where mock_id = new.mock_id
       and student_id = new.student_id;

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
     or new.proctored is distinct from old.proctored then
    raise exception 'an attempt cannot be re-clocked, reassigned or re-flagged'
      using errcode = '42501';
  end if;

  -- Submission happens once and is never undone.
  if old.status = 'submitted' and new.status <> 'submitted' then
    raise exception 'a submitted attempt cannot be reopened' using errcode = '42501';
  end if;

  if old.status = 'in_progress' and new.status = 'submitted' then
    new.submitted_at := now();
    if new.submitted_by is null then
      new.submitted_by := 'student';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.guard_attempt_write() from public, anon, authenticated;

create trigger attempts_guard_write
before insert or update on public.attempts
for each row execute function private.guard_attempt_write();

-- An answer may be written only while the attempt is open, and scoring columns
-- are never a client's to set.
create or replace function private.guard_attempt_response_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_status text;
begin
  select status into attempt_status from public.attempts where id = new.attempt_id;

  if attempt_status is null then
    raise exception 'that attempt does not exist' using errcode = '42501';
  end if;

  -- Scoring writes through a SECURITY DEFINER function of its own in slice 4.3,
  -- which sets these after the attempt closes. Nothing a student posts may.
  if tg_op = 'INSERT' then
    new.is_correct := null;
    new.marks_awarded := null;
  else
    new.is_correct := old.is_correct;
    new.marks_awarded := old.marks_awarded;
    if new.attempt_id is distinct from old.attempt_id
       or new.question_id is distinct from old.question_id then
      raise exception 'a response cannot be moved to another attempt or question'
        using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;

  if attempt_status <> 'in_progress' then
    raise exception 'this attempt has been submitted' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_attempt_response_write() from public, anon, authenticated;

create trigger attempt_responses_guard_write
before insert or update on public.attempt_responses
for each row execute function private.guard_attempt_response_write();

-- A section clock, like the attempt clock, starts once and on the server.
create or replace function private.guard_attempt_section_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := now();
    new.submitted_at := null;
    return new;
  end if;

  if new.started_at is distinct from old.started_at
     or new.attempt_id is distinct from old.attempt_id
     or new.mock_section_id is distinct from old.mock_section_id then
    raise exception 'a section cannot be re-clocked or moved' using errcode = '42501';
  end if;

  if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    raise exception 'a section is left once' using errcode = '42501';
  end if;

  if old.submitted_at is null and new.submitted_at is not null then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_attempt_section_write() from public, anon, authenticated;

create trigger attempt_sections_guard_write
before insert or update on public.attempt_sections
for each row execute function private.guard_attempt_section_write();

-- ---------------------------------------------------------------------------
-- Reading helpers
-- ---------------------------------------------------------------------------

create or replace function private.student_owns_attempt(target_attempt_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.attempts as a
    where a.id = target_attempt_id
      and a.student_id = (select auth.uid())
  );
$$;

revoke execute on function private.student_owns_attempt(bigint) from public, anon;
grant execute on function private.student_owns_attempt(bigint) to authenticated;

-- A student reads a question only because an attempt of theirs contains it.
-- There is no other door: `questions` still has no student policy of its own.
--
-- `mock_questions` holds top-level rows only -- a standalone question, or a DI
-- set's stimulus -- because that is what the builder writes. So a sub-question
-- is reached through its parent, and both cases are spelled out rather than
-- collapsed into something clever.
create or replace function private.student_reaches_question(target_question_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attempts as a
    join public.mock_questions as mq on mq.mock_id = a.mock_id
    where a.student_id = (select auth.uid())
      and (
        -- the question itself is in the paper
        mq.question_id = target_question_id
        -- or it is a sub-question of a set that is
        or mq.question_id = (
          select parent_id from public.questions where id = target_question_id
        )
      )
  );
$$;

revoke execute on function private.student_reaches_question(bigint) from public, anon;
grant execute on function private.student_reaches_question(bigint) to authenticated;

-- The answer key. **Only after the student's own attempt is submitted**, which
-- is the Critical finding this whole design exists to satisfy.
create or replace function private.student_may_read_key(target_question_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.attempts as a
    join public.mock_questions as mq on mq.mock_id = a.mock_id
    where a.student_id = (select auth.uid())
      and a.status = 'submitted'
      and (
        target_question_id = mq.question_id
        or target_question_id in (
          select child.id from public.questions as child where child.parent_id = mq.question_id
        )
      )
  );
$$;

revoke execute on function private.student_may_read_key(bigint) from public, anon;
grant execute on function private.student_may_read_key(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Enabled and forced on every table here, in the migration that creates them.
-- Policies cover INSERT and UPDATE as well as SELECT: a read policy alone leaves
-- writes unconstrained, and writes are the half that leaks.

alter table public.attempts enable row level security;
alter table public.attempts force row level security;
alter table public.attempt_sections enable row level security;
alter table public.attempt_sections force row level security;
alter table public.attempt_responses enable row level security;
alter table public.attempt_responses force row level security;
alter table public.proctor_events enable row level security;
alter table public.proctor_events force row level security;
alter table public.rescore_events enable row level security;
alter table public.rescore_events force row level security;

-- attempts ------------------------------------------------------------------

create policy attempts_select_own on public.attempts
for select to authenticated
using (student_id = (select auth.uid()));

create policy attempts_select_admin on public.attempts
for select to authenticated
using ((select private.is_admin_of_org(org_id)));

-- A mentor sees the attempts of the students assigned to them, and no others.
create policy attempts_select_mentor on public.attempts
for select to authenticated
using ((select private.is_assigned_mentor(student_id)));

-- A student starts an attempt for themselves, on a mock they have been granted.
-- The clock, the status and the score are the trigger's to set, not the
-- caller's.
create policy attempts_insert_own on public.attempts
for insert to authenticated
with check (
  student_id = (select auth.uid())
  and (select private.student_has_mock_grant(mock_id))
);

-- Submitting. The trigger decides what may actually change.
create policy attempts_update_own on public.attempts
for update to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

create policy attempts_delete_admin on public.attempts
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

-- attempt_sections ----------------------------------------------------------

create policy attempt_sections_select_own on public.attempt_sections
for select to authenticated
using ((select private.student_owns_attempt(attempt_id)));

create policy attempt_sections_select_staff on public.attempt_sections
for select to authenticated
using (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id
    and (private.is_admin_of_org(a.org_id) or private.is_assigned_mentor(a.student_id))
));

create policy attempt_sections_insert_own on public.attempt_sections
for insert to authenticated
with check ((select private.student_owns_attempt(attempt_id)));

create policy attempt_sections_update_own on public.attempt_sections
for update to authenticated
using ((select private.student_owns_attempt(attempt_id)))
with check ((select private.student_owns_attempt(attempt_id)));

-- attempt_responses ---------------------------------------------------------

create policy attempt_responses_select_own on public.attempt_responses
for select to authenticated
using ((select private.student_owns_attempt(attempt_id)));

create policy attempt_responses_select_staff on public.attempt_responses
for select to authenticated
using (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id
    and (private.is_admin_of_org(a.org_id) or private.is_assigned_mentor(a.student_id))
));

create policy attempt_responses_insert_own on public.attempt_responses
for insert to authenticated
with check ((select private.student_owns_attempt(attempt_id)));

create policy attempt_responses_update_own on public.attempt_responses
for update to authenticated
using ((select private.student_owns_attempt(attempt_id)))
with check ((select private.student_owns_attempt(attempt_id)));

-- proctor_events ------------------------------------------------------------
--
-- The student sees what was recorded about them: it is warn-and-log, and a log
-- the subject cannot read would be neither.

create policy proctor_events_select_own on public.proctor_events
for select to authenticated
using ((select private.student_owns_attempt(attempt_id)));

create policy proctor_events_select_staff on public.proctor_events
for select to authenticated
using (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id
    and (private.is_admin_of_org(a.org_id) or private.is_assigned_mentor(a.student_id))
));

create policy proctor_events_insert_own on public.proctor_events
for insert to authenticated
with check ((select private.student_owns_attempt(attempt_id)));

-- No update and no delete policy: an event, once recorded, is not editable by
-- anyone through the API. That is the point of a log.

-- rescore_events ------------------------------------------------------------

create policy rescore_events_select_admin on public.rescore_events
for select to authenticated
using ((select private.is_admin_of_org(org_id)));

create policy rescore_events_insert_admin on public.rescore_events
for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));

-- Grants. `authenticated` holds nothing by default in this project, so each is
-- named. No table here grants DELETE except attempts, and that only to satisfy
-- the admin policy above.
revoke all on table public.attempts from anon, authenticated;
revoke all on table public.attempt_sections from anon, authenticated;
revoke all on table public.attempt_responses from anon, authenticated;
revoke all on table public.proctor_events from anon, authenticated;
revoke all on table public.rescore_events from anon, authenticated;

grant select, insert, update, delete on table public.attempts to authenticated;
grant select, insert, update on table public.attempt_sections to authenticated;
grant select, insert, update on table public.attempt_responses to authenticated;
grant select, insert on table public.proctor_events to authenticated;
grant select, insert on table public.rescore_events to authenticated;

grant usage, select on sequence public.attempts_id_seq to authenticated;
grant usage, select on sequence public.attempt_sections_id_seq to authenticated;
grant usage, select on sequence public.attempt_responses_id_seq to authenticated;
grant usage, select on sequence public.proctor_events_id_seq to authenticated;
grant usage, select on sequence public.rescore_events_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- The two doors this migration opens
-- ---------------------------------------------------------------------------
--
-- Until now a student could read nothing about a mock or a question. These are
-- the only student policies on those tables, and they are deliberately narrow.

-- The paper itself, while the student holds a grant.
create policy mocks_select_student on public.mocks
for select to authenticated
using ((select private.student_has_mock_grant(id)));

create policy mock_sections_select_student on public.mock_sections
for select to authenticated
using ((select private.student_has_mock_grant(mock_id)));

create policy mock_questions_select_student on public.mock_questions
for select to authenticated
using ((select private.student_has_mock_grant(mock_id)));

-- The questions, but only through an attempt the student owns. Holding a grant
-- is not enough: the paper is not readable until it is being sat.
create policy questions_select_student on public.questions
for select to authenticated
using ((select private.student_reaches_question(id)));

-- **The answer key, and only after their own attempt is submitted.** This is
-- the Critical finding in CONTEXT.md: keys live in a table of their own
-- precisely so this door can be opened separately and late.
create policy question_keys_select_student on public.question_keys
for select to authenticated
using ((select private.student_may_read_key(question_id)));

grant select on table public.mocks to authenticated;
grant select on table public.mock_sections to authenticated;
grant select on table public.mock_questions to authenticated;

commit;
