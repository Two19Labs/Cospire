# Handoff: feat/bundle

Stopped at the 7% rule (five-hour window at 6%, resets 2026-11-23 12:30 UTC).

## Task
End-to-End bundle grant (owner's D62): one admin action granting a student a
programme (`courses.kind = 'programme'`) plus an ARS process (`'ars_process'`)
together. No migration, no new table: two existing `content_access` rows
(`resource_type = 'course'`) written in ONE insert statement, so both land or
neither does. Revoking stays per grant.

## Done (committed, unverified beyond the below)
- `grantBundleAction` in `src/features/curriculum/actions/set-course-access.ts`:
  `requireRole("admin")`, parses courseId/processId/studentId, reads both
  courses through the admin's own client and refuses unless the kinds are
  programme + ars_process, then `upsert([...], { ignoreDuplicates: true,
  onConflict: "student_id,resource_type,resource_id" })` (ON CONFLICT DO
  NOTHING; needs no UPDATE grant -- **not yet proven against the hosted DB**).
- `BundleGrantForm` in `src/features/curriculum/components/course-access-panel.tsx`,
  rendered in `course-detail.tsx` for programmes; the page
  `src/app/admin/courses/[id]/page.tsx` lists ARS processes with `listCourses`.
- Notice `bundle-granted` in `src/features/curriculum/list-params.ts`.
- `src/features/curriculum/grant-bundle.test.ts`: 4/4 pass (one statement with
  both rows; non-admin writes nothing; wrong pairing / bad id refused; DB
  error reported). `npm run typecheck` passes.

## Next, in order
1. Write `scripts/verify/bundle.sql` in the style of `scripts/verify/modules-2.sql`
   (copy its pg_temp helpers and probe.admin / probe.s1 lookup; fixtures: one
   programme and one ars_process course in org 1). Checks: as admin, the
   two-row `insert ... on conflict (student_id, resource_type, resource_id) do
   nothing` writes 2 rows; repeating it is not an error; with one grant held
   the other is still written; a pair whose second course id does not exist is
   refused and the first row is NOT present (atomicity); as the student the
   insert is refused `42501` and writes nothing. Run
   `npx supabase db query --linked -f scripts/verify/bundle.sql` (rolls back).
2. `npm run lint`, full `cmd //c "cd /d C:\Cospire\Cospire-bundle && npx vitest run"`, `npm run build`.
3. Bulk creation accepting the bundle: not built. It is roughly 25 lines over
   three files (page query, two selects on the form, one 2N-row insert after
   the profiles insert in `bulk-create-students.ts`, failure falls into the
   existing compensating deleteUser, which cascades). Owner's call; otherwise a follow-up.
4. Context: fold `docs/context/branches/feat-bundle.md` into
   `docs/context/completed.md` and `verification-log.md`, delete it and the
   Active work row, leave a line in CONTEXT.md (stay under 300 lines),
   `node scripts/check-context.mjs`, delete this handoff, then PR (do not merge).

Not seen in a browser.
