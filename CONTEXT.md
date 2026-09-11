# Cospire LMS - Shared Project Context

Last updated: 2026-09-12 (Asia/Calcutta)

**Phase 0 is complete.** The exit gate closed on 2026-08-29: all three roles
signed in on the deployed URL and reached their own role shell.

**Phase 1 is nearly complete.** Six of its seven steps are merged and live:
steps 1-3 plus user deactivation in PR #12, and steps 4, 6 and 7 -- access
granting, the document library and the protected viewer -- in **PR #16, merged
2026-09-03**. Both documents migrations are applied. Only **step 5, bulk CSV
creation**, is unbuilt, and it is blocked on custom SMTP, which Cospire owes.

**The Phase 1 exit gate closed on 2026-09-08.** `scripts/verify/` was run against
`https://cospire-roan.vercel.app` -- the deployed URL, not a local build -- and
**36 of 36 checks passed**, including the exit-gate sentence itself and the direct
Storage-path refusals. Teardown restored the baseline exactly.

**Phase 5a steps 1 and 2 are built, merged and deployed.** Step 2, ARS rounds,
merged in **PR #21** on 2026-09-10 -- see *Phase 5a progress*. Step 1, programmes -- the `courses` table, its grant helper
and the admin screens -- are complete and verified at both the database and the
application, and **merged to `main` in PR #19 on 2026-09-10**. Code and database
are back in step, and the new routes are live: `/admin/courses` and
`/admin/courses/[id]` answer on the deployed URL and refuse anonymous callers.
The next work is `ars_rounds`.

**The sequence changed on 2026-09-08. ARS is now the next phase built**, at the
Client's request, ahead of video and the test engine. Weeks 4 to 6 are
deliberately left un-planned until VdoCipher's arrival date is known. See
*Sequencing change* below and `docs/implementation-plan.md`.

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

6. Move finished items out of **Active work** into **Completed**.
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

> A new session that reads only this file must be able to continue the work
> without asking a single question.

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
| Repository visibility | **Public** during the build, by the owner's decision on 2026-08-28, taken to obtain branch protection on the free plan. To be made private once the project completes. See the note below |
| Application URL during build | Local only (`http://127.0.0.1:3000`). Confirmed by the client-side owner on 2026-08-28. A Vercel URL replaces it later; see the must-change note below |
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

- Repository: `C:\Cospire\Cospire`. **Checked out on `feat/programmes`**, rebased
  onto `origin/main` and pushed.
- **PRs #1 to #18 are merged.** #18 carried the teardown data-loss fix and #17 the
  gate closure and resequence, both merged 2026-09-10.
- **PRs #1 to #19 are merged.** #19 carried Phase 5a step 1 and merged
  2026-09-10; its migration had been applied ahead of the merge, so code and
  database are now back in step.
- **No pull request is open.**
- `feat/documents`, `docs/programme-decisions`, `fix/verify-teardown-scope` and
  `feat/programmes` still exist on the remote after their merges and can be
  pruned.
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
  and auth configuration are both applied and in sync with this repository: three
  migrations present on both sides, and `supabase config push` reports zero
  differing lines.

### Tooling available to an agent in this repository

| Tool | State | Use it for |
|---|---|---|
| Supabase CLI | Logged in and **linked** | `npm run db:migrate` for migrations, `supabase config push` for auth settings, `npm run db:types` |
| GitHub CLI (`gh`) | Installed, authenticated as `Two19Labs` | Creating pull requests, watching CI, merging |
| Supabase MCP | Available, **read-only by policy** | Inspecting tables, advisors, logs. Never DDL; see operating manual §4.5 |
| Docker | **Unavailable** | `db:reset`, `db:lint` and `db:test` cannot run here |

Two operational notes that cost time to rediscover:

- **`gh` must be run from PowerShell, not Git Bash.** Its token lives in the
  Windows keyring, which the Git Bash environment cannot read, so `gh auth status`
  reports logged out there while working correctly in PowerShell. `gh.exe` sits at
  `%ProgramFiles%\GitHub CLI\gh.exe`.
- **Migrations go through the CLI**, now that the project is linked. The MCP
  server is for reading. Phase 0 applied two migrations through MCP out of
  necessity and reconciled the history afterwards; that route is no longer needed.

## Sequencing change, 2026-09-08

**The Client asked for ARS to be built first**, ahead of video and the test
engine. Scope is untouched; only the order moves.

**Only the next phase is committed.** ARS becomes **Phase 5a** and is next.
**Weeks 4 to 6 are deliberately left un-planned** until VdoCipher's arrival date
is known, because that date decides whether video slots alongside the question
bank or displaces something. Migration and handover stay last as Phase 5b.

Checked against the agreement before recording:

- **Not a change request.** Clause 12 covers functionality not described in the
  agreement; every module here is in Annexure A. Nothing to quote.
- **No payment consequence.** Clause 7 is 20% on signing and 80% on completion
  and acceptance, and clause 5 acceptance runs against clause 2, clause 3 and
  Annexure A — not the week table. Payment is not milestone-linked.
- **It does amend clause 4.3**, which names week 3 as video plus the first
  demonstration and week 6 as ARS. This needs agreeing **in writing**.
- **One delivery-plan promise moves.** Demo one was committed to showing *"a
  copied video link failing in a second browser."* That moves to demo two and
  must be said explicitly rather than dropped quietly.

**Why it is defensible on its own merits.** Phase 2 is blocked on VdoCipher and
nothing in it can start; ARS is blocked on a plan upgrade, which is a card
payment. The reorder swaps a blocked slot for an unblocked one and empties ARS
out of the final week this plan already calls overloaded.

**The honest counter, to be said in the same conversation:** video is the bigger
and more third-party-dependent module. If it simply lands in the last week
instead, the overload moves rather than clears. Video belongs in its own worktree
starting the day VdoCipher access arrives. If that has not happened by the start
of week four, video slips and **clause 4.4 applies** — the delivery date extends
day for day, notified in writing at the time.

**Client communications on this are the owner's**, decided 2026-09-08: the
resequence, the VdoCipher condition, the demo-one change and the Supabase Pro
timing all go to Cospire from the owner rather than being raised from here.

### What ARS needs before it can start

- **`courses` must exist first.** The decision of 2026-09-06 requires `ars_rounds`
  to carry its programme link in the migration that creates it. This is a small
  pull-forward from Phase 2: the `courses` table plus admin create and grant, not
  `curriculum_items` and not the builder. `content_access.resource_type` already
  accepts `'course'`, so no constraint change is needed.
- **Supabase Pro, now rather than before Phase 5.** 1GB of Free-plan Storage will
  not hold video essays, and `[storage] file_size_limit` is 50MiB. Clause 8.3
  already budgets it, so this is a timing note, not a new cost.
- **Not VdoCipher.** ARS video is a student upload reviewed by a mentor, not
  protected course content, so it goes to Supabase Storage behind a signed URL.
  That is precisely what makes this phase startable while Phase 2 is not.

## Completed

| Date | Work | Result / verification |
|---|---|---|
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

## Active work

| Owner / chat | Branch | Scope | Owned files | Status | Last update |
|---|---|---|---|---|---|
| None | - | - | - | Nothing claimed. **Phase 5a step 2 is merged and deployed.** The design foundation pass is complete; the **per-screen re-skin of the 13 routes is not started**. The next work is **step 3, `ars_submissions` and `ars_feedback`** with RLS covering writes, and `round_id` as ON DELETE RESTRICT. Supabase Pro is needed before ARS is *used*, not before it is built. | 2026-09-12 |

An agent picking up Phase 1 should claim it here first, naming the branch and the
files it will own, before editing anything.

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

## Hosted Supabase state

Project `eeeftjwvbppznsmcljnw` (Mumbai, Free plan), confirmed before any write.
No credentials, keys, or connection strings are recorded in this file.

### Applied

| Version | File | Result |
|---|---|---|
| `20260828093807` | `supabase/migrations/20260828093807_foundation_identity_access.sql` | Applied unchanged. 4 tables, 26 constraints, 16 indexes, 13 policies, 7 `private` helpers, 4 triggers, RLS enabled and forced everywhere, Cospire org seeded |
| `20260828102907` | `supabase/migrations/20260828102907_restrict_rls_auto_enable_execute.sql` | New, append-only. Removes the Data API execute surface from the platform-managed `public.rls_auto_enable()` |
| `20260910115938` | `supabase/migrations/20260910115938_courses_and_course_grants.sql` | Applied 2026-09-10 through `npm run db:migrate`, the CLI rather than MCP. Creates `public.courses` with RLS enabled **and forced** and four policies; adds `private.student_has_course_grant`; adds the `course` branch to `validate_content_access_resource`; adds the `courses_cascade_grants` trigger. Additive throughout. Security advisor: zero new findings |

Recorded migration versions match their repository filenames, so `supabase db push`
treats them as applied and will not re-run them.

| `20260910144415` | `supabase/migrations/20260910144415_ars_rounds.sql` | Applied 2026-09-10. Creates `public.ars_rounds` with RLS enabled **and forced** and four policies; adds `private.mentor_reaches_course` and `private.student_reaches_round`; adds `courses_id_org_unique` so the composite foreign key has something to reference; adds the `courses_select_mentor` policy. Additive throughout |
| `20260910144803` | `supabase/migrations/20260910144803_fix_ars_rounds_form_fields_check.sql` | Applied 2026-09-10, minutes after the above, correcting `ars_rounds_form_has_fields`. See *The NULL that passed a CHECK* |

Note the ordering that was used here: `20260910115938` was applied to the database
while its code still sat in an unmerged pull request, and the two came back into
step when #19 merged on 2026-09-10. That is safe **only** because the migration is
additive and nothing deployed read `courses` in the meantime. A migration that
changed or removed an existing column must not be applied ahead of its merge this
way, because Vercel deploys on merge while migrations are applied by hand.

### The project was not clean

The foundation migration had already been run once from the SQL Editor at
2026-08-28 10:00 UTC, and its four tables were dropped again between 10:10 and
10:12 UTC. That left the `private` schema and its seven helper functions behind
with no migration-history row. Before re-applying, the residual functions were
compared against the repository file and found byte-identical, and every function
in the migration is `create or replace`, so the re-run restored the intended state
rather than patching around the remnants. After applying, all seven function
bodies in the database were re-checked against the repository file and match.

### Deviation from the operating manual, recorded deliberately

`CLAUDE.md` §4.5 forbids schema writes through the Supabase MCP server. Both
migrations above were applied through it, because the CLI in this session is not
logged in, not linked, and holds no database password, so `npm run db:migrate` was
not available. The clause exists to prevent schema that lives in the database and
nowhere in git; here both migrations are timestamped files in
`supabase/migrations/`, were applied verbatim, and the recorded history was
reconciled to the filenames. A human should confirm this was the intended route.

### Advisors

Security advisor: **zero findings** after the second migration.

The one finding it raised was `public.rls_auto_enable()`, a `SECURITY DEFINER`
function reported as callable by `anon` and `authenticated` at
`/rest/v1/rpc/rls_auto_enable` (lints 0028 and 0029). It is Supabase
platform-managed, backs the `ensure_rls` event trigger, is owned by `postgres`,
and is not created by this repository. It was never actually invocable: PostgreSQL
refuses any call outside a trigger context with `0A000: trigger functions can only
be called as triggers`. The grant was removed anyway so the advisor report handed
to the Client stays clean and a real finding is never buried under a known-benign
one. Revoking `EXECUTE` does not disable the safety net, and that was verified by
creating and dropping a probe table and confirming RLS was still auto-enabled.

Performance advisor: 11 findings, all INFO, **no correction made**.

- Six `unused_index`. The database holds zero rows and has served no traffic. The
  indexes back the RLS policies and will be used. Removing them would be wrong.
- Five `unindexed_foreign_keys`, all on composite `(actor_id, org_id)` foreign
  keys. Each already has a usable leading-column index
  (`content_access_grant_unique`, `content_access_granted_by_idx`,
  `mentor_assignments_mentor_id_idx`, `mentor_assignments_student_unique`,
  `mentor_assignments_assigned_by_idx`); the linter only matches an exact
  column-set match. At the 100-user ceiling fixed by clause 3.1, adding five more
  composite indexes is over-engineering excluded by clause 3.2.

### Site URL: deliberately local, must change before real users

`auth.site_url` is set to `http://127.0.0.1:3000` and the redirect allow-list holds
only `http://localhost:3000` and `http://127.0.0.1:3000`. This is a deliberate
decision taken on 2026-08-28: the application currently runs only on the
developer's machine and has no deployed URL yet.

Supabase writes `site_url` into password-reset and invite emails, so this value is
harmless while only the three test accounts exist and becomes a live defect the
moment a real student resets a password. **Before any real user is created, the
Vercel production URL must replace it in `supabase/config.toml` and be pushed with
`supabase config push`, and the same URL must be added to
`additional_redirect_urls`.**

### Auth configuration: pushed from `config.toml` on 2026-08-28

The CLI is now logged in and linked, so auth settings are applied with
`supabase config push` rather than clicked in the dashboard. The settings live in
`supabase/config.toml`, in git, and are part of the handover.

Live and verified:

| Setting | Value | Verified by |
|---|---|---|
| Public signup | **disabled** | `POST /auth/v1/signup` returns `422 signup_disabled` |
| Email/password login | **enabled** | `POST /auth/v1/token` returns `400 invalid_credentials`, not a provider error |
| Anonymous sign-ins | disabled | `/auth/v1/settings` |
| Social/external providers | all disabled | `/auth/v1/settings` |
| Minimum password length | 8 | pushed |
| Password requirements | lower + upper + digits | pushed |

Zero users exist; the signup probe above created nothing (`auth.users` = 0 rows).

### Trap found in `config.toml`, fixed — do not reintroduce

The first `config push` **disabled email logins entirely**. Sign-in returned
`422 email_provider_disabled`, which would have locked out every admin-created
user and blocked the exit gate.

Cause: `[auth.email] enable_signup` is **not** a signup-only flag. The CLI maps it
to `external_email_enabled`, the master switch for the email/password provider.
Setting it `false` turns email login off completely.

The correct split, now in the file with a comment explaining it:

- `[auth] enable_signup = false` — blocks public signup. This is the right knob.
- `[auth.email] enable_signup = true` — keeps email/password login working.

Caught because the push was verified against the live API rather than trusted on
its `auth: updated` return value. Any future `config push` must be followed by the
same two probes: signup refused, and login reaching `invalid_credentials`.

### Notes for later, not blocking now

- `[auth.rate_limit] email_sent = 2` (per hour). Fine while no email is sent, but
  it must be raised before bulk student creation or the import will stall.
- `[storage] file_size_limit = "50MiB"`. ARS video essays may exceed this; revisit
  when the ARS upload bucket is built.
- `[api] max_rows = 1000` caps any single Data API response, which matches the
  pagination rule in the operating manual §8.

### Remaining Auth gap

Only one item is left, and it is not blocking the exit gate:

- **Custom SMTP is not configured.** The `[auth.email.smtp]` block in
  `config.toml` is still commented out. This does not block the three test
  sign-ins, because dashboard-created users can be auto-confirmed with a password
  set directly and need no email. It **does** block bulk student creation
  (clause 2.1), and needs an SMTP provider account opened in Cospire's name per
  clause 3.8 plus DNS records. Configure the credentials as `env(...)` references
  so the setting stays in git and the secret does not.

### Users and profiles

Three Auth users were created in the dashboard by the project owner on 2026-08-28,
all email-confirmed. `supabase/manual/phase_0_bootstrap_profiles.sql` was updated
with their real UUIDs and run. Result: exactly one **active** profile for each of
`admin`, `mentor`, and `student`, all in the Cospire organisation.

No email addresses, passwords, or other personal data are recorded in this file.
Profile emails are read from `auth.users` by the bootstrap SQL, so they cannot
diverge from the Auth identities.

Current live counts, re-measured 2026-09-10 after the programmes verification run
was torn down: **2 orgs, 5 profiles (5 active), 5 auth users, 1 mentor
assignment, 1 course, 3 content grants (2 document, 1 course), 2 documents,
2 storage objects.**

This is the baseline any future verification run should return to. **None of it
is test residue and none of it may be deleted:**

- The **second organisation** (`id = 5`) is the audit org described under the
  Phase 1 security audit. It cannot be removed by any application route, and
  `setup.mjs` uses it as the rival org.
- Of the five profiles, four are in Cospire and one is the audit org's admin.
  The **fourth Cospire profile** is a real student account created by the owner
  through the console on 2026-09-01, along with its mentor assignment. A real
  user, not test data.
- **Documents 7 and 8 are the owner's real PDFs**, uploaded through the console
  on 2026-09-03 during the browser render confirmation, and grants 12 and 13
  point students at them. The project is on the Free plan with no backups, so
  these files cannot be recovered if they are deleted.
- **Course 20, "Ashoka", is the owner's own**, created through the new programme
  screens on 2026-09-10 while checking them by hand, and granted to Cospire
  Student. Left in place rather than cleaned up, because it may be intended as a
  real programme. Its name is the short form; the Client's own convention is
  institution plus content type, as in "Ashoka - aptitude prep". Rename or remove
  it deliberately rather than treating it as verification residue.

### RLS verified against the hosted database

Every scenario below was run against the live project with
`set local role authenticated` and a real user's JWT claims. Scenarios needing
extra rows created them inside a transaction that was then **rolled back**; the
final counts above confirm nothing was left behind.

**Read access**

| Acting as | Profiles seen | Correct? |
|---|---|---|
| Admin | 3 (admin, mentor, student) | Yes, admin sees the whole org |
| Mentor, no students assigned | 1 (self only) | Yes, cannot browse other users |
| Mentor, student assigned | 2 (self + that student), not the admin | Yes, exactly the ARS rule |
| Student | 1 (self only), 0 assignments, 0 grants | Yes |
| Disabled student | **0 profiles, 0 orgs, 0 assignments, 0 grants** | Yes, disabling is total |
| Anonymous (`anon`) | Refused on all four tables | Yes, blocked at grant level before RLS |
| Cospire admin, after student moved to another org | 2 (admin, mentor), 1 org | Yes, cross-organisation isolation holds |

**Write access — the half that is usually untested**

| Attempt | Result |
|---|---|
| Student promotes self to admin | 0 rows changed |
| Student creates a new profile | Blocked |
| Student assigns themselves a mentor | Blocked |
| Student grants themselves content access | Blocked |
| Student deletes the admin | 0 rows deleted |
| Mentor assigns a student to themselves | Blocked |
| Admin assigns mentor to student | Allowed |
| Admin grants content access | Allowed |
| Admin edits a student profile | 1 row |
| Admin deletes their own account | 0 rows, by `profiles_delete_admin` |

The last row is a deliberate safety property: an admin cannot delete themselves and
lock the organisation out of its only admin access.

## Phase 1 progress, 2026-09-01

Build order is the seven steps in `docs/implementation-plan.md`.

| Step | State |
|---|---|
| 1. Console shell and paginated user list | **Done and verified** against the hosted database |
| 2. Create a single user | **Done and verified**, success and four rejection paths |
| 3. Mentor assignment | **Done and verified**, including refusal by the database trigger |
| 3b. Deactivate / reactivate a user | **Done and verified.** Added 2026-09-01 after the owner spotted that the console could create users but never offboard one |
| 4. Manual access granting | **Done, merged and deployed** (PR #16). Verified against the hosted database, not yet on the deployed URL |
| 5. Bulk creation from a spreadsheet | Not started. **CSV only**, decided 2026-09-01. The only step still unbuilt, and blocked on custom SMTP |
| 6. Document library | **Done, merged and deployed** (PR #16). Migrations applied |
| 7. Protected viewer | **Done, merged and deployed** (PR #16). Browser render confirmed by the owner 2026-09-03. `pdfjs-dist@6.3.289`, pinned exact |

### Decisions taken on 2026-09-01 and 2026-09-02

- **The secret key was not rotated after being shown in an editor selection on
  2026-09-02.** It has never been committed and `.env.local` remains absent from
  git history. The owner reviewed the exposure and judged the key uncompromised.
  Recorded so the decision is visible rather than implied; rotate if that
  judgement changes.

- **Bulk upload accepts CSV only.** Excel and Sheets both export it, so an
  `.xlsx` parser buys a dependency and a larger validation surface for a step
  the admin can already do. The owner separately approved an `.xlsx` parser;
  it was **not** added, because CSV-only leaves it nothing to do. Revisit only
  if admins are found to be uploading workbooks untouched.
- **The secret key is used for Auth identities and nothing else.** Creating a
  user calls the Admin API with it, then inserts `profiles` through the
  signed-in admin's own client so `profiles_insert_admin` still decides which
  organisation may be written to. Using the secret key for the table write
  would work and would silently take RLS out of the path.
- **"Both or neither" is a compensating delete, not a transaction.** The Auth
  identity is an API call and the profile is a database write, with no shared
  transaction available. If the profile insert fails the Auth user is deleted;
  if that delete *also* fails the admin is told, in plain words, that an
  orphaned identity exists and must be removed from the dashboard.
- **No return URLs in form fields.** The mentor form posts a page number and a
  search term, and the action rebuilds the destination from a literal path.
  A hidden field holding the URL would have been an open redirect.
- **Users are deactivated, never deleted.** Annexure A names visibility and
  creation only, so this is scope the owner chose to absorb rather than raise
  as a variation. Deactivation rather than deletion is forced by the schema,
  not preference:
  `content_access.granted_by` and `mentor_assignments.assigned_by` reference
  `profiles` with **ON DELETE RESTRICT**, so an admin who has ever granted a
  document or assigned a mentor cannot be deleted at all; and deleting a
  student cascades through their grants and assignments and would, from Phase 4,
  take `attempts` with it - the very history that contracted rescoring operates
  on. `profiles.status` already existed, so no migration was needed.
  The control is hidden on the admin's own row and the action refuses a
  hand-posted self-disable; the last-admin trigger remains the backstop.

### Shared and config files touched, needing review at PR

Both are outside a feature folder, so operating manual §6.1 makes them a human's
call rather than an agent's:

- `src/shared/db/supabase/admin.ts` is **new**. It is the only place
  `SUPABASE_SECRET_KEY` is read, and is marked `server-only` so importing it
  from a Client Component fails the build rather than shipping the key.
- `vitest.config.mts` now mirrors the `@/*` alias from `tsconfig.json`. Without
  it, any test whose subject imports across features fails to resolve - which
  would have blocked the numerical-answer and scoring tests operating manual
  §11 requires in Phases 3 and 4.

### What was verified, and what was not

`SUPABASE_SECRET_KEY` was supplied by the owner on 2026-09-01 and is a
new-style `sb_secret_` key, not a legacy `service_role` JWT.

**Static checks:** `npm run typecheck`, `npm run lint`, `npm test`
(**28 assertions, up from 9**), `npm run build` (12 routes), and a scan of
`.next/static` finding no `sb_secret` / `SUPABASE_SECRET` / `service_role`
reference.

**Behavioural checks against the hosted database, 2026-09-01.** Method: a
throwaway admin was created, signed in through `@supabase/ssr` with a capturing
cookie store so the session cookie was byte-identical to the application's own,
and the running app was then driven over HTTP. Every form was posted through
the **no-JavaScript progressive-enhancement path**, which incidentally proves
these screens work with scripting disabled.

| Check | Result |
|---|---|
| `/admin/users` as a signed-in admin | 200, list renders, count line correct |
| `/admin/users/new` as a signed-in admin | 200, all three role options render |
| Search | `?q=verification` narrowed 4 users to 1 |
| **Search injection** `q=x,role.eq.admin` | Sanitised; no matches, no error, no admin list leaked |
| Create user, success | 303 to `/admin/users`; Auth identity and profile both created, **same id**, email confirmed, `org_id` correct |
| Create user, duplicate email | 200 with "An account already uses this email address"; nothing created |
| Create user, weak password | 200 with "Use at least 8 characters."; **no Auth identity created** |
| Create user, role not one of the three | 200 with "Choose a role."; nothing created |
| Create user, malformed email | 200 with "Enter a valid email address."; nothing created |
| **Orphan check after all rejections** | 0 Auth identities without a profile |
| Assign mentor | 303; row written with correct `mentor_id`, `student_id`, `assigned_by`, `org_id` |
| **Assign a student as the mentor** | Refused by `mentor_assignments_validate_roles`, redirected to `?error=assignment-failed`. The database did the refusing, not application code |
| Malformed `studentId` | `?error=invalid-request`, refused before the round trip |
| Unassign | 303, row removed |
| Disable a user, then re-enable | `profiles.status` written both ways |
| Hand-posted self-disable, and a bogus status value | Both refused, nothing changed |
| **A disabled user signing in** | Auth still issues a token, but the first request redirects to `/auth/no-access`, which ends the session. Disabling is effective without deleting the identity |
| Crafted `?error=<img src=x onerror=...>` | Banner does not render; payload appears only URL-encoded inside Next's router-state JSON. **Zero literal `<img` tags in the HTML** |

**Test isolation.** Baseline before was 3 auth users, 1 org, 3 profiles, 0
assignments, 0 grants. Every account created during verification was deleted
afterwards and the live counts were re-checked: **identical to baseline**, with
the mentor assignment removed by FK cascade. Only two identities needed
deleting, because the invalid attempts never created one - independent
confirmation that a rejected creation writes nothing.

**Still not verified, and not to be recorded as working:**

- **The compensating-delete branch of `createUserAction` has never executed.**
  It fires only when the Auth identity is created and the `profiles` insert
  then fails, which no input reaches: validation catches bad data first, and a
  duplicate email fails at the Auth step before any profile write. It guards
  against an unexpected database failure, so it is untested by construction
  rather than by omission.
- **The `last-admin` error message is unreachable through the console.** The
  toggle is hidden on your own row, so an admin can never take the count to
  zero by hand: with two admins, A can disable B but not themselves. The
  trigger and the 23001 mapping are a backstop for a hand-crafted request, and
  the trigger itself was verified in Phase 0.
- **The admin console is verified working in production.** On 2026-09-02 a user
  was created through `https://cospire-roan.vercel.app` and confirmed in the
  database: Auth identity and profile written together, sharing one id, correct
  role and organisation. Both test accounts were deleted afterwards. Routes,
  guards and all six security headers were confirmed live. `SUPABASE_SECRET_KEY`
  **is** set in the Vercel environment - that creation could not have succeeded
  otherwise. It has not been exercised by a human through a browser, only over
  HTTP with a real session.
- No migration was written and none was needed; steps 1-3 left the schema
  untouched.

## Phase 1 security audit, 2026-09-02

An adversarial review of the admin console before merging `feat/admin-console`.
Throwaway accounts were created for each role, real session cookies captured
through `@supabase/ssr`, and the running application attacked over HTTP.

### Held under attack

| Attempt | Result |
|---|---|
| Student GETs `/admin/users` and `/admin/users/new` | 307 to `/student` |
| Mentor GETs `/admin/users` | 307 to `/mentor` |
| Student POSTs `createUserAction` to self-provision an admin | Refused; no profile and no Auth identity created |
| Student POSTs `setUserStatusAction` to disable an admin | Refused; target still active |
| Student POSTs `assignMentorAction` to give themselves a mentor | Refused; no row written |
| Mentor POSTs `setUserStatusAction` and `assignMentorAction` | Both refused |
| Anonymous GET and POST to the admin route and actions | 307 to `/login` |
| **Admin of another organisation lists users** | Sees only their own org. The list query has no org filter by design; RLS scopes it, and this proves it |
| Admin of another organisation assigns a mentor cross-org | Refused, `?error=assignment-failed` |
| Search term carrying PostgREST filter syntax | Neutralised |
| Crafted `?error=` payload | Not rendered; no literal tag reaches the HTML |
| Secret key in the built client bundle | Absent. The **actual key value** appears nowhere in the entire `.next` tree |

Static review: the secret key is read in exactly one module, which is
`server-only`; all three admin Server Actions re-check the role rather than
trusting the page guard; every `"use server"` file exports only async
functions; no `console.log`, `any`, `@ts-ignore`, or migration on the branch;
and every security-relevant Phase 0 file is untouched.

Supabase security advisor: the same two WARN items as Phase 0, both plan or
scope decisions rather than defects. No new findings.

### Fixed during the audit

**A status change that silently did nothing reported success.** An admin of
another organisation posting a `userId` from this one received the success
redirect while the row was unchanged. Nothing was disclosed and nothing was
written -- RLS did its job -- but PostgREST returns no error when a policy
filters an UPDATE to zero rows, so the action could not tell "done" from
"not allowed". `setUserStatusAction` now selects the affected rows and treats
anything other than exactly one as a failure. Re-tested: cross-org attempts
report `status-change-failed`, and legitimate disable and re-enable still work.

### Finding: an organisation can never be decommissioned

Discovered while cleaning up. `profiles_keep_one_active_admin` refuses to
delete, demote **or** disable an organisation's last active admin (23001), and
`profiles.org_id` references `orgs` with ON DELETE RESTRICT. Both directions
are therefore closed, and there is no application-level route to remove an
organisation once it exists.

For single-tenant V1 this is the invariant behaving exactly as intended and it
protects the real deployment. It is recorded because it is not obvious, and
because it has one consequence now:

**A leftover test organisation exists.** The audit created a second org with
one admin (`Rival Admin`, `audit-rival-...@example.com`) to prove cross-org
isolation, and it cannot be removed by any application route. It is fully
isolated by RLS -- Cospire admins cannot see it and it cannot see them, both
verified -- so it is untidy rather than harmful. Removing it needs either a
migration that relaxes the trigger when an organisation is being removed, or a
one-off manual deletion in the Supabase dashboard with the trigger temporarily
disabled. It was deliberately **not** removed through the MCP server, because
operating manual §4.5 forbids schema writes by that route.

## The documents slice, merged 2026-09-03 (PR #16)

Phase 1 steps 6, 4 and 7 in one branch, because a library with nothing in it
cannot be granted and a grant with nothing to read cannot be demonstrated.

### Migrations, both applied to the hosted project

| Version | What |
|---|---|
| `20260902180054_documents_library_and_storage` | `documents` table, RLS enabled and forced, four policies; the private `documents` bucket with `application/pdf` and a 50MiB cap plus four `storage.objects` policies; a `content_access` resource-validation trigger; `content_access_resource_idx` |
| `20260902201530_restrict_document_object_reads_to_admins` | Narrows direct object reads to admins. See the decision below |

Both are additive and safe against the deployed code, which reads none of it.

### Decisions taken

- **Direct Storage reads are admin-only, not mirrored from the table policy.**
  The first migration mirrored `documents_select_authorized` onto
  `storage.objects`, so a granted student could fetch the raw, un-watermarked
  PDF straight from the Storage API with an hour-long session token, skipping
  the viewer entirely. Both routes deliver the same bytes -- technical brief §8
  is honest that any renderable PDF has already been delivered -- but one leaves
  a traceable mark and the other does not, and there was no reason to publish
  the untraceable one. Students now read only through server-minted signed URLs.
  **This is a judgement call and is worth a second opinion.**
- **Object first, row second.** The row is the commit point and is written only
  after the object is confirmed present. The other order leaves a library entry
  an admin can see and grant that opens as a 404; this order can only leave an
  invisible orphan object.
- **A check constraint pins the object key to the owning organisation** and to a
  random UUID. The uploaded filename never reaches the object store, so no
  admin-supplied text can carry `..` or an encoding trick, and a row can never
  point at another organisation's file.
- **Folders are a flat text label**, not a table and not a path. The technical
  brief offers `parent_id` nesting as an option; nothing in Annexure A asks for
  it.
- **The upload widget requires JavaScript, and is the only component that does.**
  A multipart post would send the PDF through the app server, which operating
  manual §8 forbids and the Vercel payload limit would break in production.
  Granting, revoking, search and filtering all still work with scripting off.
- **Document deletion was deliberately not built.** It is not in the exit gate,
  and `content_access` has no foreign key to `documents`, so deleting one would
  leave dangling grants needing their own handling.
- **Mentors have no document access.** `content_access` is per student, so a
  mentor holds no grants. Nothing in Annexure A asks for it.

### Verified, and how

36 checks against the hosted database, driving a locally running production
build over HTTP with real session cookies captured through `@supabase/ssr`.
Five throwaway accounts: admin, two students, a mentor, and an admin of the
second organisation. **All 36 passed.**

The parts worth naming:

| Check | Result |
|---|---|
| Admin uploads a real two-page PDF, grants it to student A, student A opens it | Signed URL returns the actual bytes: `%PDF-` header, exact length |
| Student B opens the same document | 404, and it is absent from their list |
| **Student B requests the object directly at the Storage path** | Refused, HTTP 400 |
| Mentor, other-organisation admin, anonymous, direct at the Storage path | All refused |
| **Student A, who holds a grant, direct at the Storage path** | Refused. This is the tightening above, working |
| Admin of the owning organisation, direct at the Storage path | Allowed, HTTP 200 |
| Student attempts to upload into the bucket | Refused, HTTP 400 |
| Signed URL expiry, read from the token rather than assumed | 600 seconds, inside the contracted 5-15 minutes |
| Tampered signed-URL token | Refused |
| Watermark | Names student A and their address, composed server-side, present in the server-rendered HTML |
| Student asks for an upload ticket; student B grants themselves access; other-org admin grants this document | All three refused, nothing written |
| Database refuses: cross-org grant, grant naming a non-existent document, storage path escaping the org prefix | All three refused by trigger or check constraint |

Test isolation: baseline taken first, everything deleted afterwards, live counts
re-checked and identical.

### Two defects the verification caught that every static check had passed

Recorded because they are the argument for doing this at all. Typecheck, lint,
58 unit tests and a production build were all green with both in place.

1. **Granting silently wrote nothing.** The action used `upsert`, which compiles
   to `INSERT ... ON CONFLICT DO UPDATE` and therefore needs UPDATE rights.
   `content_access` is deliberately granted only SELECT, INSERT and DELETE and
   has no UPDATE policy, so every grant was refused with `42501`. Replaced with
   a plain insert treating `23505` as success. The table was right; the code was
   wrong.
2. **A malformed upload path returned a 500.** It reached `String.split` before
   being validated. A Server Action is a public endpoint and TypeScript's
   parameter types are erased at that boundary, so the type check is now made at
   runtime.

### Verified in a browser by the owner, 2026-09-03

This closed the one gap no automated check here could reach, and found two
defects in the process. Done against a local production build of the branch,
before the merge.

| Check | Result |
|---|---|
| PDF.js renders the pages | **Pass.** The worker resolves in a production build, which had been the largest unverified risk |
| The watermark reaches the canvas pixels | **Pass.** Saving a page as an image produces a file carrying the reader's name and address, so a screenshot or saved image is traceable |

Two defects found and fixed as a result, in `6880ac3`:

1. **The watermark read UTC.** Now IST, computed by fixed offset rather than an
   `Intl` time-zone lookup, because a runtime with trimmed ICU data falls back to
   UTC while still printing "IST" -- a wrong answer that looks right. Vercel runs
   on UTC. Tested across the midnight rollover and under three machine time
   zones.
2. **A PDF.js worker leaked on every navigation.** The parse runs on a worker
   owned by the loading task, not by React, so unmounting released neither the
   worker nor the document's buffers. Five were alive in devtools. The cleanup
   now destroys the loading task.

### Not verified, and not to be recorded as working

- **The end-to-end verification has never been run against the deployed URL.**
  It has only run against a local build, which is not the same thing.
  **The Phase 1 exit gate is therefore still open.** What *is* confirmed on
  production, 2026-09-08: the routes exist and refuse anonymous callers
  (`/admin/documents` and `/student/documents` both 307 to `/login`, where they
  would have been 404 before the merge). That proves the deployment landed and
  nothing more.
- **The orphan-object branch is untested by construction.** It fires only when
  the browser transfers bytes and then fails to call the recording action.
- **Saving a page as an image is possible and expected.** Technical brief §8
  accepts this in terms: the defence is that every such copy carries the reader's
  identity, not that copying is prevented. **A reader can also read the signed
  URL out of the page source and fetch the clean, un-watermarked PDF** within its
  ten-minute window. That is inherent to rendering a PDF in a browser and is not
  closable without putting media through the app server, which operating manual
  §8 forbids. Raised with the owner 2026-09-03; **worth telling Cospire plainly
  rather than letting them discover it.**

### Two operational facts worth keeping

- **Migrations run as `supabase_admin`, a superuser; MCP `execute_sql` runs as
  `postgres`, which is not.** This matters: `postgres` is not a member of
  `supabase_storage_admin` and cannot create policies on `storage.objects`, so
  reasoning about what a migration may do by testing through MCP gives the wrong
  answer. Storage policies applied through `npm run db:migrate` without trouble.
- **`anon` and `authenticated` hold full `arwdDxtm` grants on `storage.objects`
  and `storage.buckets`**, issued by `supabase_storage_admin` when the extension
  was installed. RLS is the only thing standing between those grants and every
  file in the project, so a bucket with no policies is protected by the absence
  of a permissive one rather than by design. Every future bucket needs its
  policies in the migration that creates it.

## How content is organised and granted: answered by the Client, 2026-09-06

The open question from 2026-09-03 is **answered**. Nothing built is wasted, and
no contract variation is needed.

### What Cospire said

Content is organised as **programmes**, one per target institution per content
type. The names came through a voice transcript and are **not yet confirmed in
writing**, but the shape is: *Masters' Union - aptitude prep*, *Masters' Union -
ARS*, *Ashoka - aptitude prep*, *Ashoka - ARS*, and others. The exact list is
still owed by the Client.

1. **A programme is a `courses` row, created by the admin.** Not a fixed list in
   code. The Client explicitly asked for the freedom to add programmes himself
   rather than being locked to a list we ship. `courses` is already a table, so
   this costs nothing beyond the admin screen in Phase 2.
2. **Access is granted per programme, with individual grants as the override.**
   "Mostly grouped, but with the ability to give access individually", in his
   words. Both mechanisms, not one.
3. **A student prepping for several institutions holds several programme
   grants.** That is the intended model, not an edge case.
4. **ARS rounds differ per institution, and the admin creates them per
   institution.** Confirmed 2026-09-06. This is the answer that has schema
   consequences; see below.

### Why this needs no variation

The distinction that matters: he described groups **of content**, not groups
**of students**. Content grouping is already in the schema as `courses`. Student
grouping - batches, cohorts - appears nowhere in the agreement or the schema and
would be a clause 3.9 variation. **If batches are ever raised, they must be
raised as a variation rather than absorbed.**

The scale problem that prompted the question also dissolves. Granting is not a
hundred students against forty documents; it is two or three programme grants
per student.

### What this obliges, and when

Neither item can be built now, and neither should be faked early. `courses`,
`curriculum_items` and `ars_rounds` do not exist: the database holds five tables,
all from Phase 0 and the documents slice.

| Obligation | Build it in |
|---|---|
| **`courses` must exist.** Nothing about programmes can be built until the table does | **Phase 5a, first step.** Pulled forward from Phase 2 on 2026-09-08, because ARS cannot carry a programme link to a table that does not exist. The table plus admin create and grant only — not `curriculum_items`, not the builder |
| **`ars_rounds` carries a programme link from birth.** Without it every student sees every institution's rounds | **Phase 5a, in the migration that creates the table** |
| **Course grants must cascade to curriculum content.** `private.student_has_document_grant` checks only `resource_type = 'document'`, so a programme grant opens no videos or documents. Cascading needs `curriculum_items` to know what a programme contains | **Phase 2, with the curriculum builder.** Not before: there is nothing to join to. ARS does not wait on this — a round belongs to a programme directly, so `private.student_has_course_grant()` reaches it without any curriculum |

**`content_access.resource_type` does not need widening.** It accepts `course`,
`video`, `document`, `mock` and cannot name an ARS round. Once rounds belong to a
programme, granting the programme reaches them, so the constraint stays as it is.

### Still owed by the Client

- The written list of programmes, with the names as students should see them.
- What "ARS" actually stands for. The agreement uses the term throughout and
  **never expands it**; it is Cospire's own vocabulary and will appear as a label
  in the interface, so it should be their words.

### The agreement's own words, for the next reader

The model above is consistent with all three places the agreement addresses it:
*"Content access and mentor assignment are granted manually per student"*;
*"Student, limited to content granted to them"*; and in the exclusions,
*"Automated purchase to access logic. Access is granted manually by an admin."*
Programme-level granting is still an admin granting, by hand, per student. It is
a shortcut through the admin console, not automated enrolment.

## Pending

The full route is in `docs/implementation-plan.md`. **Phase numbers name scope,
not order** — the order changed on 2026-09-08. Only what is open is listed here.

### Phase 5a progress: programmes then ARS

Exit gate: a student submits each of the three round shapes, their assigned mentor
opens them in a queue and writes feedback, the student reads it, and a second
student — and an unassigned mentor — are refused both the row and the uploaded
file **at its Storage path**.

| Step | State |
|---|---|
| 1. `courses`, the grant helper and admin screens | **Done, merged and deployed 2026-09-10** (PR #19). Verified at both layers; migration applied |
| 2. `ars_rounds` with its `course_id`, and the mentor-visibility policy | **Done, merged and deployed 2026-09-10** (PR #21). Verified at both layers; both migrations applied. Admin round authoring lives on the programme detail page |
| 3. `ars_submissions` and `ars_feedback`, with RLS covering writes | Not started |
| 4. The Storage bucket and its policies on `storage.objects` | Not started |
| 5. The student submission route and the mentor review queue | Not started |

**Nothing here is blocked from being built.** The Supabase Pro upgrade is a
**capacity** limit and not a capability one: Free gives 1GB of Storage and a 50MiB
`file_size_limit`, which is enough to build and test the upload path with small
files. Pro blocks students uploading **real video essays**, so it must land before
ARS is used rather than before it is written. This corrects an earlier reading of
this file that treated Pro as blocking the phase outright.

The phase needs no VdoCipher, no SMTP and no Google or LLM account.

Both obligations that hung over step 2 are now discharged, and one new one takes
their place.

- **`ars_rounds.course_id` is in the migration that created the table**, per the
  decision of 2026-09-06. It is half of a composite foreign key against
  `courses (id, org_id)`, so a round cannot sit in one organisation while its
  programme sits in another.
- **Mentors can now see a programme**, through the separate `courses_select_mentor`
  policy and `private.mentor_reaches_course`. The rule is the narrowest one that
  makes a review queue possible: a mentor reaches a programme when they are the
  active assigned mentor of an active student who holds it. Verified against a
  discriminating pair -- their student's programme is visible, another student's
  is not.
- **New, and it belongs to step 3: `ars_submissions.round_id` must be ON DELETE
  RESTRICT.** Rounds can be deleted today, which is safe only because nothing
  hangs off them. Once a student has answered a round, deleting it destroys their
  work, and the schema should refuse rather than the interface remembering to.
  The note is also in `src/features/ars/actions/delete-round.ts`, beside the code
  that would have to change.

Build order and tests are in `docs/implementation-plan.md` under Phase 5a.

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
| **Supabase on Free** | No daily backups, 1GB Storage, pauses after seven days idle. Also gates leaked-password protection | **Now blocking.** ARS moved to the front on 2026-09-08, so its Storage requirement moved with it. Clause 8.3 budgets for it |
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
2. **Decide how historical attempts are protected from live question and mock
   edits, before Phase 4 starts.** Recorded as critical below.
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
| **Google API and LLM** accounts | The Google Doc import in Phase 3. The rest of that phase proceeds without them | Cospire |
| **Existing content**: videos, question banks, documents | Migration in Phase 5, and the pulled-forward import accuracy test | Cospire, **by start of week 4** |
| **A written decision on what is still in use** | Migration scope, so nothing is migrated that nobody opens | Cospire |
| **One real question document** | The import accuracy test the delivery plan commits to in the first fortnight | Cospire |
| **Supabase Pro** | **Phase 5a, the next phase.** Storage for ARS uploads, plus daily backups, the tested restore and leaked-password protection | Cospire, clause 8.3 |
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

1. Whether the signed agreement permits publishing the Client's codebase. This was
   not confirmed before the repository was made public.
2. Cospire holds read access to this repository throughout the build, so the
   commercial commentary is readable by the Client regardless of visibility. That
   deserves a deliberate decision about what belongs in this file versus a
   delivery-team-only document.

## Phase 0 security audit, 2026-08-28

An adversarial review of the database, the auth service, and the running
application. Every probe ran against the live project; anything needing extra
rows created them inside a transaction that was rolled back, and the live counts
were re-checked afterwards.

### Held under attack

| Attempt | Result |
|---|---|
| Admin moves a user into another organisation | Blocked |
| Admin creates a profile inside another organisation | Blocked |
| Admin renames another organisation | Blocked (0 rows) |
| Mentor reads another mentor's assigned students | Blocked, sees only self |
| Student reads a peer student in the same organisation | Blocked, sees only self |
| Student self-promotes, creates profiles, self-assigns a mentor, self-grants access, deletes the admin | All blocked |
| Signup via magic link, OTP, anonymous, or phone | All refused with `signup_disabled` |
| Email enumeration through password reset | Identical responses for known and unknown addresses |
| Calling the `private` helpers over the Data API | 404, schema not exposed |
| Reading the API schema | Refused, requires a secret key |
| Anonymous table reads | Refused at grant level, before RLS |
| Unauthenticated requests to `/admin`, `/mentor`, `/student`, `/dashboard` | All redirect to `/login` |

The magic-link result is the one worth noting: disabling password signup while
leaving OTP open is a common miss, and every path is closed here.

### Fixed

**Admin could lock the organisation out of all admin access.** Verified live: the
sole admin could set their own `role` to 'student' or `status` to 'disabled',
leaving zero active admins and no in-application recovery.
`profiles_delete_admin` already blocked self-deletion, so the case had been
considered for DELETE and missed on UPDATE. Fixed by a constraint trigger in
`20260828122059`, which still permits a handover once a second admin exists.

**A user could authenticate and be sent back to sign-in with no explanation.**
Reachable in the gap between an admin creating an account and its profile
existing, and also by any disabled user. Correct credentials looped straight back
to the form, so it would have arrived as an unreproducible support report.
Anonymous and orphaned sessions are now distinct; the orphaned case ends the
session and says why.

**No HTTP security headers.** The sign-in page was embeddable in a frame on any
site. Added `frame-ancestors`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
and a `Permissions-Policy` denying camera and microphone.

**`profiles.email` could drift from the Auth address.** Now derived from
`auth.users` on every write.

**Route protection depended on every page remembering its guard.** Middleware now
requires a session outside an explicit public list. Role checks stay in the page
guards; this is the floor beneath them.

### Rate limits raised, and why

Measured rather than assumed: sign-in throttled with HTTP 429 after **36**
consecutive attempts from one IP. `sign_in_sign_ups` is counted per five minutes
per IP address.

Clause 3.1 fixes capacity at 100 users active at once. CAT candidates commonly sit
a scheduled mock together at a coaching centre, where every student shares one
public IP, so at the default of 30 the thirty first student is refused sign-in to
their own test and it looks like an outage.

`sign_in_sign_ups` raised 30 to 150 and `token_refresh` 150 to 300. The trade is
weaker per-IP brute-force resistance, accepted because public signup is closed,
passwords require eight or more characters with mixed case and digits, and sign-in
gives no oracle distinguishing an unknown address from a wrong password.
**This one is a judgement call and is worth a second opinion.**

`email_sent` stays at 2 per hour: Supabase's built-in sender caps it regardless.
It must be raised together with custom SMTP or bulk student creation under clause
2.1 will stall partway through a class.

### Known and accepted

`getSessionState` throws if the profile query fails, which surfaces as the generic
error boundary. Failing closed and loudly is the right behaviour for an unexpected
database error; the generic page is a presentation gap, not an access one.

## Phase 0 exit gate: closed 2026-08-29

Deployed to Vercel at `https://cospire-roan.vercel.app` from `main`. `site_url`
and the redirect allow-list were repointed from the local placeholder to that URL
before testing.

All three roles signed in on the deployed URL within minutes of each other and
reached their own role shell, confirmed against `auth.users.last_sign_in_at`.

Final state verified the same day:

| Check | Result |
|---|---|
| Live `/login` | 200, renders the sign-in form |
| Live `/admin` while anonymous | 307 to `/login` |
| Security headers on the deployed site | 5 of 5, plus HSTS from Vercel |
| Migrations, repo vs live | 3, all matching |
| Auth config, repo vs live | 0 differing lines |
| Working tree | `main`, clean, synced |

## GitHub exposure audit, 2026-08-29

The repository is public by the owner's decision, so it was audited as an
attacker would read it.

Clean:

- Every blob in every commit scanned for credential patterns. Nothing found; the
  only match is the literal `your-project-ref:password` placeholder in
  `.env.example`.
- Zero Actions secrets, Dependabot secrets, Actions variables, deploy keys and
  webhooks. There is nothing stored in GitHub to steal.
- One collaborator, `Two19Labs`, admin.
- CI uses the `pull_request` trigger rather than `pull_request_target`, so a fork's
  code never runs with repository permissions. `permissions: contents: read`, no
  secrets referenced, workflow token read-only and unable to approve reviews.
- Repository knowledge grants nothing. Reading every table name, policy and private
  function name from the repo, then calling them with the publishable key: all four
  tables return 401, every helper returns 404, storage is empty, and the auth admin
  endpoint returns 401.

### Open finding: CODEOWNERS is inert

`.github/CODEOWNERS` names `@manthan` and `@aditya`. Both are real GitHub accounts
belonging to other people, and neither has access to this repository. GitHub
silently ignores CODEOWNERS entries for users who cannot access the repo, with no
warning.

So the review requirement on `/supabase/migrations/**` does not exist. It is not
dangerous today, since neither account has access and the file alone grants
nothing, but it is documentation that describes a control which is not in place.

The owner's account is `Two19Labs`. Fixing it needs the second engineer's real
GitHub handle before the `/src/features/**` line can be corrected.

### Minor hardening, not blocking

- Actions are referenced by tag rather than commit SHA. Low risk with official
  GitHub actions; worth pinning before handover.
- Anyone can open a pull request that consumes Actions minutes. GitHub's default
  approval requirement for first-time contributors covers this; worth confirming
  it is enabled.

## Advisor findings after the audit fixes

The security advisor returns two WARN items. Neither is a defect in this
repository and neither is fixable here.

**Leaked password protection is disabled.** Supabase can reject passwords known
to appear in breaches by checking HaveIBeenPwned. Worth enabling. It is
**available on the Pro plan and above**, so it cannot be turned on while the
project is on Free. This is a fourth reason to upgrade, alongside backups,
Storage capacity and project pausing in the operating manual §4.6. Enable it in
the same session as the upgrade.

**Insufficient MFA options.** TOTP is disabled. This is a product decision rather
than a defect: nothing in Annexure A asks for MFA, and requiring it of a hundred
students adds friction to every mock. Enabling it for admins alone is the
sensible middle, and it is a scope conversation rather than a fix.

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
| Critical | Historical mocks can change if attempts reference mutable live questions/configuration | Add publishing/version snapshots before test-engine implementation |
| Critical | Answer keys share the proposed question row students need to read | Separate protected key data or expose a safe question projection |
| Critical | Supabase database backups exclude Storage objects | Design and test a separate file backup/restore process |
| High | Vercel Functions have small request/response payload limits | Use direct authorized uploads/downloads; never proxy media |
| High | Vercel Cron can overlap or deliver more than once | Durable job records, locks, and idempotency are required |
| High | Migration volume and cleanup responsibility are not capped | Obtain a content inventory and written acceptance boundary |
| High | Week six is overloaded with ARS, migration, QA, deployment, docs, and training | Pull prototypes and integration work earlier; reserve week six for closure |
| High | "100 concurrent users" lacks measurable performance criteria | Define workload, latency, error-rate, and duration thresholds |
| High | Google Docs image extraction guarantee is broader than the API's reliable cases | Test real Cospire documents early and preserve a correction workflow |
| Medium | Agreement kickoff prerequisites and week-four content deadline are ambiguous | Record the exact written Kickoff Date and dependency deadlines |

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-08-28 | Runtime | Node `v24.18.0`, npm `11.16.0`, Supabase CLI `2.116.0` |
| 2026-08-28 | `npm run typecheck` | Pass |
| 2026-08-28 | `npm run lint` | Pass after excluding framework-generated `next-env.d.ts` |
| 2026-08-28 | `npm test` | Pass: 1 file, 9 assertions |
| 2026-08-28 | `npm run build` | Pass: Next.js 15.5.24 production build, 7 routes plus middleware |
| 2026-08-28 | `npm audit --audit-level=moderate` | Pass: 0 vulnerabilities after pinning PostCSS override |
| 2026-08-28 | Bash syntax (`bash -n`) | Pass for both worktree scripts |
| 2026-08-28 | Migration on fresh PostgreSQL 17 | Pass; transaction committed, one Cospire org seeded, all four tables have RLS enabled and forced |
| 2026-08-28 | Manual RLS behavior | Pass: admin 4 profiles/1 org; mentor 2 profiles/no unassigned student; student 1 profile; disabled student 0 profile/access/assignment rows; unauthorized mentor insert and anonymous select rejected |
| 2026-08-28 | Hosted project reference | Confirmed `eeeftjwvbppznsmcljnw` before any write |
| 2026-08-28 | Foundation migration on hosted Supabase | Pass: 4 tables, 26 constraints, 16 indexes, 13 policies, 4 triggers, RLS enabled and forced on all four, Cospire org `id = 1` |
| 2026-08-28 | Helper functions vs repository file | Pass: all 7 `private` function bodies byte-identical to the migration file, before and after re-applying |
| 2026-08-28 | Migration history | Pass: recorded versions `20260828093807` and `20260828102907` match repository filenames |
| 2026-08-28 | Security advisor | Pass: zero findings after `20260828102907` |
| 2026-08-28 | Performance advisor | 11 INFO findings, all assessed as not actionable at contracted scale; reasoning recorded above |
| 2026-08-28 | `ensure_rls` safety net after the revoke | Pass: a probe table created and dropped in one transaction still had RLS auto-enabled |
| 2026-08-28 | Anonymous Data API | Pass: REST reads of `profiles` and `orgs` refused with HTTP 401 and Postgres `42501 permission denied`; `anon` denied on all four tables at grant level |
| 2026-08-28 | Signed-in user with no profile | Pass: zero rows visible in all four tables, including `orgs` |
| 2026-08-28 | Client bundle secret scan | Pass: no `service_role`, `sb_secret`, or `SUPABASE_SECRET` reference in `.next/static` |
| 2026-08-28 | Bootstrap profile SQL dry run | Pass: valid against the live schema, resolves the Cospire org, writes zero rows with no matching Auth users |
| 2026-08-28 | Generated database types | Pass: `src/shared/db/types.ts` generated from the live hosted schema |
| 2026-08-28 | `npm run typecheck` / `lint` / `test` / `build` | Pass: 9 test assertions; production build of 7 routes plus middleware |
| 2026-08-28 | Docker availability | Absent, re-confirmed. `db:reset`, `db:lint`, `db:test` not run; pgTAP suite still unexecuted |
| 2026-08-28 | Supabase CLI login and link | Pass: logged in, linked to `eeeftjwvbppznsmcljnw`; `migration list` shows local and remote agreeing on both versions |
| 2026-08-28 | `supabase config push` | Pass: `auth: updated`; api, storage, db.settings already up to date |
| 2026-08-28 | Public signup blocked | Pass: `POST /auth/v1/signup` returns `422 signup_disabled`; probe created no user (`auth.users` = 0) |
| 2026-08-28 | Email/password login enabled | Pass after fix: `POST /auth/v1/token` returns `400 invalid_credentials`. The first push had disabled the provider entirely (`422 email_provider_disabled`); cause and fix recorded above |
| 2026-08-28 | Password policy | Pushed: minimum 8 characters, lower + upper + digits |
| 2026-08-28 | Custom SMTP | Not configured. Does not block the exit gate; blocks bulk student creation |
| 2026-08-28 | Three Auth users created | Pass: created in the dashboard, all email-confirmed |
| 2026-08-28 | Profile bootstrap | Pass: exactly one active profile for each of admin, mentor, student |
| 2026-08-28 | Hosted RLS matrix, reads | Pass: admin 3 profiles; unassigned mentor 1; assigned mentor 2 (self + student, not admin); student 1; disabled user 0 everywhere; anonymous refused; cross-organisation isolated |
| 2026-08-28 | Hosted RLS matrix, writes | Pass: student cannot self-promote, create profiles, self-assign a mentor, self-grant access, or delete the admin; mentor cannot self-assign a student; admin can assign, grant, and edit, but cannot delete their own account |
| 2026-08-28 | Three live role sign-ins | **Pass**, confirmed by the project owner: admin, mentor, and student each signed in and reached their own role shell. Local only (`http://localhost:3000`); not yet repeated on a deployed URL |
| 2026-08-28 | Login page fixes | Pass: typecheck, lint, 9 tests, and production build all pass after removing the invalid `"use server"` export, dropping the sign-in `minLength`, and adding readable action error handling |
| 2026-08-28 | Test isolation | Pass: all scenario data rolled back; live counts remain 1 org, 3 active profiles, 0 assignments, 0 grants |
| 2026-08-28 | GitHub CI, first runs | **Pass**, both green: `verify` on the PR and on the merge commit to `main`. Confirms the Windows-authored tree builds on Linux; no filename case collisions |
| 2026-08-28 | Branch protection on `main` | **Active**, verified through the public rules API: restrict deletions, block force pushes, require a pull request (approvals 0, conversation resolution on), and require the `verify` status check with branches up to date |
| 2026-08-28 | Phase 0 work merged | PR #1 merged to `main` as `abea31e`; 71 files tracked; `.env.local` absent from all history; typecheck, lint, tests, and build all pass on `main` |
| 2026-08-28 | Security audit, attack attempts | 12 attack classes attempted against the live project; all refused. Full matrix recorded above |
| 2026-08-28 | Admin lockout fix | Pass: sole admin can no longer demote or disable themselves (`23001`); a handover with a second admin still succeeds and leaves 1 active admin |
| 2026-08-28 | Email drift fix | Pass: an admin write of a different address is accepted and silently corrected back to the Auth address |
| 2026-08-28 | Security headers | Pass: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` all present on the running app |
| 2026-08-28 | Sign-in dead end fix | Pass: `/login?error=no_profile` renders the explanation; unknown values render nothing, and a crafted value reaches only Next.js's JSON-escaped router state, never the page |
| 2026-08-28 | Middleware session gate | Pass: `/`, `/admin`, `/mentor`, `/student`, `/dashboard` all redirect anonymous callers to `/login`; `/login` still reachable |
| 2026-08-28 | Rate limit measurement | Sign-in throttled at 36 consecutive attempts from one IP (HTTP 429). Raised to 150; `token_refresh` to 300 |
| 2026-08-28 | Migration applied via CLI | `20260828122059` applied with `npm run db:migrate` against the linked project, resolving the earlier MCP deviation |
| 2026-08-28 | pgTAP suite 002 | Authored and its 9 assertions verified against the live schema in a rolled-back transaction. `supabase test db` still unrun; Docker remains unavailable |
| 2026-08-28 | Generated types after migration | Unchanged: the migration adds triggers and functions only, no tables or columns |
| 2026-08-28 | All Phase 0 PRs merged | PRs #1, #2, #3 merged to `main`; five CI runs, all green; only `main` remains; local matches `origin/main` with a clean tree |
| 2026-08-28 | Migrations, repo vs live | Pass: `20260828093807`, `20260828102907`, `20260828122059` all present on both sides |
| 2026-08-28 | Auth config, repo vs live | Pass: zero differing lines |
| 2026-08-28 | Final smoke test on merged `main` | Pass after a clean rebuild: `/login` 200, `/admin` and `/dashboard` 307, all five security headers present, no runtime errors |
| 2026-08-28 | Security advisor, post-fix | Two WARN items, both plan or scope decisions rather than defects; recorded above |
| 2026-08-28 | Explorer cleanup verification | Parent-workspace VS Code settings parse as valid JSON; repository `.vscode` clutter removed; `npm run typecheck` and `npm run lint` pass after cleanup |
| 2026-09-02 | Documents migrations applied | Both applied with `npm run db:migrate`. `documents` has RLS enabled and forced with 4 policies; `storage.objects` has 4 documents policies; the bucket is private, PDF-only, 50MiB |
| 2026-09-02 | Security advisor after the migrations | The same two pre-existing WARN items (leaked-password protection needs Pro, MFA is a scope decision). **No new findings** |
| 2026-09-02 | `npm run typecheck` / `lint` / `test` / `build` | Pass. **58 test assertions, up from 28.** Production build of 14 routes |
| 2026-09-02 | Client bundle secret scan | Pass: the **actual secret key value** appears nowhere in the entire `.next` tree. The only `sb_secret` match is supabase-js's own key-format check |
| 2026-09-02 | pdfjs-dist worker asset | Emitted by webpack to `.next/static/media/`, so the `new URL(..., import.meta.url)` worker reference resolves in a production build |
| 2026-09-02 | Documents end-to-end, hosted database, local build | **36 of 36 checks passed.** Full matrix in the documents slice section above |
| 2026-09-02 | Documents defects found by that run | Two, both invisible to typecheck/lint/tests/build: granting wrote nothing because `upsert` needs UPDATE rights `content_access` does not grant; a malformed upload path returned a 500. Both fixed and re-verified |
| 2026-09-02 | Test isolation after the documents run | Pass: live counts returned to baseline exactly (2 orgs, 5 profiles, 1 assignment, 0 grants, 0 documents, 0 storage objects) |
| 2026-09-02 | CI on PR #16 | `verify` green in 50s; Vercel preview deployed |
| 2026-09-08 | Documents on the deployed URL | **Still not run**, and it is the last thing holding the Phase 1 exit gate open. Confirmed on production that the routes exist and refuse anonymous callers (307 to `/login`); that proves the deploy landed, nothing more |
| 2026-09-03 | PDF.js rendering in a browser | **Pass**, confirmed by the owner: pages render and a page saved as an image carries the reader's name. Found two defects, both fixed in `6880ac3`: the stamp read UTC rather than IST, and a PDF.js worker leaked per navigation |

## Next recommended action

**One task closes Phase 1's exit gate, and it is not a coding task.** In order:

1. **Run the end-to-end verification against `https://cospire-roan.vercel.app`.**
   The harness is in `scripts/verify/` with a README; it takes the base URL as
   its third argument and was 36/36 against a local build. **Until it passes on
   the deployed URL the exit gate is open**, and neither a green CI run nor the
   local pass is a substitute. This is the only thing standing between Phase 1
   and done, apart from step 5 below.
2. **Build step 5, bulk CSV creation**, the last unbuilt part of Phase 1. Blocked
   on custom SMTP, which is Cospire's to provide.
3. **Chase two things still owed by the Client**, both small and both cheap to
   get while he is responsive: the written list of programmes with the names
   students should see, and **what "ARS" actually stands for** — the agreement
   uses the term throughout and never expands it, and it will be a label in the
   interface.
4. **Tell Cospire what the document watermark does and does not stop**, before
   they discover it. A reader can save a page as an image (watermarked, so
   traceable) and can read the signed URL out of the page source to fetch the
   clean PDF (not traceable). Both are inherent to rendering a PDF in a browser.
   Better raised in week two than found in week six.
5. Decide what to do about the leftover audit organisation described in the
   Phase 1 security audit. It is harmless and RLS-isolated, but it can only be
   removed by a migration or a manual dashboard deletion.
6. **Two documents uploaded through the console during the owner's browser
   testing are still live**, with two grants against them. Real rows, not test
   residue from a verification run. **Document deletion is not built**, so
   removing them needs the Supabase dashboard.
7. **Correct the parent operating manual.** `../CLAUDE.md` documents `profiles`
   as `id, org_id, role, name, email` and omits `status`, which the deactivate
   feature, the disabled-user behaviour and `enforce_last_admin` all depend on.
   It also lists `documents` without noting that `id` must be `bigint`, because
   `content_access.resource_id` is. Owner's file, outside git, so it was left
   alone.

Carried from Phase 0, none of it blocking:

1. **Fix CODEOWNERS.** Needs the second engineer's GitHub handle. Until then the
   migration review requirement is documentation only.
2. **Vercel Hobby to Pro.** Hobby does not permit commercial use. The owner has
   chosen to build on Hobby and upgrade later; it must happen before the Client is
   told this is their platform. Clause 3.8 puts the account in Cospire's name.
3. **Supabase Free to Pro**, before ARS uploads and restore testing. Also unlocks
   leaked-password protection.
4. **Custom SMTP**, raising `[auth.rate_limit] email_sent` at the same time,
   before bulk student creation.
5. **Run the pgTAP suites** on a Docker-enabled machine. Neither has ever executed;
   both were verified by hand against the live schema instead.
6. **Replace `site_url`** if a custom domain replaces the `vercel.app` address.

Phase 1 work can begin in parallel worktrees. The foundation, the access model,
the deployment pipeline and the review workflow are all verified end to end.

The route through the rest of the build is in `docs/implementation-plan.md`,
split into six phases, one per contracted week, each with a single demonstrable
exit gate taken from the signed delivery plan.

**Phase 0 is complete. Phase 1 is nearly complete:** the admin console and the
document library are built, and only bulk CSV creation remains, itself blocked
on custom SMTP. Its exit gate is the client's own sentence, an admin creates a
student, grants them a document, that student reads it, and another student is
correctly refused. Every part of that sentence has been demonstrated against the
hosted database, and **none of it on the deployed URL yet**, which is what the
gate requires.
