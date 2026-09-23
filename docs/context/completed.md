# Completed work

The log of finished work and the detailed write-ups behind it. Moved out of `CONTEXT.md` on 2026-09-22; the text is unchanged.

## Completed

| Date | Work | Result / verification |
|---|---|---|
| 2026-09-23 | The seven PR #49 review findings fixed (`fix/mock-builder-review`) | Section slots map by slot, not position (`mapSectionSlots`, unit tested); a question archived after selection renders as a removable row rather than a hidden input, and the save says "archived" rather than "unavailable"; the section embed is read as the object PostgREST returns for a many-to-one; a missing section field is refused; childless DI sets are listed and refused instead of filtered after `.range()` had paged, which shortened picker pages; `/admin/mocks/[id]` uses `parseId`; images dropped from a saved question are deleted from Storage after the save, and an upload removed before saving is deleted immediately. 19/19 over HTTP, 354 tests, typecheck, lint and build. **Two facts worth keeping:** the service key cannot write `questions` rows directly -- the row CHECK calls `private.question_images_valid`, granted to `authenticated` only -- so a verify script must archive through the admin's own session; and `notFound()` on a route carrying a `loading.tsx` renders the not-found page with status 200, because the skeleton has already streamed the headers, the same trade-off the role layouts record for `redirect()` |
| 2026-09-23 | Question bank, Phase 3 parts 1-4, merged as `1c7073d` (PR #49) | Schema with answer keys in their own table, the numerical normaliser, authoring for admins and mentors, paste-a-prompt import with per-question review, and the admin-only mock builder. Seven migrations were already applied, so `main` and the database came back into step on merge. Verified before merge: 41/41 SQL, 36/36 authoring over HTTP, 25/25 importer, 9/9 mock SQL and 10/10 mock HTTP, 342 tests, typecheck, lint and build. A high-effort review at merge time raised seven findings, all in the mock builder and none student-facing: blank section slot misfiles questions; a question archived after selection makes its mock uneditable; the picker's section column always shows "-" (many-to-one embed read as an array, confirmed against the schema); a missing section field files into section one; childless DI stimuli filtered after paging; `/admin/mocks/[id]` 500s on an unsafe integer id; removed image uploads are never deleted from the bucket. To be fixed before any real mock is built |
| 2026-09-22 | Skeletons for every signed-in screen, and sign-in straight to the role home (`fix/loading-coverage`) | From the 2026-09-21 client demo: skeletons looked fine on admin screens but not on student and mentor ones. Every page already had a skeleton, and all three roles stream it with the first byte (measured on the deployed URL: about 0.5s to skeleton, 0.75-1.1s to content, the same for each role). The real gaps were on exactly the paths the demo took. (1) Seven detail screens had no `loading.tsx` of their own and borrowed their parent list's, under the list's title, so a click into them looked as if it had not landed: `student/reports/[id]`, `student/documents/[id]`, `mentor/reports/[id]`, `admin/documents/[id]`, `admin/report-templates/[id]`, `admin/report-templates/import`, `admin/ars/[id]/rounds/[roundId]`. Each now has its own. (2) Signing in went login, then `/dashboard`, then the role home: a second full round trip (about 0.5s) with nothing on screen, at the moment of switching to a student or mentor account. `loginAction` now redirects straight to the role home when the profile is active, and falls back to `/dashboard` otherwise; the role layout re-checks either way. `src/features/auth/loading-coverage.test.ts` fails if any admin, mentor or student page lacks its own `loading.tsx`, and was seen to fail when one was removed. `scripts/verify/loading-coverage.mjs` 11/11 on a local production build and 1/11 on the unfixed deployed URL, so it discriminates. 241/241 tests, typecheck, lint and build pass. **Merged as PR #52 (`39860c6`) and 11/11 on the deployed URL.** Not browser-tested: client-side navigation itself cannot be driven here |
| 2026-09-22 | Report round selector limited to the template's programme (PR #50, merged `9d6364f`, deployed) | Found in the 2026-09-21 client demo: the selector listed every round in the organisation by bare name. Now only the template programme's rounds, process-labelled options when there is no programme, and a round linked from another process kept listed and selected. No migration. `scripts/verify/report-round-links.mjs` **8/8 on the deployed URL**, counts back to baseline |
| 2026-09-21 | ARS report round links made manual | Imported components start unlinked; each component has an optional manual round selector. No schema change. Typecheck, lint, 235 tests and production build pass; linking and unlinking confirmed on Production on 2026-09-22 by the PR #50 check |
| 2026-08-28 | Read agreement, proposal, delivery plan, operating manual, and technical brief | Product, scope, architecture, and source-of-truth hierarchy understood |
| 2026-08-28 | Delivery and architecture audit | Contractual, scheduling, integrity, media, backup, security, and acceptance risks recorded below |
| 2026-08-28 | Cross-agent context protocol | Added `CONTEXT.md`, repository `AGENTS.md`/`CLAUDE.md` entrypoints, and the mandatory parent-manual rule |
| 2026-08-28 | Current technical research | Checked current Supabase SSR, API key, grants/RLS, pooling, custom SMTP, redirect, CLI testing, and Next.js 15 guidance |
| 2026-08-28 | Next.js trunk scaffold | Pinned Next.js 15/React 19/TypeScript and exact dependencies, App Router structure, scripts, environment template, ESLint, and Vitest |
| 2026-08-28 | Shared foundation | Added Button, Input, Table, Dialog, shared utilities, Supabase browser/server/middleware clients, and transaction-pooled Postgres client with prepared statements disabled |
| 2026-08-28 | Authentication shells | Added password login/logout, validated server-side claims, active-profile lookup, three role guards, redirects, and empty Admin/Mentor/Student workspaces |
| 2026-08-28 | Team workflow | Added worktree scripts, CI, CODEOWNERS, branch-protection instructions, and fixed Windows/Git-Bash path normalization |
| 2026-08-28 | Foundation migration | Added `orgs`, `profiles`, `mentor_assignments`, `content_access`, constraints, indexes, explicit grants, private security-definer helpers, validation triggers, forced RLS, and seed organisation |
| 2026-08-28 | Database security tests | Added a 23-assertion pgTAP suite and manually exercised admin/mentor/student/disabled/anonymous policy behavior against PostgreSQL 17 |
| 2026-08-28 | Hosted Supabase handoff | Added exact profile bootstrap SQL and ordered dashboard/deployment runbook |
| 2026-08-28 | Local verification | Typecheck, lint, 9 app test assertions, production build, Bash syntax check, migration execution, manual RLS checks, and npm audit all pass |
| 2026-08-28 | Hosted foundation migration applied | `20260828093807_foundation_identity_access.sql` applied to `eeeftjwvbppznsmcljnw`; 4 tables, 26 constraints, 16 indexes, 13 policies, 4 triggers, RLS enabled and forced on all four tables, Cospire org seeded as `id = 1` |
| 2026-08-28 | Pre-existing drift investigated | Project was not clean: the migration had run from the SQL Editor at 10:00 UTC and its tables were dropped at 10:10-10:12 UTC, leaving `private` and 7 helper functions. Residual functions verified byte-identical to the repository file before re-applying |
| 2026-08-28 | Migration history reconciled | Recorded versions corrected to match repository filenames exactly, so `supabase db push` will not re-run either migration |
| 2026-08-28 | Security advisor finding resolved | Added `20260828102907_restrict_rls_auto_enable_execute.sql`; security advisor now returns zero findings |
| 2026-08-28 | Database types generated | `src/shared/db/types.ts` generated from the live hosted schema, not hand-authored |
| 2026-08-28 | Hosted access verification | Anonymous REST refused with HTTP 401 / `42501`; signed-in user with no profile sees zero rows; no secret in the built client bundle |
| 2026-08-28 | Login page crash fixed | `login.ts` is a `"use server"` file and exported `initialLoginState`, a plain object. Next.js allows only async function exports there, so the login page failed at load with `A "use server" file can only export async functions, found object`, surfacing as the generic error boundary. Moved `LoginState` and `initialLoginState` to `src/features/auth/actions/login-state.ts` |
| 2026-08-28 | Login password `minLength` removed | The sign-in form enforced an 8-character minimum, locking out an existing shorter password and leaking the policy. Password rules belong where a password is set, not checked; Supabase enforces the real rule |
| 2026-08-28 | Login action error handling | Unexpected failures now return a readable message on the form instead of escaping to the error boundary. `redirect()` deliberately stays outside the try, since it signals success by throwing |
| 2026-08-28 | Workspace navigation cleanup | Added parent-workspace VS Code Explorer exclusions/file nesting; all required root metadata now appears collapsed under `package.json`; removed generated `.next` and `tsconfig.tsbuildinfo` artifacts (about 124 MB); kept `node_modules` installed but hidden |
| 2026-09-08 | **Phase 1 exit gate closed** | `scripts/verify/` run against `https://cospire-roan.vercel.app`. **36 of 36 checks passed**, including the exit-gate sentence, the server-composed watermark, the 600-second signed URL, and direct Storage-path refusals for the other student, the mentor, another org's admin, an anonymous caller and even the grant-holding student. Teardown restored the baseline exactly |
| 2026-09-08 | **Data-loss bug found and fixed in `teardown.mjs`** | It deleted *every* document grant and *every* `documents` row with their Storage objects, unscoped. Running the documented sequence would have destroyed the owner's two real PDFs on a Free-plan project with no backups. Now scoped to the accounts in `state.json`, and refuses to run if that file names none. See *The teardown near-miss* |
| 2026-09-08 | `verify.mjs` sample path fixed | It read `coverage/verify/sample.pdf`, left over from when the harness lived there; the file is tracked at `scripts/verify/sample.pdf`. Now resolved against `import.meta.url`, so the run no longer depends on the working directory |
| 2026-09-08 | Sequence changed at the Client's request | ARS brought forward as Phase 5a; weeks 4-6 left un-planned pending VdoCipher. Checked against clauses 4.3, 4.4, 5, 7 and 12 before recording. See *Sequencing change* |
| 2026-09-10 | **Phase 5a step 1: programmes** | `courses` table, `private.student_has_course_grant`, the `course` branch on `validate_content_access_resource`, a delete cascade for grants, and admin list/search/create/detail plus granting. Migration applied to the hosted project. PR #19. See *Phase 5a progress* |
| 2026-09-10 | Programmes verified at both layers | **Database:** 12 probes in a rolled-back transaction with real JWT claims, covering reads, writes, the validation trigger and the cascade. **Application:** `scripts/verify/courses.mjs` drove the built app over HTTP with real session cookies, every form through the no-JavaScript path — **19 of 19**. Both runs returned the live counts to baseline |
| 2026-09-10 | The ordering field was removed from the create form | The owner asked what "Order" meant, which is the answer. Choosing a sort key by hand needs the other programmes' keys, and no screen shows them. `sort_order` stays on the table, defaults to 0, and the list reads in creation order until a reorder control exists. `validateNewCourse` keeps its rules, now tested by a hand-posted request instead of a form field |
| 2026-09-10 | **Phase 5a step 2: ARS rounds** | `ars_rounds` with its `course_id` as half a composite foreign key, `submission_mode` and a `config` JSONB; `private.mentor_reaches_course` and `private.student_reaches_round`; the `courses_select_mentor` policy; and admin round authoring on the programme detail page. One round engine, not four screens |
| 2026-09-10 | ARS rounds verified at both layers | **Database:** 8 read probes on a discriminating pair -- the mentor's own student holds one programme and another student holds the other -- plus 12 write and constraint probes, all in rolled-back transactions. **Application:** `scripts/verify/ars-rounds.mjs`, **19 of 19**, every form posted through the no-JavaScript path. Baseline restored both times |
| 2026-09-10 | Phase 5a step 2 merged and deployed | PR #21. `/admin/courses/[id]` now carries the ARS rounds panel on the deployed URL |
| 2026-09-10 | **The context gate strengthened after it missed three stale claims** | It read a single line, and the word making the claim had wrapped onto the next. Now reads the sentence, and counts "awaiting review". See *The context gate's own blind spot* |
| 2026-09-10 | **A CHECK constraint that passed on NULL** | `ars_rounds_form_has_fields` accepted the exact row it existed to refuse. Found by probe, fixed forward in `20260910144803`. See *The NULL that passed a CHECK* |
| 2026-09-10 | **Design foundation integrated** | Tokens read out of the Client-approved prototype into `src/app/globals.css`; Figtree self-hosted through `next/font/google`; panels, buttons, inputs, tables and pills moved onto the tokens. The prototype is committed to `design/` as reference and is never shipped. See *The design integration* |
| 2026-09-10 | **A font that loaded and never rendered** | `next/font` defines `--font-sans` on a class on `<html>`; `globals.css` defined a fallback for the same variable on `:root`. Equal specificity, and Next emits its class first, so the fallback won: Figtree downloaded on every page and nothing was set in it. The fallback now lives inside `var()`. Caught by reading the served stylesheet rather than the source |
| 2026-09-10 | PRs #17, #18 and #19 merged | The teardown fix, then the gate closure and resequence, then Phase 5a step 1. `/admin/courses` and `/admin/courses/[id]` confirmed live on the deployed URL, refusing anonymous callers |

| 2026-09-20 | **Paste-to-build process import** | An admin copies a standard prompt into any model along with an institution's admission-process document, and pastes the answer back. The parser reads it, shows a preview, and creates the whole process on confirmation. `/admin/courses/[id]/import`. **No migration, no new table, no new dependency.** Verified over HTTP, 35 of 35, against a production build and the hosted database. See *The process importer* |
| 2026-09-20 | The importer's own harness found two false passes before it found anything else | A probe asserting on the word "Application" passed against a page that had parsed nothing, because the copyable prompt contains that word in its own example. And a `\b` written into a regex through a Python patch became a literal backspace byte, so the hidden-field reader silently matched nothing and every action post returned 500. Both are the same class of error: a probe that matches prose rather than behaviour |
| 2026-09-18 | **ARS report database and mentor/student workflow** | Four report/late-stamp migrations are applied. Mentor queue/editor and student released-report view built, including weighted totals, configurable metric rows and optional narrative. Database probe 17/17; production-build HTTP workflow 12/12; baseline restored. **Admin template authoring is not built**, so this is not yet deploy-ready as a self-service feature |
| 2026-09-20 | **Multi-file ARS upload UI built, merged and deployed** | A file question uploads directly from the browser to the private `ars-uploads` bucket, attaches metadata under its stable field key, and can be replaced or removed only while the submission is a draft. Multiple questions in one form are supported. Migration `20260920150318` is applied; live Storage verification is 10/10; typecheck, lint, 226 tests and production build pass. PR #36 merged as `0e0f14f`; Production deployed it and a signed-in live capture confirmed a real file input with no placeholder |

### The process importer, 2026-09-20

Built on the owner's instruction, for the Client to review the same evening.
An admin builds an ARS process by hand today -- a round at a time, a question at
a time. That stays and is unchanged. Beside it there is now a second route: copy
a standard prompt into whatever model the admin already has, give it the
institution's admission-process document, and paste the answer back here.

**It is the mechanism the founder already agreed**, on 2026-09-16, for question
import: a standard prompt run in a model the Client already pays for, with the
output pasted into a parser here, rather than an API integration billed per
call. Pointing it at ARS processes needs no Google account, no LLM account, no
key in the application and no per-call cost -- all four of which the Client still
owes. Question import now uses the same mechanism (2026-09-21), so they no longer
block Phase 3 either.

Four decisions were taken with the owner **before** any code was written, and
three of them are not what would have been guessed:

- **One paste builds every round of one existing programme.** The programme
  itself is still created by hand.
- **A preview is shown and nothing is written until it is confirmed.** This is
  also what Annexure A asks of the question importer -- an admin reviews before
  anything lands.
- **An import REPLACES the programme's rounds.** Not appends. This was the
  owner's explicit choice against the recommendation, and it is why the
  destruction guards below exist rather than being optional polish.
- **A timed aptitude round becomes a placeholder** carrying its full
  specification -- sections, question count, duration, negative marking -- stored
  as an `offline` round with `config.pendingFeature = "test-engine"`. There is no
  question bank and no test engine, so a round that pretended otherwise would be
  a demonstration of something that does not exist.

**What protects a live process from a bad paste.** Replacing is the most
destructive control an admin has in this application, so:

- Reading a paste touches no table at all. Only confirming writes.
- Confirming **re-parses the pasted text on the server**. The preview travels to
  the browser and back, and a Server Action is a public endpoint, so treating
  the returned preview as the thing to insert would let a crafted post write any
  rounds it liked.
- The delete is **one statement**, so it is all or nothing. Both
  `ars_submissions.round_id` and `ars_attempt_grants.round_id` are ON DELETE
  RESTRICT, so if any single round has been answered the whole delete is refused
  and the process is left exactly as it was. Verified over HTTP: a student's
  submission was created, the import was attempted, and it was refused with the
  process intact.
- Two rounds sharing a name are caught **before** anything is deleted. The
  database would otherwise refuse the second insert for
  `ars_rounds_name_unique_per_course` after the old process had already gone.
- The remaining gap, stated rather than hidden: a delete and an insert cannot
  share a transaction over PostgREST. If the insert failed after the delete
  succeeded the programme would be left with no rounds. Everything is parsed and
  validated before the delete so that insert has nothing left to fail on, and
  the screen says plainly what happened and that pressing Create again fixes it.

**The parser is lenient about names and strict about values.** A model told to
emit `instructions` will emit `prompt` or `description`; told `questions` it will
emit `fields`; told `select` it will say `dropdown`. All of those are accepted,
because a wrong name is a synonym. A question type this platform cannot render is
refused rather than guessed at, because a wrong value is a broken round. Prose
and ``` fences around the JSON are stripped, since models wrap their answers more
often than not, and a half-copied answer is told it looks cut off rather than
told it contains no JSON.

**Keys are ours, never the model's.** A field key is what an answer is stored
under, so asking a language model for stable identifiers invites two questions
silently overwriting one another's answer. Labels come from the model; `toKey`
derives the keys, with the same collision handling the hand builder uses.

**The prompt is generated from the schema**, not typed out as a literal: it lists
the field types from `fieldTypes` and the page limit from `maxStepsPerForm`. A
prompt that drifts from the parser is worse than no prompt, because the model is
then told to produce something this platform will refuse and the admin is caught
between the two.

### The shell and the form re-skin, 2026-09-20

The owner asked for the look to match the Client's prototype, and for the
prototype's left panel to exist. Both are done for the shell and for the ARS
form; the per-screen pass over the remaining panels is not, and is still the
open item it was.

**Where the values came from.** The prototype's markup was extracted rather than
guessed at: its pages are gzipped blobs inside the export, and the shell's
measurements were read straight off the inline styles -- a 232px rail in ink
with cream text, a 64px white title bar, 32px content padding, group labels at
10px tracked to .09em, and an active navigation item filled gold with ink text.
They are tokens and classes here, not inline styles.

**Why the form looked broken.** `round-form.tsx` emitted bare `<label>` and
`<input>` siblings with no wrapper and no class at all, into a grid. So a
four-page application rendered as one run-on line of boxes with the labels
sitting between them. Every field is now one `.field` block, label above
control, in a grid that gives long answers and choice lists the whole row.
Nothing about the data changed; the markup had simply never been written.

**Three real defects the screenshots found**, none of which any test would have:

- **`button, input { font: inherit }` was missing `textarea` and `select`.** Form
  controls do not inherit the page font on their own, so every textarea in the
  application -- the essay box, the importer's paste box -- rendered in the
  browser's default monospace. Fixed for all of them at once. The prompt and
  paste boxes are deliberately put *back* to monospace through `.input--code`,
  because they hold a prompt and JSON.
- **The sidebar email had `text-overflow: ellipsis` and no `white-space:
  nowrap`,** so the ellipsis never fired and a long address wrapped to three
  lines inside a 232px rail.
- **A grid track of `minmax(16rem, 1fr)` cannot shrink below 16rem,** so on a
  phone the column kept its width and the page scrolled sideways.
  `minmax(min(16rem, 100%), 1fr)` fixes it.

**What the rail deliberately leaves out.** The prototype's rail also lists
Curriculums, Mock tests and Mock Analytics, and shows a "View as" role switcher.
The three screens are not built, so listing them would make a demonstration look
broken at the first click; the switcher is impersonation, appears nowhere in
Annexure A, and this file already records it as prototype scope not to absorb.

**`.role-layout`, `.role-header` and `.account-summary` are gone.** The new shell
replaced them and nothing referenced them afterwards. They were removed rather
than left behind, because dead CSS carrying a comment about where it is used is
worse than no CSS.

**Headings still resolve to Georgia.** Recoleta Bold is the design's heading face
and the Client has still not supplied the web licence and woff2, so this is as
close to the prototype as it can get until they do.

### The question bank, 2026-09-21

Phase 3 started on `feat/question-bank`. The owner approved the plan and
settled four decisions the same day, all of which shape the schema:

- **Questions stay editable, even after a mock using them has been attempted.**
  The student's review screen shows the question as it reads now. No locking,
  no version table. A changed key, option set or marks value is left to the
  contracted rescore in Phase 4. This **supersedes** the "publishing/version
  snapshots" mitigation in the Critical finding below. That finding now
  reduces to "rescore on every change that affects a score", which Phase 4 has
  to do anyway.
- **Sections are a fixed list per organisation**, on one admin screen
  (`question_sections`), so the analytics cannot split "QA" from "Quant".
  Topics stay free text, and `save_question` snaps each one to an existing
  spelling within the section.
- **Clause 3.15 images:** import is paste-a-prompt now. Images that a Google
  Doc import would have extracted are added in the review screen by upload or
  clipboard paste. That falls short of 3.15's "no manual re-uploading", so it
  **joins the clause 16.1 written amendment** with the report and the process
  importer. The prompt will carry `[[image-N]]` markers so that a Google Docs
  image fetch (a Google account only, no LLM) can be added later without
  redesign. `question_imports.source_type` already accepts `google_doc`.
- **Notation is plain text with Unicode** (½, x², √, ≤), line breaks kept. No
  KaTeX dependency. Anything that needs typesetting goes in as an image.

**How the answer key is kept from students (the Critical finding).** It is
not on the question row. `question_keys` holds `correct_answer` and
`solution` and has **no student policy at all**. Column grants could not do
this, because admins and students both connect as `authenticated`. Phase 4
adds a student read, and only after the student's own attempt is submitted.

**Every scored question has a valid key, enforced at commit.** A deferred
constraint trigger checks both tables, so a key naming a removed option is
refused. The only way to write a question is `public.save_question`, a
SECURITY INVOKER function, so RLS still decides. It exists because PostgREST
commits each request separately and the question and its key must commit
together. `public.approve_question_import` wraps it with the staging-row
update, so a refused approval leaves no question behind.

**Annexure A says "admins and mentors" author questions.** Mentors can write
questions and keys. Sections, imports, approval and hard deletes are
admin-only.

**The first three migrations**, applied 2026-09-21 with `supabase db push --linked` after a `--dry-run` listed exactly these three:
`20260921120000_question_bank` (sections, questions, keys, `save_question`),
`20260921120100_question_images_bucket` (private bucket, 5MiB, images only,
authors of the org by path, no student policy) and
`20260921120200_question_imports` (staging, admin-only, a decision is made
once, staged content immutable).

**Verified so far:**

- **Against the applied schema, 41 of 41.** `scripts/verify/question-bank.sql` re-run after the push, rolled back as always. RLS enabled and forced on all four tables, with INSERT and UPDATE policies as well as SELECT; the bucket is private and holds its 4 `storage.objects` policies. Security advisor: the same two pre-existing Auth warnings and nothing new. Types regenerated. Live counts unchanged: 5 profiles, 7 courses, 2 documents, 0 rows in every question table.
- **Before applying, a dry run, also 41 of 41.** `scripts/verify/question-bank.sql` and migrations 1
  and 3 were run in one transaction against the hosted project through
  `supabase db query --linked`, then rolled back. Afterwards
  `to_regclass('public.questions')` is null, so nothing persisted.
- **What the dry run proves:** every missing tag is refused; a scored question
  without a key is refused at commit; a key naming a missing option, two
  answers on a single-correct MCQ, and removing the keyed option are all
  refused; DI rules hold, and moving a stimulus moves its set. A student and a
  rival admin read 0 questions and 0 keys and cannot edit. A mentor authors
  but cannot approve an import, and the refused approval leaves no question.
  Double approval is refused with no duplicate created.
- **The bucket migration was not in the dry run.** The CLI connection cannot
  create `storage.objects` policies (see *Two operational facts worth
  keeping*). It mirrors the proven documents bucket, and its policies stay
  **unverified** until an HTTP upload exercises them in PR 2.
- **53 unit tests** for the numerical normaliser and the question validator,
  covering 0.5, 1/2, .50, 0.50, whitespace, tolerance, negatives, pasted minus
  signs, thousands commas and exact big-integer comparison. **288 tests in
  total**, typecheck and lint clean.

**PR 2, authoring, built 2026-09-21.** Routes: `/admin/questions`,
`/admin/questions/new`, `/admin/questions/[id]` and
`/admin/questions/sections`, plus mentor copies of the first three under
`/mentor/questions`. The admin and mentor copies share one loader
(`components/routes.tsx`); the base path comes from the signed-in role, never
from the request. The editor handles all four types:

- single- and multiple-correct MCQs, with blank option rows ignored and two
  spare rows after each save, since there is no "add" button without
  JavaScript;
- typed answers, one accepted form per line, with an optional tolerance;
- DI sets, where a sub-question's section is locked to its set's.

Topics autocomplete from existing ones. Archiving a set archives its
sub-questions too. The question list shows standalone questions and sets;
sub-questions are reached through their set. Both Question bank nav items are
added in `src/features/auth/components/app-nav.tsx` (another feature's file,
flagged for review). New CSS rules sit at the end of `src/app/globals.css`.

**Images** upload from the browser straight to `question-images` under the
author's own session, by file or by pasting into the dashed zone. The form
posts only paths. Editing still works without JavaScript; adding an image
does not, the same trade the document upload makes. An image removed before
saving stays in the bucket as an orphan. That is harmless, and nothing
cleans it up yet.

**A defect found while writing the harness, fixed forward in
`20260921140000`:** `save_question` snapped a topic to an existing spelling,
and when editing, that existing spelling was the question's own. So
correcting "linear equations" to "Linear equations" silently saved the old
spelling. The snap now skips the question being edited. Applied, and the SQL
probe re-run at 41/41.

**PR 2 verified, 36 of 36**, by `scripts/verify/question-bank-ui.mjs` against
a local production build and the hosted database. Every form is posted
without JavaScript, and rows are counted, not errors trusted. It proves:

- the four roles land where they should, and a mentor cannot reach sections;
- sections: add, a case-duplicate refused, a mentor's post writes nothing;
- every type saved with the key stored apart; an edit changes question and
  key in place; the topic snap works across authors;
- a missing topic is refused with the typing kept; an uncomparable TITA
  answer is refused;
- a crafted post moving a sub-question out of its set's section is refused
  by the database;
- a student gets 307 on both copies with none of the text, writes nothing by
  posting the action, and reads 0 questions and 0 keys through the API;
- another org's admin sees none of it in the list, by id, or through the key;
- archiving and restoring a set carries its sub-questions.

**The image bucket's Storage policies are now verified over HTTP**, which
the SQL probe could not do:

- admin and mentor uploads are accepted;
- refused: a student's upload, a rival admin's upload into org 1, an admin's
  upload into org 5, and badly shaped paths;
- a mentor reads an image; a student, the rival admin and an anonymous
  caller are refused;
- a saved image renders through a signed URL;
- an author's delete removes the object and a student's delete removes
  nothing.

Cleanup left the live counts at 0 question rows, 0 image objects, 5
profiles, 7 courses and 2 documents. The screens were also photographed and
reviewed at 1440px and at phone width. That review found two wording
defects, since fixed: placeholders that read as pre-filled values, and
"(tita)" in lower case.

**Two local traps from this session.** Stopping a background `npx next
start` stops the wrapper and can leave the node server running on its port.
The next start then fails with EADDRINUSE, and a harness run silently hits
the old build. Check the port's owning process before trusting a run.
Separately, older `next start` servers from earlier sessions were found on
ports 3000 and 3001, left running. A captured page showing only the loading
skeleton is streaming, not a bug: the content arrives in hidden chunks that
a script moves into place, so a script-stripped capture has to replay
`$RC`/`$RS` itself.

**PR 3, the question importer, built 2026-09-21.** No migration: the
staging table and `approve_question_import` came with PR 1.

- `/admin/questions/import` has three steps: copy the prompt, paste the
  model's answer, send it for review. A list of earlier imports sits below.
  `/admin/questions/import/[batch]` is the review.
- **Admin-only**, as the `question_imports` policies already are.
- **Reading a paste writes nothing.** Staging re-parses the pasted text on the
  server and writes the whole batch in one insert. Each entry becomes one
  `pending_review` row.
- **A DI set is staged as its passage plus one row per sub-question**, linked
  by `parsed.parentPosition`. A sub-question opens for approval only after its
  passage is approved. It then takes the passage's question as parent and the
  passage's section, whatever the post says.
- **The type comes from the staged row, never the form.**
- **Approval** runs the ordinary editor, pre-filled with the parsed question,
  against `approveImportAction`. That validates like the editor and calls
  `approve_question_import`, so the question, its key and the row's decision
  land in one transaction.
- **Reject** marks one row. **Discard** deletes what is not approved and keeps
  every approved row as the record of where a question came from.

**The parser** (`import-spec.ts`) is lenient about names and strict about
values, like the ARS importer, and reuses its `extractJsonBlock`:

- it accepts a bare list, prose and code fences;
- MCQ answers can be written as a letter, "(b)", "Option C", the option's own
  text (tried first) or a 1-based number;
- multi-answers can be written "A, C", "A and C", "AC" or as a list, and an
  MCQ given two answers becomes multiple correct, with a note saying so;
- TITA answers can be a number, a list, or joined by "or".

It never guesses:

- no marks is left blank, unless the admin gives default marks for the batch;
- no answer is flagged, not worked out;
- an unknown type is staged as unreadable;
- a section is matched only by exact name, ignoring case, so "Quant" against
  a list holding "QA" is left for the admin to choose.

A `[[figure]]` marker from the prompt is removed from the text and becomes a
note to paste the image in. That is the clause 3.15 compromise recorded above.
The prompt (`import-prompt.ts`) is built from the parser's limits, and a unit
test parses the prompt's own example, so the two cannot drift apart silently.

**The shared editor gained three props** (`action`, `hidden`, `submitLabel`)
and per-instance element ids, because the review page shows several editors
at once. PR 2's harness re-run after that change: 36/36.

**PR 3 verified, 25 of 25**, by `scripts/verify/question-import.mjs`, on
the dev server and again on a clean production build. Every refusal is proven
by counting rows. It proves:

- mentors and students are turned away;
- a paste in prose and a fence previews all seven entries, and reading writes
  nothing; a non-JSON paste is refused;
- a mentor posting the stage action stages nothing, and staging writes 7
  pending rows in one batch with nothing in the bank;
- default marks fill only where marks are missing; the essay is staged as
  unreadable and the unanswered MCQ carries its problem; the figure is flagged
  and its marker removed;
- a student and a mentor read 0 staged rows through the API;
- approval writes the question, its key and the reviewer stamp; a second
  approval is refused with no duplicate; a mentor's approve changes nothing;
- a crafted type is ignored; a sub-question is refused before its passage and
  joins the set in the set's section after it;
- reject, then a second reject refused; discard keeps all four approved rows.

342 unit tests in total (27 for the parser). The review screen was
photographed and reviewed.

**Not tested with a real Cospire document**, because none has been supplied.
Its parse quality depends on the model and the document, which is the
pulled-forward "run one real document" item the delivery plan commits to.

**PR 4, the mock builder, built 2026-09-21.** It adds `mocks`,
`mock_sections` and `mock_questions`, with one implicit untimed section for an
overall-only mock or fully timed sections whose durations add exactly to the
full duration. Settings cover negative marking and its question types, attempt
limit, mobile access and proctoring. The admin picker excludes archived
questions and adds a DI set whole to one section. RLS is admin-only on all
three tables; no mentor or student policy exists in Phase 3.

The three migrations are applied: `20260921150000_mock_builder`,
`20260921150100_save_mock_transaction` and the fix-forward
`20260921150200_fix_mock_structure_trigger_target`. The first database probe
found that the shared trigger read `mock_id` from a `mocks` row; its transaction
rolled back, the fix-forward migration corrected it, and the re-run passed 9/9.
HTTP verification passed 10/10 with real sessions and no-JavaScript form posts;
cleanup returned to 0 mocks, 0 mock sections, 0 mock questions, 0 questions and
5 profiles. The authoring regression remains 36/36. Typecheck, lint, 342 tests
and a clean production build pass.

### Word upload: pictures out, numbered markers in, 2026-09-23

*What to build next*, item 1, built on `feat/doc-import`. An admin opens a
`.docx`; its pictures go into the existing `question-images` bucket; the paper's
text comes back with `[[figure:N]]` where each one sat. The admin pastes that
text into any model with the existing prompt, pastes the JSON back, and each
marker is resolved to image N before the usual review and approval.

**No model call anywhere in it**, so it works whatever the Client decides about
the Gemini cost. **No migration**: the bucket and `questions.images` already
exist, and `source_type` stays `'paste'` because the JSON still arrives by paste
-- only the figures now come out of the document.

**Extraction runs in the browser, and that is the load-bearing decision.** Every
upload in this project goes from the browser straight to Storage under the
author's own session, so the Storage policies decide and no file passes through
the application server (operating manual §8). Sending a 12 MB Word file to a
Server Action instead would proxy media through a Vercel function, whose request
body is capped at 1 MB by default and 4.5 MB by the platform -- which is the High
finding about payload limits, met head on. Raising that cap would also have meant
editing `next.config.ts`, a human's call under §6.1. So the Word step needs
JavaScript, the same trade the image field and the document upload already make;
without it the paste box still works and there is simply no Word step.

**What is flagged rather than guessed at**, as the owner settled on 2026-09-23:
EMF and WMF drawings, native Word charts, embedded objects, formats the bucket
does not accept, and anything over 5 MB. Each is still *numbered*, so the marker
in the text keeps its meaning and the admin is told which numbers to paste in by
hand. An image inside an answer option is attached to the question and the option
is still flagged for retyping -- images attach to a question as a set, so an image
that belongs in one option cannot be shown in its place.

**Three defects the tests found, none of which a build would have caught:**

- A table nested inside a table cell came out empty. `row` was one variable
  rather than one per table, so an inner `</w:tr>` cleared the outer table's row
  and the whole outer table was lost.
- `fig` sat before `figure` in the marker alternation, so `[[figure:3]]` matched
  on `fig` and the trailing `[^\]]*` ate the number. The marker still vanished
  from the text, so the only symptom was a figure that never attached to
  anything. The alternation is now ordered longest-first, with a comment saying
  why it must stay that way.
- Text was being collected from between tags as well as from `<w:t>`. Word writes
  no whitespace between elements, but a file that has been through any other tool
  does, and every line would have arrived indented with the XML's own
  indentation.

**Verified 25 of 25** by `scripts/verify/docx-import.mjs` against a local
production build and the hosted database. It builds its own `.docx` with
`zipSync` rather than carrying a binary fixture, and that document is awkward on
purpose: two PNGs, an EMF, a native chart, a data table and a paragraph left in
with track changes on. It proves the markers are numbered in document order, the
table becomes a text table, the deleted paragraph is absent, the EMF and the
chart are flagged; that an admin's upload lands and a student's and a rival
organisation's are refused with zero objects created; that each marker resolves
to the picture it named; that **a crafted post naming org 5's path or a traversal
path attaches nothing**; that a missing figure is a note and not a problem, so the
question can still be approved; and that approval carries the picture onto
`questions.images` while a student, a rival admin and an anonymous caller are all
refused the object.

**What it does not prove, stated rather than implied:** the React click handler
that joins the browser half to the server half. There is no browser automation in
this repository, so the harness imports the *real* `readDocx` -- through a
six-line `module.registerHooks` resolver that adds the `.ts` the application's
imports leave off -- and uploads byte-identically to the browser, then drives
everything downstream over HTTP. A harness that reimplemented the extraction
would prove only that the copy agrees with itself.

**398 unit tests**, up from 354. Typecheck, lint and a clean production build,
run in the `Cospire-doc-import` worktree so the dev server on port 3000 was never
touched.

### Where the 1.3 seconds actually goes, 2026-09-21

The owner reported the platform feeling slow and unresponsive: a click on a nav
item produced nothing for about a second, which reads as an unregistered click,
so the natural response is to click again. Measured before changing anything,
four requests per page, median:

| Page | Local production build | Deployed (Vercel) |
|---|---|---|
| `/login` (no data) | 43ms | 294ms |
| `/admin` | 113ms | 1,520ms |
| `/admin/users` | 278ms | 1,783ms |
| `/admin/ars` | 186ms | 1,718ms |

**The application is not slow.** It answers in 113-278ms *including every
database query*. The missing 1.2-1.5 seconds is the hosting: Vercel is in `bom1`
and Supabase is in Mumbai, so it is not a region mismatch, and the variance
(541ms to 3,659ms on the same URL) is the signature of cold starts on the
**Hobby** tier. Vercel Pro is already owed for the commercial-use clause; it is
also the fix for this number, and nothing in the repository will move it much.

Measured rather than assumed on the way: token verification is **not** a cost.
The project already uses asymmetric ES256 signing keys, so `getClaims()` checks
the signature locally in 2-5ms after the first call, and every page's queries
already run through `Promise.all` where they can.

**So the work was perceived speed, which is the part we control.** Sixteen
`loading.tsx` files, each drawing the real chrome and a skeleton shaped like
that route -- a table page shimmers as a table, a form page as fields. They also
switch link prefetching back on: Next only prefetches a dynamic route's loading
boundary, so with no loading file there was nothing to prefetch. A prefetched
skeleton now arrives in 23-157ms, which is what makes the click feel instant.

**Two consequences of streaming, both found by the harnesses rather than by
reading.** A `loading.tsx` sends headers before the page runs, so:

- **`notFound()` can no longer set the status.** An unassigned mentor opening
  another mentor's submission gets **200 with the not-found page** rather than a
  404. Checked directly against a submission carrying a known string: the
  unassigned mentor's response contains none of it and the assigned mentor's
  contains all of it, so nothing is disclosed. The gate now asserts on the
  content instead of the status, which is the property that was always meant.
- **`redirect()` degraded to a script**, and that one was a real defect. A
  signed-in student pointed at an admin URL received 200, a skeleton, and a
  redirect delivered by JavaScript -- so with scripting off they would have
  watched an admin skeleton shimmer for ever. **Role guards moved into
  `src/app/{admin,mentor,student}/layout.tsx`**, which render outside their
  segment's Suspense boundary and therefore still return a real 307. Verified:
  307 to `/student`, no redirect in the body.

That second one is why `getSessionState` is wrapped in React's per-request
`cache`. The layout and the page both call `requireRole` now, and without the
cache every screen would quietly pay for two token verifications and two profile
queries.

### Programmes and ARS split apart, 2026-09-20

A learning programme and an admission-readiness process had been the same
`courses` row since Phase 5a step 1, distinguished only by whether anyone had
hung ARS rounds off it. So the Programmes list showed processes, the ARS list
showed programmes, and the owner reported exactly that.

**One column, not two tables.** `courses.kind` is `programme` or `ars_process`.
Splitting the table would have meant rewriting the composite foreign key every
round hangs from, every policy that reaches through it, and every grant -- for a
distinction one word wide. The column is additive with a default, so it could
not break the deployed code in the gap between applying it and merging.

**The backfill rule, and the reason there is a way to undo it.** A course with
ARS rounds became a process; everything else stayed a programme. That is the
only rule true of the data as it stands, and it is stated as a rule rather than
a list of ids so it reproduces on any rebuild -- clause 3.9. It moved "Ashoka"
into ARS on the strength of one round called "ARS Template", which may or may
not be what the owner wants. **So a course can be moved between the sections**,
because a classification you cannot change is the same dead end as a list with
no way in.

**What each section can now do on its own.** ARS creates its own processes and
grants its own students. Before this it could do neither: its empty state read
"Create a programme first", and granting existed on exactly one screen in the
other section. That is why the first attempt at this -- replacing
`/admin/courses` with a static placeholder -- would have closed the flow
completely, with no way to create a process and no way to put a student on one.
The order matters: **make ARS self-sufficient first, reduce Programmes second.**

**Programmes keeps its list.** It carries the two placeholder cards the owner
asked for -- aptitude preparation and video curriculums, both marked *Not built
yet* -- above the real programme list, rather than instead of it. A purely
static page would have orphaned "Ashoka", "Mesa" and the two aptitude-prep rows:
still in the database, reachable from no screen.

**`kind` decides both the data and the destination**, so the two cannot drift.
It travels with every post as a closed set mapped to a literal path -- a form
may say which of two sections it belongs to and nothing more -- which is the
same open-redirect reasoning as `buildUsersHref` and `buildRoundsHref`.

**Two defects the verification found**, neither visible to typecheck, lint, 230
tests or a production build:

- **`createCourseAction` read `kind` for the redirect and never wrote it to the
  insert.** So every process created from the ARS screen was filed as a
  programme -- the exact conflation the column exists to end -- and the admin
  landed in ARS looking at a row that was not there. The redirect was right and
  the data was wrong, which is the hardest pairing to spot by eye.
- **A check that proved nothing.** "The student sees the process they were
  granted" passed against a process with no rounds, where there was nothing to
  see either way. It now creates a round first, so granting through ARS is shown
  to give real access rather than merely not erroring.

### The Phase 5a exit gate, closed 2026-09-20

Every piece of ARS had been verified on its own -- uploads 10/10, the importer
35/35, the report 17/17 and 12/12, scheduling 15/15 -- and the sentence the
phase is judged by had never been run as one sequence. "ARS works" was an
inference from parts. `scripts/verify/ars-gate.mjs` is that sequence, and it
passes **28 of 28 against `https://cospire-roan.vercel.app`**.

**One word of the gate has moved, and the script says so.** "Writes feedback"
was written when `ars_feedback` hung one row off one submission. The 2026-09-16
meeting replaced that with a report belonging to a whole process, so the mentor
step here is the review transition that releases the student's view; the
report's own path stays covered by `ars-report.sql` and `ars-report-ui.mjs`.
Recorded rather than quietly reinterpreted.

**What it drives, in order:** a programme with all four round shapes; the
student's process list; a written answer handed in and stamped by the server; an
upload into the student's own private folder, attached to a draft and handed in;
a two-page form saving page one as a draft and handing in on page two with both
pages' answers intact; the assigned mentor's queue showing all three; the mentor
opening one and reading it; the review transition stamping who and when; the
student seeing it reviewed; the mentor recording the off-platform round; and the
process run stamping itself complete.

**What it refuses**, which is the half that matters: a second student **holding
the same programme** sees none of the first student's submissions -- a student
without the grant would prove much less -- an unassigned mentor sees none of
them and gets a 404 opening one directly, and both are refused the uploaded file
**at its Storage path**, while the owning student and the assigned mentor can
read it. Row counts are asserted rather than the absence of an error, which is
the shape this project has been caught by twice.

**Two things the gate found on its first run.**

- **A file round cannot be handed in through the form alone.** `saveAnswers`
  skips file fields, because a plain post carries no bytes, so a required upload
  reads as missing until the upload action has attached it to a draft. The draft
  is created by that action, not by the form. The harness now does what the
  browser does. Not a defect -- but it means the file round has exactly one
  working order, and anything that changes `getOrCreateDraft` will break it
  silently.
- **The teardown leaked one profile per run.** `mentor_assignments.assigned_by`
  is ON DELETE RESTRICT, and the accounts were deleted in creation order, so the
  admin was removed while its own assignment still referenced it. The Auth API
  reports that in a return value the script was not reading, so it failed
  silently and the live profile count climbed 5, 6, 7 across runs. Assignments
  are now all deleted first and the delete result is checked. **The count in the
  cleanup line is the only thing that caught it.**

### The context gate's own blind spot, found 2026-09-10

Merging the ARS rounds pull request left three statements in this file
describing it as unmerged, and **`check-context.mjs` passed anyway**. The claim
read, with the number written here as `#N` for the reason given below:

```
...ARS rounds, is in **PR #N**,
open -- see *Phase 5a progress*.
```

The check tested only the line carrying the number, and the word making the
claim had wrapped onto the next one. Two of the three misses were the phrase
"awaiting review", which was not in its vocabulary at all.

Both are fixed. The check now unwraps the paragraph and then cuts back to the
**sentence** holding the mention, and "awaiting review" and "in review" count as
open claims.

Sentence scope rather than paragraph scope is deliberate, and the first attempt
got it wrong: scanning the whole paragraph convicted the older pull request of
the newer one's word, because "step 2 is in the open one" and "step 1 merged in
the other" sit in the same paragraph and always will.

**This section deliberately avoids writing the literal `PR #<number>` token.**
A document that discusses staleness trips a staleness detector, and the first
draft of this very passage failed the check four times over. Given the choice
between an exemption mechanism and writing "the ARS rounds pull request", the
prose gives way: an escape hatch in the check is a hole someone will later use
to silence a real finding.

The rule this leaves behind: **a safety net that reads one line is defeated by a
line break**, and prose in this file wraps at 80 characters everywhere. A missed
staleness is worse than a false positive here, because the whole point is that
nobody has to remember.

### The design integration, 2026-09-10

The Client supplied a visual prototype, and it was integrated **before** the
remaining features rather than after. The reasoning: there are 13 routes today
and Phase 4 alone will add the most complex UI in the product, so building those
against scaffolding and re-skinning later means building them twice, the second
time under deadline. Week 3 was also blocked on VdoCipher, so the foundation pass
filled a gap rather than displacing feature work.

**Nothing in the prototype was copied.** It is a visual-builder export: React 18
UMD from unpkg, assets base64-encoded into a manifest, markup escaped inside a
template string, and -- decisively -- **423 inline `style` attributes and zero CSS
classes**. There was no stylesheet to import and no component to reuse. The design
was read instead: token values were derived by counting what the prototype
actually uses, which is why the token set is deliberately small.

Full detail, including the extracted palette, is in `design/README.md`.

### Three things the Client should decide

None block the build. All three would be worse discovered late.

- **The heading font is not available.** Every heading in the design is Recoleta
  Bold, a licensed face whose files are absent from the export -- the prototype
  itself falls back to a system serif. The Client holds a licence and will supply
  the files. Until then `--font-serif` resolves to Georgia. **Weight 700 only** is
  needed; all thirty heading usages are Bold. It must be a *web* kit: a desktop
  or OTF licence does not permit `@font-face` embedding.

- **The type scale is small.** The prototype's body copy is 13px and its largest
  heading 24px -- a dense admin-tool scale. It has been applied faithfully rather
  than quietly enlarged, but 13px on a phone is a legibility question, and this
  is a student-facing product. The Client should answer it deliberately.

- **The prototype shows scope the agreement does not cover.** A **study streak**
  counter, **"mocks attempted" / "average score"** dashboard statistics, and a
  **"View as"** role switcher, which is impersonation. None appear in Annexure A.
  Build the design's look without absorbing its scope: each is a clause 12 change
  request if wanted, and none should arrive silently because it was in a picture.

### The NULL that passed a CHECK, 2026-09-10

`ars_rounds_form_has_fields` was written to stop a `form` round being created
with no questions, since that renders a page asking the student to submit
nothing. It read:

```sql
check (
  submission_mode <> 'form'
  or (
    jsonb_typeof(config -> 'fields') = 'array'
    and jsonb_array_length(config -> 'fields') > 0
  )
)
```

A `form` round carrying `{"prompt":"..."}` and **no `fields` key at all** was
accepted. `config -> 'fields'` is SQL NULL when the key is absent, so
`jsonb_typeof(NULL)` is NULL, `NULL = 'array'` is NULL, the AND is NULL, and
`false or NULL` is NULL -- and **a CHECK constraint passes when its expression is
NULL.** Only `false` rejects a row.

What made it easy to miss: `{"fields": []}` *was* refused correctly. The case
anyone thinks to test evaluates to a real `false`; the case nobody types
evaluates to NULL.

The rule worth carrying: **every CHECK over a nullable expression needs its NULL
case decided on purpose.** `... IS TRUE` collapses NULL to false, which is what a
constraint almost always wants.

Fixed forward in `20260910144803` rather than by editing `20260910144415`, which
was already applied and recorded -- editing it would have left a file that never
runs again and a database that disagrees with it.

### Two mistakes from 2026-09-10, both worth keeping

Neither cost anything. Both are the kind that would have.

**A verification probe gave a false pass.** The check that a student cannot grant
themselves a programme was written as `INSERT ... SELECT`, and under the student's
own RLS the SELECT matched zero rows — so it inserted nothing, raised nothing, and
reported "ALLOWED", which read as a policy hole. Re-run with a literal
`resource_id` and a row count, the write is correctly refused.

This is the same shape as the upsert bug in the documents slice: **the absence of
an error is not evidence of an effect.** Any probe asserting that a write was
refused must count rows, and must not let RLS on the *read* side of the statement
do the work.

**The CI context gate was run at the wrong moment.** `check-context.mjs` passed
locally, then failed on the branch that introduced it, because it was run *before*
committing — while "Last updated" was still true. The commit is what made the
header stale. **Run it after the commit, not before.**

### The teardown near-miss, 2026-09-08

Worth keeping visible, because the failure mode is one this project will meet
again.

`scripts/verify/teardown.mjs` deleted every row in `documents`, every
`content_access` row with `resource_type = 'document'`, and every corresponding
Storage object. It never filtered to the run that created them.

That was **indistinguishable from correct** when it was written. The 2026-09-02
baseline held zero documents and zero grants, so "delete everything" and "delete
what I made" described the same set. It silently became a data-loss bug on
2026-09-03, when the owner uploaded two real PDFs through the console — the very
run that confirmed the viewer renders in a browser.

Nothing failed, nothing warned, and the README instructed the operator to run it
every time. It was caught only by reading the script before running it and
noticing the live counts no longer matched the baseline the file recorded.

Two things follow, and both are cheap:

- **A cleanup routine scoped by "everything currently here" is a bug waiting for
  someone to add real data.** Scope by what the run created.
- **A recorded baseline that drifts is worse than none**, because it is what makes
  a destructive operation look safe. The baseline in this file and in the harness
  README is now 2 documents, 2 grants, 2 objects, and it must be re-measured
  rather than assumed before any future run.

## What Phase 0 added

- Foundation/config: `package.json`, `package-lock.json`, `.env.example`,
  `.gitignore`, `.nvmrc`, Next.js/TypeScript/ESLint/Vitest config, `README.md`
- Application: `src/app/**`, `src/features/auth/**`, Admin/Mentor/Student shells,
  placeholder feature directories, `src/shared/ui/**`, `src/shared/db/**`
- Database: `supabase/config.toml`, seed file, manual profile bootstrap SQL, two
  pgTAP suites, and three migrations:
  `20260828093807_foundation_identity_access`,
  `20260828102907_restrict_rls_auto_enable_execute`, and
  `20260828122059_protect_last_admin_and_sync_profile_email`
- Generated: `src/shared/db/types.ts`, generated from the live hosted schema and
  never hand-edited
- Local only, gitignored, never committed: `.env.local`, holding the browser-safe
  Supabase URL and publishable key. `DATABASE_URL` and `SUPABASE_SECRET_KEY` are
  deliberately left blank
- Workflow/docs: `.github/**`, `scripts/wt-new.sh`, `scripts/wt-done.sh`,
  `docs/branch-protection.md`, `docs/supabase-phase-0-runbook.md`,
  `docs/implementation-plan.md`
- Agent handoff: `AGENTS.md`, repository `CLAUDE.md`, and this file
- Navigation: local parent-workspace `C:\Cospire\.vscode\settings.json` hides
  generated/dependency folders and visually nests required root metadata under
  `package.json` without relocating tool-discovered files
