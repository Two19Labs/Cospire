-- Rollback-only verification for rescoring (20260927090000_test_engine_rescore).
-- Every claim is proven by counting rows.
--
--   npx supabase db query --linked --project-ref eeeftjwvbppznsmcljnw -f scripts/verify/test-engine-rescore.sql
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
create or replace function pg_temp.as_server() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true)
$$;
create or replace function pg_temp.v(key text) returns bigint language sql as $$
  select current_setting('probe.'||key)::bigint
$$;
grant execute on function pg_temp.ok(boolean,text), pg_temp.as_user(text), pg_temp.as_server(), pg_temp.v(text) to authenticated;

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select set_config('probe.other', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id offset 1 limit 1;
select set_config('probe.events_before', (select count(*) from public.rescore_events)::text, true);

-- Fixtures: q1 (answered by both students), q2 (answered by nobody), one mock.
set local role authenticated;
set local role authenticated; select pg_temp.as_user('admin');
insert into public.question_sections(org_id,name) values(1,'Rescore probe '||txid_current()) returning set_config('probe.section',id::text,true);
select set_config('probe.q'||n, public.save_question(null,'mcq','Rescore probe '||n,'[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["a"]}',null)::text,true)
  from generate_series(1,2) as n;
select set_config('probe.mock', public.save_mock(null,'Rescore probe','',60,1,array['mcq'],1,true,false,
  jsonb_build_array(jsonb_build_object('title','All','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q1'),pg_temp.v('q2')))))::text,true);
set constraints all immediate; set constraints all deferred;
insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('mock'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.other')::uuid,'mock',pg_temp.v('mock'),current_setting('probe.admin')::uuid);

-- The student answers q1 and submits; the other student answers q1 and stays
-- in progress.
set local role authenticated; select pg_temp.as_user('student');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('mock'),current_setting('probe.student')::uuid) returning set_config('probe.a',id::text,true);
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('a'),pg_temp.v('q1'),'{"options":["a"]}');
update public.attempts set status='submitted' where id=pg_temp.v('a');
set local role authenticated; select pg_temp.as_user('other');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('mock'),current_setting('probe.other')::uuid) returning set_config('probe.b',id::text,true);
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('b'),pg_temp.v('q1'),'{"options":["b"]}');

-- Scoring, as the server writes it.
reset role; select pg_temp.as_server();
update public.attempts set score=3 where id=pg_temp.v('a');
select pg_temp.ok((select score=3 from public.attempts where id=pg_temp.v('a')), 'the submitted attempt is scored 3');

-- 1. Correcting the key clears the score of the attempt that answered it.
set local role authenticated; select pg_temp.as_user('admin');
select public.save_question(pg_temp.v('q1'),'mcq','Rescore probe 1','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["b"]}',null);
set constraints all immediate; set constraints all deferred;
reset role; select pg_temp.as_server();
select pg_temp.ok((select score is null from public.attempts where id=pg_temp.v('a')), 'a corrected key clears the score of a submitted attempt that answered it');
select pg_temp.ok((select status='in_progress' and score is null from public.attempts where id=pg_temp.v('b')), 'an attempt still in progress is left alone');
select pg_temp.ok((select count(*)=1 from public.rescore_events where question_id=pg_temp.v('q1')), 'one rescore event is recorded');
select pg_temp.ok((select attempts_affected=1 and reason='answer key changed' and changed_by=current_setting('probe.admin')::uuid
  from public.rescore_events where question_id=pg_temp.v('q1')), 'the event names the change, the count and the admin who made it');

-- 2. A marks change, after the attempt is scored again.
update public.attempts set score=0 where id=pg_temp.v('a');
set local role authenticated; select pg_temp.as_user('admin');
select public.save_question(pg_temp.v('q1'),'mcq','Rescore probe 1','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',5,'{"options":["b"]}',null);
set constraints all immediate; set constraints all deferred;
reset role; select pg_temp.as_server();
select pg_temp.ok((select score is null from public.attempts where id=pg_temp.v('a')), 'a marks change clears the score too');
select pg_temp.ok((select count(*)=1 from public.rescore_events where question_id=pg_temp.v('q1') and reason='marks changed'), 'and records "marks changed"');

-- 3. Rewording a question changes no score and records nothing.
update public.attempts set score=0 where id=pg_temp.v('a');
set local role authenticated; select pg_temp.as_user('admin');
select public.save_question(pg_temp.v('q1'),'mcq','Rescore probe 1, reworded','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',5,'{"options":["b"]}',null);
set constraints all immediate; set constraints all deferred;
reset role; select pg_temp.as_server();
select pg_temp.ok((select score=0 from public.attempts where id=pg_temp.v('a')), 'rewording the body leaves the score alone');
select pg_temp.ok((select count(*)=2 from public.rescore_events where question_id=pg_temp.v('q1')), 'and records no event');

-- 4. A question nobody answered affects nobody.
set local role authenticated; select pg_temp.as_user('admin');
select public.save_question(pg_temp.v('q2'),'mcq','Rescore probe 2','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["b"]}',null);
set constraints all immediate; set constraints all deferred;
reset role; select pg_temp.as_server();
select pg_temp.ok((select score=0 from public.attempts where id=pg_temp.v('a')), 'changing an unanswered question''s key changes no score');
select pg_temp.ok((select count(*)=0 from public.rescore_events where question_id=pg_temp.v('q2')), 'and records no event');

-- 5. The client still cannot touch a score.
set local role authenticated; select pg_temp.as_user('student');
update public.attempts set score=99 where id=pg_temp.v('a');
reset role; select pg_temp.as_server();
select pg_temp.ok((select score=0 from public.attempts where id=pg_temp.v('a')), 'a student still cannot set their own score');
select pg_temp.ok(current_setting('cospire.system_write', true) is distinct from 'on', 'the system flag is not left on after a rescore');

-- 6. Who reads the log.
set local role authenticated; select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=0 from public.rescore_events), 'a student reads no rescore events');
set local role authenticated; select pg_temp.as_user('admin');
select pg_temp.ok((select count(*)=2 from public.rescore_events where question_id=pg_temp.v('q1')), 'the admin reads them');

reset role;
select pg_temp.ok(current_setting('probe.passes')::int=15, current_setting('probe.passes')||' rescore checks passed, expected 15');
rollback;
