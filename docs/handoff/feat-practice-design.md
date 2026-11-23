# Handoff: feat/practice-design

Stopped at the 7% rule (five-hour window at 6%). The work is complete:
`docs/design/practice-mode.md` is written, `completed.md` has its row,
`CONTEXT.md` points to it, `node scripts/check-context.mjs` passed. PR opened
against main, not merged.

Left: the owner reads the design and answers its six open questions
(section 7). Not done: the design's claims about existing helpers
(`private.is_trusted_writer`, `student_reaches_programme`,
`validate_curriculum_item_parent`) were read from migrations and code, not
re-checked against the hosted database. Delete this file when the PR merges.
