-- Corrections to the ARS report migrations, found by review on 2026-09-18.
--
-- Fix-forward, not an edit. `20260918094500` and `20260918095000` are applied to
-- the hosted project and recorded in its migration history, so editing either
-- would leave a file that never runs again and a database that disagrees with
-- it. Operating manual 4.3.
--
-- Four corrections, each a defect rather than a preference.

begin;

-- ---------------------------------------------------------------------------
-- 1. A mentor could type any overall score onto a new report
-- ---------------------------------------------------------------------------
--
-- `20260918095000` wrote `grant select, insert on table public.ars_reports`,
-- which is column-WIDE, directly beneath a comment claiming that `overall_score`
-- and `released_at` could not be set by any caller. The UPDATE grant beneath it
-- was correctly column-scoped; the INSERT grant was not, so all thirteen columns
-- were insertable.
--
-- The consequence was narrow but real: an assigned mentor could create a draft
-- report carrying a fabricated `overall_score`, visible to themselves and to
-- admins until the first component write fired the recompute. A RELEASED score
-- was always correct, because release requires every component filled and each
-- component write recomputes the total. A draft one was not.
--
-- The insert surface is now exactly the four columns the application supplies.
-- `overall_score` is computed, `released_at` is stamped on release, `written_by`
-- is stamped by the shape guard, and the three timestamps default.
revoke insert on table public.ars_reports from authenticated;

grant insert (org_id, run_id, student_id, template_id)
  on table public.ars_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A template could be built that made an ordinary save fail
-- ---------------------------------------------------------------------------
--
-- Each component's weightage is checked `> 0 and <= 100` individually, and the
-- rule that they TOTAL 100 lived only in the release guard. So three components
-- at 50% each was a legal template. Score them all 10 and the recompute produces
-- 1500/10 = 150, which trips `ars_reports_score_range` -- and it trips inside the
-- trigger fired by an ordinary component save. The mentor would see a raw
-- constraint error while typing a score, and would never reach the release
-- guard's readable "Component weightages total X, not 100".
--
-- Fixed at the cause rather than by clamping the total: a template whose
-- components sum past 100 cannot be built at all. Summing to LESS than 100 stays
-- legal, because that is every half-built template, and release still demands
-- exactly 100.
--
-- With this in place the recompute cannot exceed 100 arithmetically -- its
-- maximum is sum(10 x weightage)/10, which is the weightage total -- so
-- `ars_reports_score_range` becomes unreachable rather than merely unlikely.
create or replace function private.guard_template_weightage_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_template_id bigint;
  total numeric(6,2);
begin
  -- OLD is unassigned on INSERT and NEW on DELETE, so neither may be referenced
  -- without first establishing which one exists. See correction 3 below for what
  -- happens when that rule is not followed.
  if tg_op = 'DELETE' then
    affected_template_id := old.template_id;
  else
    affected_template_id := new.template_id;
  end if;

  select coalesce(sum(tc.weightage_pct), 0)
    into total
  from public.ars_report_template_components as tc
  where tc.template_id = affected_template_id;

  if total > 100 then
    raise exception 'Component weightages would total %, which is more than 100. Reduce another component first.', total
      using errcode = '23514';
  end if;

  return null;
end;
$$;

revoke execute on function private.guard_template_weightage_total()
  from public, anon, authenticated;

create constraint trigger ars_report_template_components_weightage_total
after insert or update or delete on public.ars_report_template_components
deferrable initially deferred
for each row execute function private.guard_template_weightage_total();

-- ---------------------------------------------------------------------------
-- 3. A trigger that reads OLD on INSERT
-- ---------------------------------------------------------------------------
--
-- `private.ars_stamp_late` currently opens:
--
--     if tg_op = 'UPDATE' and old.status in ('submitted', 'reviewed') then
--
-- on a BEFORE INSERT OR UPDATE trigger. Whether PostgreSQL treats OLD as NULL
-- there or raises "record old is not assigned yet" was not settled by review,
-- and SQL's AND is not guaranteed to short-circuit. The two sibling functions in
-- the same pull request -- `ars_guard_report_release` and
-- `ars_recompute_report_score` -- both use the nested form and both carry
-- comments explaining why, so the codebase currently contradicts itself and the
-- unguarded version is the one installed.
--
-- Nesting costs two lines and removes the question rather than resting a live
-- trigger on an unreproduced probe result. The SEMANTICS below are deliberately
-- the current ones, not the original: preserving the stamp across a mentor's
-- 'submitted' -> 'reviewed' transition is correct and was a genuine fix. The
-- first draft of this function set `submitted_late := null` on that transition
-- and silently erased the evidence.
create or replace function private.ars_stamp_late()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deadline timestamptz;
begin
  -- Nested, not `tg_op = 'UPDATE' and old.status in (...)`. OLD is unassigned on
  -- INSERT and the flat form evaluates it there.
  if tg_op = 'UPDATE' then
    if old.status in ('submitted', 'reviewed') then
      -- The stamp records when the student handed the work in. It is historical
      -- evidence, not a property of the row's current status, so a mentor
      -- marking something reviewed weeks later must not re-evaluate it.
      new.submitted_late := old.submitted_late;
      return new;
    end if;
  end if;

  if new.status <> 'submitted' then
    new.submitted_late := null;
    return new;
  end if;

  deadline := private.round_due_at(new.round_id);

  if deadline is null then
    -- No deadline is not the same as on time, and must not flatten to false.
    new.submitted_late := null;
  else
    new.submitted_late := now() > deadline;
  end if;

  return new;
end;
$$;

revoke execute on function private.ars_stamp_late() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. A SECURITY DEFINER function nothing calls
-- ---------------------------------------------------------------------------
--
-- `private.mentor_reaches_report` was written for a policy that ended up using
-- `private.report_is_readable` instead. No policy and no function references it.
-- An unused SECURITY DEFINER function is attack surface with no purpose, and a
-- decoy for the next reader deciding which helper is authoritative.
drop function if exists private.mentor_reaches_report(bigint);

commit;
