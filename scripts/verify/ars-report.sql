-- Rollback-only verification for the ARS report and late-submission migrations.
--
-- Run with:
--   npx supabase db query --linked --file scripts/verify/ars-report.sql
--
-- The probe uses existing test identities but writes only transaction-scoped
-- rows with a unique prefix. It switches to the real `authenticated` role for
-- every RLS assertion and rolls the entire transaction back at the end.

begin;

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void
language plpgsql
as $$
begin
  if ok is not true then
    raise exception 'PROBE FAILED: %', message;
  end if;
end;
$$;

-- Capture the established baseline identities without printing personal data.
select set_config('probe.admin', id::text, true)
from public.profiles
where org_id = 1 and role = 'admin' and status = 'active'
limit 1;

select set_config('probe.mentor', mentor_id::text, true),
       set_config('probe.student', student_id::text, true)
from public.mentor_assignments
where org_id = 1
limit 1;

select set_config('probe.other_student', id::text, true)
from public.profiles
where org_id = 1
  and role = 'student'
  and id <> current_setting('probe.student')::uuid
limit 1;

select set_config('probe.rival_admin', id::text, true)
from public.profiles
where org_id <> 1 and role = 'admin' and status = 'active'
limit 1;

insert into public.courses (org_id, title)
values (1, 'Verify ARS report ' || txid_current())
returning set_config('probe.course', id::text, true);

insert into public.ars_rounds (
  org_id, course_id, name, submission_mode, config, sort_order, due_at
)
values (
  1,
  current_setting('probe.course')::bigint,
  'Late written round',
  'text',
  '{"prompt":"Rollback-only verification"}'::jsonb,
  1,
  now() - interval '1 hour'
)
returning set_config('probe.round', id::text, true);

insert into public.ars_process_runs (
  org_id, course_id, student_id, round_order, completed_at
)
values (
  1,
  current_setting('probe.course')::bigint,
  current_setting('probe.student')::uuid,
  jsonb_build_array(current_setting('probe.round')::bigint),
  now()
)
returning set_config('probe.run', id::text, true);

insert into public.ars_submissions (
  org_id, run_id, round_id, student_id, status, answer
)
values (
  1,
  current_setting('probe.run')::bigint,
  current_setting('probe.round')::bigint,
  current_setting('probe.student')::uuid,
  'submitted',
  '{"text":"rollback-only answer"}'::jsonb
)
returning set_config('probe.submission', id::text, true);

select pg_temp.assert_true(
  (select submitted_late is true
   from public.ars_submissions
   where id = current_setting('probe.submission')::bigint),
  'a submission after due_at was not stamped late'
);

insert into public.ars_report_templates (
  org_id, course_id, name, readiness_tags, overall_levels
)
values (
  1,
  current_setting('probe.course')::bigint,
  'Primary verification template',
  '["Developing","Ready"]'::jsonb,
  '["Moderate","Strong"]'::jsonb
)
returning set_config('probe.template', id::text, true);

insert into public.ars_report_template_components (
  org_id, template_id, round_id, title, weightage_pct, metric_names, sort_order
)
values (
  1,
  current_setting('probe.template')::bigint,
  current_setting('probe.round')::bigint,
  'Written response',
  60,
  '["Structure"]'::jsonb,
  1
)
returning set_config('probe.component_1', id::text, true);

insert into public.ars_report_template_components (
  org_id, template_id, title, weightage_pct, metric_names, sort_order
)
values (
  1,
  current_setting('probe.template')::bigint,
  'Profile',
  40,
  '["Clarity"]'::jsonb,
  2
)
returning set_config('probe.component_2', id::text, true);

insert into public.ars_report_templates (org_id, name)
values (1, 'Foreign verification template')
returning set_config('probe.foreign_template', id::text, true);

insert into public.ars_report_template_components (
  org_id, template_id, title, weightage_pct, sort_order
)
values (
  1,
  current_setting('probe.foreign_template')::bigint,
  'Wrong template component',
  100,
  1
)
returning set_config('probe.foreign_component', id::text, true);

-- Relational attacks run as the database owner so their rejection proves the
-- trigger invariant rather than merely an RLS policy happening to hide them.
do $$
begin
  begin
    insert into public.ars_reports (
      org_id, run_id, template_id, student_id
    ) values (
      1,
      current_setting('probe.run')::bigint,
      current_setting('probe.template')::bigint,
      current_setting('probe.other_student')::uuid
    );
    raise exception 'PROBE FAILED: report accepted a student different from its run';
  exception
    when check_violation then null;
  end;
end;
$$;

-- The assigned mentor creates the real draft through RLS. Supplying a forged
-- writer is ignored; authorship is stamped only when the report is released.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('probe.mentor'),
    'role', 'authenticated'
  )::text,
  true
);

insert into public.ars_reports (
  org_id, run_id, template_id, student_id, written_by
)
values (
  1,
  current_setting('probe.run')::bigint,
  current_setting('probe.template')::bigint,
  current_setting('probe.student')::uuid,
  current_setting('probe.other_student')::uuid
)
returning set_config('probe.report', id::text, true);

select pg_temp.assert_true(
  (select written_by is null
   from public.ars_reports
   where id = current_setting('probe.report')::bigint),
  'an authenticated caller forged written_by on a draft'
);

reset role;

do $$
begin
  begin
    insert into public.ars_report_components (
      org_id, report_id, template_component_id, score, readiness_tag
    ) values (
      1,
      current_setting('probe.report')::bigint,
      current_setting('probe.foreign_component')::bigint,
      10,
      'Ready'
    );
    raise exception 'PROBE FAILED: report accepted a component from another template';
  exception
    when check_violation then null;
  end;
end;
$$;

-- A student cannot see a draft report or its components.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('probe.student'),
    'role', 'authenticated'
  )::text,
  true
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.ars_reports
   where id = current_setting('probe.report')::bigint),
  'student could read a draft report'
);

reset role;

-- Fill one component as the assigned mentor, then prove release is refused
-- until every template component is present and scored.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('probe.mentor'),
    'role', 'authenticated'
  )::text,
  true
);

insert into public.ars_report_components (
  org_id, report_id, template_component_id, score, readiness_tag, metrics
)
values (
  1,
  current_setting('probe.report')::bigint,
  current_setting('probe.component_1')::bigint,
  8,
  'Ready',
  '[{"name":"Structure","score":8}]'::jsonb
);

do $$
begin
  begin
    update public.ars_reports
       set status = 'released'
     where id = current_setting('probe.report')::bigint;
    raise exception 'PROBE FAILED: incomplete report was released';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into public.ars_report_components (
  org_id, report_id, template_component_id, score, readiness_tag, metrics
)
values (
  1,
  current_setting('probe.report')::bigint,
  current_setting('probe.component_2')::bigint,
  6,
  'Developing',
  '[{"name":"Clarity","score":6}]'::jsonb
);

select pg_temp.assert_true(
  (select overall_score = 72.0
   from public.ars_reports
   where id = current_setting('probe.report')::bigint),
  'weighted score was not recomputed as 72.0'
);

update public.ars_reports
   set status = 'released', overall_level = 'Moderate'
 where id = current_setting('probe.report')::bigint;

select pg_temp.assert_true(
  (select status = 'released'
          and released_at is not null
          and written_by = current_setting('probe.mentor')::uuid
   from public.ars_reports
   where id = current_setting('probe.report')::bigint),
  'release did not stamp status, time, and the authenticated mentor'
);

select pg_temp.assert_true(
  (select report_released_at is not null
   from public.ars_process_runs
   where id = current_setting('probe.run')::bigint),
  'release did not stamp the process run'
);

update public.ars_submissions
   set status = 'reviewed'
 where id = current_setting('probe.submission')::bigint;

select pg_temp.assert_true(
  (select submitted_late is true and status = 'reviewed'
   from public.ars_submissions
   where id = current_setting('probe.submission')::bigint),
  'mentor review erased the historical late stamp'
);

reset role;

-- The owning student can now read the report and both components.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('probe.student'),
    'role', 'authenticated'
  )::text,
  true
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.ars_reports
   where id = current_setting('probe.report')::bigint),
  'student could not read their released report'
);

select pg_temp.assert_true(
  (select count(*) = 2 from public.ars_report_components
   where report_id = current_setting('probe.report')::bigint),
  'student could not read both released report components'
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.ars_report_templates
   where id = current_setting('probe.template')::bigint),
  'student could not read the template for their released report'
);

select pg_temp.assert_true(
  (select count(*) = 2 from public.ars_report_template_components
   where template_id = current_setting('probe.template')::bigint),
  'student could not read the component labels for their released report'
);

reset role;

-- An unrelated student in the same organisation sees neither row type.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('probe.other_student'),
    'role', 'authenticated'
  )::text,
  true
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.ars_reports
   where id = current_setting('probe.report')::bigint),
  'unrelated student could read another student report'
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.ars_report_components
   where report_id = current_setting('probe.report')::bigint),
  'unrelated student could read another student report components'
);

reset role;

-- An admin from another organisation also sees nothing.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('probe.rival_admin'),
    'role', 'authenticated'
  )::text,
  true
);

select pg_temp.assert_true(
  (select count(*) = 0 from public.ars_reports
   where id = current_setting('probe.report')::bigint),
  'another organisation admin could read the report'
);

reset role;

-- Return one deliberately non-sensitive proof row before rollback.
select jsonb_build_object(
  'checks', 17,
  'weighted_score', 72.0,
  'late_stamp_preserved', true,
  'transaction', 'rolled back'
) as result;

rollback;
