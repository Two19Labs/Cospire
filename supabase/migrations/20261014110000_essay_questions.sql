-- The essay question type: the on-the-spot essays in the full MESA and Ashoka
-- mocks (owner, 2026-10-13).
--
-- An essay is answered as typed text inside the mock, under the section timer
-- like any other question. It is **not auto-scored**: its marks stay pending
-- until an admin or the student's assigned mentor awards them on the attempt
-- review, and the attempt's score then includes them.
--
-- Three things are deliberately *not* built here:
--
--   * **No second scoring routine.** `scoreAndStore` stays the only scorer
--     (operating manual §11, Annexure A rescoring). Awarding a mark clears
--     `attempts.score`, which is this repository's existing "awaiting a score"
--     state, and the existing path recomputes the attempt -- the same path a
--     corrected answer key uses.
--   * **No key.** An essay has no `question_keys` row, like a DI stimulus.
--   * **No choice-group model.** "Choose 1 of 2" is handled by the scorer
--     taking the best-marked essay in a section; see the pull request, it is a
--     decision for the owner.

-- ---------------------------------------------------------------------------
-- The type
-- ---------------------------------------------------------------------------

-- Widened, never narrowed: every existing row still satisfies it.
alter table public.questions drop constraint questions_type_valid;
alter table public.questions add constraint questions_type_valid
  check (type in ('mcq', 'mcq_multi', 'numerical', 'di_stimulus', 'essay'));

-- An essay carries marks (`questions_marks_valid` already requires marks > 0
-- for everything but a stimulus) and no options: the `else` arm of
-- `private.question_options_valid` already demands `'[]'` for any type it does
-- not name, so that function needs no change.

-- The key's shape. Redefined from 20260921120000 to add one arm: an essay has
-- no key at all, exactly like a stimulus. Nothing else is changed.
create or replace function private.question_key_valid(
  p_type text,
  p_options jsonb,
  p_answer jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    case
      -- Neither is answered against a stored key: the stimulus is read, the
      -- essay is marked by a person.
      when p_type in ('di_stimulus', 'essay') then p_answer is null
      when jsonb_typeof(p_answer) is distinct from 'object' then false
      when p_type in ('mcq', 'mcq_multi')
           and jsonb_typeof(p_answer -> 'options') is distinct from 'array' then false
      when p_type = 'numerical'
           and jsonb_typeof(p_answer -> 'accepted') is distinct from 'array' then false
      when p_type in ('mcq', 'mcq_multi') then
        (
          case p_type
            when 'mcq' then jsonb_array_length(p_answer -> 'options') = 1
            else jsonb_array_length(p_answer -> 'options') >= 1
          end
        )
        and not exists (
          select 1
          from jsonb_array_elements(p_answer -> 'options') as chosen (value)
          where jsonb_typeof(chosen.value) is distinct from 'string'
             or not exists (
               select 1
               from jsonb_array_elements(p_options) as option_row (value)
               where option_row.value ->> 'id' = chosen.value #>> '{}'
             )
        )
        and (
          select count(distinct chosen.value)
          from jsonb_array_elements(p_answer -> 'options') as chosen (value)
        ) = jsonb_array_length(p_answer -> 'options')
      when p_type = 'numerical' then
        jsonb_array_length(p_answer -> 'accepted') between 1 and 20
        and not exists (
          select 1
          from jsonb_array_elements(p_answer -> 'accepted') as form_row (value)
          where jsonb_typeof(form_row.value) is distinct from 'string'
             or btrim(form_row.value #>> '{}') = ''
             or char_length(form_row.value #>> '{}') > 50
        )
        and (
          p_answer -> 'tolerance' is null
          or (jsonb_typeof(p_answer -> 'tolerance') = 'number'
              and (p_answer ->> 'tolerance')::numeric >= 0)
        )
        and (p_answer - 'accepted' - 'tolerance') = '{}'::jsonb
      else false
    end,
    false
  )
$$;

revoke execute on function private.question_key_valid(text, jsonb, jsonb) from public, anon, authenticated;

-- The student's stored answer. Redefined from 20260927110000 to add the essay
-- arm: `{ "text": "..." }`, which is the shape the exam screen's textarea
-- posts. The ceiling matches `questions.body`: an essay answer is prose, and
-- 20000 characters is about 3000 words, well past any on-the-spot essay, while
-- still bounding what one row can hold.
create or replace function private.answer_fits_question(p_answer jsonb, p_type text, p_options jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_answer is null then true
    when jsonb_typeof(p_answer) is distinct from 'object' then false
    when p_type = 'essay' then
      (p_answer - 'text') = '{}'::jsonb
      and jsonb_typeof(p_answer -> 'text') = 'string'
      and char_length(p_answer ->> 'text') between 1 and 20000
    when p_type in ('mcq', 'mcq_multi') then
      (p_answer - 'options') = '{}'::jsonb
      and jsonb_typeof(p_answer -> 'options') = 'array'
      and jsonb_array_length(p_answer -> 'options') between 1 and (case when p_type = 'mcq' then 1 else 10 end)
      and not exists (
        select 1 from jsonb_array_elements(p_answer -> 'options') as chosen (value)
         where jsonb_typeof(chosen.value) is distinct from 'string'
            or not exists (
              select 1 from jsonb_array_elements(p_options) as option_row (value)
               where option_row.value ->> 'id' = chosen.value #>> '{}'
            )
      )
      and (select count(distinct chosen.value) from jsonb_array_elements(p_answer -> 'options') as chosen (value))
          = jsonb_array_length(p_answer -> 'options')
    when p_type = 'numerical' then
      (p_answer - 'value') = '{}'::jsonb
      and jsonb_typeof(p_answer -> 'value') = 'string'
      and char_length(p_answer ->> 'value') between 1 and 50
    else false
  end;
$$;

revoke execute on function private.answer_fits_question(jsonb, text, jsonb) from public, anon, authenticated;

-- An essay's marks are written by a person, and a person's mark is not a right
-- or wrong answer. Widened so `marks_awarded` may stand without `is_correct`;
-- the reverse, a verdict with no marks, is still refused, and every existing
-- row still satisfies it.
alter table public.attempt_responses drop constraint attempt_responses_scored_together;
alter table public.attempt_responses add constraint attempt_responses_scored_together
  check (is_correct is null or marks_awarded is not null);

-- ---------------------------------------------------------------------------
-- essay_marks
-- ---------------------------------------------------------------------------
--
-- The awarded mark is kept here rather than in `attempt_responses.marks_awarded`
-- because those two are different facts: this is the marker's **input**, which
-- must survive every recomputation, while `marks_awarded` is the scorer's
-- **output** and is rewritten on every rescore. Keeping them apart is also what
-- lets the row carry who marked it and when, and lets the write be governed by
-- its own policies rather than by widening a student-facing table.
create table public.essay_marks (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references public.attempts (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete restrict,
  -- Copied from the attempt by the trigger, so every policy here can be an
  -- org check without a join, as everywhere else in this schema.
  org_id bigint not null references public.orgs (id) on delete restrict,
  marks numeric(6, 2) not null,
  -- The admin or mentor who awarded it. Never the student.
  marked_by uuid not null,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- One mark per essay per attempt. Re-marking updates this row, so the
  -- history of a mark is not kept: Annexure A asks for a mark, not an audit of
  -- marking, and `activity_log` records that the action happened.
  constraint essay_marks_once unique (attempt_id, question_id),
  constraint essay_marks_not_negative check (marks >= 0),
  constraint essay_marks_marker_fk foreign key (marked_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

-- The review screen reads one attempt's marks; the scorer reads the same.
create index essay_marks_attempt_idx on public.essay_marks (attempt_id);

alter table public.essay_marks enable row level security;
alter table public.essay_marks force row level security;

-- Reading. The student sees their own mark **only once the attempt is
-- submitted**, which is the rule the answer key follows
-- (`private.student_may_read_key`); a mark cannot exist before submission
-- anyway, and saying so in the policy means that stays true if that ever
-- changes.
create policy essay_marks_select_own on public.essay_marks
for select to authenticated
using (
  (select private.student_owns_attempt(attempt_id))
  and exists (
    select 1 from public.attempts as a
    where a.id = attempt_id and a.status = 'submitted'
  )
);

create policy essay_marks_select_staff on public.essay_marks
for select to authenticated
using (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id
    and (private.is_admin_of_org(a.org_id) or private.is_assigned_mentor(a.student_id))
));

-- Writing. **Only an admin of the organisation or this student's own assigned
-- mentor**, and only those: there is no student policy for insert or update, so
-- a student cannot award themselves marks whatever a route does. The trigger
-- below enforces the rest -- the question really is an essay in this paper, the
-- attempt is submitted, and the mark is within what the question is worth.
create policy essay_marks_insert_staff on public.essay_marks
for insert to authenticated
with check (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id
    and (private.is_admin_of_org(a.org_id) or private.is_assigned_mentor(a.student_id))
));

create policy essay_marks_update_staff on public.essay_marks
for update to authenticated
using (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id
    and (private.is_admin_of_org(a.org_id) or private.is_assigned_mentor(a.student_id))
))
with check (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id
    and (private.is_admin_of_org(a.org_id) or private.is_assigned_mentor(a.student_id))
));

create policy essay_marks_delete_admin on public.essay_marks
for delete to authenticated
using (exists (
  select 1 from public.attempts as a
  where a.id = attempt_id and private.is_admin_of_org(a.org_id)
));

-- What a mark may be, and what it may not.
--
-- The ceiling is the question's marks **on this mock**, which is the section's
-- marks when the section sets them and the question's own when it does not --
-- decision D19, the same rule `effectiveMarks` applies when scoring. A mark
-- above that would let a marker hand out more than the paper is worth.
--
-- `org_id`, `marked_by` and `marked_at` are the server's, never the caller's:
-- a route cannot credit the mark to somebody else.
create or replace function private.guard_essay_mark_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_mock_id bigint;
  attempt_org_id bigint;
  attempt_status text;
  question_type text;
  ceiling numeric;
begin
  select a.mock_id, a.org_id, a.status
    into attempt_mock_id, attempt_org_id, attempt_status
    from public.attempts as a
   where a.id = new.attempt_id;

  if attempt_mock_id is null then
    raise exception 'that attempt does not exist' using errcode = '42501';
  end if;

  -- Marked after the paper is closed, never during it: a mark appearing mid
  -- attempt would be visible to the student under the key rule.
  if attempt_status <> 'submitted' then
    raise exception 'an essay is marked after the attempt is submitted' using errcode = '42501';
  end if;

  select q.type into question_type from public.questions as q where q.id = new.question_id;
  if question_type is distinct from 'essay' then
    raise exception 'only an essay question carries an awarded mark' using errcode = '42501';
  end if;

  -- In this paper, and in a section of it, which is also where the ceiling
  -- comes from. An essay is a standalone question, so it is placed directly in
  -- `mock_questions`; there is no parent to reach through.
  select coalesce(ms.marks, q.marks)
    into ceiling
    from public.mock_questions as mq
    join public.questions as q on q.id = mq.question_id
    left join public.mock_sections as ms on ms.id = mq.mock_section_id
   where mq.mock_id = attempt_mock_id
     and mq.question_id = new.question_id;

  if ceiling is null then
    raise exception 'that question is not in this paper' using errcode = '42501';
  end if;

  if new.marks > ceiling then
    raise exception 'this essay is worth % mark(s); % cannot be awarded', ceiling, new.marks
      using errcode = '23514';
  end if;

  new.org_id := attempt_org_id;
  new.marked_by := coalesce((select auth.uid()), new.marked_by);
  new.marked_at := now();

  if tg_op = 'UPDATE' then
    new.attempt_id := old.attempt_id;
    new.question_id := old.question_id;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_essay_mark_write() from public, anon, authenticated;

create trigger essay_marks_guard_write
before insert or update on public.essay_marks
for each row execute function private.guard_essay_mark_write();

-- Awarding, changing or removing a mark puts the attempt back in the
-- awaiting-a-score state, and **that is the whole of the recompute**: the
-- existing path (`rescoreAwaiting`, and the result screen itself) scores an
-- attempt whose score is null, so the mark reaches the total through the one
-- scorer rather than through a second one here.
create or replace function private.essay_mark_awaits_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target bigint := coalesce(new.attempt_id, old.attempt_id);
begin
  perform set_config('cospire.system_write', 'on', true);
  update public.attempts set score = null where id = target and status = 'submitted';
  perform set_config('cospire.system_write', 'off', true);
  return null;
end;
$$;

revoke execute on function private.essay_mark_awaits_score() from public, anon, authenticated;

create trigger essay_marks_awaits_score
after insert or update or delete on public.essay_marks
for each row execute function private.essay_mark_awaits_score();

comment on table public.essay_marks is
  'The mark an admin or assigned mentor awarded for one essay answer in one attempt. The marker''s input, kept apart from attempt_responses.marks_awarded, which is the scorer''s output and is rewritten on every rescore.';
