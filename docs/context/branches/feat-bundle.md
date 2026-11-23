# feat/bundle

End-to-End bundle grant (D62): one admin action granting a student a programme
and an ARS process together.

- Design: no migration, no new table. The bundle is two existing
  `content_access` rows (`resource_type = 'course'`) written in one INSERT
  statement, so both land or neither does.
- Built: `grantBundleAction` (set-course-access.ts), `BundleGrantForm` on the
  programme page; 4/4 unit tests, typecheck pass. Probe, lint, build not yet
  run. Handed off: `docs/handoff/feat-bundle.md`.
