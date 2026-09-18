-- Phase 5a, step 4: the ARS upload bucket and its policies.
--
-- Rule #2 of the operating manual, and the half of the ARS access rule that RLS
-- does not cover: row policies protect rows in tables, and files are governed
-- separately by policies on storage.objects. A correct policy on
-- ars_submissions in front of an open bucket protects nothing.
--
-- Two kinds of file land here, and the 2026-09-16 meeting is why it is both:
-- video essays, and the resume, marksheet and certificates an application round
-- asks for. So the accepted types are wider than the documents bucket's.
--
-- The path is the one ars_submissions.file_path already insists on:
--
--   org/<org_id>/ars/<student_id>/<uuid>.<ext>
--
-- Write access is decided from that path rather than from a submission row,
-- because the object is uploaded before the row exists -- the same reasoning as
-- the documents bucket. Read access defers to a helper, so there is one
-- definition of who may see a student's work rather than two that drift.
--
-- Unlike documents, reads are NOT admin-only here. A document had a watermarked
-- viewer worth forcing everyone through; a video essay has nothing equivalent,
-- and Annexure A asks only that the file reach the student, their assigned
-- mentor and admins. Making mentors fetch through a server-minted URL would add
-- a hop that protects nothing.
--
-- Additive only: one bucket, two helpers, four policies on storage.objects.

begin;

-- `public = false` is the load-bearing word. A public bucket serves every object
-- to anyone holding the path, and every policy below would protect nothing.
--
-- 50MiB matches the project-wide cap in supabase/config.toml; a bucket limit
-- above the global one is silently ineffective. That cap, and the Free plan's
-- 1GB of storage, are what must be raised before students upload real video
-- essays -- capacity, not capability, and already recorded as Cospire's to do.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ars-uploads',
  'ars-uploads',
  false,
  52428800,
  array[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do nothing;

-- May the caller read this object?
--
--   the student  -- their own prefix, including a file on a draft they have not
--                   handed in yet
--   their mentor -- only once a submission naming this exact object has been
--                   handed in, which mirrors the table policy: a mentor sees no
--                   drafts, and nothing a student has not submitted
--   an admin     -- anything beneath their own organisation's prefix
--
-- The path segments are read positionally: org/<org_id>/ars/<student_id>/<file>.
create or replace function private.can_read_ars_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    -- the student's own file
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'student'
      and p.status = 'active'
      and object_name like 'org/' || p.org_id || '/ars/' || p.id::text || '/%'
  )
  or exists (
    -- an admin of the organisation the path names
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
      and object_name like 'org/' || p.org_id || '/%'
  )
  or exists (
    -- the assigned mentor, on handed-in work only
    select 1
    from public.ars_submissions as s
    where s.file_path = object_name
      and s.status <> 'draft'
      and private.is_assigned_mentor(s.student_id)
  )
$$;

revoke execute on function private.can_read_ars_object(text) from public, anon;
grant execute on function private.can_read_ars_object(text) to authenticated;

-- May the caller put an object here?
--
-- Only an active student, only beneath their own organisation and their own id.
-- Checked against the path because the object precedes the row, which is also
-- what stops one student writing into another's prefix and then pointing a
-- submission at it.
create or replace function private.can_write_ars_object(object_name text)
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
$$;

revoke execute on function private.can_write_ars_object(text) from public, anon;
grant execute on function private.can_write_ars_object(text) to authenticated;

create policy ars_objects_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ars-uploads'
  and (select private.can_read_ars_object(name))
);

create policy ars_objects_insert_student
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ars-uploads'
  and (select private.can_write_ars_object(name))
);

-- Replacing a file while the work is still a draft is ordinary; replacing one
-- after it has been handed in is not. Both the old and the new name must be the
-- student's own, so an update cannot move a file into someone else's prefix.
create policy ars_objects_update_own_draft
on storage.objects
for update
to authenticated
using (
  bucket_id = 'ars-uploads'
  and (select private.can_write_ars_object(name))
  and not exists (
    select 1
    from public.ars_submissions as s
    where s.file_path = storage.objects.name
      and s.status <> 'draft'
  )
)
with check (
  bucket_id = 'ars-uploads'
  and (select private.can_write_ars_object(name))
);

-- Same rule for removing one: a student may clear a file off work in progress,
-- and nothing removes a file that has been handed in. There is deliberately no
-- delete policy for mentors or admins: losing a student's evidence should take
-- a deliberate act in the dashboard, not a stray click.
create policy ars_objects_delete_own_draft
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ars-uploads'
  and (select private.can_write_ars_object(name))
  and not exists (
    select 1
    from public.ars_submissions as s
    where s.file_path = storage.objects.name
      and s.status <> 'draft'
  )
);

commit;
