-- Phase 1, steps 6 and 4: the document library and the grants that reach it.
--
-- Additive only: one new table, one new bucket, new helpers, new policies and
-- one new index on an existing table. Nothing here can break the currently
-- deployed code, per docs/implementation-plan.md.

begin;

-- The library itself.
--
-- Columns are exactly the set named in the operating manual §4 and technical
-- brief §3. There is deliberately no mime_type or size column: the bucket below
-- declares `allowed_mime_types` and `file_size_limit`, so the Storage service
-- refuses a non-PDF and an oversized file at upload time. A column would only
-- record what the object store already enforces, and could drift from it.
create table public.documents (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  title text not null,
  -- A single-level label, not a path and not a table. The technical brief
  -- offers a self-referencing parent_id for nesting; nothing in Annexure A asks
  -- for it, so folders stay a flat filter over the library.
  folder text not null default '',
  storage_path text not null,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_title_not_blank check (btrim(title) <> ''),
  constraint documents_title_length check (char_length(title) <= 200),
  constraint documents_folder_normalized check (
    folder = btrim(folder)
    and folder !~ '[/\\]'
    and char_length(folder) <= 80
  ),
  constraint documents_storage_path_unique unique (storage_path),
  -- The object key is pinned to this organisation's prefix and to a random
  -- UUID, in the database rather than only in the code that builds it.
  --
  -- Two things this buys. A row can never point at another organisation's
  -- object, which is the cross-tenant hole a polymorphic resource_id cannot be
  -- given a foreign key to close. And a path can never contain `..` or a
  -- filename taken from the upload, so nothing an admin types reaches the
  -- object store.
  constraint documents_storage_path_scoped check (
    storage_path ~ (
      '^org/' || org_id ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    )
  ),
  -- ON DELETE RESTRICT, matching content_access.granted_by and
  -- mentor_assignments.assigned_by. An admin who has uploaded a document cannot
  -- be deleted, which is the same force that made deactivation rather than
  -- deletion the only workable offboarding route on 2026-09-01.
  constraint documents_uploader_org_fkey
    foreign key (uploaded_by, org_id)
    references public.profiles (id, org_id)
    on delete restrict
);

create index documents_org_id_folder_idx on public.documents (org_id, folder);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

-- The admin's "who can read this document" screen filters by resource rather
-- than by student, so the leading column of content_access_grant_unique
-- (student_id, resource_type, resource_id) does not serve it.
create index content_access_resource_idx
  on public.content_access (resource_type, resource_id);

create trigger documents_set_updated_at
before update on public.documents
for each row execute function private.set_updated_at();

-- Read the grant through a SECURITY DEFINER helper rather than a direct
-- content_access subquery inside the policy, per operating manual §9.7.
create or replace function private.student_has_document_grant(target_document_id bigint)
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
    where grant_row.resource_type = 'document'
      and grant_row.resource_id = target_document_id
      and grant_row.student_id = (select auth.uid())
      and student.role = 'student'
      and student.status = 'active'
  )
$$;

revoke execute on function private.student_has_document_grant(bigint) from public, anon;
grant execute on function private.student_has_document_grant(bigint) to authenticated;

-- content_access.resource_id is polymorphic, so it cannot carry a foreign key.
-- Without this, an admin could write a grant naming a document id that does not
-- exist, or one belonging to another organisation. Neither would let anybody
-- read anything -- the documents policies below close that -- but both produce
-- a grant that displays in the console and resolves to nothing, which is a bug
-- report waiting to happen rather than a security hole.
--
-- Scoped to resource_type = 'document' because that is the only resource type
-- that exists yet. Videos, courses and mocks extend this function when their
-- tables land.
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
    select org_id
      into resource_org_id
      from public.documents
     where id = new.resource_id;

    if resource_org_id is null then
      raise exception 'resource_id % does not match an existing document', new.resource_id;
    end if;

    if resource_org_id <> new.org_id then
      raise exception 'a document may only be granted within its own organisation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_content_access_resource()
  from public, anon, authenticated;

create trigger content_access_validate_resource
before insert or update on public.content_access
for each row execute function private.validate_content_access_resource();

alter table public.documents enable row level security;
alter table public.documents force row level security;

-- No org filter is written into the application's list query. This policy is
-- what scopes an admin to their own organisation and a student to their grants,
-- the same division of labour as profiles_select_authorized.
create policy documents_select_authorized
on public.documents
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_has_document_grant(id))
  )
);

create policy documents_insert_admin
on public.documents
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy documents_update_admin
on public.documents
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy documents_delete_admin
on public.documents
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.documents from anon, authenticated;
revoke all on sequence public.documents_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.documents to authenticated;
grant usage, select on sequence public.documents_id_seq to authenticated;

-- The bucket, created in the same migration as the table, per operating manual
-- §9.5 and technical brief §4.2.
--
-- `public = false` is the load-bearing word. A public bucket serves every object
-- to anyone holding the path, and the policies below would protect nothing.
--
-- allowed_mime_types and file_size_limit are enforced by the Storage service on
-- upload, which is why the documents table carries neither as a column. 50MiB
-- matches the project-wide cap in supabase/config.toml; a bucket limit above the
-- global one is silently ineffective.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- Storage policies.
--
-- `anon` and `authenticated` hold full arwdDxtm grants on storage.objects,
-- issued by supabase_storage_admin when the Storage extension was installed.
-- RLS on storage.objects is what stands between those grants and every file in
-- the project, so a bucket without policies is protected only by the absence of
-- a permissive one. These make the intent explicit and mirror the table
-- policies above: an admin manages their own organisation's objects, a student
-- reads an object only where a content_access grant reaches the document row
-- that names it.
create or replace function private.can_read_document_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents as d
    where d.storage_path = object_name
      and (
        private.is_admin_of_org(d.org_id)
        or (
          d.org_id = private.current_org_id()
          and private.student_has_document_grant(d.id)
        )
      )
  )
$$;

revoke execute on function private.can_read_document_object(text) from public, anon;
grant execute on function private.can_read_document_object(text) to authenticated;

-- Write access is checked against the path prefix rather than against a
-- documents row, because the object is uploaded before the row exists. An admin
-- may only ever write beneath their own organisation's prefix.
create or replace function private.can_write_document_object(object_name text)
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
      and p.role = 'admin'
      and p.status = 'active'
      and object_name like 'org/' || p.org_id || '/%'
  )
$$;

revoke execute on function private.can_write_document_object(text) from public, anon;
grant execute on function private.can_write_document_object(text) to authenticated;

create policy documents_objects_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (select private.can_read_document_object(name))
);

create policy documents_objects_insert_admin
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (select private.can_write_document_object(name))
);

create policy documents_objects_update_admin
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documents'
  and (select private.can_write_document_object(name))
)
with check (
  bucket_id = 'documents'
  and (select private.can_write_document_object(name))
);

create policy documents_objects_delete_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and (select private.can_write_document_object(name))
);

commit;
