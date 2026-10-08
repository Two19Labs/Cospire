-- Phase 6.6: the activity log, and the two unusual-activity flags that need no
-- video (one account in two sessions at once, one account from several places).
--
-- Annexure A promises admins an activity log with unusual-activity flags. The
-- table is the one operating manual §4 names -- user_id, event_type, meta, ip,
-- occurred_at -- plus org_id, because every RLS decision in this database is
-- made per organisation.
--
-- Who writes it: the server and nobody else. A row is evidence about a person,
-- so a student must not be able to write one, forge one about someone else, or
-- delete one about themselves. `authenticated` and `anon` therefore hold no
-- write grant and there is no write policy: refused twice. The application
-- writes through `public.record_activity`, which only `service_role` may
-- execute, from server code that has already verified the session and read the
-- address from the request headers itself.
--
-- Who reads it: an active admin of the same organisation. Nobody else, the
-- person the rows describe included.
--
-- Additive only: one new table, its indexes and policy, one new function.
-- Nothing deployed reads or writes any of it.

begin;

create table public.activity_log (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  user_id uuid not null,
  -- sign_in and sign_out from the sign-in and sign-out actions; `active` from
  -- every signed-in page view, at most once per session, address and ten
  -- minutes (see record_activity below).
  event_type text not null,
  -- { "session_id": "<Supabase Auth session id>" } today. The session id is
  -- what tells two browsers apart from two tabs of one browser.
  meta jsonb not null default '{}'::jsonb,
  -- Read by the server from x-forwarded-for, never from anything the browser
  -- sends in a form or a body. Null when the request carried none.
  ip inet,
  occurred_at timestamptz not null default now(),

  constraint activity_log_event_type_valid check (
    event_type in ('sign_in', 'sign_out', 'active')
  ),
  constraint activity_log_meta_is_object check (jsonb_typeof(meta) = 'object'),

  -- CASCADE, unlike most references to profiles. Profiles are never deleted in
  -- use -- an account is disabled -- so this only ever fires when a
  -- verification run removes its throwaway accounts. RESTRICT here would make
  -- every existing harness that signs in through the application fail its
  -- cleanup.
  constraint activity_log_user_org_fkey
    foreign key (user_id, org_id)
    references public.profiles (id, org_id)
    on delete cascade
);

-- The admin screen: the organisation's events, newest first, and the flag
-- window, which is a range on the same columns.
create index activity_log_org_occurred_idx
  on public.activity_log (org_id, occurred_at desc);
-- The ten-minute throttle in record_activity, and one person's history.
create index activity_log_user_occurred_idx
  on public.activity_log (user_id, occurred_at desc);

alter table public.activity_log enable row level security;

-- Supabase's default privileges grant every role everything on a new public
-- table. Take it all back, then give `authenticated` reading only.
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

create policy activity_log_select_admin
on public.activity_log
for select
to authenticated
using ((select private.is_admin_of_org(org_id)));

-- The only way a row is written. `service_role` only.
--
-- The organisation comes from the profile, not the caller, so a row cannot be
-- filed under the wrong one. An `active` row is skipped when the same session
-- was already seen from the same address in the last ten minutes: a page view
-- is not an event worth a row each, and ten minutes is fine enough to tell two
-- sessions apart (ACTIVE_THROTTLE_MINUTES in src/features/admin/activity-flags.ts
-- must match). The throttle lives here rather than in server memory, so it
-- holds across instances.
create or replace function public.record_activity(
  p_user_id uuid,
  p_event_type text,
  p_ip inet,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_org_id bigint;
  session_key text := coalesce(p_meta, '{}'::jsonb) ->> 'session_id';
begin
  select p.org_id into target_org_id
  from public.profiles as p
  where p.id = p_user_id;

  -- No profile, nothing to file it under. Not an error: sign-in for an
  -- account whose profile is missing is already handled elsewhere.
  if target_org_id is null then
    return;
  end if;

  if p_event_type = 'active' and exists (
    select 1
    from public.activity_log as l
    where l.user_id = p_user_id
      and l.occurred_at > now() - interval '10 minutes'
      and (l.meta ->> 'session_id') is not distinct from session_key
      and l.ip is not distinct from p_ip
  ) then
    return;
  end if;

  insert into public.activity_log (org_id, user_id, event_type, meta, ip)
  values (target_org_id, p_user_id, p_event_type, coalesce(p_meta, '{}'::jsonb), p_ip);
end;
$$;

revoke execute on function public.record_activity(uuid, text, inet, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_activity(uuid, text, inet, jsonb)
  to service_role;

commit;
