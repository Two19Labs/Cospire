-- A form round may ask for several files (for example, a marksheet and a
-- transcript), while the original ars_submissions.file_path column can name
-- only one. File-field metadata therefore lives under its field key in the
-- existing answer JSON object:
--
--   { "marksheet": { "storagePath": "org/.../uuid.pdf", ... } }
--
-- This migration teaches Storage authorization to recognise those paths. The
-- old file_path branch remains for backwards compatibility with any standalone
-- file submission written before this form engine existed.

begin;

create or replace function private.ars_submission_references_object(
  submission_answer jsonb,
  legacy_file_path text,
  object_name text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select legacy_file_path = object_name
    or exists (
      select 1
      from jsonb_each(
        case
          when jsonb_typeof(submission_answer) = 'object' then submission_answer
          else '{}'::jsonb
        end
      ) as field(key, value)
      where jsonb_typeof(field.value) = 'object'
        and field.value ->> 'storagePath' = object_name
    )
$$;

revoke execute on function private.ars_submission_references_object(jsonb, text, text)
  from public, anon;
grant execute on function private.ars_submission_references_object(jsonb, text, text)
  to authenticated;

create or replace function private.ars_object_is_handed_in(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_submissions as s
    where s.status <> 'draft'
      and private.ars_submission_references_object(s.answer, s.file_path, object_name)
  )
$$;

revoke execute on function private.ars_object_is_handed_in(text) from public, anon;
grant execute on function private.ars_object_is_handed_in(text) to authenticated;

create or replace function private.can_read_ars_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'student'
      and p.status = 'active'
      and object_name like 'org/' || p.org_id || '/ars/' || p.id::text || '/%'
  )
  or exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
      and object_name like 'org/' || p.org_id || '/%'
  )
  or exists (
    select 1
    from public.ars_submissions as s
    where s.status <> 'draft'
      and private.ars_submission_references_object(s.answer, s.file_path, object_name)
      and private.is_assigned_mentor(s.student_id)
  )
$$;

drop policy ars_objects_update_own_draft on storage.objects;
create policy ars_objects_update_own_draft
on storage.objects
for update
to authenticated
using (
  bucket_id = 'ars-uploads'
  and (select private.can_write_ars_object(name))
  and not (select private.ars_object_is_handed_in(name))
)
with check (
  bucket_id = 'ars-uploads'
  and (select private.can_write_ars_object(name))
);

drop policy ars_objects_delete_own_draft on storage.objects;
create policy ars_objects_delete_own_draft
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ars-uploads'
  and (select private.can_write_ars_object(name))
  and not (select private.ars_object_is_handed_in(name))
);

commit;
