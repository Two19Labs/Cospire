-- One review queue for two kinds of report (owner's decision D65, from the
-- Client's review of 2026-11-23): a **help ticket** (a technical problem,
-- raised from the student's Help page) and a **reported mistake** (a content
-- error, raised from the "Report a mistake" button on every student page).
-- Both land in one admin inbox, which reads, filters and resolves them.
--
-- Who may do what is the database's decision, not a route's:
--
--   * a student inserts only their own rows, in their own organisation, as
--     `open`, and reads only their own;
--   * an admin of the organisation reads every row and changes the status;
--   * a mentor reads nothing, and nobody deletes.
--
-- Column privileges carry half of it: `authenticated` may insert only the five
-- columns a report is made of, and update only `status`. So a student naming a
-- status, a resolver or a date on insert is refused before RLS is consulted,
-- and an admin cannot rewrite what a student said. Who resolved it and when are
-- stamped by the trigger from the session, never taken from the caller.
--
-- Additive: one new table, one trigger function. Nothing deployed reads it.

begin;

create table public.support_reports (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  -- The signed-in student. Defaults to the session, and the insert policy
  -- refuses any other value, so a report can never be filed in another's name.
  reporter_id uuid not null default auth.uid(),
  kind text not null,
  -- Where the student was: path and query, as the button or the Help page saw
  -- it. Text, not a link the inbox follows blindly.
  page text not null,
  comment text not null,
  status text not null default 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint support_reports_kind_valid check (kind in ('ticket', 'mistake')),
  constraint support_reports_status_valid check (status in ('open', 'resolved')),
  constraint support_reports_page_length check (char_length(page) between 1 and 500),
  constraint support_reports_comment_length check (
    char_length(comment) between 1 and 2000 and btrim(comment) <> ''
  ),
  -- Resolved means somebody resolved it, at a time; open means nobody has.
  constraint support_reports_resolution_shape check (
    (status = 'resolved') = (resolved_by is not null and resolved_at is not null)
    and (resolved_by is null) = (resolved_at is null)
  ),
  constraint support_reports_reporter_org_fkey foreign key (reporter_id, org_id)
    references public.profiles (id, org_id) on delete restrict,
  constraint support_reports_resolver_org_fkey foreign key (resolved_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

-- The inbox: one organisation, one kind, one status, newest first, a page at a
-- time. The student's own reports are read by reporter.
create index support_reports_inbox_idx
  on public.support_reports (org_id, kind, status, created_at desc, id desc);
create index support_reports_reporter_idx
  on public.support_reports (reporter_id, created_at desc);

alter table public.support_reports enable row level security;
alter table public.support_reports force row level security;

revoke all on table public.support_reports from public, anon, authenticated;
grant select on table public.support_reports to authenticated;
grant insert (org_id, reporter_id, kind, page, comment) on table public.support_reports to authenticated;
grant update (status) on table public.support_reports to authenticated;

-- Reading. `current_app_role()` reads only an active profile, so a disabled
-- student sees nothing, as everywhere else in this schema.
create policy support_reports_select_own on public.support_reports
for select to authenticated
using (
  (select private.current_app_role()) = 'student'
  and reporter_id = (select auth.uid())
);

create policy support_reports_select_admin on public.support_reports
for select to authenticated
using (private.is_admin_of_org(org_id));

-- Writing. A student files their own report, in their own organisation, open.
-- (`status`, `resolved_by` and `resolved_at` are not insertable at all; the
-- check restates it so the policy reads true on its own.)
create policy support_reports_insert_own on public.support_reports
for insert to authenticated
with check (
  (select private.current_app_role()) = 'student'
  and reporter_id = (select auth.uid())
  and org_id = (select private.current_org_id())
  and status = 'open'
  and resolved_by is null
  and resolved_at is null
);

-- Only an admin of the organisation changes a status. There is no student
-- update policy, so a student's update matches no row.
create policy support_reports_update_admin on public.support_reports
for update to authenticated
using (private.is_admin_of_org(org_id))
with check (private.is_admin_of_org(org_id));

-- No delete policy and no delete privilege: a report is resolved, never
-- removed.

-- Who resolved it and when come from the session. Reopening clears both.
create or replace function private.stamp_support_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_by := (select auth.uid());
      new.resolved_at := now();
    else
      new.resolved_by := null;
      new.resolved_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_support_report() from public, anon, authenticated;

create trigger support_reports_stamp
before update on public.support_reports
for each row execute function private.stamp_support_report();

comment on table public.support_reports is
  'Help tickets and reported content mistakes from students, in one admin review queue (D65). Students insert and read their own; admins of the org read and set the status; nobody deletes.';

commit;
