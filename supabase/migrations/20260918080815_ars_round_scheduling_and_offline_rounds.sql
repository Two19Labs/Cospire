-- Phase 5a: what the Client meeting of 2026-09-16 added to a round.
--
-- Two things came out of that call which the schema had nowhere to put:
--
--   1. Dates. "The student will see that the next step is, let's say, an
--      interview or a group discussion. There are these five steps and here are
--      the dates, or here are the deadlines for it." So a round carries when it
--      opens and when it is due.
--
--   2. Rounds that happen somewhere else. Interviews, group discussions and
--      guesstimates are two-way, and Annexure B excludes live features from this
--      platform -- the founder raised that limit himself. They still belong in
--      the sequence: the student sees the step and its date, and the mentor
--      records the outcome afterwards. That is the `offline` mode below.
--
-- And one thing that follows from the same call: an application round is
-- practice and nobody reviews it, while an essay is read by a mentor. That is
-- `requires_review`.
--
-- On widening the mode constraint: the check is dropped and recreated with a
-- fourth value. Widening can never fail against existing rows and cannot break
-- the deployed code, which only ever writes the three it already knows.
--
-- Additive: three nullable-or-defaulted columns, one widened check, one helper,
-- one policy.

begin;

alter table public.ars_rounds
  add column opens_at timestamptz,
  add column due_at timestamptz,
  -- Defaulted true, because a round nobody reads is the exception rather than
  -- the rule, and a NOT NULL column with no default would break every insert the
  -- deployed code is still making.
  add column requires_review boolean not null default true;

alter table public.ars_rounds
  add constraint ars_rounds_dates_ordered check (
    opens_at is null or due_at is null or due_at >= opens_at
  );

alter table public.ars_rounds
  drop constraint ars_rounds_submission_mode_valid;

alter table public.ars_rounds
  add constraint ars_rounds_submission_mode_valid check (
    submission_mode in ('text', 'file', 'form', 'offline')
  );

-- An `offline` round has no student submission: the student hands in nothing,
-- because the interview or group discussion happens elsewhere. What lands in
-- ars_submissions for such a round is the mentor recording that it happened, so
-- that the round counts towards the run being complete like any other.
--
-- A `form` round still needs its fields; nothing about that changes.
create or replace function private.round_is_offline(target_round_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_rounds as r
    where r.id = target_round_id
      and r.submission_mode = 'offline'
  )
$$;

revoke execute on function private.round_is_offline(bigint) from public, anon;
grant execute on function private.round_is_offline(bigint) to authenticated;

-- The assigned mentor records an off-platform round for their own student.
--
-- Only as `submitted`: the ordinary review path then applies, so marking it
-- reviewed goes through the same trigger and stamps the same columns. A mentor
-- cannot open one as a draft, and cannot record a round that takes a real
-- submission -- those are the student's to make.
create policy ars_submissions_insert_mentor_offline
on public.ars_submissions
for insert
to authenticated
with check (
  org_id = (select private.current_org_id())
  and (select private.is_assigned_mentor(student_id))
  and status = 'submitted'
  and (select private.round_is_offline(round_id))
);

-- The other half of that rule: a student cannot hand in work for a round that
-- happens off the platform. The insert policy would already refuse a mentor's
-- round, but nothing stopped a student posting to an `offline` one, which would
-- have let them complete an interview round from their own keyboard.
create or replace function private.ars_begin_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  round_course_id bigint;
  round_org_id bigint;
  round_mode text;
  run public.ars_process_runs%rowtype;
  snapshot jsonb;
  round_position integer;
  blocking bigint;
  used integer;
  allowed integer;
begin
  select r.course_id, r.org_id, r.submission_mode
    into round_course_id, round_org_id, round_mode
    from public.ars_rounds as r
   where r.id = new.round_id;

  if round_course_id is null then
    raise exception 'round % does not exist', new.round_id using errcode = '23503';
  end if;

  if new.org_id is distinct from round_org_id then
    raise exception 'a submission must sit in the same organisation as its round'
      using errcode = '42501';
  end if;

  if round_mode = 'offline'
     and (select auth.uid()) is not null
     and private.current_app_role() = 'student' then
    raise exception 'this round happens off the platform; a mentor records its outcome'
      using errcode = '42501';
  end if;

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

  new.submitted_at := case when new.status = 'submitted' then now() end;
  new.reviewed_at := null;
  new.reviewed_by := null;

  return new;
end;
$$;

revoke execute on function private.ars_begin_submission() from public, anon, authenticated;

commit;
