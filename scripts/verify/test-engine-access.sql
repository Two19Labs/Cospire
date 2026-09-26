-- Rollback-only database verification for Phase 4 slice 4.1: the attempt
-- tables, their guards, and the student's two doors (the paper while sitting it,
-- the key after submitting). Every refusal is proven by what the database
-- refuses or by counting rows, never by the absence of an error.
--
-- Run after the migration is applied:
--   npx supabase db query --linked --project-ref eeeftjwvbppznsmcljnw -f scripts/verify/test-engine-access.sql
-- Or as a dry run before it is: see docs/context/verification-log.md for how the
-- migration body is spliced in after `begin;`.
--
-- `now()` is fixed for the whole transaction, so "the clock ran out" is staged
-- by backdating an attempt with its guard switched off. That is a table-level
-- change inside a transaction that always rolls back.
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
grant execute on function pg_temp.ok(boolean,text), pg_temp.refused(text,text,text), pg_temp.as_user(text), pg_temp.v(text) to authenticated;

-- Structure: RLS on and forced, write policies present, server time only, and
-- nothing granted to anonymous callers.
select pg_temp.ok((select count(*)=5 from pg_class where oid in ('public.attempts'::regclass,'public.attempt_sections'::regclass,'public.attempt_responses'::regclass,'public.proctor_events'::regclass,'public.rescore_events'::regclass) and relrowsecurity and relforcerowsecurity),
  'RLS is enabled and forced on all five attempt tables');
select pg_temp.ok((select count(distinct tablename)=5 from pg_policies where schemaname='public' and cmd='INSERT' and tablename in ('attempts','attempt_sections','attempt_responses','proctor_events','rescore_events')),
  'every attempt table carries an INSERT policy, not only SELECT');
select pg_temp.ok((select count(*)=0 from information_schema.columns where table_schema='public' and table_name in ('attempts','attempt_sections','attempt_responses','proctor_events','rescore_events') and data_type='timestamp without time zone'),
  'no bare timestamp column');
select pg_temp.ok((select count(*)=0 from information_schema.role_table_grants where grantee='anon' and table_schema='public' and table_name in ('attempts','attempt_sections','attempt_responses','proctor_events','rescore_events')),
  'anon holds no grant on any attempt table');

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select set_config('probe.other', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id offset 1 limit 1;
select set_config('probe.rival', id::text, true) from public.profiles where org_id<>1 and role='admin' and status='active' limit 1;

-- ---------------------------------------------------------------------------
-- Fixtures, as the admin: three questions, a sectionally timed mock (QA holds
-- q1, LR holds q2; one attempt; no phones) and an overall mock holding q3 (two
-- attempts; phones allowed).
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('admin');
insert into public.question_sections(org_id,name) values(1,'Engine probe '||txid_current()) returning set_config('probe.section',id::text,true);
select set_config('probe.q'||n, public.save_question(null,'mcq','Engine probe question '||n,'[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["a"]}',null)::text,true)
  from generate_series(1,4) as n;
set constraints all immediate; set constraints all deferred;

select set_config('probe.timed', public.save_mock(null,'Timed probe','',60,1,array['mcq'],1,false,true,
  jsonb_build_array(
    jsonb_build_object('title','QA','durationMinutes',30,'questions',jsonb_build_array(pg_temp.v('q1'))),
    jsonb_build_object('title','LR','durationMinutes',30,'questions',jsonb_build_array(pg_temp.v('q2')))))::text,true);
select set_config('probe.open', public.save_mock(null,'Overall probe','',60,0,array['mcq'],2,true,false,
  jsonb_build_array(jsonb_build_object('title','All questions','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q3')))))::text,true);
set constraints all immediate; set constraints all deferred;
select set_config('probe.qa', id::text, true) from public.mock_sections where mock_id=pg_temp.v('timed') and title='QA';
select set_config('probe.lr', id::text, true) from public.mock_sections where mock_id=pg_temp.v('timed') and title='LR';
select set_config('probe.whole', id::text, true) from public.mock_sections where mock_id=pg_temp.v('open');

insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('timed'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('open'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.other')::uuid,'mock',pg_temp.v('open'),current_setting('probe.admin')::uuid);

select pg_temp.refused(format($q$insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values (1,%L,'mock',999999999,%L)$q$,
  current_setting('probe.other'), current_setting('probe.admin')), 'P0001', 'a grant naming a mock that does not exist is refused');

-- ---------------------------------------------------------------------------
-- Before an attempt: the mock is visible, the paper is not.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=2 from public.mocks where id in (pg_temp.v('timed'),pg_temp.v('open'))), 'a student reads the two mocks they were granted');
select pg_temp.ok((select count(*)=0 from public.questions where id in (pg_temp.v('q1'),pg_temp.v('q2'),pg_temp.v('q3'))), 'before an attempt, the student reads none of the questions');
select pg_temp.as_user('other');
select pg_temp.ok((select count(*)=0 from public.mocks where id=pg_temp.v('timed')), 'a student without the grant does not read the mock');
select pg_temp.refused(format($q$insert into public.attempts(org_id,mock_id,student_id) values (1,%s,%L)$q$, pg_temp.v('timed'), current_setting('probe.other')),
  '42501', 'a student without the grant cannot start an attempt');

-- ---------------------------------------------------------------------------
-- Starting: the server owns the clock, the status and the score.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('student');
select pg_temp.refused(format($q$insert into public.attempts(org_id,mock_id,student_id,proctored) values (1,%s,%L,false)$q$, pg_temp.v('timed'), current_setting('probe.student')),
  '42501', 'a phone attempt on a mock that forbids phones is refused');
insert into public.attempts(org_id,mock_id,student_id,started_at,status,score,submitted_at,submitted_by)
  values (1,pg_temp.v('timed'),current_setting('probe.student')::uuid,'2000-01-01','in_progress',99,null,null)
  returning set_config('probe.a1',id::text,true);
select pg_temp.ok((select started_at=now() and status='in_progress' and score is null and proctored from public.attempts where id=pg_temp.v('a1')),
  'a client-supplied start time and score are overwritten: started_at = now(), unscored, proctored');
select pg_temp.refused(format($q$insert into public.attempts(org_id,mock_id,student_id) values (1,%s,%L)$q$, pg_temp.v('timed'), current_setting('probe.student')),
  '42501', 'a second attempt on a one-attempt mock is refused');
select pg_temp.ok((select count(*)=2 from public.questions where id in (pg_temp.v('q1'),pg_temp.v('q2'))), 'with an attempt, the student reads the paper''s questions');
select pg_temp.ok((select count(*)=0 from public.questions where id=pg_temp.v('q4')), 'a question in no paper of theirs stays unreadable');
select pg_temp.ok((select count(*)=0 from public.question_keys where question_id in (pg_temp.v('q1'),pg_temp.v('q2'))), 'no key is readable while the attempt is open');

-- ---------------------------------------------------------------------------
-- Sections: in order, one at a time, only this paper's.
-- ---------------------------------------------------------------------------
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a"]}')$q$, pg_temp.v('a1'), pg_temp.v('q1')),
  '42501', 'an answer in a timed section not yet entered is refused');
select pg_temp.refused(format($q$insert into public.attempt_sections(attempt_id,mock_section_id) values (%s,%s)$q$, pg_temp.v('a1'), pg_temp.v('lr')),
  '42501', 'the second section cannot be entered before the first');
select pg_temp.refused(format($q$insert into public.attempt_sections(attempt_id,mock_section_id) values (%s,%s)$q$, pg_temp.v('a1'), pg_temp.v('whole')),
  '42501', 'a section from another mock is refused');
insert into public.attempt_sections(attempt_id,mock_section_id,started_at) values (pg_temp.v('a1'),pg_temp.v('qa'),'2000-01-01');
select pg_temp.ok((select started_at=now() from public.attempt_sections where attempt_id=pg_temp.v('a1') and mock_section_id=pg_temp.v('qa')), 'the section clock starts at now(), whatever the client sends');

insert into public.attempt_responses(attempt_id,question_id,answer,is_correct,marks_awarded) values (pg_temp.v('a1'),pg_temp.v('q1'),'{"options":["b"]}',true,3);
select pg_temp.ok((select is_correct is null and marks_awarded is null from public.attempt_responses where attempt_id=pg_temp.v('a1') and question_id=pg_temp.v('q1')),
  'an answer in the open section is saved, and client-set marks are dropped');
update public.attempt_responses set answer='{"options":["a"]}', marked_for_review=true, marks_awarded=3, is_correct=true where attempt_id=pg_temp.v('a1') and question_id=pg_temp.v('q1');
select pg_temp.ok((select answer='{"options":["a"]}' and marked_for_review and is_correct is null from public.attempt_responses where attempt_id=pg_temp.v('a1') and question_id=pg_temp.v('q1')),
  'changing an answer and marking for review saves; the marks stay unset');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a"]}')$q$, pg_temp.v('a1'), pg_temp.v('q2')),
  '42501', 'an answer in the next section, not yet entered, is refused');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a"]}')$q$, pg_temp.v('a1'), pg_temp.v('q4')),
  '42501', 'an answer to a question outside the paper is refused');
select pg_temp.refused(format($q$insert into public.attempt_sections(attempt_id,mock_section_id) values (%s,%s)$q$, pg_temp.v('a1'), pg_temp.v('lr')),
  '42501', 'the next section cannot be entered while this one is open and in time');

update public.attempt_sections set submitted_at='2000-01-01' where attempt_id=pg_temp.v('a1') and mock_section_id=pg_temp.v('qa');
select pg_temp.ok((select submitted_at=now() from public.attempt_sections where attempt_id=pg_temp.v('a1') and mock_section_id=pg_temp.v('qa')), 'leaving a section is stamped now()');
select pg_temp.refused(format($q$update public.attempt_responses set answer='{"options":["b"]}' where attempt_id=%s and question_id=%s$q$, pg_temp.v('a1'), pg_temp.v('q1')),
  '42501', 'an answer in a section already left is refused');
insert into public.attempt_sections(attempt_id,mock_section_id) values (pg_temp.v('a1'),pg_temp.v('lr'));
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('a1'),pg_temp.v('q2'),'{"options":["b"]}');
select pg_temp.ok((select count(*)=2 from public.attempt_responses where attempt_id=pg_temp.v('a1')), 'after leaving the first section, the second opens and takes answers');

-- ---------------------------------------------------------------------------
-- The attempt row: no re-clocking, no self-scoring, submit once.
-- ---------------------------------------------------------------------------
select pg_temp.refused(format($q$update public.attempts set started_at=now()+interval '1 hour' where id=%s$q$, pg_temp.v('a1')),
  '42501', 'an attempt cannot be re-clocked');
update public.attempts set score=99 where id=pg_temp.v('a1');
select pg_temp.ok((select score is null from public.attempts where id=pg_temp.v('a1')), 'a student cannot set their own score');
update public.attempts set status='submitted', submitted_by='timer', submitted_at='2000-01-01' where id=pg_temp.v('a1');
select pg_temp.ok((select status='submitted' and submitted_by='student' and submitted_at=now() from public.attempts where id=pg_temp.v('a1')),
  'submitting is stamped now() and by the student, whatever the client claims');
update public.attempts set score=99, submitted_at=now()+interval '1 hour', submitted_by='timer' where id=pg_temp.v('a1');
select pg_temp.ok((select score is null and submitted_at=now() and submitted_by='student' from public.attempts where id=pg_temp.v('a1')),
  'after submitting, score, time and cause cannot be rewritten by the student');
select pg_temp.refused(format($q$update public.attempts set status='in_progress' where id=%s$q$, pg_temp.v('a1')),
  '42501', 'a submitted attempt cannot be reopened');
select pg_temp.refused(format($q$update public.attempt_responses set answer='{"options":["a"]}' where attempt_id=%s and question_id=%s$q$, pg_temp.v('a1'), pg_temp.v('q2')),
  '42501', 'no answer is written after submitting');
select pg_temp.ok((select count(*)=2 from public.question_keys where question_id in (pg_temp.v('q1'),pg_temp.v('q2'))), 'after submitting, the student reads the paper''s keys');
select pg_temp.ok((select count(*)=0 from public.question_keys where question_id=pg_temp.v('q4')), 'a key outside the paper stays unreadable');

-- ---------------------------------------------------------------------------
-- Another student, and staff outside the org.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('other');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('open'),current_setting('probe.other')::uuid) returning set_config('probe.b1',id::text,true);
select pg_temp.ok((select count(*)=0 from public.attempts where id=pg_temp.v('a1')), 'another student reads 0 of this student''s attempts');
select pg_temp.ok((select count(*)=0 from public.attempt_responses where attempt_id=pg_temp.v('a1')), 'another student reads 0 of this student''s answers');
select pg_temp.ok((select count(*)=0 from public.question_keys where question_id in (pg_temp.v('q1'),pg_temp.v('q2'))), 'another student reads 0 of those keys');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a"]}')$q$, pg_temp.v('a1'), pg_temp.v('q1')),
  '42501', 'another student cannot write into this student''s attempt');
select pg_temp.as_user('student');
update public.attempt_responses set answer='{"options":["b"]}' where attempt_id=pg_temp.v('b1');
select pg_temp.ok((select count(*)=0 from public.attempt_responses where attempt_id=pg_temp.v('b1')), 'this student reads and changes nothing in the other''s attempt');
select pg_temp.as_user('rival');
select pg_temp.ok((select count(*)=0 from public.attempts where id in (pg_temp.v('a1'),pg_temp.v('b1'))), 'another organisation''s admin reads 0 attempts');
select pg_temp.as_user('admin');
select pg_temp.ok((select count(*)=2 from public.attempts where id in (pg_temp.v('a1'),pg_temp.v('b1'))), 'the org''s admin reads both attempts');
select pg_temp.refused(format($q$select public.save_mock(%s,'Timed probe','',60,1,array['mcq'],1,false,true,'[{"title":"All","durationMinutes":null,"questions":[]}]')$q$, pg_temp.v('timed')),
  '42501', 'a mock that has been attempted cannot be rebuilt');
select pg_temp.ok((select count(*)=2 from public.mock_sections where mock_id=pg_temp.v('timed')), 'and its two sections are intact');

-- ---------------------------------------------------------------------------
-- One open attempt at a time, and the key hidden during a retake.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('student');
insert into public.attempts(org_id,mock_id,student_id,proctored) values (1,pg_temp.v('open'),current_setting('probe.student')::uuid,false)
  returning set_config('probe.c1',id::text,true);
select pg_temp.ok((select proctored is false from public.attempts where id=pg_temp.v('c1')), 'a phone attempt on a mock that allows phones is stored unproctored');
select pg_temp.refused($q$update public.attempts set proctored=true where id=pg_temp.v('c1')$q$, '42501', 'an unproctored attempt cannot be re-flagged proctored');
select pg_temp.refused(format($q$insert into public.attempts(org_id,mock_id,student_id) values (1,%s,%L)$q$, pg_temp.v('open'), current_setting('probe.student')),
  '23505', 'a second open attempt on the same mock is refused, even with attempts left');
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('c1'),pg_temp.v('q3'),'{"options":["a"]}');
select pg_temp.ok((select count(*)=1 from public.attempt_responses where attempt_id=pg_temp.v('c1')), 'an untimed paper takes answers with no section entered');
update public.attempts set status='submitted' where id=pg_temp.v('c1');
select pg_temp.ok((select count(*)=1 from public.question_keys where question_id=pg_temp.v('q3')), 'after the first attempt, its key is readable');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('open'),current_setting('probe.student')::uuid) returning set_config('probe.c2',id::text,true);
select pg_temp.ok((select count(*)=0 from public.question_keys where question_id=pg_temp.v('q3')), 'while a retake is open, the key is hidden again');

-- ---------------------------------------------------------------------------
-- The clock. Backdate the retake with its guard off, as staging only.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
alter table public.attempts disable trigger attempts_guard_write;
update public.attempts set started_at = now() - interval '60 minutes 10 seconds' where id=pg_temp.v('c2');
alter table public.attempts enable trigger attempts_guard_write;
set local role authenticated;
select pg_temp.as_user('student');
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('c2'),pg_temp.v('q3'),'{"options":["b"]}');
select pg_temp.ok((select count(*)=1 from public.attempt_responses where attempt_id=pg_temp.v('c2')), 'ten seconds past the clock, inside the grace, an answer is still saved');

reset role;
select set_config('request.jwt.claims', '', true);
alter table public.attempts disable trigger attempts_guard_write;
update public.attempts set started_at = now() - interval '61 minutes' where id=pg_temp.v('c2');
alter table public.attempts enable trigger attempts_guard_write;
set local role authenticated;
select pg_temp.as_user('student');
select pg_temp.refused(format($q$update public.attempt_responses set answer='{"options":["a"]}' where attempt_id=%s$q$, pg_temp.v('c2')),
  '42501', 'past the clock and the grace, an answer is refused though the attempt was never submitted');
select pg_temp.ok((select answer='{"options":["b"]}' from public.attempt_responses where attempt_id=pg_temp.v('c2')), 'and the saved answer is unchanged');

-- ---------------------------------------------------------------------------
-- The server's own writes: scoring and the sweep.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', jsonb_build_object('role','service_role')::text, true);
update public.attempts set status='submitted', submitted_by='timer', submitted_at=started_at + interval '60 minutes' where id=pg_temp.v('c2');
select pg_temp.ok((select submitted_by='timer' and submitted_at=started_at + interval '60 minutes' from public.attempts where id=pg_temp.v('c2')),
  'the sweep may close an attempt as the timer, at the moment the clock ran out');
update public.attempt_responses set is_correct=false, marks_awarded=0 where attempt_id=pg_temp.v('c2');
update public.attempts set score=0 where id=pg_temp.v('c2');
select pg_temp.ok((select a.score=0 and r.is_correct is false from public.attempts a join public.attempt_responses r on r.attempt_id=a.id where a.id=pg_temp.v('c2')),
  'scoring writes marks and the score after submission');
update public.attempts set submitted_at=now() where id=pg_temp.v('c2');
select pg_temp.ok((select submitted_at=started_at + interval '60 minutes' from public.attempts where id=pg_temp.v('c2')), 'even the server cannot move a submission time afterwards');

select pg_temp.ok(current_setting('probe.passes')::int=56, current_setting('probe.passes')||' test-engine database checks passed, expected 56');
rollback;
