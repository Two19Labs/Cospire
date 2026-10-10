# Cospire LMS - Shared Project Context

Last updated: 2026-10-10 (Asia/Calcutta)

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
| `docs/context/meetings.md` | Client calls and what they settled |
| `docs/context/supabase.md` | Hosted Supabase state: migrations, Auth configuration, traps |
| `docs/context/phase-history.md` | Phase records, exit gates, security audits, superseded status snapshots |
| `docs/context/branches/` | One notes file per open branch; see its README |
| `docs/decisions/` | Decision statements D1-D24 and open questions N1-N13. **Untracked**, in the main checkout only (N13) |

The rule for keeping this file true is in `AGENTS.md` and `CLAUDE.md`;
`node scripts/check-context.mjs` enforces it in CI. Never put secrets,
credentials, student data or anyone's personal data here.

## Status, 2026-10-10

- **Everything built is merged to `main` and deployed** at
  `https://cospire-roan.vercel.app` (`main` at `8137089`). No feature branch
  is open; `main` is the only branch on `origin`.
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
- **Both 2026-10-08 migrations are applied** (`20261008120000` curriculum,
  `20261008130000` activity log); `main` and the database are in step, and
  `src/shared/db/types.ts` is regenerated (PR #74).
- **Open defect C2** (UI audit): a save sometimes never completes on screen
  although the server finished it (about 40% of "Remove access" locally, 2 of 4
  on the deployed URL). Stopgap: "Taking too long? Reload" after 8 s. Real fix
  is the owner's call: a Next patch upgrade, or saves returning state instead
  of redirecting.
- **Not built:** video (VdoCipher credentials expected the week of 12 October),
  bulk CSV creation (SMTP), closing abandoned attempts on a schedule (N6),
  content migration and handover.
- **Never clicked through in a real browser:** the new exam screen, the
  curriculum builder and student programme pages, the admin submissions and
  activity screens, the new student home.
- **Blocked on the Client:** VdoCipher, Supabase Pro (overdue: ARS uploads are
  live on Free's 1 GB with no backups), Vercel Pro, SMTP, Gemini billing, their
  content, and the written amendment for clause 12 work already built.

Superseded status snapshots (2026-09-28 and 2026-10-02) are in
`docs/context/phase-history.md`.

**What a green `verify` does and does not mean.** The CI job named `verify` runs
`typecheck`, `lint`, `test` and `build` -- nothing more. **CI never executes
anything in `scripts/verify/`**, so no database probe and no HTTP check is
reproduced by any check on any pull request. Every probe count recorded in these
files is a local run. Do not quote "verify is green" at a client checkpoint as
evidence the database was verified.

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

No feature branch is open. Recent merges: #69-#76 (2026-10-08 to 2026-10-10);
write-ups in `docs/context/completed.md`.

## Pending

The full route is in `docs/implementation-plan.md`. **Phase numbers name scope,
not order** — the order changed on 2026-09-08. Only what is open is listed here.

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
| ~~**A Google account** (Docs API)~~ **Received 2026-09-23** | The owner holds a Google account from the Client. It covers clause 3.15 and the Gemini key for the question-import model path. Still needed on it: the Gemini API key itself, and **billing enabled** -- the free tier is rate limited and Google may use free-tier content to improve its products, which the Client's own question papers should not be exposed to. Not blocking; nothing consumes it until the API path is built | Two19 to set up on the Client's account |
| **Existing content**: videos, question banks, documents | Migration in Phase 5, and the pulled-forward import accuracy test | Cospire, **by start of week 4** |
| **A written decision on what is still in use** | Migration scope, so nothing is migrated that nobody opens | Cospire |
| ~~**One real question document**~~ **Offered 2026-09-25** | The owner will supply real question papers on request. The importer and the Word path are built and waiting for them, so this is now a matter of asking rather than a blocker. It remains the accuracy test the delivery plan commits to in the first fortnight | Two19 to ask |
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

**As of 2026-10-10, in order:**

1. **Owner, in a real browser on the deployed URL:** sit a mock on the new exam
   screen (desktop, then a phone); build a curriculum and work through it as a
   student; save on an admin screen a few times ("Grant access", "Remove
   access": it should dim, never blank; note whether C2 happens); the new
   student home at phone width; the admin submissions and activity screens.
2. **Owner decisions:** C2 (Next patch upgrade, or saves returning state); the
   activity-flag thresholds in `src/features/admin/activity-flags.ts` (24 h,
   more than 3 addresses, 30 min idle); the five modelling choices listed in
   PR #72; N6 (`pg_cron` or Vercel Cron); N1-N3, N10, N12, N13.
3. **Video, the day VdoCipher access arrives:** one real video end to end first
   (upload, `videos` row with processing status, server-side OTP after the
   access check, per-viewer watermark, a copied link failing in a second
   browser), then the video library, `video` as a curriculum item type
   (`private.validate_curriculum_item` refuses it today), playback and
   `item_progress` for video, and the video-watching flag.
4. **Chase the Client:** VdoCipher, Supabase Pro, Vercel Pro, SMTP, Gemini
   billing, their content, the written amendment.

Open items that are not next (Phase 0 carry-overs, the written amendment, the
Ashoka question, the MESA fork, owner and Client lists) are in
`docs/context/backlog.md`.
