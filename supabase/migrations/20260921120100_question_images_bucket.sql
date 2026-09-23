-- Phase 3: images on questions, added by upload or by pasting from the
-- clipboard (clause 3.17).
--
-- Table RLS does not protect files. `anon` and `authenticated` hold full grants
-- on storage.objects, so this bucket is protected by the policies below and by
-- nothing else. They are written here, in the migration that creates it.
--
-- Authors -- active admins and mentors -- read and write beneath their own
-- organisation's prefix. Students have no policy: a student sees a question
-- image only inside an attempt, through a short-lived signed URL the server
-- mints after checking access, which Phase 4 adds.
--
-- Additive: one new bucket, one helper, four policies.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- Checked against the path rather than a questions row, because the image is
-- uploaded before the question that uses it is saved. The path shape matches
-- private.question_images_valid, so an object here and a reference on a row
-- agree on what a legal path is.
create or replace function private.can_access_question_image(object_name text)
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
      and p.role in ('admin', 'mentor')
      and p.status = 'active'
      and object_name ~ (
        '^org/' || p.org_id::text
        || '/questions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|gif|webp)$'
      )
  )
$$;

revoke execute on function private.can_access_question_image(text) from public, anon;
grant execute on function private.can_access_question_image(text) to authenticated;

create policy question_images_select_author
on storage.objects
for select
to authenticated
using (
  bucket_id = 'question-images'
  and (select private.can_access_question_image(name))
);

create policy question_images_insert_author
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'question-images'
  and (select private.can_access_question_image(name))
);

create policy question_images_update_author
on storage.objects
for update
to authenticated
using (
  bucket_id = 'question-images'
  and (select private.can_access_question_image(name))
)
with check (
  bucket_id = 'question-images'
  and (select private.can_access_question_image(name))
);

create policy question_images_delete_author
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'question-images'
  and (select private.can_access_question_image(name))
);

commit;
