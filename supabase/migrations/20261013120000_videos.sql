-- Phase 2, video: the `videos` library, video items in a curriculum, and the
-- grant helper the player's access check reads.
--
-- 1. `videos` (operating manual §4). One row per VdoCipher video. The bytes
--    never touch Supabase or the app server (§8): VdoCipher holds them, and
--    this row holds only its id, a title and what VdoCipher reports about it.
--    `status` follows VdoCipher's processing, so an upload started from the
--    platform has a row from the moment its credentials are issued.
--
-- 2. Access. A student reads a video row only through a direct `video` grant
--    in `content_access` or a programme whose curriculum contains it, through
--    `private.student_has_video_grant`, the same shape as the document and mock
--    helpers. The player mints a VdoCipher OTP only after this policy has
--    returned the row, so the policy is the access check (manual §1, §9.2).
--
-- 3. `private.validate_curriculum_item` gains its `video` branch, and
--    `private.validate_content_access_resource` its `video` branch (the check
--    constraint has accepted 'video' since the foundation; nothing validated
--    it). Both bodies are otherwise reproduced unchanged.
--
-- 4. `private.student_may_record_progress` admits video items, so the player
--    can store percent and last position. Its body is otherwise unchanged.
--
-- Additive: one new table, two new helpers, one new trigger function, three
-- redefined functions that only gain a branch. Nothing is dropped or renamed,
-- and nothing the deployed build reads changes shape.

begin;

-- ---------------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------------

create table public.videos (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  -- VdoCipher's own id: 32 hex characters.
  vdocipher_id text not null,
  title text not null,
  -- Null until VdoCipher has processed the file and reports a length.
  duration_seconds integer,
  -- VdoCipher's "Pre-Upload", "Queued" and "ready", in our spelling.
  status text not null default 'processing',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint videos_vdocipher_id_unique unique (vdocipher_id),
  constraint videos_vdocipher_id_format check (vdocipher_id ~ '^[0-9a-f]{32}$'),
  constraint videos_title_not_blank check (btrim(title) <> ''),
  constraint videos_title_length check (char_length(title) <= 200),
  constraint videos_title_normalized check (title = btrim(title)),
  constraint videos_duration_valid check (duration_seconds is null or duration_seconds >= 0),
  constraint videos_status_valid check (status in ('pre_upload', 'processing', 'ready')),
  -- RESTRICT, as documents.uploaded_by: accounts are disabled, never deleted.
  constraint videos_creator_org_fkey foreign key (created_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

create index videos_org_created_idx on public.videos (org_id, created_at desc, id desc);
create index videos_created_by_idx on public.videos (created_by);

create trigger videos_set_updated_at
before update on public.videos
for each row execute function private.set_updated_at();

-- Direct grant OR the programme cascade (N11), as student_has_document_grant.
create or replace function private.student_has_video_grant(target_video_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_access as grant_row
    join public.profiles as student
      on student.id = grant_row.student_id
     and student.org_id = grant_row.org_id
    where grant_row.resource_type = 'video'
      and grant_row.resource_id = target_video_id
      and grant_row.student_id = (select auth.uid())
      and student.role = 'student'
      and student.status = 'active'
  )
  or private.student_has_programme_item('video', target_video_id);
$$;

revoke execute on function private.student_has_video_grant(bigint) from public, anon;
grant execute on function private.student_has_video_grant(bigint) to authenticated;

-- A deleted video takes its grants and curriculum items with it, so no row is
-- left naming an id that a later video could reuse. Same reasoning as
-- cascade_course_grants_on_delete.
create or replace function private.cascade_video_references_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.content_access where resource_type = 'video' and resource_id = old.id;
  delete from public.curriculum_items where type = 'video' and ref_id = old.id;
  return old;
end;
$$;

revoke execute on function private.cascade_video_references_on_delete()
  from public, anon, authenticated;

create trigger videos_cascade_references
after delete on public.videos
for each row execute function private.cascade_video_references_on_delete();

alter table public.videos enable row level security;
alter table public.videos force row level security;

create policy videos_select_authorized on public.videos
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_has_video_grant(id))
  )
);

create policy videos_insert_admin on public.videos
for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy videos_update_admin on public.videos
for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy videos_delete_admin on public.videos
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.videos from anon, authenticated;
revoke all on sequence public.videos_id_seq from anon, authenticated;
grant select, insert, update, delete on table public.videos to authenticated;
grant usage, select on sequence public.videos_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Redefined: the previous bodies, unchanged, plus a video branch.
-- ---------------------------------------------------------------------------

create or replace function private.validate_curriculum_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'document' then
    if not exists (
      select 1 from public.documents where id = new.ref_id and org_id = new.org_id
    ) then
      raise exception 'ref_id % does not match a document in this organisation', new.ref_id;
    end if;
  elsif new.type = 'test' then
    if not exists (
      select 1 from public.mocks where id = new.ref_id and org_id = new.org_id
    ) then
      raise exception 'ref_id % does not match a mock in this organisation', new.ref_id;
    end if;
  elsif new.type = 'video' then
    if not exists (
      select 1 from public.videos where id = new.ref_id and org_id = new.org_id
    ) then
      raise exception 'ref_id % does not match a video in this organisation', new.ref_id;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_curriculum_item()
  from public, anon, authenticated;

create or replace function private.validate_content_access_resource()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource_org_id bigint;
begin
  if new.resource_type = 'document' then
    select org_id into resource_org_id from public.documents where id = new.resource_id;
    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing document', new.resource_id;
    end if;
    if resource_org_id <> new.org_id then
      raise exception 'a document may only be granted within its own organisation';
    end if;

  elsif new.resource_type = 'course' then
    select org_id into resource_org_id from public.courses where id = new.resource_id;
    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing programme', new.resource_id;
    end if;
    if resource_org_id <> new.org_id then
      raise exception 'a programme may only be granted within its own organisation';
    end if;

  elsif new.resource_type = 'mock' then
    select org_id into resource_org_id from public.mocks where id = new.resource_id;
    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing mock', new.resource_id;
    end if;
    if resource_org_id <> new.org_id then
      raise exception 'a mock may only be granted within its own organisation';
    end if;

  elsif new.resource_type = 'video' then
    select org_id into resource_org_id from public.videos where id = new.resource_id;
    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing video', new.resource_id;
    end if;
    if resource_org_id <> new.org_id then
      raise exception 'a video may only be granted within its own organisation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_content_access_resource()
  from public, anon, authenticated;

create or replace function private.student_may_record_progress(target_item_id bigint, target_org_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_student()
     and target_org_id = private.current_org_id()
     and exists (
       select 1 from public.curriculum_items
        where id = target_item_id
          and org_id = target_org_id
          and type in ('document', 'text', 'video')
          and private.student_reaches_section(section_id)
     );
$$;

commit;
