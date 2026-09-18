-- Phase 5a, step 3: ARS submissions, attempts, and the run of a whole process.
--
-- Reworked 2026-09-18 after the Client meeting of 2026-09-16, and before being
-- applied anywhere: the database has never seen the earlier draft of this file,
-- so this is an edit rather than a correcting migration. What changed:
--
--   * Scoring and the mentor's write-up belong to a WHOLE PROCESS, not to one
--     submission, so the `ars_feedback` table of the first draft is gone. The
--     report lands in its own migration once its template is agreed; the run row
--     below is what it will hang from.
--   * An extra attempt is granted per student per round by an admin, and the new
--     submission sits BESIDE the first so a mentor sees both.
--   * A student keeps the round order they started with, so the order is
--     snapshotted per student when they begin.
--
-- The access rule is Annexure A's, and the one the Client cares about most: a
-- student's ARS submission is visible only to that student, their assigned
-- mentor and admins, "enforced at the database level". So it is policy here, for
-- writes as well as reads.
--
-- Row policies decide WHICH ROWS a caller may touch, never WHICH COLUMNS, and a
-- student and a mentor both write this table for different reasons. So the
-- per-role rules live in triggers, and column grants remove what nobody may ever
-- set through the API.
--
-- The uploaded file itself is the next migration: the bucket and its policies on
-- storage.objects. `file_path` is shaped here so that has a fixed target.
--
-- Additive only: three new tables, one new constraint on ars_rounds, helpers and
-- triggers. Nothing here can break the currently deployed code.

begin;

-- First, so the composite foreign keys below have something to reference. Same
-- reason and same shape as courses_id_org_unique in step 2.
alter table public.ars_rounds
  add constraint ars_rounds_id_org_unique unique (id, org_id);

-- One student's run through one programme's ARS process.
--
-- This exists for three jobs that have nowhere else to live:
--
--   * the round ORDER as it stood when the student began, so an admin
--     reordering rounds cannot rearrange a process someone is halfway through;
--   * when the process finished, which is what releases results; and
--   * when the report was released, stamped once so that adding a round later
--     can never retract feedback a student has already read.
--
-- Rows are created by the trigger on the first submission, never by the client.
create table public.ars_process_runs (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  course_id bigint not null,
  student_id uuid not null,
  -- The snapshot: round ids in the order this student was shown, as a JSON
  -- array. A round added to the programme after they began is not in here; it
  -- is treated as open rather than inserted into their sequence.
  round_order jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  report_released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_process_runs_order_is_array check (
    jsonb_typeof(round_order) = 'array'
  ),
  -- A report cannot be released for a process that has not finished.
  constraint ars_process_runs_report_after_completion check (
    report_released_at is null or completed_at is not null
  ),
  constraint ars_process_runs_one_per_course unique (student_id, course_id),
  -- Referenced by ars_submissions.
  constraint ars_process_runs_id_org_unique unique (id, org_id),

  constraint ars_process_runs_course_org_fkey
    foreign key (course_id, org_id)
    references public.courses (id, org_id)
    on delete restrict,
  constraint ars_process_runs_student_org_fkey
    foreign key (student_id, org_id)
    references public.profiles (id, org_id)
    on delete restrict
);

create index ars_process_runs_course_id_idx on public.ars_process_runs (course_id);
create index ars_process_runs_org_completed_idx
  on public.ars_process_runs (org_id, completed_at);

create trigger ars_process_runs_set_updated_at
before update on public.ars_process_runs
for each row execute function private.set_updated_at();

-- An admin letting one student answer one round a second time.
--
-- The default is one submission per round. Each row here buys exactly one more,
-- so two rows means three submissions. Kept as rows rather than a counter
-- because who granted it and when is worth having when a student asks why.
create table public.ars_attempt_grants (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  round_id bigint not null,
  student_id uuid not null,
  granted_by uuid not null,
  created_at timestamptz not null default now(),

  constraint ars_attempt_grants_round_org_fkey
    foreign key (round_id, org_id)
    references public.ars_rounds (id, org_id)
    on delete restrict,
  constraint ars_attempt_grants_student_org_fkey
    foreign key (student_id, org_id)
    references public.profiles (id, org_id)
    on delete restrict,
  -- ON DELETE RESTRICT, matching content_access.granted_by: an admin who has
  -- granted something cannot be deleted, which is the same force that made
  -- deactivation the only workable offboarding route.
  constraint ars_attempt_grants_granter_org_fkey
    foreign key (granted_by, org_id)
    references public.profiles (id, org_id)
    on delete restrict
);

create index ars_attempt_grants_student_round_idx
  on public.ars_attempt_grants (student_id, round_id);
create index ars_attempt_grants_granted_by_idx
  on public.ars_attempt_grants (granted_by);

create table public.ars_submissions (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  -- Set by the trigger below, never by the client.
  run_id bigint not null,
  round_id bigint not null,
  student_id uuid not null,
  -- 1 for the first submission, 2 for the one an admin granted, and so on.
  attempt_no integer not null default 1,
  -- Every submission shape in one column, as technical brief §13 intends:
  -- { "text": ... } for a written round, { "answers": [...] } for a form. The
  -- shape is validated by the server action against the round's config; the
  -- database insists only that it is an object.
  answer jsonb not null default '{}'::jsonb,
  -- The object key of an uploaded file: a video essay, or a resume or marksheet
  -- on an application round. Null until something is uploaded.
  file_path text,
  status text not null default 'draft',
  -- All three written by the trigger from the server clock. Never the client.
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_submissions_status_valid check (
    status in ('draft', 'submitted', 'reviewed')
  ),
  constraint ars_submissions_answer_is_object check (jsonb_typeof(answer) = 'object'),
  constraint ars_submissions_attempt_no_positive check (attempt_no > 0),

  -- The timestamps agree with the status. Each side of each `=` is a boolean
  -- that cannot be NULL, so these cannot pass by evaluating to NULL -- the trap
  -- recorded under "The NULL that passed a CHECK".
  constraint ars_submissions_submitted_at_matches check (
    (status = 'draft') = (submitted_at is null)
  ),
  constraint ars_submissions_reviewed_matches check (
    (status = 'reviewed') = (reviewed_at is not null)
    and (status = 'reviewed') = (reviewed_by is not null)
  ),

  -- Pinned to this organisation, this student and a random UUID, in the database
  -- and not only in the code that builds it. As with documents: no row can point
  -- at another student's object, and no filename a student chose reaches the
  -- object store. The extension is kept because a video essay and a PDF are
  -- served with different content types.
  constraint ars_submissions_file_path_scoped check (
    file_path is null
    or file_path ~ (
      '^org/' || org_id || '/ars/' || student_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$'
    )
  ),

  -- One submission per student per round, until an admin grants another.
  constraint ars_submissions_one_per_attempt unique (student_id, round_id, attempt_no),
  constraint ars_submissions_id_org_unique unique (id, org_id),

  constraint ars_submissions_run_org_fkey
    foreign key (run_id, org_id)
    references public.ars_process_runs (id, org_id)
    on delete restrict,
  -- ON DELETE RESTRICT: a round a student has answered cannot be deleted, and
  -- neither can the programme above it, since ars_rounds cascades from courses.
  -- Losing a submission is losing a student's work, and the schema refuses
  -- rather than the interface remembering to.
  constraint ars_submissions_round_org_fkey
    foreign key (round_id, org_id)
    references public.ars_rounds (id, org_id)
    on delete restrict,
  constraint ars_submissions_student_org_fkey
    foreign key (student_id, org_id)
    references public.profiles (id, org_id)
    on delete restrict,
  constraint ars_submissions_reviewer_org_fkey
    foreign key (reviewed_by, org_id)
    references public.profiles (id, org_id)
    on delete restrict
);

create unique index ars_submissions_file_path_unique
  on public.ars_submissions (file_path)
  where file_path is not null;

create index ars_submissions_run_id_idx on public.ars_submissions (run_id);
-- The RESTRICT check on round deletion, and the admin's per-round view.
create index ars_submissions_round_id_idx on public.ars_submissions (round_id);
-- The review queue: handed-in work, oldest first.
create index ars_submissions_org_status_submitted_idx
  on public.ars_submissions (org_id, status, submitted_at);
create index ars_submissions_reviewed_by_idx
  on public.ars_submissions (reviewed_by)
  where reviewed_by is not null;

create trigger ars_submissions_set_updated_at
before update on public.ars_submissions
for each row execute function private.set_updated_at();

-- Starting a round: the run, the order snapshot, the sequence rule, and how many
-- attempts this student is allowed.
--
-- All of it is here rather than in a server action because every one of these is
-- a rule about the data, and an action that forgets one leaves a student with
-- two submissions where they were allowed one, or a round answered out of order.
--
-- A caller with no auth.uid() is the secret key -- operations and verification
-- teardown -- which bypasses RLS by design and is let through here as well,
-- except that the run and attempt bookkeeping still has to be correct.
create or replace function private.ars_begin_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  round_course_id bigint;
  round_org_id bigint;
  run public.ars_process_runs%rowtype;
  snapshot jsonb;
  round_position integer;
  blocking bigint;
  used integer;
  allowed integer;
begin
  select r.course_id, r.org_id
    into round_course_id, round_org_id
    from public.ars_rounds as r
   where r.id = new.round_id;

  if round_course_id is null then
    raise exception 'round % does not exist', new.round_id using errcode = '23503';
  end if;

  if new.org_id is distinct from round_org_id then
    raise exception 'a submission must sit in the same organisation as its round'
      using errcode = '42501';
  end if;

  -- The run, created on the student's first submission to this programme. The
  -- order is snapshotted here, once, and never rewritten.
  select * into run
    from public.ars_process_runs as pr
   where pr.student_id = new.student_id
     and pr.course_id = round_course_id;

  if not found then
    select coalesce(jsonb_agg(ordered.id order by ordered.sort_order, ordered.id), '[]'::jsonb)
      into snapshot
      from (
        select r.id, r.sort_order
          from public.ars_rounds as r
         where r.course_id = round_course_id
      ) as ordered;

    insert into public.ars_process_runs (org_id, course_id, student_id, round_order)
    values (new.org_id, round_course_id, new.student_id, snapshot)
    returning * into run;
  end if;

  new.run_id := run.id;

  -- The sequence rule: every round BEFORE this one in the student's own
  -- snapshot must already be handed in. A round added after they began is not
  -- in the snapshot and is therefore open rather than inserted into the order.
  select ordinality
    into round_position
    from jsonb_array_elements_text(run.round_order) with ordinality as t(id, ordinality)
   where t.id = new.round_id::text;

  if round_position is not null then
    select (t.id)::bigint
      into blocking
      from jsonb_array_elements_text(run.round_order) with ordinality as t(id, ordinality)
     where t.ordinality < round_position
       and not exists (
         select 1
           from public.ars_submissions as s
          where s.student_id = new.student_id
            and s.round_id = (t.id)::bigint
            and s.status in ('submitted', 'reviewed')
       )
     order by t.ordinality
     limit 1;

    if blocking is not null then
      raise exception 'round % must be submitted before round %', blocking, new.round_id
        using errcode = '42501';
    end if;
  end if;

  -- How many times this student may answer this round: once, plus one for each
  -- grant an admin has issued.
  select count(*) into used
    from public.ars_submissions as s
   where s.student_id = new.student_id
     and s.round_id = new.round_id;

  select 1 + count(*) into allowed
    from public.ars_attempt_grants as g
   where g.student_id = new.student_id
     and g.round_id = new.round_id;

  if used >= allowed then
    raise exception 'this round has already been answered; an admin must grant another attempt'
      using errcode = '42501';
  end if;

  new.attempt_no := used + 1;

  -- Whatever the client sent, the clock is the server's.
  new.submitted_at := case when new.status = 'submitted' then now() end;
  new.reviewed_at := null;
  new.reviewed_by := null;

  return new;
end;
$$;

revoke execute on function private.ars_begin_submission() from public, anon, authenticated;

create trigger ars_submissions_begin
before insert on public.ars_submissions
for each row execute function private.ars_begin_submission();

-- Who may change what, once a submission exists.
--
--   student  draft -> draft       the answer and file may change
--            draft -> submitted   the answer and file may change; stamps submitted_at
--   mentor   submitted -> reviewed, and nothing else; stamps reviewed_at/by
create or replace function private.guard_ars_submission_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text := private.current_app_role();
begin
  if new.org_id is distinct from old.org_id
     or new.run_id is distinct from old.run_id
     or new.round_id is distinct from old.round_id
     or new.student_id is distinct from old.student_id
     or new.attempt_no is distinct from old.attempt_no
     or new.created_at is distinct from old.created_at then
    raise exception 'an ARS submission cannot be moved to another round, student, run or attempt'
      using errcode = '42501';
  end if;

  if caller is null then
    return new;
  end if;

  if caller_role = 'student' then
    if old.status <> 'draft' or new.status not in ('draft', 'submitted') then
      raise exception 'a submission can only be edited while it is a draft'
        using errcode = '42501';
    end if;
    new.submitted_at := case when new.status = 'submitted' then now() end;
    new.reviewed_at := null;
    new.reviewed_by := null;
    return new;
  end if;

  if caller_role = 'mentor' then
    if old.status <> 'submitted'
       or new.status <> 'reviewed'
       or new.answer is distinct from old.answer
       or new.file_path is distinct from old.file_path then
      raise exception 'a mentor can only mark a submitted submission as reviewed'
        using errcode = '42501';
    end if;
    new.submitted_at := old.submitted_at;
    new.reviewed_at := now();
    new.reviewed_by := caller;
    return new;
  end if;

  raise exception 'this role cannot change an ARS submission'
    using errcode = '42501';
end;
$$;

revoke execute on function private.guard_ars_submission_write()
  from public, anon, authenticated;

create trigger ars_submissions_guard_write
before update on public.ars_submissions
for each row execute function private.guard_ars_submission_write();

-- When every round in the student's own snapshot has been handed in, the run is
-- complete. That moment is what releases results, so it is recorded by the
-- database rather than computed by whichever screen happens to ask.
--
-- completed_at is stamped once and never cleared: a round added to the programme
-- afterwards must not retract a result a student has already been shown.
create or replace function private.ars_mark_run_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.ars_process_runs%rowtype;
  outstanding integer;
begin
  select * into run
    from public.ars_process_runs as pr
   where pr.id = new.run_id;

  if not found or run.completed_at is not null then
    return null;
  end if;

  select count(*)
    into outstanding
    from jsonb_array_elements_text(run.round_order) as t(id)
   where not exists (
     select 1
       from public.ars_submissions as s
      where s.student_id = run.student_id
        and s.round_id = (t.id)::bigint
        and s.status in ('submitted', 'reviewed')
   );

  if outstanding = 0 and jsonb_array_length(run.round_order) > 0 then
    update public.ars_process_runs
       set completed_at = now()
     where id = run.id
       and completed_at is null;
  end if;

  return null;
end;
$$;

revoke execute on function private.ars_mark_run_complete() from public, anon, authenticated;

create trigger ars_submissions_complete_run
after insert or update of status on public.ars_submissions
for each row execute function private.ars_mark_run_complete();

alter table public.ars_process_runs enable row level security;
alter table public.ars_process_runs force row level security;
alter table public.ars_attempt_grants enable row level security;
alter table public.ars_attempt_grants force row level security;
alter table public.ars_submissions enable row level security;
alter table public.ars_submissions force row level security;

-- Read: the student, their assigned mentor, or an admin of the organisation.
--
-- The mentor does not see drafts. A draft is work in progress the student has
-- not handed in, and a queue showing half-written answers invites feedback on
-- something the student is still changing.
--
-- A disabled student reads nothing: current_org_id() is null for them, as for
-- every other table.
create policy ars_submissions_select_authorized
on public.ars_submissions
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      student_id = (select auth.uid())
      or (
        status <> 'draft'
        and (select private.is_assigned_mentor(student_id))
      )
    )
  )
);

-- Write: a student creates only their own submission, only in their own
-- organisation, only for a round their programme grant reaches, and only as a
-- draft or straight to submitted. The case operating manual §11 asks for --
-- another student's student_id -- is refused here. The trigger above decides
-- whether the sequence and the attempt count allow it at all.
create policy ars_submissions_insert_student
on public.ars_submissions
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select private.current_app_role()) = 'student'
  and org_id = (select private.current_org_id())
  and status in ('draft', 'submitted')
  and (select private.student_reaches_round(round_id))
);

-- Edit: the student's own draft, while they still hold the programme. Revoking
-- the grant freezes the draft rather than deleting it.
create policy ars_submissions_update_student
on public.ars_submissions
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select private.current_app_role()) = 'student'
  and status = 'draft'
)
with check (
  student_id = (select auth.uid())
  and status in ('draft', 'submitted')
  and (select private.student_reaches_round(round_id))
);

-- Review: the assigned mentor, on handed-in work only. The trigger confines the
-- change to the status.
create policy ars_submissions_update_mentor
on public.ars_submissions
for update
to authenticated
using (
  org_id = (select private.current_org_id())
  and status = 'submitted'
  and (select private.is_assigned_mentor(student_id))
)
with check (
  status = 'reviewed'
  and (select private.is_assigned_mentor(student_id))
);

-- A run is readable by the same people as the submissions inside it. Nobody
-- writes it through the API at all: the triggers above own every column.
create policy ars_process_runs_select_authorized
on public.ars_process_runs
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      student_id = (select auth.uid())
      or (select private.is_assigned_mentor(student_id))
    )
  )
);

-- Grants are an admin's to give. A student may see that they have one, which is
-- what lets a screen say "you may answer this round once more".
create policy ars_attempt_grants_select_authorized
on public.ars_attempt_grants
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and student_id = (select auth.uid())
  )
);

create policy ars_attempt_grants_insert_admin
on public.ars_attempt_grants
for insert
to authenticated
with check (
  (select private.is_admin_of_org(org_id))
  and granted_by = (select auth.uid())
);

create policy ars_attempt_grants_delete_admin
on public.ars_attempt_grants
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

-- No DELETE policy and no DELETE grant on submissions or runs. Nobody removes a
-- student's work through the API, which is technical brief §6.1's intent.
revoke all on table public.ars_submissions from anon, authenticated;
revoke all on table public.ars_process_runs from anon, authenticated;
revoke all on table public.ars_attempt_grants from anon, authenticated;
revoke all on sequence public.ars_submissions_id_seq from anon, authenticated;
revoke all on sequence public.ars_process_runs_id_seq from anon, authenticated;
revoke all on sequence public.ars_attempt_grants_id_seq from anon, authenticated;

grant select, insert on table public.ars_submissions to authenticated;
-- The only columns anyone may name in an UPDATE. The identity columns cannot
-- change at all, and the timestamps are the triggers' to write.
grant update (answer, file_path, status) on table public.ars_submissions to authenticated;
grant select on table public.ars_process_runs to authenticated;
grant select, insert, delete on table public.ars_attempt_grants to authenticated;
grant usage, select on sequence public.ars_submissions_id_seq to authenticated;
grant usage, select on sequence public.ars_attempt_grants_id_seq to authenticated;

commit;
