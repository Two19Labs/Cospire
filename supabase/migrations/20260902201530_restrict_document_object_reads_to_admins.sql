-- Narrows direct Storage reads on the documents bucket to admins.
--
-- `20260902180054` let a student read an object directly whenever they held a
-- content_access grant for the document naming it, mirroring the table policy.
-- That is a faithful mirror and it is too generous, for a reason that only
-- shows up when you ask what the watermark is for.
--
-- A student with that policy can fetch the raw, un-watermarked PDF straight
-- from the Storage API with their session token: no viewer, no canvas, no name
-- drawn across the page. The token lasts an hour and works for every document
-- they hold. The viewer's signed URL, by contrast, lasts ten minutes and names
-- one object. Both hand over the same bytes -- brief §8 is honest that any
-- renderable PDF has already been delivered -- but one of them leaves a
-- traceable mark and the other does not, and there is no reason to offer the
-- untraceable route as a documented API call.
--
-- Nothing in the application needs it. Every student read is a signed URL minted
-- server-side after `documents_select_authorized` has returned the row, and a
-- signed URL is validated by the Storage service rather than by RLS, so it is
-- unaffected by this change.
--
-- The bucket keeps a real policy either way, per operating manual §9.5: admins
-- of the owning organisation may read and write their own objects, and everyone
-- else -- students, mentors, other organisations, anonymous callers -- is
-- refused at the storage layer.

begin;

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
      and private.is_admin_of_org(d.org_id)
  )
$$;

commit;
