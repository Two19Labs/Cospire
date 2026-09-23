-- Fix forward: `save_question` snapped a topic to an existing spelling, and
-- when an author edited a question the "existing spelling" it found was that
-- question's own. So correcting "linear equations" to "Linear equations" on
-- the only question carrying it saved the old spelling back, silently.
--
-- The snap now ignores the question being edited. Everything else in the
-- function is unchanged. `20260921120000` is applied and recorded, so it is
-- corrected here rather than edited (operating manual §4.3).

begin;

create or replace function public.save_question(
  p_question_id bigint,
  p_type text,
  p_body text,
  p_options jsonb,
  p_images jsonb,
  p_parent_id bigint,
  p_section_id bigint,
  p_topic text,
  p_difficulty text,
  p_marks numeric,
  p_correct_answer jsonb,
  p_solution text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_org bigint := private.current_org_id();
  clean_topic text := regexp_replace(btrim(coalesce(p_topic, '')), '\s+', ' ', 'g');
  existing_topic text;
  clean_solution text := nullif(btrim(coalesce(p_solution, '')), '');
  saved_id bigint;
begin
  if caller_org is null then
    raise exception 'no active account' using errcode = '42501';
  end if;

  -- "percentages" typed where "Percentages" already exists becomes
  -- "Percentages", so the topic analysis does not split one topic in two.
  select q.topic into existing_topic
    from public.questions as q
   where q.org_id = caller_org
     and q.section_id = p_section_id
     and lower(q.topic) = lower(clean_topic)
     -- Never the question being edited: its own spelling is the one the
     -- author is trying to correct.
     and q.id is distinct from p_question_id
   order by q.id
   limit 1;
  clean_topic := coalesce(existing_topic, clean_topic);

  if p_question_id is null then
    insert into public.questions (
      org_id, parent_id, type, body, options, images,
      section_id, topic, difficulty, marks
    )
    values (
      caller_org, p_parent_id, p_type, p_body, coalesce(p_options, '[]'::jsonb),
      coalesce(p_images, '[]'::jsonb), p_section_id, clean_topic, p_difficulty, p_marks
    )
    returning id into saved_id;
  else
    update public.questions
       set parent_id = p_parent_id,
           type = p_type,
           body = p_body,
           options = coalesce(p_options, '[]'::jsonb),
           images = coalesce(p_images, '[]'::jsonb),
           section_id = p_section_id,
           topic = clean_topic,
           difficulty = p_difficulty,
           marks = p_marks
     where id = p_question_id
       and org_id = caller_org
    returning id into saved_id;

    if saved_id is null then
      raise exception 'question % was not found', p_question_id using errcode = 'P0002';
    end if;
  end if;

  if p_type <> 'di_stimulus' then
    -- Not an upsert: that compiles to INSERT ... ON CONFLICT DO UPDATE and the
    -- conflict arm needs UPDATE on every column it names (see the documents
    -- slice). Two plain statements, each counted.
    update public.question_keys
       set correct_answer = p_correct_answer,
           solution = clean_solution
     where question_id = saved_id;

    if not found then
      insert into public.question_keys (question_id, org_id, correct_answer, solution)
      values (saved_id, caller_org, p_correct_answer, clean_solution);
    end if;
  end if;

  return saved_id;
end;
$$;

commit;
