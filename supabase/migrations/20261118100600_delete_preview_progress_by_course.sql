-- The delete preview (D54, `20261017110000_delete.sql`) counted a programme's
-- progress rows through `item -> section -> course`. Since shared modules a
-- module item has no section, and a row names its programme in
-- `item_progress.course_id`, which is also what the course foreign key
-- cascades on delete. So the programme branch now counts
-- `item_progress where course_id = the programme`. The function is otherwise
-- the 20261017110000 body unchanged; the delete itself is untouched.

begin;

create or replace function public.content_delete_preview(p_type text, p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_org_id bigint;
  label text;
  counts jsonb;
  blocker text;
begin
  select p.org_id into caller_org_id
    from public.profiles p
   where p.id = (select auth.uid())
     and p.role = 'admin'
     and p.status = 'active';
  if caller_org_id is null then
    raise exception 'only an active admin may read a delete preview' using errcode = '42501';
  end if;

  if p_type = 'mock' then
    select m.title into label from public.mocks m where m.id = p_id and m.org_id = caller_org_id;
    if label is null then raise exception 'not found' using errcode = 'P0002'; end if;
    select jsonb_build_object(
      'attempts', (select count(*) from public.attempts where mock_id = p_id),
      'responses', (select count(*) from public.attempt_responses r join public.attempts a on a.id = r.attempt_id where a.mock_id = p_id),
      'attemptSections', (select count(*) from public.attempt_sections s join public.attempts a on a.id = s.attempt_id where a.mock_id = p_id),
      'proctorEvents', (select count(*) from public.proctor_events e join public.attempts a on a.id = e.attempt_id where a.mock_id = p_id),
      'essayMarks', (select count(*) from public.essay_marks e join public.attempts a on a.id = e.attempt_id where a.mock_id = p_id),
      'paperSections', (select count(*) from public.mock_sections where mock_id = p_id),
      'paperQuestions', (select count(*) from public.mock_questions where mock_id = p_id),
      'grants', (select count(*) from public.content_access where resource_type = 'mock' and resource_id = p_id),
      'curriculumItems', (select count(*) from public.curriculum_items where type = 'test' and ref_id = p_id)
    ) into counts;
    -- An ARS round links to a mock through its `config`, which no foreign key
    -- can protect, so deleting the mock would leave the round pointing at
    -- nothing. Refused rather than rewritten: the round is someone's design.
    select string_agg(r.name, ', ') into blocker
      from public.ars_rounds r
     where r.org_id = caller_org_id and r.config ->> 'mockId' = p_id::text;

  elsif p_type = 'document' then
    select d.title into label from public.documents d where d.id = p_id and d.org_id = caller_org_id;
    if label is null then raise exception 'not found' using errcode = 'P0002'; end if;
    select jsonb_build_object(
      'grants', (select count(*) from public.content_access where resource_type = 'document' and resource_id = p_id),
      'curriculumItems', (select count(*) from public.curriculum_items where type = 'document' and ref_id = p_id),
      'progressRows', (select count(*) from public.item_progress p join public.curriculum_items i on i.id = p.item_id
                        where i.type = 'document' and i.ref_id = p_id),
      'storageObjects', 1
    ) into counts;

  elsif p_type = 'video' then
    select v.title into label from public.videos v where v.id = p_id and v.org_id = caller_org_id;
    if label is null then raise exception 'not found' using errcode = 'P0002'; end if;
    select jsonb_build_object(
      'grants', (select count(*) from public.content_access where resource_type = 'video' and resource_id = p_id),
      'curriculumItems', (select count(*) from public.curriculum_items where type = 'video' and ref_id = p_id),
      'progressRows', (select count(*) from public.item_progress p join public.curriculum_items i on i.id = p.item_id
                        where i.type = 'video' and i.ref_id = p_id),
      'vdocipherVideos', 1
    ) into counts;

  elsif p_type = 'programme' then
    select c.title into label from public.courses c
     where c.id = p_id and c.org_id = caller_org_id and c.kind = 'programme';
    if label is null then raise exception 'not found' using errcode = 'P0002'; end if;
    select jsonb_build_object(
      'sections', (select count(*) from public.sections where course_id = p_id),
      'curriculumItems', (select count(*) from public.curriculum_items i join public.sections s on s.id = i.section_id
                           where s.course_id = p_id),
      -- Every progress row made in this programme, module items included: the
      -- course foreign key cascades exactly these (20261118100100).
      'progressRows', (select count(*) from public.item_progress where course_id = p_id),
      'grants', (select count(*) from public.content_access where resource_type = 'course' and resource_id = p_id)
    ) into counts;

  else
    raise exception 'not a deletable kind of thing' using errcode = '22023';
  end if;

  return jsonb_build_object('type', p_type, 'id', p_id, 'label', label, 'counts', counts, 'blockedBy', blocker);
end;
$$;

revoke execute on function public.content_delete_preview(text, bigint) from public, anon;
grant execute on function public.content_delete_preview(text, bigint) to authenticated;

commit;
