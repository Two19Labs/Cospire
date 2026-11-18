-- Shared modules, per-programme progress: the contract step
-- (`docs/design/shared-modules.md` §3; Phase 1 departures in
-- `docs/context/completed.md`, *Shared modules, Phase 1*).
--
-- Both progress actions now send `course_id` and upsert on the primary key
-- `(student_id, course_id, item_id)`, so the expand-step scaffolding goes:
--
--   * `item_progress_student_item_legacy_key`: with it gone, a shared module's
--     item holds a separate row per programme;
--   * `item_progress_fill_course` and its function: a row must now name its
--     programme, and NOT NULL refuses one that does not;
--   * the two-argument `student_may_record_progress`, unreferenced since
--     20261118100300 moved the policies to the three-argument one.
--
-- Applied before the Phase 2 code is deployed, the old code's progress upserts
-- (`onConflict: "student_id,item_id"`) fail with 42P10 and save nothing; reads,
-- documents, videos and mocks are unaffected. The coordinator applies this
-- immediately before merging Phase 2.

begin;

drop index public.item_progress_student_item_legacy_key;

drop trigger item_progress_fill_course on public.item_progress;
drop function private.fill_item_progress_course();

drop function private.student_may_record_progress(bigint, bigint);

commit;
