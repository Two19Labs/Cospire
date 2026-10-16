# feat/abandoned-attempts — N6, closing abandoned attempts (step 4.5)

Branch for N6. Worktree `Cospire-engine`, port 3040. One migration, one pgTAP
test, no application code.

## What it is

An attempt whose clock ran out but which nobody submitted stays `in_progress`
for ever: the student's results list shows it still running, the admin's
attempts list shows it too, and it is never scored. Nothing is at risk, because
`private.guard_attempt_response_write` already refuses every answer past the
clock plus `private.attempt_grace()` — it is the record that is wrong.

## Modelling choices

**pg_cron, in the database, every minute** (owner, 2026-10-13). Vercel Cron on
the Hobby plan runs once a day, which would leave an abandoned attempt open for
up to 24 hours, and Vercel Pro is not in place yet. pg_cron sits in the database
that already owns the clock.

**It submits; it does not score.** Scoring is TypeScript
(`src/features/test-engine/score-attempt.ts`) because it needs the keys, the
section marks and the negative-marking rules, and there is deliberately one
implementation. The sweep therefore leaves `score` null, which is already this
repository's "awaiting a score" state: `rescoreAwaiting` drains it, and it is
drained when the student opens the result (`src/app/student/attempts/[id]`) or
an admin opens a mock's attempts list (`queries/mock-attempts.ts`). So a swept
attempt is scored by the same path a rescored one is. **Nothing new scores.**

**The expiry rule is the response guard's own**, not a second one: the paper's
clock (`started_at + mocks.duration_minutes`), or every section of the mock
entered and each closed or past its own clock capped at the paper's end, both
plus the same 30-second grace. A section with no duration follows the paper's
clock, so its end *is* the paper's end and a mock carrying one never closes
early — which is what `paperState` does on screen. An unentered section is never
treated as over, because the student may still enter it.

**`submitted_at` is when the clock ran out, not when the sweep noticed.**
`guard_attempt_write` was written for this ("the expiry sweep may say the timer
ended it, and when the clock ran out") and clamps the value into
`[started_at, now()]` anyway. `submitted_by = 'timer'`, the value the column's
check constraint already allows.

**No index added:** `attempts_open_idx` already exists for this sweep,
`(started_at) where status = 'in_progress'`.

**No new table, so no new RLS.** The function is `security definer`,
`search_path = ''`, and execute is revoked from `public, anon, authenticated`,
like every other `private.` function here.

## Files

- `supabase/migrations/20261014100000_close_expired_attempts.sql` — the
  extension, `private.close_expired_attempts(batch integer default 200)` and
  the `close-expired-attempts` cron job. Timestamp confirmed unused on every
  branch (`git log --all -- 'supabase/migrations/20261014100000*'` returned
  nothing).
- `supabase/tests/003_close_expired_attempts.test.sql` — 14 pgTAP assertions.

## Verification

**The SQL has not been executed anywhere, and could not be.** Docker is
unavailable in this environment, so `npm run db:test` and `supabase db lint`
cannot run; `DATABASE_URL` in `.env.local` is empty, so there is no reachable
Postgres to run even a read-only parse against; and applying DDL is the owner's
step by policy, not an agent's.

What was done:

- `npx supabase db push --dry-run`: **"Would push these migrations:
  20261014100000_close_expired_attempts.sql"**, exactly one, nothing else.
  (The worktree is not linked, so `supabase/.temp` was copied in from the main
  checkout and deleted again; the remote already carries `20261013120000` from
  `feat/video`, which is not on `main` yet, so that file had to be present
  locally for the dry run to proceed. It was removed afterwards. Both are
  untracked paths; nothing was committed.)
- `npm run typecheck`, `lint`, `test`, `build`: pass (no application code
  changed).

**The owner must run `npm run db:test` where Docker exists, or apply this to a
branch database first.** The pgTAP file is written and reviewed but never run,
so it may itself need a correction.

## The test's cases

Each closing case has its negative twin, because a sweep that closes early ends
a real student's exam:

| Case | Expected |
|---|---|
| past the paper clock and the grace | closed, `submitted_by = 'timer'`, stamped at the clock's end, `score` still null |
| still inside the paper clock | untouched |
| every timed section entered and expired, paper clock still running | closed, stamped when the last section ended |
| a section never entered | untouched |
| an untimed section alongside an expired timed one | untouched until the paper's clock ends |
| already submitted by the student | not re-stamped as the timer's |
| run twice | the second run closes nothing |
| the cron job | exactly one job named `close-expired-attempts` |
