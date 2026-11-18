# feat/modules

Shared modules (D61), **Phase 1 only: the migration**, built to
`docs/design/shared-modules.md` (agreed, #123, decisions of 2026-11-13).

- Owner: Claude, 2026-11-18. Owned files: new `supabase/migrations/202611181*`,
  `scripts/verify/modules.sql`, this file.
- **Not applied** to the hosted database (owner's rule: the owner applies it).
  `src/shared/db/types.ts` is not regenerated (needs the applied schema).

## Notes

### Migrations (written 2026-11-18, NOT applied)

| File | Does |
|---|---|
| `20261118100000_modules.sql` | `modules`, `section_modules` (RLS forced, admin 4 verbs, student SELECT); `sections.kind` + one mocks section per programme; `curriculum_items.module_id`, `section_id` nullable, exactly-one-parent check; mocks-section triggers; `private.student_reaches_module`; `student_has_programme_item` and the `curriculum_items` SELECT policy gain the module path |
| `20261118100100_item_progress_course.sql` | `item_progress.course_id` (FK, on delete cascade), backfill, fill trigger, NOT NULL |
| `20261118100200_item_progress_course_key.sql` | PK becomes `(student_id, course_id, item_id)`; legacy unique `(student_id, item_id)` kept |
| `20261118100300_item_progress_course_policies.sql` | `private.course_has_item`, 3-arg `student_may_record_progress`; insert/update policies use it |
| `20261118100400_attempts_course.sql` | `attempts.course_id` (FK, on delete set null (course_id)); `guard_attempt_write` checks the programme, counts `max_attempts` per programme, fixes `course_id` |

### Departures from the design (all for expand and contract)

- **Fill trigger on `item_progress`:** the deployed actions send no `course_id`;
  the trigger fills it from `item -> section -> course` so NOT NULL holds.
  Dropped in the contract step.
- **Legacy unique `(student_id, item_id)` kept** beside the new PK: the deployed
  upserts use `onConflict: "student_id,item_id"`, which errors without it. So,
  until the contract step drops it, one progress row per student per item: true
  per-programme rows for a shared item start only then. `modules.sql` simulates
  that drop inside its rollback.
- `attempts_one_open_idx` (one open attempt per student per mock) left as is;
  Phase 2 decides.
- `delete_content` (D54) not extended to modules; its programme preview does not
  count module-item progress (the course FK cascade does delete it). Phase 2.

### Verification

- All six files parse with `libpg-query` (PostgreSQL 17 grammar); PL/pgSQL bodies
  not parsed. Hosted DB is 17.6 (read-only check), 0 `item_progress` rows.
- `scripts/verify/modules.sql` (69 checks) has **not been run**: it needs the
  migrations applied or spliced in, and neither is allowed on this branch.

### Contract step (Phase 2, after the code passes `course_id`)

Drop `item_progress_student_item_legacy_key`, `item_progress_fill_course` and the
2-arg `student_may_record_progress`.
