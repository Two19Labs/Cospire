-- D42 and D54: delete for programmes, documents, mocks and videos.
--
-- A delete removes everything that hangs off the thing deleted and leaves no
-- orphan: no curriculum item pointing at nothing, no grant naming an id a later
-- row could reuse, no `item_progress` row, no storage object and no VdoCipher
-- video. The database part is one transaction in a `SECURITY DEFINER` function
-- only an active admin of the organisation can run; the storage object and the
-- VdoCipher video are removed after that commits, and a row in
-- `deletion_cleanups` is what makes that second step impossible to lose.
--
-- What is NOT deleted, deliberately:
--
--   * **Questions.** The bank is shared, so a mock takes its paper rows
--     (`mock_sections`, `mock_questions`) and never a question.
--   * **`rescore_events`.** They name a question, not a mock, and the question
--     survives the mock. Deleting them with a mock would erase the record
--     Annexure A requires for a question still used in other mocks, and no
--     orphan is possible: every column references a row that is still there.
--   * **The documents, videos and mocks a programme points at.** They live in
--     their own libraries; a programme takes its sections, its curriculum items
--     and its grants only.
--
-- Additive: one new table, three new functions, one existing cascade trigger
-- function extended. Nothing existing is dropped or renamed.

begin;

-- ---------------------------------------------------------------------------
-- The existing cascade, extended to grants
-- ---------------------------------------------------------------------------

-- Live body from `20261008120000_curriculum_items_and_programme_cascade.sql`
-- with the grant delete added. `courses` and `videos` already remove their own
-- grants on delete (`cascade_course_grants_on_delete`,
-- `cascade_video_references_on_delete`); documents and mocks did not, which
-- left a `content_access` row naming a freed id -- an access bug the day an id
-- is reused. Putting it here rather than in `delete_content` means it holds
-- however the row is deleted.
create or replace function private.cascade_curriculum_items_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_type text := case tg_table_name when 'documents' then 'document' else 'test' end;
  grant_type text := case tg_table_name when 'documents' then 'document' else 'mock' end;
begin
  delete from public.curriculum_items
   where ref_id = old.id
     and type = item_type;

  delete from public.content_access
   where resource_type = grant_type
     and resource_id = old.id;

  return old;
end;
$$;

revoke execute on function private.cascade_curriculum_items_on_delete()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- deletion_cleanups: the external half of a delete, written in the same
-- transaction as the delete itself
-- ---------------------------------------------------------------------------

-- A storage object and a VdoCipher video cannot be removed inside a database
-- transaction, and a delete that commits and then fails its HTTP call must not
-- leave the file behind silently. So the row is written with the delete, and
-- the admin is shown anything still pending with a way to run it again.
create table public.deletion_cleanups (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  -- Only these two have anything outside the database.
  resource_type text not null,
  -- The storage path, or the VdoCipher video id. What the retry needs.
  target text not null,
  -- The deleted thing's title, so the screen can name it: the row it came from
  -- is gone by the time anyone reads this.
  resource_label text not null,
  status text not null default 'pending',
  last_error text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deletion_cleanups_type_valid check (resource_type in ('document', 'video')),
  constraint deletion_cleanups_status_valid check (status in ('pending', 'done')),
  constraint deletion_cleanups_target_not_blank check (btrim(target) <> ''),
  constraint deletion_cleanups_label_not_blank check (btrim(resource_label) <> ''),
  constraint deletion_cleanups_error_length check (last_error is null or char_length(last_error) <= 1000),
  constraint deletion_cleanups_requested_by_fk foreign key (requested_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

-- The screen asks for this organisation's pending rows, oldest first.
create index deletion_cleanups_pending_idx on public.deletion_cleanups (org_id, created_at)
  where status = 'pending';

create trigger deletion_cleanups_set_updated_at
before update on public.deletion_cleanups
for each row execute function private.set_updated_at();

alter table public.deletion_cleanups enable row level security;
alter table public.deletion_cleanups force row level security;

-- Admins of the organisation only, for every verb. No student or mentor policy:
-- this is an admin's own worklist, and it names storage paths.
create policy deletion_cleanups_select_admin on public.deletion_cleanups
for select to authenticated
using ((select private.is_admin_of_org(org_id)));
create policy deletion_cleanups_insert_admin on public.deletion_cleanups
for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));
create policy deletion_cleanups_update_admin on public.deletion_cleanups
for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));
create policy deletion_cleanups_delete_admin on public.deletion_cleanups
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

-- Grants, named one at a time as every other table here does: the default
-- grants to `anon` and `authenticated` are revoked first, so a policy is never
-- the only thing standing in front of this table. `authenticated` needs insert
-- for nothing today -- `delete_content` writes the row as its definer -- but
-- the insert policy exists per manual §9.4 and the grant goes with it.
revoke all on table public.deletion_cleanups from anon, authenticated;
grant select, insert, update, delete on table public.deletion_cleanups to authenticated;
grant usage, select on sequence public.deletion_cleanups_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- What a delete will remove
-- ---------------------------------------------------------------------------

-- The counts the confirmation screen states, measured rather than estimated,
-- and `SECURITY DEFINER` for the same reason the delete is: a count filtered
-- by a missing read policy would understate what is about to go, which is
-- worse than no count at all.
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
      'progressRows', (select count(*) from public.item_progress p join public.curriculum_items i on i.id = p.item_id
                        join public.sections s on s.id = i.section_id where s.course_id = p_id),
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

-- ---------------------------------------------------------------------------
-- The delete itself
-- ---------------------------------------------------------------------------

-- One transaction, so there is no half-done delete. `SECURITY DEFINER` because
-- the rows being removed belong to students and an admin holds no delete policy
-- on `attempts`; the guard below is what stands in for one, and it is the only
-- way in -- `authenticated` can execute this function and nothing else.
--
-- The typed name is checked **here** as well as in the form, so a post that
-- never rendered the confirmation screen is refused by the database.
--
-- Returns what the caller must still remove outside the database, and the id of
-- the `deletion_cleanups` row to close when it has.
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
  'Deletes a programme, document, mock or video and everything that hangs off it, in one transaction, for an active admin of its organisation only. Refuses unless the typed name matches the title. Returns the storage path or VdoCipher id still to be removed and the deletion_cleanups row to close when it has been.';

commit;
