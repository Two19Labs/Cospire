-- A student's released-report page needs the template's labels and ordered
-- component definitions as well as the filled values. The original policies
-- allowed the report and its filled components but limited the two template
-- tables to staff, making an otherwise authorized report impossible to render.
-- This helper opens only the template referenced by one of the caller's own
-- released reports; drafts and other students' templates remain invisible.

begin;

create or replace function private.student_reaches_released_report_template(
  target_template_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_reports as rep
    where rep.template_id = target_template_id
      and rep.student_id = (select auth.uid())
      and rep.org_id = private.current_org_id()
      and rep.status = 'released'
  )
$$;

revoke execute on function private.student_reaches_released_report_template(bigint)
  from public, anon;
grant execute on function private.student_reaches_released_report_template(bigint)
  to authenticated;

drop policy ars_report_templates_select_staff
  on public.ars_report_templates;
create policy ars_report_templates_select_authorized
on public.ars_report_templates
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      (select private.current_app_role()) = 'mentor'
      or (select private.student_reaches_released_report_template(id))
    )
  )
);

drop policy ars_report_template_components_select_staff
  on public.ars_report_template_components;
create policy ars_report_template_components_select_authorized
on public.ars_report_template_components
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      (select private.current_app_role()) = 'mentor'
      or (select private.student_reaches_released_report_template(template_id))
    )
  )
);

commit;
