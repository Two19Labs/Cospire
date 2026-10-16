-- Step 4.5: close abandoned attempts on a schedule (N6).
--
-- An attempt whose clock has run out but which nobody submitted stays
-- `in_progress` for ever. The database already refuses every further answer --
-- `private.guard_attempt_response_write` raises "time is up for this attempt"
-- past the clock plus `private.attempt_grace()` -- so nothing is at risk from
-- the delay. What is wrong is the record: the student's results list shows an
-- attempt still running, the admin's attempts list shows one too, and neither
-- is ever scored. `guard_attempt_write` was written for this sweep from the
-- start: "the expiry sweep may say the timer ended it, and when the clock ran
-- out, which is earlier than the sweep ran".
--
-- **Where it runs, and why not Vercel Cron.** Vercel's Hobby plan runs a cron
-- job once a day, which would leave an abandoned attempt open for up to 24
-- hours. Vercel Pro is not in place yet (clause 8.3 budgets for it, the Client
-- has not decided). pg_cron runs inside the database that already owns the
-- clock, costs nothing, and is not waiting on anybody. Decided by the owner,
-- 2026-10-13.
--
-- **It does not score.** Scoring lives in TypeScript
-- (`src/features/test-engine/score-attempt.ts`) because it needs the keys, the
-- section marks and the negative-marking rules, and there is exactly one
-- implementation of it by design (operating manual §11, Annexure A rescoring).
-- This sweep therefore does the submit half only and leaves `score` null, which
-- is already the repository's "awaiting a score" state: `rescoreAwaiting`
-- drains it, and it is drained whenever the student opens the result
-- (`src/app/student/attempts/[id]/page.tsx`) or an admin opens a mock's
-- attempts list (`src/features/test-engine/queries/mock-attempts.ts`). So a
-- swept attempt is scored by the same path a rescored one is, and no second
-- scoring routine exists to drift.

create extension if not exists pg_cron;

-- No index is added: `attempts_open_idx` already exists for exactly this sweep
-- ("the sweep in slice 4.5 asks for open attempts only, so the index is
-- partial"), on `started_at where status = 'in_progress'`, which is the scan
-- and the order below.

-- Closes every in-progress attempt that can no longer be answered, and returns
-- how many it closed.
--
-- **"Can no longer be answered" is the response guard's own rule**, not a
-- second one, because a second one would eventually disagree with it:
--
--   * the paper's clock: `started_at + mocks.duration_minutes`, or
--   * every section of the mock entered, and each one closed or past its own
--     clock -- `attempt_sections.started_at + mock_sections.duration_minutes`,
--     capped at the paper's end
--
-- both plus `private.attempt_grace()`, the same 30 seconds the guard allows so
-- a save in flight as the clock hits zero is not lost. A section with no
-- duration follows the paper's clock alone, so its end *is* the paper's end and
-- a mock carrying one can never close early -- which is what `paperState` in
-- `src/features/test-engine/paper.ts` does on screen. An unentered section is
-- never treated as over: the student may still enter it.
--
-- `submitted_at` is the moment nothing more could be answered, not the moment
-- the sweep noticed, so a student who walks away is recorded as having run out
-- of time when they did. `guard_attempt_write` clamps it into
-- `[started_at, now()]` regardless.
create or replace function private.close_expired_attempts(batch integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  -- The trigger reserves `submitted_at` and `submitted_by` for the server
  -- (`private.is_trusted_writer`). The flag is transaction-local and no client
  -- can set it; the same pattern as `private.mark_for_rescore`.
  perform set_config('cospire.system_write', 'on', true);

  with candidate as (
    select a.id,
           a.mock_id,
           a.started_at + make_interval(mins => m.duration_minutes) as paper_end
      from public.attempts as a
      join public.mocks as m on m.id = a.mock_id
     where a.status = 'in_progress'
     order by a.started_at
     limit batch
     -- ponytail: one sweeper, so the lock is belt and braces; SKIP LOCKED
     -- keeps it from queueing behind a student's own submit either way.
     for no key update of a skip locked
  ),
  ended as (
    select c.id,
           case
             when now() > c.paper_end + private.attempt_grace() then c.paper_end
             else sections.last_end
           end as ended_at
      from candidate as c
      left join lateral (
        select max(
                 coalesce(
                   entered.submitted_at,
                   case
                     when ms.duration_minutes is null then c.paper_end
                     else least(entered.started_at + make_interval(mins => ms.duration_minutes), c.paper_end)
                   end
                 )
               ) as last_end
          from public.mock_sections as ms
          left join public.attempt_sections as entered
                 on entered.attempt_id = c.id
                and entered.mock_section_id = ms.id
         where ms.mock_id = c.mock_id
        having count(*) > 0
           -- every section entered: an unentered one can still be started
           and count(entered.attempt_id) = count(*)
           and bool_and(
                 entered.submitted_at is not null
                 or now() > (
                      case
                        when ms.duration_minutes is null then c.paper_end
                        else least(entered.started_at + make_interval(mins => ms.duration_minutes), c.paper_end)
                      end
                    ) + private.attempt_grace()
               )
      ) as sections on true
  )
  update public.attempts as a
     set status = 'submitted',
         submitted_at = ended.ended_at,
         submitted_by = 'timer'
    from ended
   where a.id = ended.id
     and ended.ended_at is not null
     -- Re-checked under the row's own lock: a student who pressed submit in
     -- the same minute closed it as theirs, and that must stand.
     and a.status = 'in_progress';

  get diagnostics closed = row_count;

  perform set_config('cospire.system_write', 'off', true);

  return closed;
end;
$$;

revoke execute on function private.close_expired_attempts(integer) from public, anon, authenticated;

comment on function private.close_expired_attempts(integer) is
  'Submits every in-progress attempt that can no longer be answered, as the timer, at the moment its clock ran out. Leaves score null: scoring is TypeScript''s, through the awaiting-a-score path. Run every minute by pg_cron; safe to run again and safe to run concurrently.';

-- Every minute, because the cost is one indexed scan of the open attempts and
-- the point of the job is that a student's results list is not wrong for long.
-- `cron.schedule` replaces a job of the same name, so re-running this migration
-- does not stack jobs up.
select cron.schedule(
  'close-expired-attempts',
  '* * * * *',
  $job$select private.close_expired_attempts();$job$
);
