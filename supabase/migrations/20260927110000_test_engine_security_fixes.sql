-- Phase 4: fixes from the security review of feat/test-engine, 2026-09-27.
-- Fix-forward; supersedes the two functions below as last defined in
-- 20260927100000. Both defects are reachable with a student's own session
-- through the API, so both are fixed in the database.
--
--   1. The answer's shape was never checked. A student could store
--      {"options":["a","a"]} for a multiple-correct question keyed ["a","c"],
--      which the scorer (since fixed too) counted as right. An answer is now
--      refused unless it is exactly what the paper's form could send: distinct
--      option ids that exist on the question (one for a single-answer MCQ), or
--      one typed value of at most 50 characters.
--   2. In a sectioned paper a student could read later sections' questions
--      before entering them, and work on them in the earlier sections' time.
--      While the attempt is open, a sectioned paper's questions are readable
--      only for sections the student has entered. After submitting, all are.
--
-- The attempt screen still needs the paper's shape before later sections open,
-- to number questions across the whole paper, so `public.attempt_outline`
-- returns ids, parents, sections, order and types -- never a body, an option
-- or a key -- for the caller's own attempt only.

begin;

-- 2. Reading questions: only sections entered, until submitted.
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
        or mq.question_id = (select parent_id from public.questions where id = target_question_id)
      )
      and (
        a.status = 'submitted'
        or not exists (
          select 1 from public.mock_sections
           where mock_id = a.mock_id and duration_minutes is not null
        )
        or exists (
          select 1 from public.attempt_sections as s
           where s.attempt_id = a.id and s.mock_section_id = mq.mock_section_id
        )
      )
  );
$$;

-- The paper's shape for the caller's own attempt: no text, no options, no keys.
create or replace function public.attempt_outline(p_attempt_id bigint)
returns table (question_id bigint, parent_id bigint, mock_section_id bigint, sort_order integer, question_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select mq.question_id, q.parent_id, mq.mock_section_id, mq.sort_order, q.type
  from public.attempts as a
  join public.mock_questions as mq on mq.mock_id = a.mock_id
  join public.questions as q on q.id = mq.question_id
  where a.id = p_attempt_id
    and a.student_id = (select auth.uid())
    and private.is_active_student()
  union
  select child.id, child.parent_id, mq.mock_section_id, mq.sort_order, child.type
  from public.attempts as a
  join public.mock_questions as mq on mq.mock_id = a.mock_id
  join public.questions as child on child.parent_id = mq.question_id
  where a.id = p_attempt_id
    and a.student_id = (select auth.uid())
    and private.is_active_student();
$$;

revoke execute on function public.attempt_outline(bigint) from public, anon;
grant execute on function public.attempt_outline(bigint) to authenticated;

-- 1. Answers: the shape the paper's form sends, and nothing else.
create or replace function private.answer_fits_question(p_answer jsonb, p_type text, p_options jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_answer is null then true
    when jsonb_typeof(p_answer) is distinct from 'object' then false
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
  question_type text;
  question_options jsonb;
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

  select type, options into question_type, question_options
    from public.questions where id = new.question_id;

  if not private.answer_fits_question(new.answer, question_type, question_options) then
    raise exception 'that answer does not fit the question' using errcode = '22023';
  end if;

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
