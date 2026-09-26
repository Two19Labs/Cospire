-- Rollback-only verification for 20260927100000_test_engine_review_fixes.
--   npx supabase db query --linked --project-ref eeeftjwvbppznsmcljnw -f scripts/verify/test-engine-review-fixes.sql
begin;

create or replace function pg_temp.ok(value boolean, message text) returns void language plpgsql as $$
begin
  if value is not true then raise exception 'PROBE FAILED: %', message; end if;
  raise notice 'pass: %', message;
  perform set_config('probe.passes', (coalesce(nullif(current_setting('probe.passes', true), ''), '0')::int + 1)::text, true);
end $$;
create or replace function pg_temp.as_user(key text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('probe.'||key), 'role', 'authenticated')::text, true)
$$;
create or replace function pg_temp.v(key text) returns bigint language sql as $$
  select current_setting('probe.'||key)::bigint
$$;
grant execute on function pg_temp.ok(boolean,text), pg_temp.as_user(text), pg_temp.v(text) to authenticated;

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;

-- Fixtures: q1 is in both mock A and mock B.
set local role authenticated; select pg_temp.as_user('admin');
insert into public.question_sections(org_id,name) values(1,'Review probe '||txid_current()) returning set_config('probe.section',id::text,true);
select set_config('probe.q1', public.save_question(null,'mcq','Shared question','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["a"]}',null)::text,true);
select set_config('probe.mockA', public.save_mock(null,'Review A','',60,0,array['mcq'],1,true,false,
  jsonb_build_array(jsonb_build_object('title','All','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q1')))))::text,true);
select set_config('probe.mockB', public.save_mock(null,'Review B','',60,0,array['mcq'],1,true,false,
  jsonb_build_array(jsonb_build_object('title','All','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q1')))))::text,true);
set constraints all immediate; set constraints all deferred;
insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('mockA'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('mockB'),current_setting('probe.admin')::uuid);

-- 1. A key unlocked by mock A stays hidden while mock B, which shares it, is open.
set local role authenticated; select pg_temp.as_user('student');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('mockA'),current_setting('probe.student')::uuid) returning set_config('probe.a',id::text,true);
update public.attempts set status='submitted' where id=pg_temp.v('a');
select pg_temp.ok((select count(*)=1 from public.question_keys where question_id=pg_temp.v('q1')), 'after submitting mock A, its key is readable');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('mockB'),current_setting('probe.student')::uuid) returning set_config('probe.b',id::text,true);
select pg_temp.ok((select count(*)=0 from public.question_keys where question_id=pg_temp.v('q1')), 'while mock B, which shares the question, is open, the key is hidden');
update public.attempts set status='submitted' where id=pg_temp.v('b');
select pg_temp.ok((select count(*)=1 from public.question_keys where question_id=pg_temp.v('q1')), 'once mock B is submitted, the key is readable again');

-- 4. Revoking the grant keeps the mock readable to someone who has sat it, but
--    no new attempt can start.
reset role;
delete from public.content_access where student_id=current_setting('probe.student')::uuid and resource_type='mock' and resource_id=pg_temp.v('mockA');
set local role authenticated; select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=1 from public.mocks where id=pg_temp.v('mockA')), 'after the grant is revoked, a student who sat the mock still reads it');
select pg_temp.ok((select count(*)=1 from public.mock_questions where mock_id=pg_temp.v('mockA')), 'and its paper, for their result');
reset role;
update public.mocks set max_attempts=2 where id=pg_temp.v('mockA');
set local role authenticated; select pg_temp.as_user('student');
do $$ begin
  begin
    insert into public.attempts(org_id,mock_id,student_id) values (1,current_setting('probe.mockA')::bigint,current_setting('probe.student')::uuid);
    raise exception 'PROBE FAILED: a new attempt started without a grant';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.ok((select count(*)=1 from public.attempts where mock_id=pg_temp.v('mockA')), 'but no new attempt can start without the grant');

-- 3. A disabled student reads nothing.
reset role;
update public.profiles set status='disabled' where id=current_setting('probe.student')::uuid;
set local role authenticated; select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=0 from public.questions where id=pg_temp.v('q1')), 'a disabled student reads no questions');
select pg_temp.ok((select count(*)=0 from public.question_keys where question_id=pg_temp.v('q1')), 'a disabled student reads no keys');
select pg_temp.ok((select count(*)=0 from public.mocks where id in (pg_temp.v('mockA'), pg_temp.v('mockB'))), 'a disabled student reads no mocks');

reset role;
select pg_temp.ok(current_setting('probe.passes')::int=9, current_setting('probe.passes')||' review-fix checks passed, expected 9');
rollback;
