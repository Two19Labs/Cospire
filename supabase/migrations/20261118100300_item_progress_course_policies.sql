-- Shared modules, per-programme progress, step 3 of 3
-- (`docs/design/shared-modules.md` §3):
-- `private.student_may_record_progress(item_id, course_id, org_id)`.
--
-- The item must be reachable *through that programme* (directly in one of its
-- sections, or in a module attached to one of its subjects) and the student
-- must hold that programme. The insert and update policies move to it; the
-- deployed code still passes because `item_progress_fill_course` has set
-- `course_id` before the policy's WITH CHECK runs. The two-argument overload
-- stays, unreferenced, until the contract step drops it.

begin;

-- Is this item in this programme's curriculum, by either path?
create or replace function private.course_has_item(target_course_id bigint, target_item_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.curriculum_items as item
    join public.sections as section
      on section.id = item.section_id
      or (
        item.module_id is not null
        and exists (
          select 1 from public.section_modules as attached
           where attached.module_id = item.module_id
             and attached.section_id = section.id
        )
      )
    where item.id = target_item_id
      and section.course_id = target_course_id
  );
$$;

revoke execute on function private.course_has_item(bigint, bigint) from public, anon;
grant execute on function private.course_has_item(bigint, bigint) to authenticated;

create or replace function private.student_may_record_progress(
  target_item_id bigint,
  target_course_id bigint,
  target_org_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_student()
     and target_org_id = private.current_org_id()
     and private.student_reaches_programme(target_course_id)
     and private.course_has_item(target_course_id, target_item_id)
     and exists (
       select 1 from public.curriculum_items
        where id = target_item_id
          and org_id = target_org_id
          and type in ('document', 'text', 'video')
     );
$$;

revoke execute on function private.student_may_record_progress(bigint, bigint, bigint) from public, anon;
grant execute on function private.student_may_record_progress(bigint, bigint, bigint) to authenticated;

drop policy item_progress_insert_own on public.item_progress;
create policy item_progress_insert_own on public.item_progress
for insert to authenticated
with check (
  student_id = (select auth.uid())
  and (select private.student_may_record_progress(item_id, course_id, org_id))
);

drop policy item_progress_update_own on public.item_progress;
create policy item_progress_update_own on public.item_progress
for update to authenticated
using (
  student_id = (select auth.uid())
  and (select private.student_may_record_progress(item_id, course_id, org_id))
)
with check (
  student_id = (select auth.uid())
  and (select private.student_may_record_progress(item_id, course_id, org_id))
);

commit;
