# feat/mock-instructions

Owner's request, 2026-11-10: "Attempt mock" went straight into the exam in the
new window. It should open the new window on an instructions page, with a
button there that starts the test. Also: the exam screen still showed the old
"C" mark instead of the Cospire logo.

## Owner's answers

- The clock starts at Start test on the instructions page, not when it opens.
- The mock's page in the dashboard becomes a short summary with the button.
- No "I have read" tick, only the button.
- An attempt already in progress skips the instructions and resumes.
- A phone opens the same page in a new tab (or the same one), then Start.

## What changed

- New route `/student/mocks/[id]/start` (with its own `loading.tsx`): the
  instructions in the exam's frame, `MockInstructionsScreen`. The Start form
  (`startAttemptAction`, unchanged) lives only there, so nothing is written to
  `attempts` until Start is pressed. An open attempt redirects to itself.
- `/student/mocks/[id]` shows the fact chips and an "Attempt mock" link
  (`AttemptLink` in `own-window.tsx`): it opens the start page in the exam
  window; with the popup refused or no JavaScript it is a plain link. The old
  `?start=1` auto-submit is gone.
- A refused start (`phone`, `limit`, `failed`) returns to the start page.
- `StudentMock` carries `proctoringEnabled`, for the proctoring line.
- The exam bar and both exam skeletons show `/cospire-wordmark.png`.
- No migration, no policy change, no shared code.
- **Not shown: the number of questions.** A student cannot read `questions`
  before an attempt, so a set's passage cannot be told from a question without
  a database function. Duration and sections are shown.

## Verification, 2026-11-10

- `typecheck`, `lint`, `test` (666), `build`.
- `scripts/verify/test-engine-sit.mjs` on a local production build (3070)
  against the hosted database: **55/55**, counts back to baseline. It reads the
  instructions and starts every paper from `/start`, and a phone is refused
  there. The script had been failing since mocks gained a draft state (its
  student saw no mock); it now publishes its fixtures.
- `ars-aptitude.mjs`, `exam-fullscreen.mjs` and `ui-audit-flows.mjs` had their
  start steps repointed and were **not run**.
- **Not verified:** anything in a browser. The window opening on the
  instructions, full screen from Start test, the logo's size in the exam bar,
  the phone tab.
