-- Programmes and ARS processes stop being the same thing.
--
-- `courses` has carried both since Phase 5a step 1: a learning programme
-- ("Ashoka - Aptitude Test Prep") and an admission-readiness process ("MU ARS")
-- are the same row, distinguished only by whether anyone happened to hang ARS
-- rounds off it. So the Programmes list shows processes, the ARS list shows
-- programmes, and the owner reported exactly that on 2026-09-20.
--
-- One column fixes it. `kind` says what a row is, each screen filters on it,
-- and nothing else about the shape changes: an ARS process still owns rounds
-- through `ars_rounds.course_id`, and access is still granted through
-- `content_access` with `resource_type = 'course'`. Splitting the table instead
-- would mean rewriting that composite foreign key, every policy that reaches
-- through it, and every grant -- for a distinction that is one word wide.
--
-- Additive and safe against the deployed code, per the expand-and-contract rule:
-- the column has a default, so code that has never heard of it keeps inserting
-- successfully and keeps reading every row it read before. Vercel deploys on
-- merge while migrations are applied by hand, so a migration that removed or
-- narrowed anything here would break the running application in the gap.

alter table public.courses
  add column if not exists kind text not null default 'programme';

-- A check rather than an enum, for the reason `ars_rounds.submission_mode` uses
-- one: widening a check is a one-line migration, and adding a value to an enum
-- in use is not.
alter table public.courses
  drop constraint if exists courses_kind_valid;

alter table public.courses
  add constraint courses_kind_valid
  check (kind in ('programme', 'ars_process'));

-- The backfill rule, and it is the only one true of the data as it stands: a
-- course that already has ARS rounds is an admission process, and everything
-- else is a learning programme. Stated as a rule rather than a list of ids so
-- it is reproducible on any copy of this database -- clause 3.9 promises the
-- migration history recreates it.
--
-- Deliberately NOT `where kind = 'programme'`: on a re-run that would be the
-- same set, and being explicit about the condition makes the intent readable.
update public.courses c
set kind = 'ars_process'
where exists (
  select 1 from public.ars_rounds r where r.course_id = c.id
);

-- Each admin list is now "this organisation's rows of one kind, in order", so
-- the index leads with the two columns both lists filter on. The existing
-- courses_org_id_sort_order_idx stays: it still serves the student's own list,
-- which does not filter by kind.
create index if not exists courses_org_kind_sort_idx
  on public.courses (org_id, kind, sort_order, id);

comment on column public.courses.kind is
  'programme = teachable content (aptitude prep, video curriculums). '
  'ars_process = an admission-readiness process that owns ars_rounds. '
  'Backfilled 2026-09-20 by the rule "has rounds means process".';
