-- Rollback-only database verification for the End-to-End bundle grant (D62,
-- `grantBundleAction` in src/features/curriculum/actions/set-course-access.ts).
-- The action writes a programme grant and an ARS process grant as ONE
-- statement, `insert ... on conflict (student_id, resource_type, resource_id)
-- do nothing`. This proves, through RLS as the real roles, that the statement
-- writes both rows, that DO NOTHING is accepted with no UPDATE grant, that a
-- grant already held does not stop the other, that a refused second row leaves
-- no first row behind, and that a student cannot write it.
--
--   npx supabase db query --linked -f scripts/verify/bundle.sql
--
-- Writes nothing: everything rolls back. Needs, in org 1, one active admin and
-- one active student.
begin;

create or replace function pg_temp.ok(value boolean, message text) returns void language plpgsql as $$
begin
  if value is not true then raise exception 'PROBE FAILED: %', message; end if;
  raise notice 'pass: %', message;
  perform set_config('probe.passes', (coalesce(nullif(current_setting('probe.passes', true), ''), '0')::int + 1)::text, true);
end $$;
create or replace function pg_temp.refused(statement text, state text, message text) returns void language plpgsql as $$
begin
  begin execute statement; set constraints all immediate; raise exception 'accepted' using errcode='P0099';
  exception when others then
    if sqlstate='P0099' then raise exception 'PROBE FAILED (accepted): %', message; end if;
    if sqlstate<>state then raise exception 'PROBE FAILED (% instead of %: %): %', sqlstate, state, sqlerrm, message; end if;
  end;
  set constraints all deferred;
  perform pg_temp.ok(true, message);
end $$;
create or replace function pg_temp.as_user(key text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('probe.'||key), 'role', 'authenticated')::text, true)
$$;
create or replace function pg_temp.v(key text) returns bigint language sql as $$
  select current_setting('probe.'||key)::bigint
$$;
create or replace function pg_temp.u(key text) returns uuid language sql as $$
  select current_setting('probe.'||key)::uuid
$$;
create or replace function pg_temp.refused_any(statement text, message text) returns void language plpgsql as $$
begin
  begin execute statement; raise exception 'accepted' using errcode='P0099';
  exception when others then
    if sqlstate='P0099' then raise exception 'PROBE FAILED (accepted): %', message; end if;
  end;
  perform pg_temp.ok(true, message);
end $$;
create or replace function pg_temp.bundle(other bigint) returns void language sql as $$
  insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
    (1,pg_temp.u('s1'),'course',pg_temp.v('p'),pg_temp.u('admin')),
    (1,pg_temp.u('s1'),'course',other,pg_temp.u('admin'))
  on conflict (student_id, resource_type, resource_id) do nothing
$$;
create or replace function pg_temp.held() returns bigint language sql as $$
  select count(*) from public.content_access
  where student_id=pg_temp.u('s1') and resource_type='course' and resource_id in (pg_temp.v('p'), pg_temp.v('a'))
$$;
grant execute on function pg_temp.ok(boolean,text), pg_temp.refused(text,text,text), pg_temp.refused_any(text,text),
  pg_temp.as_user(text), pg_temp.v(text), pg_temp.u(text), pg_temp.bundle(bigint), pg_temp.held() to authenticated;

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' order by id limit 1;
select set_config('probe.s1', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select pg_temp.ok(current_setting('probe.s1', true) is not null and current_setting('probe.admin', true) is not null, 'the accounts this probe needs exist');

set local role authenticated;
select pg_temp.as_user('admin');
insert into public.courses(org_id,title,kind,sort_order) values (1,'Bundle probe programme '||txid_current(),'programme',0)
  returning set_config('probe.p',id::text,true);
insert into public.courses(org_id,title,kind,sort_order) values (1,'Bundle probe process '||txid_current(),'ars_process',0)
  returning set_config('probe.a',id::text,true);
select pg_temp.ok(pg_temp.held()=0, 'the student starts with neither grant');

-- The student cannot grant themselves the bundle.
select pg_temp.as_user('s1');
select pg_temp.refused(format('select pg_temp.bundle(%s)', pg_temp.v('a')), '42501', 'a student writing the bundle is refused (42501)');
select pg_temp.as_user('admin');
select pg_temp.ok(pg_temp.held()=0, 'and nothing was written');

-- Atomicity: the second row is refused (no such course), so the first is not kept.
select pg_temp.refused_any('select pg_temp.bundle(2147483000)', 'a bundle whose process does not exist is refused');
select pg_temp.ok(pg_temp.held()=0, 'and the programme grant was not kept either');

-- The action's write, as the admin.
select pg_temp.bundle(pg_temp.v('a'));
select pg_temp.ok(pg_temp.held()=2, 'the admin''s single statement writes both grants');
select pg_temp.bundle(pg_temp.v('a'));
select pg_temp.ok(pg_temp.held()=2, 'granting again is not an error and writes nothing more (DO NOTHING needs no UPDATE)');
delete from public.content_access where student_id=pg_temp.u('s1') and resource_type='course' and resource_id=pg_temp.v('a');
select pg_temp.ok(pg_temp.held()=1, 'revoking stays per grant: the process alone is removed');
select pg_temp.bundle(pg_temp.v('a'));
select pg_temp.ok(pg_temp.held()=2, 'with the programme already held, the process is still written');

select pg_temp.ok(current_setting('probe.passes')::int=10, current_setting('probe.passes')||' bundle database checks passed, expected 10');
rollback;
