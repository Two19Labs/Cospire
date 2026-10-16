# Cospire LMS - Shared Project Context

Last updated: 2026-10-16 (Asia/Calcutta)

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
| `docs/context/meetings.md` | Client calls and what they settled, newest first: the October 2026 design and content call, then 2026-10-01 and earlier |
| `docs/context/supabase.md` | Hosted Supabase state: migrations, Auth configuration, traps |
| `docs/context/phase-history.md` | Phase records, exit gates, security audits, superseded status snapshots |
| `docs/context/branches/` | One notes file per open branch; see its README |
| `docs/decisions/` | Decision statements D1-D54 and open questions to N18 (newest: `2026-10-16-decision-statement.md`). **Untracked and private**, in the main checkout only (D43) |

The rule for keeping this file true is in `AGENTS.md` and `CLAUDE.md`;
`node scripts/check-context.mjs` enforces it in CI. Never put secrets,
credentials, student data or anyone's personal data here.

## Status, 2026-10-16

- **Deployed** at `https://cospire-roan.vercel.app`, from `main`.
- **UI refresh slice 1** (`feat/ui-refresh`): Inter for body and headings and
  the original navy and cream colours, both the Client's choice on 2026-10-12,
  in the AfterBoards card shape; typed names and titles normalised on save.
  See *UI refresh* under Pending and the 2026-10-10 rows of the Completed log in
  `docs/context/completed.md`.
- **Question import reads PDFs** beside Word files, pictures included (best effort, Annexure B): *PDF upload, 2026-10-12* in `docs/context/completed.md`.
- **Built and verified (local production builds against the hosted
  database):**
  - users, roles, access granting; the document library and protected viewer
    (watermark bottom left, full screen)
  - the question bank: authoring, Word upload with pictures, paste-a-prompt and
    Gemini import, the mock-first import wizard, duplicate detection with no
    model, marks on the mock, readable IDs and ID-list mocks
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
- **The database is one migration ahead of `main`:** `20261013120000_videos`
  is applied (owner's go, 2026-10-13) and lands on `main` with `feat/video`.
- **Defect C2** (a save never completes on screen although it landed): fixed
  on PR #80, 0/40 stuck. The full-screen hold is answered and measured: a
  proctored sitting keeps full screen from Start through every section change
  and time-up, with no `proctor_events` row for a move the platform made
  (`scripts/verify/exam-fullscreen.mjs`). A Server Action's `redirect()` is
  followed by the client router and never reaches `ActionBoundary`, so only the
  countdown's native form post ever lost full screen, and it no longer posts.
  Stopgap meanwhile: "Taking too long? Reload" after 8 s.
- **Not built:** bulk CSV creation (SMTP), a mock draft state (D41), delete for
  programmes, documents and mocks (D42), content migration and handover. In
  progress: video, abandoned attempts (`pg_cron`, D35), the essay type (D34).
- **Never clicked through in a real browser:** the new exam screen, the
  curriculum builder and student programme pages, the admin submissions and
  activity screens, the new student home, and saves after the C2 fix.
- **Blocked on the Client:** VdoCipher, Supabase Pro (overdue: ARS uploads are
  live on Free's 1 GB with no backups), Vercel Pro, SMTP, Gemini billing, their
  content, and per-question metadata (a meeting, D39).

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
| Repository visibility | **Public** during the build, by the owner's decision on 2026-08-28, taken to obtain branch protection on the free plan. **This conflicts with clause 3.9 of the agreement**, which says the build is held in "a private repository controlled by the Developer", and clause 13.1 lists source code as confidential. The agreement wins; open for the owner's decision. See *Repository visibility* |
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
| Engine worker (`Cospire-engine`, port 3040) | `fix/save-completion` | Defect C2, and the exam keeping full screen | `scripts/verify/c2-repro.mjs`, `scripts/verify/exam-fullscreen.mjs`, `package.json`/`package-lock.json` (`next` only), `src/shared/ui/action-boundary.tsx`, `src/features/test-engine/components/exam-sitting.tsx`, `.../fullscreen.tsx` | 0/40 stuck, 13/13 flows, full screen held through Start, section change and time-up with 0 false proctoring rows; PR #80 awaiting the owner | 2026-10-16 |

In progress, each branch carrying its own row until it merges: `feat/video`
(migration `20261013120000` applied; live pass waits for a test video) and
`fix/save-completion` (C2). Merged: #69-#75, #77-#79; #76 closed unmerged
(its content is in #77). Write-ups: `docs/context/completed.md`.

## Pending

The full route is in `docs/implementation-plan.md`. **Phase numbers name scope,
not order** — the order changed on 2026-09-08. Only what is open is listed here.

### UI refresh: slice 1 done, slice 2 next

All of slice 1's questions are settled (D25-D31 in the untracked
`docs/decisions/2026-10-12-decision-statement.md`):

- **Inter** for body and headings, platform-wide; the exam screen's own styling
  stays CAT-like and untouched.
- **The original colours**: ink rail `#182b50`, cream page `#faf5e6`, navy
  primary buttons, gold for progress and the current nav item, rust for
  emphasis and danger only.
- **The AfterBoards card shape**: 20px cards, no shadows, pill primary buttons,
  larger type, one motion curve. The sidebar keeps its line icons.
- **No gamification, no illustrations, no emoji.** Never copy AfterBoards' logo,
  wording, orange or the licensed MADE Gentle font.

Next:
1. Slice 2: the remaining student screens (programmes, documents, mock list,
   results and attempt review, analytics, ARS).
2. **A mock opens in its own window on Start** (decided, not built). Without
   JavaScript it falls back to the same tab; switching back is an expected
   proctoring focus loss; on submit the window closes and the dashboard
   refreshes.
Build desktop first, then derive the phone layout (D52); no further
AfterBoards references are owed.

### Phase 6 step 6.1, the exam screen: merged, browser pass owed

Merged as PR #70 (`9f808b3`) on 2026-10-09. Still owed: the owner's review, **a sitting in a real browser with JavaScript** --
moving between questions, typing and watching "All answers saved", the dialog,
full screen on Start, the countdown reaching zero -- on desktop and then a
phone. See *The exam screen, 6.1*.

### Phase 1, one step still unbuilt

Step 5, **bulk creation from a spreadsheet**, CSV only. Blocked on custom SMTP.
The exit gate closed without it on 2026-09-08; this is the remainder of the phase,
not a gate item.

### Phase 2, video still blocked; curriculums merged

Curriculums without video (steps 3, 4, 4b, 5) merged as PR #72 (`b0de34d`),
verified 35/35; not yet clicked through in a browser. **Video is still blocked on VdoCipher**
(expected the week of 12 October): the upload pipeline, playback, the `videos`
table, the `video` branch of `private.validate_curriculum_item` and
`student_has_programme_item('video', …)` in a video access helper, and
`item_progress` for video (percent, last position).

## External blockers and client-owned steps

Every blocker recorded during Phase 0 is resolved: Supabase dashboard access, the
CLI link, the three Auth users, and a deployed URL all exist. What follows blocks
**later phases**, with the phase it stops.

| Needed | Blocks | Owner |
|---|---|---|
| **Custom SMTP** account and DNS records | Bulk student creation only, in Phase 1. Invitations and password resets generally | Cospire, clause 3.8 |
| **VdoCipher** account and API access | **All of Phase 2.** Nothing in that phase starts without it | Cospire |
| **Billing on the Gemini project** (**agreed by the Client on 2026-10-01**, about ₹1,000 prepaid; owner to set up, in Cospire's name) | The question-import model path. Without it the project is capped at five requests a minute and answers 503 most of the time, which makes real imports impossible and exposes papers to free-tier training terms. **Not a new key** -- the existing one is valid | Cospire, on the project `aistudio.google.com/apikey` names |
| **Existing content**: videos, question banks, documents | Migration in Phase 5, and the pulled-forward import accuracy test | Cospire, **by start of week 4** |
| **A written decision on what is still in use** | Migration scope, so nothing is migrated that nobody opens | Cospire |
| **Supabase Pro** | Real ARS video uploads (capacity, not building), plus daily backups, the tested restore and leaked-password protection | Cospire, clause 8.3 |
| **Vercel Pro** | Commercial use. Hobby does not permit it | Cospire, clause 3.8 |
| **Docker on a build machine** | Both pgTAP suites, neither of which has ever run | Two19 Labs |
| **The second engineer's GitHub handle** | Making CODEOWNERS actually enforce anything | Two19 Labs |
| **The written Kickoff Date** | Nothing directly, but the week-four content deadline hangs off it and it has never been confirmed | Cospire |

The delivery plan also assumes **feedback within two working days**. Where that
slips the delivery date moves by the same amount, and it must be flagged in
writing at the time rather than absorbed silently.

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
| High | "100 concurrent users" lacks measurable performance criteria | Define workload, latency, error-rate, and duration thresholds |
| High | Google Docs image extraction guarantee is broader than the API's reliable cases | Test real Cospire documents early and preserve a correction workflow |
| Medium | Agreement kickoff prerequisites and week-four content deadline are ambiguous | Record the exact written Kickoff Date and dependency deadlines |

## Next recommended action

**From the design and content call** (recorded 2026-10-12; *The design and
content call, October 2026* in `docs/context/meetings.md`):

- **The Client's timeline:** student access by the **end of October**, a stable
  product by the **end of November** after testing.
- **Content migration starts now, with ARS and mock documents**, before video.
  The Client sends them through a shared drive, organised and rechecked; the
  owner imports them. Each mock type still needs its settings (duration, marks,
  negative marking, section timing and locking) and the answer-key errors fixed.
- **The Client sends a curriculum flow** (for example Ashoka Aptitude prep). The
  builder exists (PR #72): this is content plus a check against their flow.
- **Supabase Pro:** the Client's decision is pending.
- **Owner:** tell the Client the answer-key errors and ask Ashoka's order
  (D48); hold the per-question metadata meeting (D39); payments still owed are
  Gemini billing, Supabase Pro and Vercel Pro (D49); import the content, then
  train the Client's team.

**As of 2026-10-10, in order:**

1. **Owner, in a real browser on the deployed URL:** sit a mock on the new exam
   screen (desktop, then a phone); build a curriculum and work through it as a
   student; save on an admin screen a few times ("Grant access", "Remove
   access": it should dim, then show the save at once -- C2 is fixed); the new
   student home at phone width; the admin submissions and activity screens.
2. **Owner decisions still open:** N3 hosting (deferred). Settled on
   2026-10-16: D33-D54. Delete (D42, D54, not built) removes everything hanging
   off the deleted thing, guards against orphans, and takes two to three
   confirming steps.
3. **Video:** built on `feat/video`; the live pass with the Client's test video
   runs next, then its PR.
4. **Chase the Client:** Supabase Pro, Vercel Pro, SMTP, Gemini billing, their
   content.

Open items that are not next (Phase 0 carry-overs, the Ashoka question, owner
and Client lists) are in
`docs/context/backlog.md`.
