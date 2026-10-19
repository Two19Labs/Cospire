-- Sections follow the paper (owner, 2026-10-19). A mock keeps the sections of
-- the document it was imported from whatever its timing, so an overall-timer
-- mock may now have several untimed sections rather than one implicit one.
--
-- The engine already sits that shape: with no section timed the paper is in
-- free mode (one clock, every question reachable), in `paper.ts` and in the
-- answer-window checks of 20260927110000 alike. Mixing timed and untimed
-- sections stays refused, and a fully timed mock must still add up exactly.
--
-- Expand only: every mock that passed the old rule passes this one, and the
-- deployed code never builds the new shape, so nothing deployed can break.

begin;

create or replace function private.validate_mock_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_mock_id bigint;
  mock_row public.mocks%rowtype;
  section_count integer;
  untimed_count integer;
  section_total integer;
begin
  if tg_table_name = 'mocks' then
    target_mock_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_mock_id := case when tg_op = 'DELETE' then old.mock_id else new.mock_id end;
  end if;

  select * into mock_row from public.mocks where id = target_mock_id;
  if mock_row.id is null then return null; end if;

  select count(*), count(*) filter (where duration_minutes is null), coalesce(sum(duration_minutes), 0)
    into section_count, untimed_count, section_total
    from public.mock_sections where mock_id = target_mock_id;
  if section_count = 0 then raise exception 'a mock needs at least one section' using errcode = '23514'; end if;
  if untimed_count > 0 and untimed_count <> section_count then
    raise exception 'either every section has a time limit or none does' using errcode = '23514';
  end if;
  if untimed_count = 0 and section_total <> mock_row.duration_minutes then
    raise exception 'section durations must equal the full mock duration' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.mock_questions mq join public.questions q on q.id=mq.question_id and q.org_id=mq.org_id
    where mq.mock_id=target_mock_id and q.archived_at is not null
  ) then raise exception 'an archived question cannot be added to a mock' using errcode = '23514'; end if;
  if exists (
    select 1 from public.mock_questions mq join public.questions q on q.id=mq.question_id and q.org_id=mq.org_id
    where mq.mock_id=target_mock_id and q.parent_id is not null and not exists (
      select 1 from public.mock_questions parent_mq where parent_mq.mock_id=mq.mock_id
      and parent_mq.question_id=q.parent_id and parent_mq.mock_section_id=mq.mock_section_id
    )
  ) or exists (
    select 1 from public.mock_questions stimulus_mq
    join public.questions stimulus on stimulus.id=stimulus_mq.question_id and stimulus.org_id=stimulus_mq.org_id
    where stimulus_mq.mock_id=target_mock_id and stimulus.type='di_stimulus' and exists (
      select 1 from public.questions child where child.parent_id=stimulus.id and child.org_id=stimulus.org_id
      and not exists (
        select 1 from public.mock_questions child_mq where child_mq.mock_id=stimulus_mq.mock_id
        and child_mq.question_id=child.id and child_mq.mock_section_id=stimulus_mq.mock_section_id
      )
    )
  ) then raise exception 'a DI set must be added whole to one section' using errcode = '23514'; end if;
  return null;
end;
$$;

commit;
