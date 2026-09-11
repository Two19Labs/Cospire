-- Phase 5a, step 3: ARS submissions and mentor feedback.
--
-- The access rule is Annexure A's, and the one the Client cares about most: a
-- student's ARS submission is visible only to that student, their assigned
-- mentor and admins, "enforced at the database level". So it is written here,
-- as policy, for writes as well as reads.
--
-- Decisions taken by the owner on 2026-09-12:
--
--   * One submission per student per round. The student edits it only while it
--     is a draft; once submitted it is fixed.
--   * The mentor marks the submission itself as reviewed, after reading it.
--   * Only the assigned mentor writes feedback. Admins see, and do not write.
--
-- Row policies decide WHICH rows a caller may update, never WHICH COLUMNS. A
-- student and a mentor both update this table, for different reasons, so the
-- per-role rules about what may change live in a trigger. Column grants remove
-- the columns nobody may ever change through the API.
--
-- The uploaded file itself is step 4: the bucket and its policies on
-- storage.objects. `file_path` is shaped here so that step has a fixed target.
--
-- Additive only: two new tables, one new constraint on ars_rounds, helpers and
-- triggers. Nothing here can break the currently deployed code.

begin;

-- First, so the composite foreign key below has something to reference. The
-- same reason, and the same shape, as courses_id_org_unique in step 2.
alter table public.ars_rounds
  add constraint ars_rounds_id_org_unique unique (id, org_id);

create table public.ars_submissions (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  round_id bigint not null,
  student_id uuid not null,
  -- Every submission shape in one column, as the technical brief §13 intends:
  -- { "text": ... } for a text round, { "answers": [...] } for a form round.
  -- The shape is validated by the server action against the round's config;
  -- the database insists only that it is an object.
  answer jsonb not null default '{}'::jsonb,
  -- The object key of an uploaded file, for `file` rounds. Null until uploaded.
  file_path text,
  status text not null default 'draft',
  -- Written by the trigger below from the server clock. Never from the client.
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_submissions_status_valid check (
    status in ('draft', 'submitted', 'reviewed')
  ),
  constraint ars_submissions_answer_is_object check (jsonb_typeof(answer) = 'object'),

  -- The timestamps agree with the status. Each side of each `=` is a boolean
  -- that cannot be NULL (status is NOT NULL, and IS NULL never yields NULL), so
  -- these cannot pass by evaluating to NULL -- the trap recorded under "The
  -- NULL that passed a CHECK".
  constraint ars_submissions_submitted_at_matches check (
    (status = 'draft') = (submitted_at is null)
  ),
  constraint ars_submissions_reviewed_matches check (
    (status = 'reviewed') = (reviewed_at is not null)
    and (status = 'reviewed') = (reviewed_by is not null)
  ),

  -- Pinned to this organisation, this student and a random UUID, in the
  -- database and not only in the code that builds it. As with documents: no
  -- row can point at another student's object, and no filename a student chose
  -- reaches the object store. The extension is kept because a video essay and a
  -- PDF are served with different content types.
  constraint ars_submissions_file_path_scoped check (
    file_path is null
    or file_path ~ (
      '^org/' || org_id || '/ars/' || student_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$'
    )
  ),

  -- One submission per student per round.
  constraint ars_submissions_one_per_round unique (student_id, round_id),
  -- Referenced by ars_feedback's composite key.
  constraint ars_submissions_id_org_unique unique (id, org_id),

  -- ON DELETE RESTRICT: a round a student has answered cannot be deleted.
  -- Losing a submission is losing a student's work, and the schema refuses
  -- rather than the interface remembering to. Composite, so a submission cannot
  -- sit in one organisation while its round sits in another.
  --
  -- Note the chain: ars_rounds cascades from courses, so deleting a programme
  -- whose rounds have submissions is refused by this constraint too. That is
  -- intended. No screen deletes a programme today.
  constraint ars_submissions_round_org_fkey
    foreign key (round_id, org_id)
    references public.ars_rounds (id, org_id)
    on delete restrict,
  -- RESTRICT, matching the rest of the schema: users are deactivated, never
  -- deleted, and a student's submissions must not vanish with an account.
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

-- The RESTRICT check on round deletion, and the admin's per-round view.
create index ars_submissions_round_id_idx on public.ars_submissions (round_id);
-- The review queue: submitted work, oldest first.
create index ars_submissions_org_status_submitted_idx
  on public.ars_submissions (org_id, status, submitted_at);
create index ars_submissions_reviewed_by_idx
  on public.ars_submissions (reviewed_by)
  where reviewed_by is not null;

create trigger ars_submissions_set_updated_at
before update on public.ars_submissions
for each row execute function private.set_updated_at();

-- Who may change what, and the server-written timestamps.
--
-- The policies below have already decided that the caller may touch this row
-- at all. This decides what the change may be:
--
--   student  draft -> draft      the answer and file may change
--            draft -> submitted  the answer and file may change; stamps submitted_at
--   mentor   submitted -> reviewed, and nothing else; stamps reviewed_at/by
--
-- A caller with no auth.uid() is the secret key -- operations and verification
-- teardown -- which bypasses RLS by design and is let through here as well.
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
  if caller is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Whatever the client sent, the timestamps come from the server clock.
    new.submitted_at := case when new.status = 'submitted' then now() end;
    new.reviewed_at := null;
    new.reviewed_by := null;
    return new;
  end if;

  if new.org_id is distinct from old.org_id
     or new.round_id is distinct from old.round_id
     or new.student_id is distinct from old.student_id
     or new.created_at is distinct from old.created_at then
    raise exception 'an ARS submission cannot be moved to another round, student or organisation'
      using errcode = '42501';
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
before insert or update on public.ars_submissions
for each row execute function private.guard_ars_submission_write();

alter table public.ars_submissions enable row level security;
alter table public.ars_submissions force row level security;

-- Read: the student, their assigned mentor, or an admin of the organisation.
--
-- The mentor does not see drafts. A draft is work in progress the student has
-- not handed in, and a queue that shows half-written answers invites feedback
-- on something the student is still changing.
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
-- draft or straight to submitted. The case §11 tests: another student's
-- student_id is refused here.
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

-- Review: the assigned mentor, on submitted work only. The trigger above
-- confines the change to status.
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

-- No DELETE policy, and no DELETE grant. Nobody removes a submission through
-- the API, which is the technical brief's §6.1 intent.
revoke all on table public.ars_submissions from anon, authenticated;
revoke all on sequence public.ars_submissions_id_seq from anon, authenticated;

grant select, insert on table public.ars_submissions to authenticated;
-- The only columns anyone may name in an UPDATE. The identity columns cannot
-- change at all, and the timestamps are the trigger's to write.
grant update (answer, file_path, status) on table public.ars_submissions to authenticated;
grant usage, select on sequence public.ars_submissions_id_seq to authenticated;

create table public.ars_feedback (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  submission_id bigint not null,
  mentor_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_feedback_body_not_blank check (btrim(body) <> ''),
  constraint ars_feedback_body_length check (char_length(body) <= 20000),
  -- One feedback per submission, which the mentor edits rather than appends to.
  constraint ars_feedback_one_per_submission unique (submission_id),

  constraint ars_feedback_submission_org_fkey
    foreign key (submission_id, org_id)
    references public.ars_submissions (id, org_id)
    on delete restrict,
  constraint ars_feedback_mentor_org_fkey
    foreign key (mentor_id, org_id)
    references public.profiles (id, org_id)
    on delete restrict
);

create index ars_feedback_mentor_id_idx on public.ars_feedback (mentor_id);

create trigger ars_feedback_set_updated_at
before update on public.ars_feedback
for each row execute function private.set_updated_at();

-- Is the caller the active assigned mentor of this submission's student, and
-- has the submission been handed in? Feedback on a draft is refused, because
-- the mentor cannot see drafts.
create or replace function private.mentor_reaches_submission(target_submission_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_submissions as submission
    where submission.id = target_submission_id
      and submission.status in ('submitted', 'reviewed')
      and private.is_assigned_mentor(submission.student_id)
  )
$$;

revoke execute on function private.mentor_reaches_submission(bigint) from public, anon;
grant execute on function private.mentor_reaches_submission(bigint) to authenticated;

-- Does the calling student own this submission, and has it been marked
-- reviewed? The student reads feedback only once the mentor has finished, so
-- marking reviewed is the moment feedback is released rather than the student
-- watching it being written.
create or replace function private.student_reads_feedback(target_submission_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_submissions as submission
    join public.profiles as student
      on student.id = submission.student_id
     and student.org_id = submission.org_id
    where submission.id = target_submission_id
      and submission.student_id = (select auth.uid())
      and submission.status = 'reviewed'
      and student.status = 'active'
  )
$$;

revoke execute on function private.student_reads_feedback(bigint) from public, anon;
grant execute on function private.student_reads_feedback(bigint) to authenticated;

alter table public.ars_feedback enable row level security;
alter table public.ars_feedback force row level security;

create policy ars_feedback_select_authorized
on public.ars_feedback
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      (select private.mentor_reaches_submission(submission_id))
      or (select private.student_reads_feedback(submission_id))
    )
  )
);

-- Only the assigned mentor writes feedback, and only as themselves.
create policy ars_feedback_insert_mentor
on public.ars_feedback
for insert
to authenticated
with check (
  mentor_id = (select auth.uid())
  and org_id = (select private.current_org_id())
  and (select private.mentor_reaches_submission(submission_id))
);

-- The author edits their own feedback while they still mentor the student. The
-- column grant below means only the body can change.
create policy ars_feedback_update_mentor
on public.ars_feedback
for update
to authenticated
using (
  mentor_id = (select auth.uid())
  and (select private.mentor_reaches_submission(submission_id))
)
with check (
  mentor_id = (select auth.uid())
  and (select private.mentor_reaches_submission(submission_id))
);

revoke all on table public.ars_feedback from anon, authenticated;
revoke all on sequence public.ars_feedback_id_seq from anon, authenticated;

grant select, insert on table public.ars_feedback to authenticated;
grant update (body) on table public.ars_feedback to authenticated;
grant usage, select on sequence public.ars_feedback_id_seq to authenticated;

commit;
