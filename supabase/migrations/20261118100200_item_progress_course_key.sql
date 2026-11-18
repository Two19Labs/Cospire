-- Shared modules, per-programme progress, step 2 of 3
-- (`docs/design/shared-modules.md` §3): the primary key becomes
-- `(student_id, course_id, item_id)`, one row per student per programme per
-- item.
--
-- Departure from the design, for expand and contract: the deployed actions
-- upsert with `onConflict: "student_id,item_id"`, which needs a unique index on
-- exactly those columns or the statement errors. So the old key is kept as a
-- unique index until both actions pass `course_id` and conflict on the new key;
-- the contract step drops it. Until then a student has at most one row per item,
-- which is all the deployed code can write anyway.

begin;

create unique index item_progress_student_item_legacy_key
  on public.item_progress (student_id, item_id);

alter table public.item_progress drop constraint item_progress_pkey;
alter table public.item_progress
  add constraint item_progress_pkey primary key (student_id, course_id, item_id);

commit;
