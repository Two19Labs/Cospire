# Cospire LMS - Shared Project Context

Last updated: 2026-09-25 (Asia/Calcutta)

This file holds what is true **now**: status, active work, what is pending, the
blockers and the next actions. History lives in `docs/context/`, one file per
topic, and is read when the task touches that area. A section named elsewhere in
this file and not found here is in one of these; find it with
`grep -rn "<section name>" docs/context/`:

| File | Holds |
|---|---|
| `docs/agent-map.md` | **Start here if unsure where to look.** Diagrams of where everything lives, where to look by task, the route every piece of work takes, and what enforces it |
| `docs/context/completed.md` | The Completed log and every detailed write-up behind it: the question bank, the process importer, the re-skin, the Phase 5a exit gate, the 1.3-second investigation, mistakes worth keeping |
| `docs/context/meetings.md` | Client calls and what they settled: 2026-09-21 walkthrough (with the question-ID mock document design), 2026-09-16 ARS meeting, the Masters' Union process, content organisation, the 2026-09-08 sequencing change |
| `docs/context/supabase.md` | Hosted Supabase state: applied migrations, Auth configuration, users, advisors, traps |
| `docs/context/phase-history.md` | Phase 0, 1 and 5a progress records, exit gates and security audits |
| `docs/context/verification-log.md` | Every check run, with its result |

## Status, 2026-09-23

- **On `main` and deployed** at `https://cospire-roan.vercel.app`:
  - Phase 0 and Phase 1: users, access granting, the document library and the
    protected viewer. Bulk CSV creation is the one Phase 1 step unbuilt, blocked
    on custom SMTP.
  - Phase 5a, ARS, complete: exit gate 28/28 on the deployed URL (2026-09-20).
    That covers programmes, rounds, submissions, private uploads, the mentor
    queue, off-platform rounds, the ARS report, and both paste-a-prompt importers.
  - Programmes and ARS as separate admin sections; the shell and ARS form
    re-skinned to the Client's prototype.
  - A skeleton of its own for every signed-in screen, and sign-in straight to
    the role home (PR #52, 11/11 on the deployed URL).
  - Report-template round selector limited to the template's programme (PR #50,
    8/8 on the deployed URL).
  - The question bank (Phase 3), **merged 2026-09-23 as `1c7073d`** (PR #49):
    schema with answer keys held apart, the numerical normaliser, authoring,
    paste-a-prompt import with review, and the admin mock builder. Its seven
    migrations were already applied, so `main` and the database are back in
    step. Details in `docs/context/completed.md`.
- **The seven review findings on the question bank are fixed, merged and
  deployed** (PR #55, `cc015e0`), all in the mock builder: section slots map by
  slot rather than position; a question archived after selection is listed and
  removable instead of locking its mock; the picker reads the section embed as
  the object PostgREST returns; a missing section field is refused instead of
  filed into section one; childless DI sets are shown and refused instead of
  filtered after paging; `/admin/mocks/[id]` uses `parseId`; and images dropped
  from a question are deleted from Storage. **19/19 on the deployed URL.**
- **Word upload with pictures extracted is merged and deployed** (PR #58,
  `b2a4fb8`, 2026-09-25) and verified **25/25 against the deployed URL**. It
  needs no migration and calls no model. Details in
  `docs/context/completed.md`.
- **The Gemini path and the automatic routing are merged and deployed too**, in
  the same pull request. A `.docx` with no pictures shows the prompt to copy, as before; one with
  pictures is sent to Gemini with its pictures, and the platform places each
  figure. **Its live round trip is UNVERIFIED**: every Gemini model on the
  Client's key answered `503 UNAVAILABLE` from 2026-09-23 and still on 2026-09-25,
  though the key is valid and lists 42 models. Everything else about the path is
  checked, including that the key is in none of the chunks the browser is served.
  Run `scripts/verify/gemini-import.mjs` when the API is back; that is the one
  thing outstanding.
- **Next, in this order (owner, 2026-09-23):** Word upload with pictures
  extracted (now built, awaiting merge), then the Gemini import path, then mocks
  built from documents that quote question IDs, then the test engine (Phase 4).
  See *What to build next*.
- **Blocked on the Client:** VdoCipher (all of Phase 2), custom SMTP (bulk CSV),
  Supabase Pro, Vercel Pro. See *External blockers*.
- **Schedule:** the owner confirmed on 2026-09-22 that it holds.

**What a green `verify` does and does not mean.** The CI job named `verify` runs
`typecheck`, `lint`, `test` and `build` -- nothing more. **CI never executes
anything in `scripts/verify/`**, so no database probe and no HTTP check is
reproduced by any check on any pull request. Every probe count recorded in these
files is a local run. Do not quote "verify is green" at a client checkpoint as
evidence the database was verified.

## Purpose and authority

This is the canonical operational handoff for every agent, developer, and chat
working on this repository. It records current state, decisions, findings,
completed work, active work, pending work, blockers, and verification results.

It is not a substitute for the governing documents. Use this order of authority:

1. The signed agreement defines what must be delivered.
2. The parent operating manual (`../CLAUDE.md`) defines how it is built.
3. `../Context/Cospire_LMS_Technical_Brief.md` explains the architecture.
4. This file records current execution state and handoff context.

If this file conflicts with a higher-authority document, correct this file rather
than silently following it.

## The context rule - non-negotiable, every agent, every session

This file is the single source of truth for the state of this project. It is what
lets a new chat, a new agent or a new engineer pick this up without anyone
explaining it to them. Keeping it true is part of the work, not admin bolted on at
the end.

The same rule is in `AGENTS.md` and `CLAUDE.md`, so it binds whichever entry point
you arrive through.

**Before planning or editing anything**

1. Read this file in full. Not skimmed, not searched for a keyword.
   Then read the file in `docs/context/` for the area your task touches: the
   history lives there, one file per topic, and `CONTEXT.md` lists which is
   which. Reading all of them is not required.
2. Add your entry to **Active work** - branch, scope, the files you will own -
   before your first material change, so a parallel agent can see the collision
   coming.
3. Inspect `git status`, the current branch, recent commits, and the relevant
   files. Do not trust this file over what the repository actually says; where
   they disagree, the repository is right and this file gets corrected.

**While working**

4. Update it the moment something material changes: a decision, a discovery, a
   blocker, a migration, a new dependency, an assumption about an external
   service. Write it when you learn it, not at the end when you have forgotten why
   it mattered.
5. Do not edit files another agent has claimed under **Active work** without
   coordinating first.

**Before ending any turn, handing off, or going quiet**

6. Move finished items out of **Active work** into the Completed log in
   `docs/context/completed.md`. Put the detailed write-up there too, or in
   whichever `docs/context/` file fits, and leave this file a line or two plus
   a pointer. It holds what is true now, so a new session can read it whole
   without cost.
7. Record what you verified and how, **including what failed**. Never record an
   assumption as a fact, and never record "should work" as "works". A green build
   is not evidence a feature works.
8. Update **Pending**, the blockers, and **Next recommended action**.
9. **Replace stale statements. Do not append a correction beneath them.** A file
   that contradicts itself is worse than one that is merely out of date, because
   the reader cannot tell which half is true. Replace stale state rather than
   accumulating an unbounded diary.
10. Leave incomplete work explicitly marked as incomplete. Never imply completion
    from partial scaffolding.

**The test that decides whether you are finished**

> A new session that reads this file, plus the `docs/context/` file for its
> area, must be able to continue the work without asking a single question.

If that is not true, this file is not finished and neither are you. Check it by
reading your own entry as if you had never seen this project.

**Never** put secrets, credentials, tokens, connection strings, student data or
anyone's personal data in this file.

This rule is not waived by being in a hurry, by the change being small, or by the
work being unfinished. An unfinished task recorded honestly is useful. An
unfinished task recorded as complete is worse than no record at all.

In a feature worktree, update that worktree's copy. The integrating reviewer
consolidates concurrent context changes when branches merge.

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
| ARS model | One data-driven round engine with text, file, and form modes |
| Mobile mocks | Phone attempts are permanently unproctored; mock can disallow phones |
| Timing | Server-authoritative, including sectional timing |
| Schema workflow | Append-only migrations; no live schema writes through MCP |
| Migration safety | Expand and contract. A migration must never break the currently deployed code, because Vercel deploys on merge while migrations are applied by hand |
| Supabase plans | Free during build, Pro before handover/ARS and restore testing |
| Application hosting | Vercel Pro; Hobby is not used for the commercial application |

## Non-negotiable implementation rules

- Never expose a Supabase secret or legacy `service_role` key to browser code.
- Enforce user-data access with RLS, including write policies.
- Protect Storage objects with Storage policies; table RLS does not protect files.
- Every question requires section, topic, difficulty, and marks metadata.
- Store all time columns as `timestamptz`.
- Use the Supabase transaction pooler for direct Postgres connections and disable
  named prepared statements in transaction mode.
- No media bytes pass through the application server.
- Heavy operations must be asynchronous, idempotent, and auditable.
- Every committed migration must be sufficient to recreate the database.
- Migrations are additive and must not break the code already deployed. Drops
  and renames happen in a later release, once nothing reads the old thing. See
  `docs/implementation-plan.md`.
- `src/shared/db/types.ts` is generated from the database and never hand-edited.

## Current repository state

- Repository: `C:\Cospire\Cospire`.
- **The question bank merged on 2026-09-23 as `1c7073d`** (PR #49), squashed
  from `feat/question-bank` with all four checks green. Every earlier pull
  request is merged or closed. The docs split (PR #54) is the only pull
  request still to land.
  PR #35 was **closed as
  superseded** -- it corrected this file on 2026-09-20 and was overtaken by
  #36-#42, so its corrections were restated against current `main` instead of
  resolved through a stale conflict.
- **Everything through PR #48 is merged and deployed.** The run of 2026-09-20
  and 21, in order: **#36** private multi-file ARS uploads, **#38** the mentor
  review workflow, **#40** the report-template document importer, **#42** the
  first separation of Programmes and ARS administration, **#43** the Phase 5a
  exit gate, **#44** `courses.kind` and the real separation, **#45** deleting
  the duplicated ARS routes #42 left behind, **#46** loading states and pending
  buttons. PR #48 makes ARS report-component round links manual. Each feature
  has a documentation follow-up where the context gate required one (#37, #39,
  #41).
- **The hosted project is 7 migrations ahead of `main`**: 19 on `main`, 26
  applied, the extra seven being the question bank's, on
  `feat/question-bank` and applied 2026-09-21. They are additive and nothing
  deployed reads them, so this is safe (see *Migration safety*). `main` and
  the database come back into step when that branch merges.
- Two things worth keeping from the earlier merge history, because both cost
  time. **Do not delete the base branch of a stacked pull request**: merging #24
  with `--delete-branch` closed #25 rather than retargeting it, and reopening
  needed that branch pushed back before the base could move. And **the context
  gate fails on `main` for any pull request that describes itself as open**,
  which is why each feature is followed by a commit recording its own merge.
- **PR #27 merged 2026-09-18** as `6a39649`, adding the documentation-only
  review contract in `docs/review-checklist.md`. #25 was stacked on #24's branch, so
  merging #24 with `--delete-branch` **closed** it rather than retargeting it;
  reopening needed that branch pushed back before the base could be moved to
  `main`. **Do not delete the base branch of a stacked pull request.** It was then
  rebased onto `main`, where git skipped the squashed cleanup commit as already
  applied.
- **PR #28 merged 2026-09-18** as `17cc78d` and deployed: the report migrations,
  the mentor and student screens, **admin template authoring**, pagination, and
  the fix-forward migration `20260918153000`.
- PR #36 merged as `0e0f14f` and Production deployed that commit. Its
  multi-file Storage authorization is live.
- **The context gate fails on `main` for any pull request that describes itself as
  open.** It did so for #24: the file merged saying #24 was open, which by then it
  was not. `verify` passed and only `context` failed. The fix is the follow-up
  commit that records the merge, which is what this entry is; the alternative,
  claiming a merge before it happens, would make the gate lie in the worse
  direction.
- **`origin` carries `main` and `feat/question-bank` only**, checked with
  `git ls-remote --heads origin` on 2026-09-21. The PR #35 branch is gone.
  `feat/question-bank` held the question-bank work from parts 1-4 and was
  squashed into `main` on 2026-09-23; the branch is deleted once PR #54 is
  retargeted off it.
- `main` is protected by an active ruleset: pull request required, `verify` status
  check required, branches must be up to date, force pushes and deletions blocked.
  Required approvals are deliberately `0` while the team is one person, since
  GitHub does not permit self-approval.
- The repository is **public**, by the owner's decision, to be made private after
  the project. See Repository visibility below.
- Deployed on **Vercel** at `https://cospire-roan.vercel.app`, auto-deploying from
  `main`, with a preview deployment per pull request. Currently on the **Hobby**
  plan, which does not permit commercial use; the owner has chosen to build on it
  and upgrade before handover.
- Hosted Supabase project `eeeftjwvbppznsmcljnw` (Mumbai, **Free** plan). Schema
  and auth configuration are applied. All nineteen migrations on `main` are
  present on both sides, plus the seven question bank migrations from
  `feat/question-bank`, applied 2026-09-21 ahead of merge.

### Tooling available to an agent in this repository

| Tool | State | Use it for |
|---|---|---|
| Supabase CLI | Logged in and **linked** | `npm run db:migrate` for migrations, `supabase config push` for auth settings, `npm run db:types` |
| GitHub CLI (`gh`) | Installed and **logged in as `Two19Labs`** (2026-09-18, scopes `repo`, `read:org`, `gist`). If a session reports no host, run `gh auth login` | Creating pull requests, watching CI, merging |
| Supabase MCP | Available, **read-only by policy** | Inspecting tables, advisors, logs. Never DDL; see operating manual §4.5 |
| Docker | **Unavailable** | `db:reset`, `db:lint` and `db:test` cannot run here |

Two operational notes that cost time to rediscover:

- **`gh` reads the same credentials from PowerShell and from Git Bash.** An earlier
  note here claimed the token was visible only to PowerShell; that was checked on
  2026-09-18 and is **wrong** -- both reported logged out because no login had
  completed. After `gh auth login` both see the account. `gh.exe` sits at
  `%ProgramFiles%\GitHub CLI\gh.exe`, which Git Bash must call by full path.
- **Migrations go through the CLI**, now that the project is linked. The MCP
  server is for reading. Phase 0 applied two migrations through MCP out of
  necessity and reconciled the history afterwards; that route is no longer needed.

## Active work

| Owner / chat | Branch | Scope | Owned files | Status | Last update |
|---|---|---|---|---|---|

**Nobody holds a branch as of 2026-09-25.** `feat/doc-import` merged as PR #58
(`b2a4fb8`) and its branch is deleted. Two things a new session should know
before touching anything:

- **A dev server is running on port 3000** from the main checkout
  (`C:\Cospire\Cospire`, on `main`). Leave it alone unless asked: Codex is
  reading the code and working on UI there. **Never run `npm run build` in that
  checkout while it is up** -- they share `.next`, and the build corrupts the
  running server, which then answers 500 to everything. Do your own work in a
  worktree (`scripts/wt-new.sh NAME PORT`).
- **Tell the owner at once if anything changes that you did not do** -- a file
  in the working tree, a branch, a commit, the dev server going down. They have
  remote access and can intervene, but only if it is surfaced immediately.

**The Vercel preview deployments do not work.** `/dashboard` on a preview URL
renders the application's error boundary while the same route on production
answers 307 to `/login`. The application throws exactly one error of that shape,
from `requirePublicSupabaseConfig`, so the likely cause is that
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set for
the Production environment only and not for Preview. **Unconfirmed**: nobody has
looked at the Vercel environment-variable settings yet. It matters because this
file claims every pull request gets a clickable URL, and it appears none of them
ever has -- every verification row here is either a local production build or the
deployed URL, never a preview.

## Pending

The full route is in `docs/implementation-plan.md`. **Phase numbers name scope,
not order** — the order changed on 2026-09-08. Only what is open is listed here.

### Phase 1, one step still unbuilt

Step 5, **bulk creation from a spreadsheet**, CSV only. Blocked on custom SMTP.
The exit gate closed without it on 2026-09-08; this is the remainder of the phase,
not a gate item.

### Phase 2, deferred and still blocked

Video and curriculums. **VdoCipher access has still not arrived** and nothing in
the phase can start without it. Build it in its own worktree the day access lands.
If that has not happened by the start of week four, it slips and clause 4.4
applies — flagged in writing at the time, not at the end.

### Carried over from Phase 0

None of these block Phase 5a.

| Item | Why it matters | Needs |
|---|---|---|
| **CODEOWNERS is inert** | It names two accounts that cannot access the repository, so GitHub ignores it and the review requirement on `/supabase/migrations/**` does not actually exist | The second engineer's real GitHub handle. The owner's account is `Two19Labs` |
| **Vercel on Hobby** | Hobby forbids commercial use | Upgrade before the Client is told the platform is theirs. Clause 3.8 puts the account in Cospire's name |
| **Supabase on Free** | No daily backups, 1GB Storage, pauses after seven days idle. Also gates leaked-password protection | Blocks ARS being **used** with real video essays, not built: Free's 1GB and 50MiB file limit are enough to build and test the upload path. Needed before students upload for real, and before the restore test. Clause 8.3 budgets for it |
| **Custom SMTP not configured** | The built-in sender is rate limited to 2 emails an hour and will stall bulk creation partway through a class | An SMTP account in Cospire's name plus DNS. Raise `[auth.rate_limit] email_sent` at the same time |
| **Neither pgTAP suite has ever run** | 32 assertions across two files, verified by hand against the live schema instead | A Docker-enabled machine, then `npm run db:test` |
| **Actions pinned by tag, not SHA** | A moved tag would run different code | Worth pinning before handover. CI now also warns that `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20 and are being forced onto Node 24; bumping to `@v5` clears both the warning and the pinning item in one change |
| **`site_url` points at a `vercel.app` address** | It goes into password-reset emails | Replace if a custom domain is added, then `supabase config push` |

### Pulled forward from later phases

Recorded in the implementation plan, repeated here because they are easy to lose.

1. **Run one of Cospire's real documents through the importer during Phase 1 or 2.**
   The delivery plan commits to the first fortnight. It needs no finished UI, and
   poor accuracy on their older material is a conversation to have with four weeks
   left rather than one.
2. **Historical attempts and live edits: decided 2026-09-21.** Questions stay
   editable. A past attempt's review shows the current question, and Phase 4
   rescores every attempt a key, option or marks change affects. See the
   Critical finding below.
3. **Supabase Pro immediately, and a tested restore before handover.** Pro moved
   from "before Phase 5" to "now" when ARS was brought forward. The deliverable is
   a restore tested, not enabled, and database backups exclude Storage objects.

## External blockers and client-owned steps

Every blocker recorded during Phase 0 is resolved: Supabase dashboard access, the
CLI link, the three Auth users, and a deployed URL all exist. What follows blocks
**later phases**, with the phase it stops.

| Needed | Blocks | Owner |
|---|---|---|
| **Custom SMTP** account and DNS records | Bulk student creation only, in Phase 1. Invitations and password resets generally | Cospire, clause 3.8 |
| **VdoCipher** account and API access | **All of Phase 2.** Nothing in that phase starts without it | Cospire |
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

## Repository visibility

`Two19Labs/Cospire` is **public** during the build. This was a deliberate choice by
the repository owner on 2026-08-28: branch protection and rulesets are free on
public repositories but require a paid plan on private ones, and the owner judged
the exposure acceptable for a low-traffic repository. It is to be made private
once the project completes.

What this exposes, recorded so the decision can be reviewed on its facts:

- No credentials. No keys, passwords, or connection strings are in any commit, and
  `.env.local` has never been committed. Verified before the first push and again
  afterwards.
- The Supabase project reference. Low severity: it appears in every API URL the
  browser calls once the application ships, and is not a credential. Access is
  protected by RLS and by `anon` holding no grants, both verified against the live
  API.
- The full schema and every RLS policy. The access model does not depend on
  secrecy, but publishing it does hand a reader a map of what to probe.
- **This file's commercial commentary.** The findings table below carries candid
  internal assessment of the agreement and delivery risk. It is the highest-value
  content here for anyone outside the delivery team.

Two points to revisit rather than assume:

1. **The agreement answers whether the codebase may be public, and the answer is
   no.** Checked 2026-09-12: clause 3.9 says that during the build the code "is
   held in a private repository controlled by the Developer", and clause 13.1
   lists source code among the confidential information neither party discloses.
   The agreement outranks this file, so the public setting is a deviation awaiting
   the owner's decision. Making it private means losing the free branch
   protection, or paying for it.
2. Cospire holds read access to this repository throughout the build, so the
   commercial commentary is readable by the Client regardless of visibility. That
   deserves a deliberate decision about what belongs in this file versus a
   delivery-team-only document.

## Local build gotcha, Windows

Running `npm run build` while `next start` is still serving produces a corrupt
`.next/server/middleware.js`, and every route then answers 500 with `EvalError:
Code generation from strings disallowed for this context`. The build itself
reports success, so this is invisible until a request is made.

It is a Windows file-locking artifact, not a code defect: stop the server, delete
`.next`, and rebuild. Vercel always builds clean, so it cannot occur there.
Recorded because the symptom points convincingly at the middleware and wastes
time otherwise.

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

**First, three things that are not code**, from the meetings of 2026-09-16 and
2026-09-21:

1. **The 1 October commitment.** The Client was told ARS and the mock test
   would be ready and tested "in the next 15 days", and on 2026-09-21 that the
   project is on time; the owner confirmed on 2026-09-22 that the schedule
   holds. ARS is done and deployed, and so are the question bank and the mock
   builder. **On 2026-09-23 the owner put the import work ahead of the test
   engine**, so what a student sits is now the last of the four items above.
   A tested mock engine by 1 October is the part at risk. The owner promised
   the Client on 2026-09-21 to raise any delay up front, and clause 4.4 wants
   that in writing at the time rather than at the end.
2. **Put the build-now, invoice-later arrangement in writing**, with the first
   items named: feedback, onboarding, offboarding, student journey trackers,
   the ARS report and the process importer. Clause 12 says quote first; clause
   16.1 says amendments are written. Both sides want this, so it only needs
   recording. **The same amendment should record that question import runs on
   paste-a-prompt**, with figures pasted in on review, rather than the
   automatic Google Docs image extraction clause 3.15 promises. The owner
   accepted this on 2026-09-21. Add the two items the Client raised in the
   call that day: **sub-admins**, once they define them, and **a parser for
   the mentor's report**.
3. **Send the Client access to the build**, as agreed at the end of the
   2026-09-21 call, so their team can review the flow. Their feedback clock
   starts when they have it.

**The process importer is built, verified, merged and deployed** (2026-09-20,
PR #30), together with the form engine it depends on. Two things follow from it
that are not code:

- **It is a clause 12 conversation, like the report.** The founder agreed the
  paste-a-prompt mechanism on 2026-09-16 for *question* import. Pointing it at
  whole ARS processes is more than Annexure A's words and was built on the
  owner's instruction of 2026-09-20 for a client review the same evening. The
  quotation and the clause 16.1 written amendment are outstanding, and are not
  settled by having built it.
- **Tell the Client what it does not do.** It reads what a model gives it. It
  never invents a date, and it will not deliver an aptitude test, because the
  test engine is unbuilt -- those rounds arrive as placeholders carrying their
  specification. Both are visible in the preview, and both are better said than
  discovered in front of a college.

**Phase 5a is complete.** Its exit gate closed on 2026-09-20, **28 of 28 against
the deployed URL**, and the draft/save path that previously lacked a
browser-level harness is inside it. Nothing in the phase is outstanding.

**Programmes and ARS are separated** (2026-09-20, PR #44/#45) and **every
signed-in screen has a loading state** (2026-09-21, PR #46). Both are deployed
and verified against the deployed URL.

### What to build next, in the order it should be taken

**Order changed by the owner on 2026-09-23: the import work comes before the
test engine.** Question import and mock assembly are what the Client can use
immediately on the material they already have; the test engine is the larger
build and now follows them. The 1 October commitment covers a tested mock
engine, so this order makes the written revision under clause 4.4 more likely
to be needed, not less -- see *Next recommended action*, item 1.

**1. Word upload: pictures out, numbered markers in. BUILT on
`feat/doc-import`, 2026-09-23, verified 25/25 locally, not yet merged or
deployed.** No model call, so it
works whatever the Client decides about cost. The admin uploads a `.docx`; the
platform opens it (a zip), extracts each image in document order into the
existing `question-images` bucket, and produces the paper's text with
`[[figure:N]]` where each image sat. The admin copies that text into any model
with the existing prompt, pastes the JSON back, and the platform resolves each
marker to image N before the usual review and approval. Word tables become text
tables. Flagged rather than guessed: an image inside an answer option, EMF/WMF
drawings Word stores as vector art, and native Word charts.
**Dependency: `fflate` 0.8.2, approved by the owner 2026-09-23 and now in
`package.json`** -- Node cannot
open a zip on its own, and a hand-written zip reader is the kind of code that
works on one file and fails on the next. `@google/genai` was **declined in
favour of plain `fetch`**, which was proven against the live key on 2026-09-23.

**2. The Gemini path: three steps instead of six. BUILT on `feat/doc-import`,
2026-09-23. The Client has agreed the cost, per the owner. The live round trip
is still UNVERIFIED because Gemini answered 503 throughout the session.** The platform sends the
prepared text to Gemini itself and places the images, so the admin uploads,
reviews and approves. Everything technical is in hand: the key works, returns
schema-valid JSON, and is on the paid tier. Two things to settle first, neither
of them code: the Client's agreement to the cost (about Rs 5 a paper, billed to
their own Google account -- the drafted question still quotes Claude and Rs 20
and needs redrafting before it is sent), and thinking turned low or off in the
call, because thinking tokens bill as output. Details, limits and routing are
under *Question import with pictures* below.

**3. Mocks built from documents that quote question IDs.** Readable IDs
(`Q00042`, computed from `questions.id`, no migration), copyable ID lists on
the bank and at the end of an import, and a plain-text mock template parsed
directly -- no model, because an ID must match exactly -- which resolves to the
existing `save_mock`. Full design under *Question IDs and mock documents:
designed 2026-09-22* in `docs/context/meetings.md`.

**4. The test engine (Phase 4)**, with everything operating manual §1 insists
on: the server-authoritative timer, per-question-type negative marking, the
phone attempt permanently marked unproctored, warn-and-log proctoring, and
auto-submit of expired attempts through Vercel Cron. Two things the question
bank has already fixed for it:
- A student reads a question only through an attempt; `questions` and
  `question_keys` have no student policy today.
- Keys become readable only after the student's own attempt is submitted. Any
  change to a key, option set or marks value must rescore affected attempts
  and write `rescore_events`, because questions stay editable.
Then **attach a mock to the ARS aptitude round**, replacing the
`pendingFeature: "test-engine"` placeholder.

**5. Run Cospire's real question documents through the importer** as soon as
they supply them, and settle the model choice with the accuracy test described
below rather than on price.

**6. Video and curriculums (Phase 2)**, the day VdoCipher access arrives, in its
own worktree. If it has not arrived by the start of week four it slips and
clause 4.4 applies -- notified in writing at the time, not at the end.

**7. Phase 1 step 5**, bulk CSV student creation, still blocked on custom SMTP.

### Smaller things, none of them blocking

- **The owner should decide where "Ashoka" belongs.** The `kind` backfill filed
  it as an ARS process because it holds one round called "ARS Template". If it
  is really aptitude-prep content, one click on its ARS page moves it back.
- **The per-screen re-skin of the remaining panels.** The shell, the ARS form
  and the loading states are done; the panels inside the admin and mentor
  screens have not been gone through one by one. Start with the mentor report
  screen, whose layout the owner called broken in the 2026-09-21 demo.
- **From the 2026-09-21 call, all small, none built yet:**
  - a full-screen mode for the document viewer
  - the watermark as one small mark in the bottom left of each page, in place
    of the rotated tiling
  - a landscape PDF opened in the viewer to check how it fits

  See *The walkthrough call, 2026-09-21* (`docs/context/meetings.md`).
- **`src/shared/ui/submit-button.tsx` is new and shared**, which operating
  manual §6.1 makes a human's call. It is used by 34 buttons across 16 files.
  Flagged in PR #46 rather than assumed; confirm or move it.
- **Vercel Pro.** It is owed for the commercial-use clause and it is also the
  only thing that will move the 1.3-second page times, which are cold starts on
  the Hobby tier rather than anything in this repository. See *Where the 1.3
  seconds actually goes*.

**The review contract is merged** (2026-09-18, `6a39649`), so `docs/review-checklist.md`
is on `main` and is what a reviewer works from.

**Put the MESA question-type fork to the Client.** Their benchmark process puts
email writing and a video essay inside one timed test; Annexure A fixes the four
question types to automatically scored ones. Either the writing becomes its own
round, which costs nothing, or extending the engine is quoted under clause 12.

Owed by the Client, to chase rather than work around:

1. **VdoCipher access -- all of Phase 2.** Week 3 is burning. Notify in writing
   now. Cite clause 4.4 (delivery extends day for day) and clause 4.2: the
   Kickoff Date is the latest of signature, advance and the Client providing the
   clause 6 access. Clause 6.4 sets no deadline for opening accounts, so 4.4 on
   its own is arguable.
2. **Supabase Pro**, before ARS is used with real video essays and before the
   restore test.
3. **Custom SMTP**, for bulk CSV creation (Phase 1 step 5), raising
   `[auth.rate_limit] email_sent` at the same time.
4. **Recoleta Bold `.woff2` and its web licence.** Headings use Georgia until then.
5. **The written list of programmes**, and **what "ARS" stands for**.
6. **The written Kickoff Date.** The copy of the agreement in `../Context/` has
   the Client's signature date blank; file the countersigned copy if one exists.
7. **From the 2026-09-21 call:** two or three sample documents of each of the
   five content kinds, their question lists for mocks, a definition of
   sub-admin permissions, and one consolidated list of flow feedback.

Owner decisions:

1. **Repository visibility against clause 3.9.** See *Repository visibility*.
2. **Tell Cospire what the document watermark does and does not stop**: a saved
   page image is watermarked, but the signed URL can be read from the page source
   to fetch the clean PDF within its ten minutes.
3. **The leftover audit organisation**, which can only be removed by a migration
   or a manual dashboard deletion.
4. **Correct the parent operating manual.** `../CLAUDE.md` omits `profiles.status`
   and does not note that `documents.id` must be `bigint`. The owner's file,
   outside git.

Carried from Phase 0, none of it blocking:

1. **Fix CODEOWNERS.** Needs the second engineer's GitHub handle. Both engineers
   currently commit as one shared account, so no review is enforceable.
2. **Vercel Hobby to Pro**, before the Client is told this is their platform.
3. **Run the pgTAP suites** on a Docker-enabled machine; neither has ever run.
4. **Replace `site_url`** if a custom domain replaces the `vercel.app` address.
5. **Pin Actions**, bumping `checkout` and `setup-node` to `@v5`.

The route through the rest of the build is in `docs/implementation-plan.md`.
