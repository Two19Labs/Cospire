-- Phase 5a: a submission records whether it arrived after its deadline.
--
-- `ars_rounds.opens_at` and `due_at` were added on 2026-09-18 and, until now,
-- nothing read either one. No policy, no trigger, no function. A student could
-- submit before a round opened or a month after it closed and the database
-- accepted it, because a deadline that nothing enforces is a label.
--
-- The decision taken 2026-09-18, and it is deliberately not a refusal: a late
-- submission is ACCEPTED and STAMPED. Refusing outright means a student whose
-- upload finishes a minute past midnight is locked out of their own process and
-- telephones Cospire; accepting silently means the deadline means nothing. So
-- the work is taken, `submitted_late` records the fact, and the mentor queue
-- shows it. Whether lateness costs anything is then a human's judgement, which
-- is what it has always been off the platform.
--
-- The stamp is computed from the SERVER clock against the round's own due_at,
-- never from anything the client sends. That is operating manual rule 1 applied
-- to a deadline: the same reason the mock timer is server-authoritative.
--
-- This is a SEPARATE trigger rather than an edit to private.ars_begin_submission
-- or private.guard_ars_submission_write. Both are long, both are working, and
-- both guard student data; rewriting 150 lines of plpgsql to add one assignment
-- is a poor trade. Trigger order within the same event is alphabetical by name,
-- so `ars_submissions_stamp_late` runs after `ars_submissions_begin` and after
-- `ars_submissions_guard_write`, which is what we want -- it stamps only what
-- those two have already allowed.
--
-- Additive: one nullable column, one helper, one trigger. The deployed code does
-- not read the column and cannot break on it.

begin;

-- Null while a draft, because a draft has not been handed in and cannot be late.
-- Set once, at the moment the status becomes 'submitted'.
alter table public.ars_submissions
  add column submitted_late boolean;

comment on column public.ars_submissions.submitted_late is
  'True when the submission was handed in after its round due_at. Null while a '
  'draft, and null when the round carries no deadline. Written by trigger from '
  'the server clock, never by the client.';

-- Null when the round has no deadline, which is not the same as "on time" and
-- must not be flattened into false.
create or replace function private.round_due_at(target_round_id bigint)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.due_at
  from public.ars_rounds as r
  where r.id = target_round_id
$$;

revoke execute on function private.round_due_at(bigint) from public, anon, authenticated;

-- Stamps on the transition into 'submitted', and only then.
--
-- Three cases, decided on purpose:
--
--   * still a draft            -> null, it has not been handed in
--   * round carries no due_at  -> null, there is no deadline to be late against
--   * handed in                -> now() > due_at
--
-- `submitted_at` is itself written by private.ars_begin_submission from the
-- server clock, so comparing against now() here compares two server times.
-- Re-stamping on a later status change is prevented by only acting when the row
-- is arriving at 'submitted', so a mentor marking something 'reviewed' cannot
-- silently re-evaluate lateness weeks afterwards.
create or replace function private.ars_stamp_late()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deadline timestamptz;
begin
  if new.status <> 'submitted' then
    new.submitted_late := null;
    return new;
  end if;

  -- Nested rather than `tg_op = 'UPDATE' and old.status = ...`, because OLD is
  -- unassigned on INSERT and SQL's AND is not guaranteed to short-circuit. The
  -- flat form raises "record old is not assigned yet" on the very first insert.
  if tg_op = 'UPDATE' then
    if old.status = 'submitted' then
      new.submitted_late := old.submitted_late;
      return new;
    end if;
  end if;

  deadline := private.round_due_at(new.round_id);

  if deadline is null then
    new.submitted_late := null;
  else
    new.submitted_late := now() > deadline;
  end if;

  return new;
end;
$$;

revoke execute on function private.ars_stamp_late() from public, anon, authenticated;

create trigger ars_submissions_stamp_late
before insert or update on public.ars_submissions
for each row execute function private.ars_stamp_late();

-- No grant is added. `submitted_late` is absent from the UPDATE column grant on
-- purpose, so neither a student nor a mentor can set it through the API even if
-- a future policy would otherwise let the row through.

-- Finding the late work in a mentor's queue without scanning submissions.
create index ars_submissions_late_idx
  on public.ars_submissions (org_id, submitted_late)
  where submitted_late is true;

commit;
