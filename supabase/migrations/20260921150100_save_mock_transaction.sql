-- PostgREST commits each request separately, while a valid mock and its first
-- section must commit together. Keep the complete replacement atomic and let
-- RLS remain the authority by using SECURITY INVOKER.

begin;

create or replace function public.save_mock(
  p_mock_id bigint,
  p_title text,
  p_instructions text,
  p_duration_minutes integer,
  p_negative_marking numeric,
  p_negative_marking_types text[],
  p_max_attempts integer,
  p_allow_mobile boolean,
  p_proctoring_enabled boolean,
  p_sections jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_org_id bigint;
  saved_mock_id bigint;
  section_row jsonb;
  saved_section_id bigint;
  section_position integer := 0;
  question_value jsonb;
  question_position integer;
begin
  select p.org_id into caller_org_id
    from public.profiles p
   where p.id = (select auth.uid())
     and p.role = 'admin'
     and p.status = 'active';
  if caller_org_id is null then
    raise exception 'only an active admin may save a mock' using errcode = '42501';
  end if;

  if jsonb_typeof(p_sections) is distinct from 'array'
     or jsonb_array_length(p_sections) not between 1 and 20 then
    raise exception 'a mock needs between 1 and 20 sections' using errcode = '22023';
  end if;

  if p_mock_id is null then
    insert into public.mocks (
      org_id, title, instructions, duration_minutes, negative_marking,
      negative_marking_types, max_attempts, allow_mobile, proctoring_enabled
    ) values (
      caller_org_id, regexp_replace(btrim(p_title), '\s+', ' ', 'g'), coalesce(p_instructions, ''),
      p_duration_minutes, p_negative_marking, p_negative_marking_types,
      p_max_attempts, p_allow_mobile, p_proctoring_enabled
    ) returning id into saved_mock_id;
  else
    update public.mocks set
      title = regexp_replace(btrim(p_title), '\s+', ' ', 'g'),
      instructions = coalesce(p_instructions, ''),
      duration_minutes = p_duration_minutes,
      negative_marking = p_negative_marking,
      negative_marking_types = p_negative_marking_types,
      max_attempts = p_max_attempts,
      allow_mobile = p_allow_mobile,
      proctoring_enabled = p_proctoring_enabled
    where id = p_mock_id and org_id = caller_org_id
    returning id into saved_mock_id;
    if saved_mock_id is null then
      raise exception 'mock not found' using errcode = 'P0002';
    end if;
    delete from public.mock_sections where mock_id = saved_mock_id;
  end if;

  for section_row in select value from jsonb_array_elements(p_sections)
  loop
    if jsonb_typeof(section_row) is distinct from 'object'
       or jsonb_typeof(section_row -> 'title') is distinct from 'string'
       or jsonb_typeof(section_row -> 'questions') is distinct from 'array' then
      raise exception 'invalid mock section' using errcode = '22023';
    end if;

    insert into public.mock_sections (
      mock_id, org_id, title, duration_minutes, sort_order
    ) values (
      saved_mock_id,
      caller_org_id,
      regexp_replace(btrim(section_row ->> 'title'), '\s+', ' ', 'g'),
      case
        when section_row -> 'durationMinutes' = 'null'::jsonb then null
        when jsonb_typeof(section_row -> 'durationMinutes') = 'number'
          then (section_row ->> 'durationMinutes')::integer
        else null
      end,
      section_position
    ) returning id into saved_section_id;

    question_position := 0;
    for question_value in select value from jsonb_array_elements(section_row -> 'questions')
    loop
      if jsonb_typeof(question_value) is distinct from 'number' then
        raise exception 'invalid question id' using errcode = '22023';
      end if;
      insert into public.mock_questions (
        mock_id, mock_section_id, question_id, org_id, sort_order
      ) values (
        saved_mock_id, saved_section_id, (question_value #>> '{}')::bigint,
        caller_org_id, question_position
      );
      question_position := question_position + 1;
    end loop;
    section_position := section_position + 1;
  end loop;

  return saved_mock_id;
end;
$$;

revoke execute on function public.save_mock(
  bigint, text, text, integer, numeric, text[], integer, boolean, boolean, jsonb
) from public, anon;
grant execute on function public.save_mock(
  bigint, text, text, integer, numeric, text[], integer, boolean, boolean, jsonb
) to authenticated;

commit;
