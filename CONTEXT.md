# Cospire LMS - Shared Project Context

Last updated: 2026-11-10 (Asia/Calcutta)

This file holds what is true **now**: status, decisions, active work, pending
work, blockers and the next actions. Read it in full; it is kept under 300
lines, so that costs little. Everything else lives in the file for its topic,
read only when the task touches that area:

| File | Holds |
|---|---|
| `docs/agent-map.md` | **Start here if unsure where to look.** Where everything lives, where to look by task, the route every piece of work takes |
| `docs/context/operations.md` | Environment, tooling and traps: merge-history lessons, dev servers, the Windows build gotcha, the editor's stage-all, Vercel previews, repository visibility |
| `docs/context/backlog.md` | Open items off the immediate path (Phase 0 carry-overs, owner and Client lists, smaller things) and the earlier plan |
| `docs/context/completed.md` | The Completed log and every detailed write-up |
| `docs/context/verification-log.md` | Every check run, with its result |
| `docs/context/meetings.md` | Client calls and what they settled, newest first: the 2026-10-22 metadata and flow call, the October design and content call, then 2026-10-01 and earlier |
| `docs/context/supabase.md` | Hosted Supabase state: migrations, Auth configuration, traps |
| `docs/context/phase-history.md` | Phase records, exit gates, security audits, superseded status snapshots |
| `docs/context/branches/` | One notes file per open branch; see its README |
| `docs/decisions/` | Decision statements D1-D56 and open questions to N19 (newest file: `2026-10-16-decision-statement.md`; D55, D56 and N19 are recorded in this file only). **Untracked and private**, in the main checkout only (D43) |

The rule for keeping this file true is in `AGENTS.md` and `CLAUDE.md`;
`node scripts/check-context.mjs` enforces it in CI. Never put secrets,
credentials, student data or anyone's personal data here.

## Status, 2026-11-10

- **Deployed** at `https://cospire-roan.vercel.app`, from `main`. **The
  repository must stay public while Vercel is on Hobby:** it was briefly private
  (after 2026-10-21, until 2026-11-06), and Vercel then blocked six deployments
  (Hobby deploys a private repository only for its owner's commits; authoring as
  `tech@cospire.in` failed too, as no GitHub account holds that address), while
  GitHub stopped enforcing branch protection. Public again 2026-11-06.
- **Custom SMTP is live** (#109, 2026-11-06): Resend, `noreply@cospire.in`, 100
  emails an hour (Resend free caps 100 a day); probes passed, reset delivered.
- **Work resumed 2026-11-06** (#109-#114: SMTP, Node 24, bulk students, sign-in
  link, UI cleanup) after a pause from 21 October; the Client's 24 to 28 October
  feedback window and "student access by the end of October" both passed unmet.
- **Masters' Union ARS started 2026-11-07:** R1 built (#115 open, 16/16 in a
  browser); R2 and R3 await the owner's material. See *Pending*.
- **UI refresh slices 1 and 2** (#77, #85): Inter, the original navy and cream
  colours in the AfterBoards card shape; a mock opens in its own window on Start
  (#87). *UI refresh slices 1 and 2* in `docs/context/completed.md`.
- **Question import reads PDFs** beside Word files, pictures included (best effort, Annexure B): *PDF upload, 2026-10-12* in `docs/context/completed.md`.
- **Built and verified (local production builds against the hosted
  database):**
  - users, roles, access granting; the document library and protected viewer
    (watermark bottom left, full screen)
  - the question bank: authoring, Word upload with pictures, paste-a-prompt and
    Gemini import, the mock-first import wizard, duplicate detection with no
    model (a close DI set is the admin's call, 2026-10-20), marks on the mock, readable IDs and ID-list mocks
  - the test engine: server-authoritative timer, sections, negative marking per
    type, phone attempts unproctored, warn-and-log proctoring, scoring,
    rescoring; the rebuilt exam screen (PR #70)
  - analytics for students, mentors and admins
  - ARS: the round engine, private uploads, the mentor queue and reports, the
    process importer, the aptitude round linked to a mock and opening the
    importer (D8)
  - **curriculums without video** (PR #72): sections and ordered items
    (document, test, text) on a programme, the admin builder, programme grants
    cascading to every item, `item_progress`, the student programme pages
  - **admin gaps** (PR #73): every ARS submission for admins, `activity_log`
    with concurrent-session and several-location flags
  - **the UI audit and cleanup** (PR #75): no blank page after saves
    (`src/shared/ui/action-boundary.tsx`), 268 to 203 ms average server time,
    the prototype's student home. Report: `docs/ui-audit-2026-10-09.md`
- **Defect C2 is fixed** (#80, 0/40 stuck); a proctored sitting keeps full
  screen from Start through every section change and time-up, with no
  `proctor_events` row for a move the platform made
  (`scripts/verify/exam-fullscreen.mjs`). The 8 s "Taking too long? Reload"
  stopgap stays.
- **Abandoned attempts close every minute** via `pg_cron` (#81, D35; migration
  `20261014100000` applied, job runs and succeeds). They are left unscored for
  `rescoreAwaiting`, so there is one scorer.
- **Essay questions** (#84, D34; migration `20261014110000` applied): typed in
  the mock, marked by an admin or the assigned mentor in `essay_marks` (forced
  RLS, no student write), pending until marked. No essay has yet been authored,
  sat and marked end to end.
- **Video is built and live-verified** (#86): library, server-side OTP with a
  per-viewer watermark, `video` curriculum items, upload, video `item_progress`.
  Migration `20261013120000` applied; 17/17 and 4/4 on the two `video-*` scripts
  against the hosted database; **playback passed in the owner's real-browser
  check** (reported 2026-11-06). See *Video, Phase 2* in `docs/context/completed.md`.
- **A mock has a draft state** (D41, #89): invisible to students in the database,
  published by an admin; a sat mock cannot go back. Migration `20261017100000`
  applied 2026-10-18; new mocks start as drafts. *A mock has a draft state* in
  `completed.md`.
- **Delete for programmes, documents, mocks and videos** (D42, D54, #90): three
  deliberate steps ending in the name typed out, checked on the server and again
  in the database; one `SECURITY DEFINER` transaction, with the storage object or
  VdoCipher video removed after the commit against a `deletion_cleanups` row, so
  a failure there is visible and retryable. Migration `20261017110000` applied
  2026-10-18 (a call with no admin session is refused). 53/53 on
  `scripts/verify/delete.sql`; the screens have never been clicked through.
  *Delete, 2026-10-17* in `completed.md`.
- **Hosted database reset to no content** on 2026-10-18 so the owner could test
  the admin flow from scratch; since then the owner has imported real papers
  (e.g. "01 Question paper A", built into a mock) and essays.
- **The owner's UI pass, 2026-10-19 to 21** (#100-#106, all merged and live):
  a mock keeps the paper's sections under either timing, with section minutes
  read from the paper (migration `20261019100000`, applied); last-question
  submit and a proctor popup; analytics on a student's sat mock; proctoring on by
  default; the mock editor lists only its own questions (bank on "Add
  questions"); a close DI set is flagged, not silently imported; **admin
  sections open on option cards, kept as tabs in each view** (#106, checked on
  the live URL). Rows dated 2026-10-19 to 21 in `completed.md`.
- **Duplicate set Q772 archived** (2026-10-20). The throwaway admin used for it
  is disabled and banned, not deleted: it is the last editor of 772-775, and
  accounts are withdrawn by disabling them.
- **Bulk student creation and emailed links are live** (#112, 19/19; config
  pushed 2026-11-06, both probes passed): CSV invites, set-password, "Forgot your
  password?". The owner's inbox click-through is still owed. *Bulk student creation* in `completed.md`.
- **Not built:** content migration and handover.
- **Never clicked through in a real browser:** the new exam screen, the
  curriculum builder and student programme pages, the admin submissions and
  activity screens, the new student home. (Video playback: passed, owner,
  reported 2026-11-06.)
- **Blocked on the Client:** VdoCipher beyond its 30-day trial, Supabase Pro
  (overdue: ARS uploads are live on Free's 1 GB with no backups), Vercel Pro,
  Gemini billing, their content, per-question metadata (a meeting, D39).

**What a green `verify` does and does not mean.** The CI job named `verify` runs
`typecheck`, `lint`, `test` and `build` -- nothing more. **CI never executes
anything in `scripts/verify/`**, so no database probe and no HTTP check is
reproduced by any check on any pull request. Every probe count recorded in these
files is a local run. Do not quote "verify is green" at a client checkpoint as
evidence the database was verified.

## Authority

The signed agreement defines what is delivered; the parent operating manual
(`../CLAUDE.md`) defines how; `../Context/Cospire_LMS_Technical_Brief.md`
explains the architecture. This file records state only: where it conflicts with
any of them, correct this file.

## Product summary

Cospire LMS V1 is a six-week, fixed-scope learning and assessment platform for a
maximum of 100 registered/concurrent users. It has Admin, Mentor, and Student
roles and four modules:

- Protected video curriculums and progress tracking
- Full mocks and topic tests with authoring, scoring, analytics, and proctoring
- Protected document library
- Configurable asynchronous ARS submission and mentor review workflow

Planned stack: Next.js 15, TypeScript, Supabase managed Postgres/Auth/Storage,
VdoCipher, PDF.js, Recharts, Google Docs API plus an LLM, and Vercel Pro.

## Confirmed decisions

| Decision | Confirmed state |
|---|---|
| Repository visibility | **Public** during the build, by the owner's decision on 2026-08-28, taken to obtain branch protection on the free plan; Vercel Hobby also needs it (briefly private until 2026-11-06, which blocked every deployment). **This conflicts with clause 3.9 of the agreement**, which says the build is held in "a private repository controlled by the Developer", and clause 13.1 lists source code as confidential. The agreement wins; open for the owner's decision. Going private needs GitHub Pro and Vercel Pro first. See *Repository visibility* |
| Application URL during build | `https://cospire-roan.vercel.app`, deployed from `main` since 2026-08-29. `site_url` and the redirect allow-list point at it |
| Prerequisite gating | None in V1; every curriculum item is open |
| Proctoring violation | Warn and log; never auto-submit |
| Negative marking | Per mock and question type; defaults to MCQ types, not TITA |
| Curriculum model | Ordered mixed `curriculum_items`, not a lessons-only model |
| Programme grants (N11) | A programme grant opens every item in that programme's curriculum; individual item grants still work on their own (owner, 2026-10-08) |
| Where programme items appear | Also in the student's Documents and Mock tests lists, next to items granted directly ("keep both", owner, 2026-10-09) |
| ARS model | One data-driven round engine with text, file, and form modes |
| Mobile mocks | Phone attempts are permanently unproctored; mock can disallow phones |
| Timing | Server-authoritative, including sectional timing |
| Schema workflow | Append-only migrations; no live schema writes through MCP |
| Migration safety | Expand and contract. A migration must never break the currently deployed code, because Vercel deploys on merge while migrations are applied by hand |
| Supabase plans | Free during build, Pro before handover/ARS and restore testing |
| Application hosting | Vercel Pro; Hobby is not used for the commercial application |

## Rules this project adds to the manual

- **Never send a real Cospire question paper to a free model tier** (clause
  13.1). Real papers go through the paid Gemini path or no API at all.
- Migrations are additive and must not break the deployed code (expand, then
  contract); every committed migration must recreate the database.
- `src/shared/db/types.ts` is generated, never hand-edited.
- The full list, with the manual's own rules, is in `docs/context/operations.md`.

## Repository and environment

- `C:\Cospire\Cospire` on `main`, which is protected: pull request required,
  `verify` required, branches must be up to date, no force pushes. **Public**
  repository; see *Repository visibility* in `docs/context/operations.md`.
- Deployed from `main` to `https://cospire-roan.vercel.app` (Vercel **Hobby**).
  Preview deployments cannot be driven by scripts (environment variables and
  deployment protection; see `operations.md`).
- Hosted Supabase `eeeftjwvbppznsmcljnw` (Mumbai, **Free**). Every migration on
  `main` is applied, and nothing else.
- Feature work happens in sibling worktrees (`scripts/wt-new.sh NAME PORT`).
  Never build in the main checkout while a server runs there, and stop a
  `next start` before deleting its folder.

### Tooling available to an agent in this repository

| Tool | State | Use it for |
|---|---|---|
| Supabase CLI | Logged in and **linked** | `npm run db:migrate` for migrations, `supabase config push` for auth settings, `npm run db:types` |
| GitHub CLI (`gh`) | Installed and **logged in as `Two19Labs`** (2026-09-18, scopes `repo`, `read:org`, `gist`). If a session reports no host, run `gh auth login` | Creating pull requests, watching CI, merging |
| Supabase MCP | Available, **read-only by policy** | Inspecting tables, advisors, logs. Never DDL; see operating manual §4.5 |
| Docker | **Unavailable** | `db:reset`, `db:lint` and `db:test` cannot run here |

## Active work

| Owner / chat | Branch | Scope | Owned files | Status | Last update |
|---|---|---|---|---|---|
| Claude, programme uploads chat | `feat/programme-uploads` | Upload a video or document straight from a programme section; it lands in its library and in the section | `src/features/curriculum/**`, `src/features/video/actions/videos.ts`, `src/features/video/components/video-upload-form.tsx`, `src/features/documents/actions/{record-document,create-upload-ticket}.ts`, `src/features/documents/components/upload-form.tsx` | PR #116 open, awaiting owner merge; 15/15 headless, video placement not re-run (branch notes) | 2026-11-10 |

Merged: #115, #117 logo (2026-11-10); #108-#114 (2026-11-06); #100-#106 (10-19 to 21); #80, #81, #84-#92 (10-16 to 18);
#69-#75, #77-#79, #82, #83, #88 earlier; #76 closed (in #77). Write-ups: `docs/context/completed.md`.

## Pending

The full route is in `docs/implementation-plan.md`. **Phase numbers name scope,
not order** — the order changed on 2026-09-08. Only what is open is listed here.

**UI refresh settled:** *UI refresh slices 1 and 2* in `completed.md` (D25-D31, D52).

**Masters' Union ARS: on hold** (owner, 2026-11-10, D57); #115 merged, R1 import private in `Context/`.
**Question bank replaced** (owner, 2026-11-10; D59 in the owner's decisions file): all mocks, attempts and old questions deleted; 1,349 normalised questions loaded with **id = the document's Question ID** (sets 1350-1458), marks 1. No mocks exist.
VdoCipher answered 423 "write actions paused" on 2026-11-10: a probe clip awaits deletion (`docs/context/branches/feat-programme-uploads.md`).

### Owed in a real browser (owner)

Headless Chrome covered everything else; these need a person. **The exam**
(#70, #80, #87): a sitting on desktop then a phone, moving between questions,
"All answers saved", full screen, the countdown reaching zero, the mock opening
in its own window. **Essays** (#84): author, sit and mark one. (Video, #86:
passed in the owner's check, reported 2026-11-06.)
**Since 2026-10-19:** sit a mock with several untimed sections, and one Gemini
import of a paper that states section times (`sections` read back).

## External blockers and client-owned steps

Every blocker recorded during Phase 0 is resolved: Supabase dashboard access, the
CLI link, the three Auth users, and a deployed URL all exist. What follows blocks
**later phases**, with the phase it stops.

| Needed | Blocks | Owner |
|---|---|---|
| **VdoCipher beyond the 30-day trial** | Nothing today: the trial account is in the Client's name and video is built and verified against it. A paid plan is needed before handover, and the trial's expiry date is not recorded | Cospire |
| **Billing on the Gemini project** (**agreed by the Client on 2026-10-01**, about ₹1,000 prepaid; owner to set up, in Cospire's name) | The question-import model path. Without it the project is capped at five requests a minute and answers 503 most of the time, which makes real imports impossible and exposes papers to free-tier training terms. **Not a new key** -- the existing one is valid | Cospire, on the project `aistudio.google.com/apikey` names |
| **Existing content**: videos, question banks, documents | Migration in Phase 5, and the pulled-forward import accuracy test | Cospire, **by start of week 4** |
| **A written decision on what is still in use** | Migration scope, so nothing is migrated that nobody opens | Cospire |
| **Supabase Pro** | Real ARS video uploads (capacity, not building), plus daily backups, the tested restore and leaked-password protection | Cospire, clause 8.3 |
| **Vercel Pro** | Commercial use. Hobby does not permit it. On Hobby a private repository deploys only its owner's commits, so the repository stays public until Pro | Cospire, clause 3.8 |
| **Docker on a build machine** | Both pgTAP suites, neither of which has ever run | Two19 Labs |
| **The second engineer's GitHub handle** | Making CODEOWNERS actually enforce anything | Two19 Labs |

No written Kickoff Date is needed and feedback turnaround is not chased (owner,
2026-10-18, D56): the build is up to date and delays have been on the Client's
side.

## Findings and risks to preserve

| Severity | Finding | Required mitigation |
|---|---|---|
| Critical | Historical mocks can change if attempts reference mutable live questions/configuration | **Decided 2026-09-21: questions stay editable** and a past attempt's review shows the current question. Phase 4 must rescore every attempt affected by a change to a key, option set or marks value, and record it in `rescore_events`. See *The question bank* (`docs/context/completed.md`) |
| Critical | Answer keys share the proposed question row students need to read | **Designed out 2026-09-21:** keys live in `question_keys`, which has no student policy. Phase 4 adds a read only after the student's own attempt is submitted |
| Critical | Supabase database backups exclude Storage objects | Design and test a separate file backup/restore process |
| High | Vercel Functions have small request/response payload limits | Use direct authorized uploads/downloads; never proxy media |
| High | Vercel Cron can overlap or deliver more than once | Durable job records, locks, and idempotency are required |
| High | Migration volume and cleanup responsibility are not capped | Obtain a content inventory and written acceptance boundary |
| High | Week six is overloaded with ARS, migration, QA, deployment, docs, and training | Pull prototypes and integration work earlier; reserve week six for closure |
| High | 100 concurrent users: measured 2026-10-18 with functions in Mumbai (*Load test, 100 concurrent* in `completed.md`). 100/100 sat with 0 errors and every answer and score correct; fast at 10, saves fine at 50, but at 100 saves p95 1.9 s and pages 9.8 s because the Free-plan database saturates | Supabase Pro, then re-run; if still slow, the next compute size and/or slimmer start, result and submit paths. Students should log in before a timed mock |
| High | Google Docs image extraction guarantee is broader than the API's reliable cases | Test real Cospire documents early and preserve a correction workflow |

## Next recommended action

**From the metadata and flow call, 2026-10-22** (*The metadata and flow call*
in `docs/context/meetings.md`; earlier calls below it):

- **Two19 sends:** the per-question metadata list (difficulty, topic; marks
  constant); the questions with suspect answer keys. (The `cospire.in` email
  domain, N19, is verified: 2026-11-06.)
- **The Client sends:** documents with metadata beside each question (the
  importer reads it, no code); programme flows (N15); analytics needs (N5, N7).
- **Sections (N4):** QA, LR, DI, VA, CR.

**Then, in order:**

1. **PR #116 (`feat/programme-uploads`):** owner merges; then the programme
   importer and adding a test from the builder.
2. **MU mocks from the new bank** (questions 1034-1348 carry the MU Mock
   questions; the owner decides sections, timings and order first; no negative
   marking). **MU ARS stays on hold**: on resuming, check the R1 preview only.
3. **Owner checks:** one bulk invitation clicked through from the inbox (then
   remove the test student); `lms.cospire.in` in Vercel and a GoDaddy CNAME
   (not the apex, which is the live website), then `site_url` and
   `additional_redirect_urls` in `supabase/config.toml` and `config push`.
4. **The browser pass owed in *Owed in a real browser* above.**
5. **Chase the Client:** feedback, documents with metadata, programme flows,
   analytics needs, a date for student access; Supabase Pro, Vercel Pro, Gemini
   billing (D49). Then re-run `load-100.mjs` after Pro. N3 hosting stays deferred.

Open items that are not next (Phase 0 carry-overs, the Ashoka question, owner
and Client lists) are in
`docs/context/backlog.md`.
