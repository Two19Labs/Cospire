-- Delete for shared modules (D61 decision 4, D54 flow): `content_delete_preview`
-- and `delete_content` gain the kind 'module'. Deleting an attached module is
-- allowed; the preview returns `attachedTo`, the programmes it is attached to,
-- so the confirmation screen can say "attached to N programmes: ...". The
-- delete removes the module, its `section_modules` rows and its items (and their
-- progress rows) through the foreign-key cascades; the library content its items
-- pointed at (videos, documents, mocks) is untouched.
--
-- Both functions are replaced with their live bodies (20261118100600 and
-- 20261017110000) plus the module branch; security settings, search_path, and
-- grants are unchanged.

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
  attached jsonb;
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

  elsif p_type = 'module' then
    select m.title into label from public.modules m where m.id = p_id and m.org_id = caller_org_id;
    if label is null then raise exception 'not found' using errcode = 'P0002'; end if;
    select jsonb_build_object(
      'moduleItems', (select count(*) from public.curriculum_items where module_id = p_id),
      'attachments', (select count(*) from public.section_modules where module_id = p_id),
      'progressRows', (select count(*) from public.item_progress p join public.curriculum_items i on i.id = p.item_id
                        where i.module_id = p_id)
    ) into counts;
    -- Deleting is allowed while attached (decision 4); the screen names the
    -- programmes so the admin knows what the module disappears from.
    select coalesce(jsonb_agg(t order by t), '[]'::jsonb) into attached
      from (select distinct c.title as t
              from public.section_modules sm
              join public.sections s on s.id = sm.section_id
              join public.courses c on c.id = s.course_id
             where sm.module_id = p_id) names;

  else
    raise exception 'not a deletable kind of thing' using errcode = '22023';
  end if;

  return jsonb_build_object('type', p_type, 'id', p_id, 'label', label, 'counts', counts, 'blockedBy', blocker, 'attachedTo', coalesce(attached, '[]'::jsonb));
end;
$$;

revoke execute on function public.content_delete_preview(text, bigint) from public, anon;
grant execute on function public.content_delete_preview(text, bigint) to authenticated;

create or replace function public.delete_content(p_type text, p_id bigint, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_org_id bigint;
  caller uuid := (select auth.uid());
  label text;
  typed text := regexp_replace(btrim(coalesce(p_confirm_name, '')), '\s+', ' ', 'g');
  cleanup_id bigint;
  external_target text;
  linked_rounds text;
begin
  select p.org_id into caller_org_id
    from public.profiles p
   where p.id = caller
     and p.role = 'admin'
     and p.status = 'active';
  if caller_org_id is null then
    raise exception 'only an active admin may delete content' using errcode = '42501';
  end if;

  if p_type = 'mock' then
    select m.title into label from public.mocks m
     where m.id = p_id and m.org_id = caller_org_id for update;
  elsif p_type = 'document' then
    select d.title, d.storage_path into label, external_target from public.documents d
     where d.id = p_id and d.org_id = caller_org_id for update;
  elsif p_type = 'video' then
    select v.title, v.vdocipher_id into label, external_target from public.videos v
     where v.id = p_id and v.org_id = caller_org_id for update;
  elsif p_type = 'programme' then
    select c.title into label from public.courses c
     where c.id = p_id and c.org_id = caller_org_id and c.kind = 'programme' for update;
  elsif p_type = 'module' then
    select m.title into label from public.modules m
     where m.id = p_id and m.org_id = caller_org_id for update;
  else
    raise exception 'not a deletable kind of thing' using errcode = '22023';
  end if;

  if label is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  -- Normalised on both sides, because every title in this database is stored
  -- whitespace-normalised. Otherwise exact: the typing is the last of the three
  -- deliberate steps, and a near miss is a miss.
  if typed <> regexp_replace(btrim(label), '\s+', ' ', 'g') then
    raise exception 'the typed name does not match' using errcode = '22023';
  end if;

  if p_type = 'mock' then
    select string_agg(r.name, ', ') into linked_rounds
      from public.ars_rounds r
     where r.org_id = caller_org_id and r.config ->> 'mockId' = p_id::text;
    if linked_rounds is not null then
      raise exception 'this mock is linked to the ARS round %, which would be left pointing at nothing. Unlink it first.', linked_rounds
        using errcode = '23503';
    end if;

    -- Attempts first, and not only for tidiness: `attempts.mock_id` is ON
    -- DELETE RESTRICT and `private.guard_sat_mock_structure` refuses to delete
    -- a `mock_sections` row while any attempt exists, so the mock cannot go
    -- until they have. Their responses, sections entered, proctor events and
    -- essay marks all cascade from here.
    delete from public.attempts where mock_id = p_id;
    -- The paper rows cascade from the mock, and the trigger above takes the
    -- curriculum items and the grants. Questions are untouched.
    delete from public.mocks where id = p_id and org_id = caller_org_id;

  elsif p_type = 'document' then
    -- Curriculum items and grants go with it through the trigger, and
    -- `item_progress` cascades from `curriculum_items`.
    delete from public.documents where id = p_id and org_id = caller_org_id;

  elsif p_type = 'video' then
    -- `cascade_video_references_on_delete` takes the grants and the curriculum
    -- items; `item_progress` cascades from those.
    delete from public.videos where id = p_id and org_id = caller_org_id;

  elsif p_type = 'programme' then
    -- `sections` cascade from the course, `curriculum_items` from the sections
    -- and `item_progress` from the items; `cascade_course_grants_on_delete`
    -- takes the grants. The documents, videos and mocks the items pointed at
    -- are not touched: they live in their own libraries.
    delete from public.courses where id = p_id and org_id = caller_org_id and kind = 'programme';

  elsif p_type = 'module' then
    -- `section_modules` (every attachment) and the module's `curriculum_items`
    -- cascade from the module, and `item_progress` from those items. The
    -- documents, videos and mocks the items pointed at stay in their libraries.
    delete from public.modules where id = p_id and org_id = caller_org_id;
  end if;

  -- Written in the same transaction as the delete, so a failure of the HTTP
  -- call afterwards cannot lose the file.
  if external_target is not null then
    insert into public.deletion_cleanups (org_id, resource_type, target, resource_label, requested_by)
    values (caller_org_id, p_type, external_target, label, caller)
    returning id into cleanup_id;
  end if;

  return jsonb_build_object(
    'type', p_type, 'label', label,
    'cleanupId', cleanup_id, 'target', external_target
  );
end;
$$;

revoke execute on function public.delete_content(text, bigint, text) from public, anon;
grant execute on function public.delete_content(text, bigint, text) to authenticated;

comment on function public.delete_content(text, bigint, text) is
  'Deletes a programme, module, document, mock or video and everything that hangs off it, in one transaction, for an active admin of its organisation only. Refuses unless the typed name matches the title. Returns the storage path or VdoCipher id still to be removed and the deletion_cleanups row to close when it has been.';

commit;
