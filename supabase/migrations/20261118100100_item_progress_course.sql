-- Shared modules, per-programme progress, step 1 of 3
-- (`docs/design/shared-modules.md` §3): `item_progress.course_id`.
--
-- A module shared by MU and Ashoka shows progress in each programme
-- separately, so a progress row names the programme it was made in.
--
-- Added nullable, backfilled from `item -> section -> course` (0 rows on the
-- hosted database, 2026-11-18), then NOT NULL.
--
-- Departure from the design, for expand and contract: the deployed
-- `record-progress.ts` and `record-video-progress.ts` do not send `course_id`.
-- So a BEFORE INSERT trigger fills it when it is missing and the item sits
-- directly in a section, where the programme is unambiguous. Every item the
-- deployed code can reach is such an item. A module item has no single
-- programme, so a row for one must name it, and NOT NULL refuses one that does
-- not. The trigger goes in the contract step, once both actions pass
-- `course_id`.

begin;

alter table public.item_progress
  add column course_id bigint,
  -- Deleting a programme deletes the progress made in it. Items in shared
  -- modules outlive the programme, so this cannot rely on the item cascade.
  add constraint item_progress_course_fk foreign key (course_id, org_id)
    references public.courses (id, org_id) on delete cascade;

update public.item_progress as progress
   set course_id = section.course_id
  from public.curriculum_items as item
  join public.sections as section on section.id = item.section_id
 where item.id = progress.item_id
   and progress.course_id is null;

create or replace function private.fill_item_progress_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.course_id is null then
    select section.course_id
      into new.course_id
      from public.curriculum_items as item
      join public.sections as section on section.id = item.section_id
     where item.id = new.item_id;
  end if;
  return new;
end;
$$;

revoke execute on function private.fill_item_progress_course()
  from public, anon, authenticated;

create trigger item_progress_fill_course
before insert on public.item_progress
for each row execute function private.fill_item_progress_course();

alter table public.item_progress alter column course_id set not null;

create index item_progress_course_idx on public.item_progress (course_id, org_id);

commit;
