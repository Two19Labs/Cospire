# Operations: environment, tooling and traps

Moved verbatim from `CONTEXT.md` on 2026-10-10, when that file was cut to what
is true now. Read this before running builds, servers or git operations, or when
something behaves strangely on Windows.

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
- **`main` and the hosted database are in step**: every migration on `main` is
  applied, the test engine's four included (the last three on 2026-09-28,
  before PR #63 merged).
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
- Hosted Supabase project `eeeftjwvbppznsmcljnw` (Mumbai, **Free** plan). Every
  migration on `main` is applied, and nothing else.
  The Supabase MCP server points at this project (`get_project_url`, checked
  2026-09-27); an earlier suspicion that it pointed elsewhere was wrong.

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

## Notes that sat under Active work

**Merged since 2026-10-08:** `feat/mock-import` (Phase 6.2-6.4) as PR #69 (`92df9fc`), `feat/small-items` (6.5) as PR #71 (`a65a9d3`) `feat/curriculum` (curriculums before video, migration `20261008120000` applied) as PR #72 (`b0de34d`), `feat/admin-gaps` (6.6 and D8, migration `20261008130000` applied) as PR #73 (`ee1e0e8`), `fix/main-faults` (both `main` faults were check faults; types regenerated) as PR #74 (`783aac8`), and `feat/ui-cleanup` (the UI audit and cleanup) as PR #75 (`8137089`). **No feature branch is open.** Write-ups are in `docs/context/completed.md`. `feat/exam-screen` (6.1, the exam rebuild) merged as PR #70 (`9f808b3`) on 2026-10-09, after `test-engine-sit.mjs` 59/59 on the rebased branch; **no real-browser sitting yet**.

**Earlier feature branches were all merged by 2026-09-28.**
`feat/test-engine` merged as PR #63,
`feat/analytics` as PR #65 and `feat/admin-ui` as PR #66 (`fe9e836`); all three
branches are deleted from `origin`. **Cleaned up on 2026-10-02:** those
worktrees, the orphan `Cospire-doc-import` folder and the seven merged local
branches are removed. Three stale `next start` servers from 2026-09-28 (ports
3010, 3050 and 3060) are stopped. `scripts/wt-done.sh` cannot remove a
squash-merged branch: its `merge-base --is-ancestor` check refuses every one.
Use `git worktree remove` and `git branch -D` once the PR is confirmed merged.
A leftover `next start` locks `next-swc.win32-x64-msvc.node` and stops the
folder being deleted, so stop the server first.

`feat/doc-import` merged as PR #58 (`b2a4fb8`), `fix/docx-harness-assertion` as
PR #59 (`6cc00f6`) and `feat/model-provider` as PR #60 (`51148e1`).
`feat/mock-docs` merged as PR #61 and the stop-at-7% rule as PR #62; their
branches and `feat/doc-import` were deleted from `origin` on 2026-09-28. Three things a new session should know before touching
anything:

- **A dev server may be running on port 3000** (none was on 2026-09-28) from the main checkout
  (`C:\Cospire\Cospire`, on `main`). Leave it alone unless asked: Codex is
  reading the code and working on UI there. **Never run `npm run build` in that
  checkout while it is up** -- they share `.next`, and the build corrupts the
  running server, which then answers 500 to everything. Do your own work in a
  worktree (`scripts/wt-new.sh NAME PORT`).
- **Tell the owner at once if anything changes that you did not do** -- a file
  in the working tree, a branch, a commit, the dev server going down. They have
  remote access and can intervene, but only if it is surfaced immediately.
- **The editor's Commit button stages everything.** On 2026-10-01 at 10:43,
  Commit was pressed in the Antigravity IDE's Source Control panel with nothing
  staged. That makes VS Code-based editors run `git add -A` first, and it staged
  the private `docs/client/` files in this **public** repository. The commit
  aborted on an empty message, so nothing was committed or pushed. They were
  unstaged on 2026-10-02, and `docs/client/` is now in `.git/info/exclude`, so a
  "stage all" skips it. `docs/decisions/` is not excluded (N13). The editor's
  record of every git command is its `vscode.git/Git.log`, under
  `%APPDATA%\Antigravity IDE\logs\`.
- **A new worktree may arrive without its dependencies.** `Cospire-mock-docs`
  was handed over as ready and held one stray `next` directory in
  `node_modules` and no `.bin`, so every script failed with "'vitest' is not
  recognized" -- which reads like a broken install of vitest rather than an
  absent `npm ci`. Check `node_modules/.bin` exists before concluding anything
  about a tool. Its `.env.local` also has an empty `DATABASE_URL`; nothing the
  application or the verify scripts do reads it, so it blocked nothing.

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

**And a second reason, measured on 2026-09-26:** a preview URL is behind
**Vercel deployment protection**. Every path on
`https://cospire-git-feat-mock-docs-cospire.vercel.app` -- `/login`,
`/dashboard`, `/admin/mocks/import` alike -- answers `302` to
`https://vercel.com/sso-api?...`, so **no verify script can drive a preview at
all** without a protection-bypass token, whatever the environment variables say.
A browser signed in to the Vercel account passes that gate, which is why the
error boundary was what a person saw. Two separate things to fix, then: the
Preview environment variables, and either a bypass token for the harness or
disabling protection on previews.

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
- **Never send a real Cospire question paper to a free model tier.** Free usage
  is free because the provider may train on what it is given, and clause 13.1
  makes the Client's content confidential. The second, OpenAI-compatible provider
  exists to exercise the code against synthetic fixtures. Real papers go through
  the paid Gemini path or through no API at all.
