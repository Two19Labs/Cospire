# feat/programme-uploads

Owner's request, 2026-11-10: uploading a video or document should happen from
the programme's curriculum builder, landing in the library and in the chosen
section in one step, instead of uploading in Videos or Documents first and then
picking it in the builder.

## Design

- No migration. The existing upload flows stay as they are (video: VdoCipher
  policy, row first as `pre_upload`, browser posts to VdoCipher; document:
  signed Storage URL, object first, row second). Each takes an optional
  placement `{courseId, sectionId}`.
- The section is checked against the programme **before** anything is uploaded,
  so a bad placement never leaves a stray library entry.
- One helper, `appendCurriculumItem` (`src/features/curriculum/append-item.ts`,
  not a `"use server"` file, so it is not a public endpoint), puts an item at the
  end of a section. The builder's own Add uses it too. RLS and
  `private.validate_curriculum_item` still decide what may be inserted.
- If the library row is written but the item is refused, the upload still
  completes and the builder says the file is in the library but not the section.
- Picking an existing video or document from the library stays.

## Not in this branch

- Creating a test from the builder (mock import) and a programme importer: next.

- A document uploaded from a programme returns to the programme from the form
  (`window.location.assign`), not by a Server Action redirect: called from the
  submit handler, the redirect back to the page it was on was swallowed (row and
  item written, page never moved, no message). Found by the headless check below.

## Verification, 2026-11-10

- `typecheck`, `lint`, `test` (668, 2 new: `parsePlacement`), `build` (clean
  `.next`, no server running). The new test caught a real defect first: the
  forms send the programme id as a number and `parsePositiveId` reads strings,
  so every upload from the builder would have been refused.
- Headless Chrome on a local production build (port 3041) against the hosted
  database, throwaway accounts (`setup.mjs`), probe `coverage/programme-uploads/probe.mjs`
  (local, gitignored): **15/15** with the video upload skipped. A document
  uploaded from section 2 lands in the library and **after** the item already
  there, the builder returns with its message and lists it; a document or video
  aimed at another programme's section is refused before any transfer (no row,
  VdoCipher never asked); another organisation's admin posting straight at
  `startVideoUploadAction` / `createDocumentUploadTicketAction` is refused and
  writes nothing; "Add reading" still works and goes last. A plain upload from
  Documents still lands on its document with no section picker.
- **Video from the builder: partly verified.** The first run uploaded a 2-second
  clip from the builder: the `videos` row was written and VdoCipher received the
  file (status `ready`). That run's output was cut short, so the item in the
  section and the return to the programme were **not seen**; the same helper
  places documents, which passed. Not re-run, because VdoCipher then refused
  every delete with 423 "Write actions are temporarily paused".
- **Left on the Client's VdoCipher account:** "Probe video 1794294142909",
  id `ee90134230a74d149dba4610cfe79114` (no library row). Delete it with
  `DELETE /api/videos?videos=<id>` once VdoCipher allows writes again.
- Teardown: 6 probe documents and their objects, 5 accounts; probe programmes,
  sections and items removed in the probe's `finally`. Afterwards 3 courses (the
  owner's), 0 probe rows anywhere.
- Not done: a real browser, a real video placed end to end.
