-- Phase 5a: the ARS report -- a configurable template, and the filled reports.
--
-- This is what replaces `ars_feedback`, which was removed on 2026-09-18 before
-- it reached any database. The Client meeting of 2026-09-16 settled that the
-- write-up belongs to a WHOLE PROCESS rather than to one submission, and the
-- Client's own sample report settles its shape. Until this migration, the
-- database could record THAT a mentor reviewed something, when, and who -- and
-- nothing at all about what they wrote.
--
-- The shape, read from the Client's sample rather than invented:
--
--   * A weighted component table. Each component has a score out of ten, a
--     weightage, and a readiness tag. The weightages total 100.
--   * An overall score that is COMPUTED from those, not typed. In the sample,
--     6.0x.20 + 6.0x.20 + 4.6x.15 + 3.6x.10 + 6.7x.35 = 5.795, printed as 58/100.
--     A mentor who edits one component must not have to redo that arithmetic,
--     and must not be able to get it wrong.
--   * Per component, a table of sub-metrics whose SHAPE DIFFERS. One component
--     scores each metric and comments on it; another carries narrative with no
--     scores at all; a third scores with a tag and no prose. Even the column
--     heading differs -- "Metric", "Section", "Criteria", "Parameters" -- which
--     is exactly the kind of thing that gets hardcoded and then cannot be
--     changed by the admin who was promised they could change it.
--   * Per component, up to three free-text blocks: strengths, development areas,
--     action plan. Genuinely optional. In the sample one component has no
--     strengths and another has no action plan, and the founder said so in
--     terms: "in some we won't write a plan of action ... or there's no
--     strengths".
--   * An executive summary giving each component a timeline and a next step,
--     and a closing note addressed to the student.
--
-- So: a TEMPLATE describes the shape, and a REPORT fills it in. Adding a
-- component, renaming a column heading or changing the tag vocabulary is data
-- entry. Annexure A promises admins can add round types over time; the founder
-- asked for the same of the report, because "it can change ... it's something
-- that cannot be fixed for us".
--
-- SCOPE. Annexure A promises a mentor "writes feedback and marks a submission as
-- reviewed" and that students read it. A configurable template carrying weighted
-- quantitative scoring is more than that sentence describes, and CONTEXT.md
-- records it as the largest single piece of new work the 2026-09-16 meeting
-- produced. It is built here on the owner's instruction of 2026-09-18. The
-- clause 12 paperwork is a separate matter and is not settled by this file.
--
-- NO CLIENT CONTENT IS REPRODUCED HERE. The sample report names a real student
-- and carries her marks and candid assessments of her. Clause 13.3 and the
-- context rule both bar that from this repository, so this migration seeds
-- nothing and carries no example row.
--
-- Additive: four new tables, helpers, triggers. Nothing deployed reads any of it.

begin;

-- ---------------------------------------------------------------------------
-- The template
-- ---------------------------------------------------------------------------

-- A report shape, owned by an organisation and optionally tied to a programme.
--
-- `course_id` is nullable on purpose. The founder expects a different report per
-- institution -- "when we do Plaksha, we would need an ARS report for Plaksha" --
-- but also has one house shape that most of them start from. Null means the
-- template is general to the organisation.
--
-- The two vocabularies are data, not enums. `readiness_tags` is the per-component
-- vocabulary ("Developing", "Needs Work", ...) and `overall_levels` the whole-report
-- one ("Moderate", ...). A Postgres enum would need a migration to add a word,
-- which is the thing this table exists to avoid.
create table public.ars_report_templates (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id),
  course_id bigint,
  name text not null,
  readiness_tags jsonb not null default '[]'::jsonb,
  overall_levels jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_report_templates_course_org_fkey
    foreign key (course_id, org_id)
    references public.courses (id, org_id)
    on delete restrict,

  constraint ars_report_templates_name_present
    check (length(btrim(name)) > 0),

  -- jsonb_typeof returns NULL for a SQL NULL, and a CHECK PASSES when its
  -- expression is NULL. `ars_rounds_form_has_fields` shipped that exact bug on
  -- 2026-09-10 and accepted the one row it existed to refuse. IS TRUE collapses
  -- the NULL to false. Every check over jsonb in this file ends the same way.
  constraint ars_report_templates_tags_are_array
    check ((jsonb_typeof(readiness_tags) = 'array') is true),
  constraint ars_report_templates_levels_are_array
    check ((jsonb_typeof(overall_levels) = 'array') is true),

  constraint ars_report_templates_id_org_unique unique (id, org_id)
);

create index ars_report_templates_org_idx
  on public.ars_report_templates (org_id, is_active);
create index ars_report_templates_course_idx
  on public.ars_report_templates (course_id);

create trigger ars_report_templates_set_updated_at
before update on public.ars_report_templates
for each row execute function private.set_updated_at();

-- One row of the component table, and the declaration of its sub-metric table.
--
-- `round_id` is nullable, and that is the point. Four of the five components in
-- the Client's sample map onto an ARS round -- a video essay, an aptitude mock,
-- a group discussion, an interview. The fifth does not: "Profile & Content" is
-- an assessment of who the student is, and there is no round in which anyone
-- submits a profile. Forcing components to be rounds would mean inventing a
-- round with nothing to submit purely so the report had somewhere to hang.
--
-- `metric_label` carries the column heading because the sample uses four
-- different words for it. `metric_names` is the ordered list of row labels.
-- `metric_has_scores` and `metric_has_notes` say which columns that table has,
-- and the three `uses_*` flags say which narrative blocks this component asks
-- for at all.
create table public.ars_report_template_components (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id),
  template_id bigint not null,
  round_id bigint,
  title text not null,
  weightage_pct numeric(5,2) not null,
  metric_label text not null default 'Metric',
  metric_names jsonb not null default '[]'::jsonb,
  metric_has_scores boolean not null default true,
  metric_has_notes boolean not null default true,
  uses_strengths boolean not null default true,
  uses_development_areas boolean not null default true,
  uses_action_plan boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_report_template_components_template_fkey
    foreign key (template_id, org_id)
    references public.ars_report_templates (id, org_id)
    on delete cascade,

  -- Deleting a round must not silently reshape a report template that refers to
  -- it, for the same reason a round with submissions cannot be deleted.
  constraint ars_report_template_components_round_fkey
    foreign key (round_id, org_id)
    references public.ars_rounds (id, org_id)
    on delete restrict,

  constraint ars_report_template_components_title_present
    check (length(btrim(title)) > 0),
  constraint ars_report_template_components_label_present
    check (length(btrim(metric_label)) > 0),

  -- A weightage of zero would be a component that cannot affect the total, which
  -- is a component that should not be in the table.
  constraint ars_report_template_components_weightage_range
    check (weightage_pct > 0 and weightage_pct <= 100),

  constraint ars_report_template_components_metrics_are_array
    check ((jsonb_typeof(metric_names) = 'array') is true),

  constraint ars_report_template_components_id_org_unique unique (id, org_id)
);

create index ars_report_template_components_template_idx
  on public.ars_report_template_components (template_id, sort_order);
create index ars_report_template_components_round_idx
  on public.ars_report_template_components (round_id);

create trigger ars_report_template_components_set_updated_at
before update on public.ars_report_template_components
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- The filled report
-- ---------------------------------------------------------------------------

-- One report per run of one process by one student.
--
-- `overall_score` is never written through the API. It is recomputed by trigger
-- from the component rows and their template weightages, so a mentor who changes
-- one score cannot leave a stale total behind, and cannot type a total that the
-- parts do not support.
--
-- Releasing is the moment the student may read it. It stamps
-- `ars_process_runs.report_released_at`, which already carries a constraint that
-- the run must have completed first -- so a report cannot reach a student
-- halfway through their own process.
create table public.ars_reports (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id),
  run_id bigint not null,
  template_id bigint not null,
  student_id uuid not null,
  status text not null default 'draft',
  overall_score numeric(5,2),
  overall_level text,
  closing_note text,
  written_by uuid,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One report per run. A second opinion is an edit, not a second row, for the
  -- same reason one feedback row per submission was chosen in step 3.
  constraint ars_reports_run_unique unique (run_id),

  constraint ars_reports_run_fkey
    foreign key (run_id, org_id)
    references public.ars_process_runs (id, org_id)
    on delete restrict,

  constraint ars_reports_template_fkey
    foreign key (template_id, org_id)
    references public.ars_report_templates (id, org_id)
    on delete restrict,

  constraint ars_reports_student_org_fkey
    foreign key (student_id, org_id)
    references public.profiles (id, org_id)
    on delete restrict,

  constraint ars_reports_writer_org_fkey
    foreign key (written_by, org_id)
    references public.profiles (id, org_id)
    on delete restrict,

  constraint ars_reports_status_valid
    check (status in ('draft', 'released')),

  constraint ars_reports_score_range
    check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),

  -- Released and stamped travel together in both directions, so neither can be
  -- true on its own.
  constraint ars_reports_released_matches
    check ((status = 'released') = (released_at is not null)),

  constraint ars_reports_id_org_unique unique (id, org_id)
);

create index ars_reports_student_idx on public.ars_reports (student_id, status);
create index ars_reports_org_status_idx on public.ars_reports (org_id, status);
create index ars_reports_written_by_idx on public.ars_reports (written_by);

create trigger ars_reports_set_updated_at
before update on public.ars_reports
for each row execute function private.set_updated_at();

-- One filled component.
--
-- `metrics` holds the sub-metric table as an array of objects. The template
-- declares the row labels and which columns exist; this holds what was entered.
-- It is jsonb rather than a fifth table because the shape is declared per
-- component and read as a unit, which is the same reasoning that put
-- `ars_rounds.config` in jsonb.
--
-- Every narrative column is nullable. The founder was explicit that a mentor
-- leaves fields blank, and the interface shows a dash rather than refusing.
create table public.ars_report_components (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id),
  report_id bigint not null,
  template_component_id bigint not null,
  score numeric(3,1),
  readiness_tag text,
  metrics jsonb not null default '[]'::jsonb,
  strengths text,
  development_areas text,
  action_plan text,
  timeline text,
  next_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_report_components_report_fkey
    foreign key (report_id, org_id)
    references public.ars_reports (id, org_id)
    on delete cascade,

  constraint ars_report_components_template_component_fkey
    foreign key (template_component_id, org_id)
    references public.ars_report_template_components (id, org_id)
    on delete restrict,

  -- One row per component per report. Two rows for the same component would make
  -- the weighted total ambiguous.
  constraint ars_report_components_unique
    unique (report_id, template_component_id),

  constraint ars_report_components_score_range
    check (score is null or (score >= 0 and score <= 10)),

  constraint ars_report_components_metrics_are_array
    check ((jsonb_typeof(metrics) = 'array') is true)
);

create index ars_report_components_report_idx
  on public.ars_report_components (report_id);
create index ars_report_components_template_component_idx
  on public.ars_report_components (template_component_id);

create trigger ars_report_components_set_updated_at
before update on public.ars_report_components
for each row execute function private.set_updated_at();

-- A report is a view of one process run through one compatible template. The
-- composite foreign keys above pin every reference to the organisation, but a
-- same-organisation caller could otherwise pair run A with student B, or use a
-- programme-specific template for a different programme. Those are relational
-- invariants and therefore live here rather than in a form action.
create or replace function private.guard_ars_report_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_student_id uuid;
  run_course_id bigint;
  template_course_id bigint;
  caller uuid := (select auth.uid());
begin
  select pr.student_id, pr.course_id
    into run_student_id, run_course_id
    from public.ars_process_runs as pr
   where pr.id = new.run_id
     and pr.org_id = new.org_id;

  if not found then
    raise exception 'report run % does not exist in organisation %', new.run_id, new.org_id
      using errcode = '23503';
  end if;

  if new.student_id is distinct from run_student_id then
    raise exception 'a report must belong to the student on its process run'
      using errcode = '23514';
  end if;

  select t.course_id
    into template_course_id
    from public.ars_report_templates as t
   where t.id = new.template_id
     and t.org_id = new.org_id;

  if not found then
    raise exception 'report template % does not exist in organisation %', new.template_id, new.org_id
      using errcode = '23503';
  end if;

  if template_course_id is not null and template_course_id <> run_course_id then
    raise exception 'a programme-specific report template must match the run programme'
      using errcode = '23514';
  end if;

  -- Authenticated callers never choose the author stamp. It is empty on a
  -- draft and becomes the releasing mentor at the release transition.
  if caller is not null then
    if new.status = 'released' then
      new.written_by := caller;
    else
      new.written_by := null;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_ars_report_shape()
  from public, anon, authenticated;

create trigger ars_reports_guard_shape
before insert or update on public.ars_reports
for each row execute function private.guard_ars_report_shape();

-- A filled component must come from the same template as its report. Without
-- this check, a component from another template in the same organisation could
-- be inserted and would corrupt the computed total while evading the release
-- completeness count.
create or replace function private.guard_ars_report_component_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_template_id bigint;
  component_template_id bigint;
begin
  select rep.template_id
    into report_template_id
    from public.ars_reports as rep
   where rep.id = new.report_id
     and rep.org_id = new.org_id;

  select tc.template_id
    into component_template_id
    from public.ars_report_template_components as tc
   where tc.id = new.template_component_id
     and tc.org_id = new.org_id;

  if report_template_id is null or component_template_id is null then
    raise exception 'report and template component must exist in the same organisation'
      using errcode = '23503';
  end if;

  if report_template_id <> component_template_id then
    raise exception 'a filled report component must belong to the report template'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_ars_report_component_shape()
  from public, anon, authenticated;

create trigger ars_report_components_guard_shape
before insert or update on public.ars_report_components
for each row execute function private.guard_ars_report_component_shape();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A mentor reaches a report when they are the active assigned mentor of the
-- student it belongs to. The same rule as every other ARS table, restated here
-- rather than joined through three of them.
create or replace function private.mentor_reaches_report(target_report_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_reports as rep
    where rep.id = target_report_id
      and private.is_assigned_mentor(rep.student_id)
  )
$$;

revoke execute on function private.mentor_reaches_report(bigint)
  from public, anon, authenticated;

-- The student the report belongs to, used by the component policies so a
-- component cannot be reached by anyone who could not reach its report.
create or replace function private.report_is_readable(target_report_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_reports as rep
    where rep.id = target_report_id
      and (
        private.is_admin_of_org(rep.org_id)
        or (
          rep.org_id = private.current_org_id()
          and (
            private.is_assigned_mentor(rep.student_id)
            or (rep.student_id = (select auth.uid()) and rep.status = 'released')
          )
        )
      )
  )
$$;

revoke execute on function private.report_is_readable(bigint)
  from public, anon, authenticated;

create or replace function private.report_is_writable(target_report_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_reports as rep
    where rep.id = target_report_id
      and rep.status = 'draft'
      and rep.org_id = private.current_org_id()
      and private.is_assigned_mentor(rep.student_id)
  )
$$;

revoke execute on function private.report_is_writable(bigint)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The computed total
-- ---------------------------------------------------------------------------

-- Recomputes `ars_reports.overall_score` from the component rows.
--
-- score(0..10) x weightage(%) summed, then x10, giving a figure out of 100 --
-- which is how the Client's own report prints it. Components with no score yet
-- contribute nothing, so a half-written report shows a partial total rather than
-- refusing to show one.
--
-- Rounded to one decimal rather than to a whole number: rounding is the
-- renderer's business, and rounding twice loses a mark at the boundary.
create or replace function private.ars_recompute_report_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_report_id bigint;
  computed numeric(5,2);
begin
  -- Not `coalesce(new.report_id, old.report_id)`: coalesce evaluates both
  -- arguments, and one of NEW and OLD is always unassigned -- NEW on DELETE,
  -- OLD on INSERT -- so the coalesce form raises rather than falling through.
  if tg_op = 'DELETE' then
    target_report_id := old.report_id;
  else
    target_report_id := new.report_id;
  end if;

  select round(coalesce(sum(c.score * tc.weightage_pct), 0) / 10.0, 1)
    into computed
  from public.ars_report_components as c
  join public.ars_report_template_components as tc
    on tc.id = c.template_component_id
  where c.report_id = target_report_id
    and c.score is not null;

  update public.ars_reports
     set overall_score = computed
   where id = target_report_id;

  return null;
end;
$$;

revoke execute on function private.ars_recompute_report_score()
  from public, anon, authenticated;

create trigger ars_report_components_recompute
after insert or update or delete on public.ars_report_components
for each row execute function private.ars_recompute_report_score();

-- ---------------------------------------------------------------------------
-- Releasing
-- ---------------------------------------------------------------------------

-- What a report must satisfy before a student may read it, and the stamp on the
-- run that records it happened.
--
-- Checked at RELEASE rather than on every write, deliberately. A template being
-- filled in does not yet total 100, and a half-written report is a normal state
-- that must not be refused. The completeness rule belongs at the moment the work
-- is declared finished.
--
-- What is required: every component of the template has a row, each carries a
-- score and a readiness tag, and the weightages total 100. What is NOT required:
-- any narrative. The founder was explicit that a mentor leaves fields blank.
create or replace function private.ars_guard_report_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected integer;
  filled integer;
  total numeric(6,2);
  was_released boolean := false;
begin
  -- OLD is unassigned on INSERT, and SQL's AND is not guaranteed to
  -- short-circuit, so `coalesce(old.status, ...)` inline would raise "record old
  -- is not assigned yet" the first time a report is created.
  if tg_op = 'UPDATE' then
    was_released := (old.status = 'released');
  end if;

  if new.status = 'released' and not was_released then

    select count(*), coalesce(sum(tc.weightage_pct), 0)
      into expected, total
    from public.ars_report_template_components as tc
    where tc.template_id = new.template_id;

    if expected = 0 then
      raise exception 'This report template has no components, so there is nothing to release.'
        using errcode = '23514';
    end if;

    if total <> 100 then
      raise exception 'Component weightages total %, not 100. Correct the template before releasing.', total
        using errcode = '23514';
    end if;

    select count(*)
      into filled
    from public.ars_report_components as c
    join public.ars_report_template_components as tc
      on tc.id = c.template_component_id
    where c.report_id = new.id
      and tc.template_id = new.template_id
      and c.score is not null
      and c.readiness_tag is not null;

    if filled <> expected then
      raise exception 'Every component needs a score and a readiness tag before release: % of % are complete.', filled, expected
        using errcode = '23514';
    end if;

    new.released_at := now();
    new.written_by := coalesce(new.written_by, (select auth.uid()));

    -- The run carries its own constraint that a report cannot be released before
    -- the process completed, so this is where that rule bites.
    update public.ars_process_runs
       set report_released_at = now()
     where id = new.run_id;

  elsif new.status = 'draft' then
    new.released_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function private.ars_guard_report_release()
  from public, anon, authenticated;

create trigger ars_reports_guard_release
before insert or update on public.ars_reports
for each row execute function private.ars_guard_report_release();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.ars_report_templates enable row level security;
alter table public.ars_report_templates force row level security;
alter table public.ars_report_template_components enable row level security;
alter table public.ars_report_template_components force row level security;
alter table public.ars_reports enable row level security;
alter table public.ars_reports force row level security;
alter table public.ars_report_components enable row level security;
alter table public.ars_report_components force row level security;

-- Templates: admins author them; mentors read them because they cannot fill in a
-- shape they cannot see. Students never read a template -- they read a report.
create policy ars_report_templates_select_staff
on public.ars_report_templates
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.current_app_role()) = 'mentor'
  )
);

create policy ars_report_templates_insert_admin
on public.ars_report_templates
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy ars_report_templates_update_admin
on public.ars_report_templates
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy ars_report_templates_delete_admin
on public.ars_report_templates
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

create policy ars_report_template_components_select_staff
on public.ars_report_template_components
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.current_app_role()) = 'mentor'
  )
);

create policy ars_report_template_components_insert_admin
on public.ars_report_template_components
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy ars_report_template_components_update_admin
on public.ars_report_template_components
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy ars_report_template_components_delete_admin
on public.ars_report_template_components
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

-- The report itself. Annexure A's rule, one more time: the student, their
-- assigned mentor, and admins -- and nobody else.
--
-- The student reads it only once released. A half-written assessment of someone
-- is not something they should find by refreshing.
create policy ars_reports_select_authorized
on public.ars_reports
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      (student_id = (select auth.uid()) and status = 'released')
      or (select private.is_assigned_mentor(student_id))
    )
  )
);

-- Only the assigned mentor writes a report. Admins see everything and write
-- nothing here, which is the same split step 3 took: Annexure A gives admins
-- "visibility of all submissions", not authorship of the feedback.
create policy ars_reports_insert_mentor
on public.ars_reports
for insert
to authenticated
with check (
  org_id = (select private.current_org_id())
  and status = 'draft'
  and (select private.is_assigned_mentor(student_id))
);

create policy ars_reports_update_mentor
on public.ars_reports
for update
to authenticated
using (
  org_id = (select private.current_org_id())
  and status = 'draft'
  and (select private.is_assigned_mentor(student_id))
)
with check (
  org_id = (select private.current_org_id())
  and (select private.is_assigned_mentor(student_id))
);

-- Components follow their report exactly, so there is one access rule rather
-- than two that could drift apart.
create policy ars_report_components_select_authorized
on public.ars_report_components
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (select private.report_is_readable(report_id))
);

create policy ars_report_components_insert_mentor
on public.ars_report_components
for insert
to authenticated
with check (
  org_id = (select private.current_org_id())
  and (select private.report_is_writable(report_id))
);

create policy ars_report_components_update_mentor
on public.ars_report_components
for update
to authenticated
using (
  org_id = (select private.current_org_id())
  and (select private.report_is_writable(report_id))
)
with check (
  org_id = (select private.current_org_id())
  and (select private.report_is_writable(report_id))
);

create policy ars_report_components_delete_mentor
on public.ars_report_components
for delete
to authenticated
using (
  org_id = (select private.current_org_id())
  and (select private.report_is_writable(report_id))
);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- `anon` and `authenticated` are granted nothing by default here; what follows
-- is the whole API surface. Note what is absent from the UPDATE grants on
-- ars_reports: `overall_score` and `released_at` are computed and stamped by
-- trigger, so no caller may set either even if a policy would let the row
-- through. That is the same reasoning that keeps `submitted_at` off the grant
-- list in step 3.

revoke all on table public.ars_report_templates from anon, authenticated;
revoke all on table public.ars_report_template_components from anon, authenticated;
revoke all on table public.ars_reports from anon, authenticated;
revoke all on table public.ars_report_components from anon, authenticated;
revoke all on sequence public.ars_report_templates_id_seq from anon, authenticated;
revoke all on sequence public.ars_report_template_components_id_seq from anon, authenticated;
revoke all on sequence public.ars_reports_id_seq from anon, authenticated;
revoke all on sequence public.ars_report_components_id_seq from anon, authenticated;

grant select, insert, delete on table public.ars_report_templates to authenticated;
grant update (name, course_id, readiness_tags, overall_levels, is_active)
  on table public.ars_report_templates to authenticated;

grant select, insert, delete on table public.ars_report_template_components to authenticated;
grant update (
  round_id, title, weightage_pct, metric_label, metric_names,
  metric_has_scores, metric_has_notes,
  uses_strengths, uses_development_areas, uses_action_plan, sort_order
) on table public.ars_report_template_components to authenticated;

grant select, insert on table public.ars_reports to authenticated;
grant update (status, overall_level, closing_note, template_id)
  on table public.ars_reports to authenticated;

grant select, insert, delete on table public.ars_report_components to authenticated;
grant update (
  score, readiness_tag, metrics,
  strengths, development_areas, action_plan, timeline, next_step
) on table public.ars_report_components to authenticated;

grant usage, select on sequence public.ars_report_templates_id_seq to authenticated;
grant usage, select on sequence public.ars_report_template_components_id_seq to authenticated;
grant usage, select on sequence public.ars_reports_id_seq to authenticated;
grant usage, select on sequence public.ars_report_components_id_seq to authenticated;

commit;
