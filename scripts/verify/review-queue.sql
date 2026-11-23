-- Rollback-only database verification for the one review queue (D65):
-- `support_reports`, help tickets and reported mistakes. Every refusal is
-- proven by what the database refuses or by counting rows, never by the
-- absence of an error.
--
-- Once `20261123100000_support_reports.sql` is applied, run it as it is:
--
--   npx supabase db query --linked -f scripts/verify/review-queue.sql
--
-- Before it is applied, splice the migration in after `begin;` (its own
-- `begin;`/`commit;` stripped), as the other probes here are proven:
--
--   { sed -n '1,/^begin;$/p' scripts/verify/review-queue.sql
--     sed '/^begin;$/d;/^commit;$/d' supabase/migrations/20261123100000_support_reports.sql
--     sed -n '/^begin;$/,$p' scripts/verify/review-queue.sql | tail -n +2
--   } > coverage/review-queue-spliced.sql
--   npx supabase db query --linked -f coverage/review-queue-spliced.sql
--
-- The whole thing rolls back, so it writes nothing. It needs, in org 1, one
-- active admin, one active mentor and two active students.
begin;

create or replace function pg_temp.ok(value boolean, message text) returns void language plpgsql as $$
begin
  if value is not true then raise exception 'PROBE FAILED: %', message; end if;
  raise notice 'pass: %', message;
  perform set_config('probe.passes', (coalesce(nullif(current_setting('probe.passes', true), ''), '0')::int + 1)::text, true);
end $$;
create or replace function pg_temp.refused(statement text, state text, message text) returns void language plpgsql as $$
begin
  begin execute statement; raise exception 'accepted' using errcode='P0099';
  exception when others then
    if sqlstate='P0099' then raise exception 'PROBE FAILED (accepted): %', message; end if;
    if sqlstate<>state then raise exception 'PROBE FAILED (% instead of %: %): %', sqlstate, state, sqlerrm, message; end if;
  end;
  perform pg_temp.ok(true, message);
end $$;
create or replace function pg_temp.as_user(key text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('probe.'||key), 'role', 'authenticated')::text, true)
$$;
create or replace function pg_temp.affected(statement text) returns bigint language plpgsql as $$
declare n bigint;
begin execute statement; get diagnostics n = row_count; return n; end $$;
create or replace function pg_temp.v(key text) returns bigint language sql as $$
  select current_setting('probe.'||key)::bigint
$$;
grant execute on function pg_temp.ok(boolean,text), pg_temp.refused(text,text,text), pg_temp.as_user(text),
  pg_temp.affected(text), pg_temp.v(text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select pg_temp.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.support_reports'::regclass),
  'support_reports has RLS enabled and forced');
select pg_temp.ok((select count(*)=0 from pg_policies where schemaname='public' and tablename='support_reports' and cmd='DELETE'),
  'there is no delete policy');
select pg_temp.ok(not has_table_privilege('anon','public.support_reports','select')
  and not has_table_privilege('authenticated','public.support_reports','delete'),
  'anon holds nothing, and authenticated cannot delete');
select pg_temp.ok(not has_column_privilege('authenticated','public.support_reports','status','insert')
  and not has_column_privilege('authenticated','public.support_reports','resolved_by','insert')
  and not has_column_privilege('authenticated','public.support_reports','comment','update')
  and has_column_privilege('authenticated','public.support_reports','status','update'),
  'authenticated may insert only the report columns and update only status');

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' order by id limit 1;
select set_config('probe.mentor', id::text, true) from public.profiles where org_id=1 and role='mentor' and status='active' order by id limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select set_config('probe.other', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id offset 1 limit 1;
select pg_temp.ok(current_setting('probe.admin', true) <> '' and current_setting('probe.mentor', true) <> ''
  and current_setting('probe.student', true) <> '' and current_setting('probe.other', true) <> '',
  'fixtures: an admin, a mentor and two students in org 1');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- A student files their own
-- ---------------------------------------------------------------------------
select pg_temp.as_user('student');
insert into public.support_reports (org_id, reporter_id, kind, page, comment)
  values (1, current_setting('probe.student')::uuid, 'mistake', '/student/attempts/1?q=3', 'Question 3: the key says B, the solution says C.')
  returning set_config('probe.mine', id::text, true);
select pg_temp.ok((select status='open' and resolved_by is null from public.support_reports where id=pg_temp.v('mine')),
  'a student files a report; it starts open and unresolved');
insert into public.support_reports (org_id, kind, page, comment)
  values (1, 'ticket', '/student', 'The video will not load.')
  returning set_config('probe.ticket', id::text, true);
select pg_temp.ok((select reporter_id=current_setting('probe.student')::uuid from public.support_reports where id=pg_temp.v('ticket')),
  'reporter_id defaults to the session');

select pg_temp.refused(format($q$insert into public.support_reports (org_id, reporter_id, kind, page, comment)
  values (1, %L, 'ticket', '/student', 'Filed in another name')$q$, current_setting('probe.other')),
  '42501', 'a student cannot file a report in another student''s name');
select pg_temp.refused($q$insert into public.support_reports (org_id, kind, page, comment, status)
  values (1, 'ticket', '/student', 'Born resolved', 'resolved')$q$,
  '42501', 'a student cannot set a status on insert');
select pg_temp.refused(format($q$insert into public.support_reports (org_id, kind, page, comment) values (5, 'ticket', '/student', 'Other org')$q$),
  '42501', 'a student cannot file into another organisation');
select pg_temp.refused($q$insert into public.support_reports (org_id, kind, page, comment) values (1, 'praise', '/student', 'x')$q$,
  '23514', 'the kind is ticket or mistake only');
select pg_temp.refused($q$insert into public.support_reports (org_id, kind, page, comment) values (1, 'ticket', '/student', '   ')$q$,
  '23514', 'a blank comment is refused');
select pg_temp.refused(format($q$insert into public.support_reports (org_id, kind, page, comment) values (1, 'ticket', '/student', %L)$q$, repeat('x', 2001)),
  '23514', 'a comment over 2000 characters is refused');

select pg_temp.ok(pg_temp.affected(format($q$update public.support_reports set status='resolved' where id=%s$q$, pg_temp.v('mine'))) = 0,
  'a student cannot resolve their own report (no row matches)');
select pg_temp.refused(format($q$update public.support_reports set comment='edited' where id=%s$q$, pg_temp.v('mine')),
  '42501', 'nor rewrite it');
select pg_temp.refused(format($q$delete from public.support_reports where id=%s$q$, pg_temp.v('mine')),
  '42501', 'nor delete it');
select pg_temp.ok((select count(*) filter (where id in (pg_temp.v('mine'), pg_temp.v('ticket')))=2
  and count(*) filter (where reporter_id<>current_setting('probe.student')::uuid)=0 from public.support_reports),
  'the student reads their own two reports and nobody else''s');

-- ---------------------------------------------------------------------------
-- Everyone else
-- ---------------------------------------------------------------------------
select pg_temp.as_user('other');
select pg_temp.ok((select count(*)=0 from public.support_reports where reporter_id<>current_setting('probe.other')::uuid),
  'another student reads none of them');
select pg_temp.ok(pg_temp.affected(format($q$update public.support_reports set status='resolved' where id=%s$q$, pg_temp.v('mine'))) = 0,
  'and cannot resolve them');

select pg_temp.as_user('mentor');
select pg_temp.ok((select count(*)=0 from public.support_reports), 'a mentor reads none');
select pg_temp.refused($q$insert into public.support_reports (org_id, kind, page, comment) values (1, 'ticket', '/mentor', 'Mentor ticket')$q$,
  '42501', 'and cannot file one');

-- ---------------------------------------------------------------------------
-- The admin
-- ---------------------------------------------------------------------------
select pg_temp.as_user('admin');
select pg_temp.ok((select count(*)=2 from public.support_reports where id in (pg_temp.v('mine'), pg_temp.v('ticket'))),
  'an admin reads the org''s reports');
select pg_temp.ok(pg_temp.affected(format($q$update public.support_reports set status='resolved' where id=%s$q$, pg_temp.v('mine'))) = 1,
  'an admin resolves one');
select pg_temp.ok((select resolved_by=current_setting('probe.admin')::uuid and resolved_at is not null and updated_at >= created_at
  from public.support_reports where id=pg_temp.v('mine')),
  'resolved_by and resolved_at are stamped from the session');
select pg_temp.refused(format($q$update public.support_reports set resolved_by=%L where id=%s$q$, current_setting('probe.mentor'), pg_temp.v('mine')),
  '42501', 'an admin cannot write the resolver directly');
select pg_temp.refused(format($q$update public.support_reports set comment='edited' where id=%s$q$, pg_temp.v('mine')),
  '42501', 'nor rewrite what the student said');
update public.support_reports set status='open' where id=pg_temp.v('mine');
select pg_temp.ok((select status='open' and resolved_by is null and resolved_at is null from public.support_reports where id=pg_temp.v('mine')),
  'reopening clears the resolver and the date');
select pg_temp.refused(format($q$update public.support_reports set status='closed' where id=%s$q$, pg_temp.v('mine')),
  '23514', 'the status is open or resolved only');
select pg_temp.refused(format($q$delete from public.support_reports where id=%s$q$, pg_temp.v('mine')),
  '42501', 'an admin cannot delete a report');
select pg_temp.refused($q$insert into public.support_reports (org_id, kind, page, comment) values (1, 'ticket', '/admin', 'Admin ticket')$q$,
  '42501', 'an admin does not file reports');

-- ---------------------------------------------------------------------------
-- A disabled student, and nobody signed in
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set status='disabled' where id=current_setting('probe.student')::uuid;
set local role authenticated;
select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=0 from public.support_reports), 'a disabled student reads nothing, not even their own');
select pg_temp.refused($q$insert into public.support_reports (org_id, kind, page, comment) values (1, 'ticket', '/student', 'Disabled')$q$,
  '42501', 'and files nothing');

reset role;
set local role anon;
select pg_temp.refused('select count(*) from public.support_reports', '42501', 'anon is refused outright');
reset role;

select pg_temp.ok(current_setting('probe.passes')::int=33, current_setting('probe.passes')||' review queue database checks passed, expected 33');
rollback;
