-- Rollback-only verification for 20260927110000_test_engine_security_fixes.
--   npx supabase db query --linked --project-ref eeeftjwvbppznsmcljnw -f scripts/verify/test-engine-security-fixes.sql
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
create or replace function pg_temp.v(key text) returns bigint language sql as $$
  select current_setting('probe.'||key)::bigint
$$;
grant execute on function pg_temp.ok(boolean,text), pg_temp.refused(text,text,text), pg_temp.as_user(text), pg_temp.v(text) to authenticated;

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select set_config('probe.other', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id offset 1 limit 1;

set local role authenticated; select pg_temp.as_user('admin');
insert into public.question_sections(org_id,name) values(1,'Security probe '||txid_current()) returning set_config('probe.section',id::text,true);
select set_config('probe.q1', public.save_question(null,'mcq','QA question','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["a"]}',null)::text,true);
select set_config('probe.q2', public.save_question(null,'mcq_multi','LR question','[{"id":"a","text":"A"},{"id":"b","text":"B"},{"id":"c","text":"C"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["a","c"]}',null)::text,true);
select set_config('probe.q3', public.save_question(null,'numerical','Typed question','[]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"accepted":["1/2"]}',null)::text,true);
select set_config('probe.sectioned', public.save_mock(null,'Security sectioned','',60,1,array['mcq','mcq_multi'],1,true,false,
  jsonb_build_array(
    jsonb_build_object('title','QA','durationMinutes',30,'questions',jsonb_build_array(pg_temp.v('q1'))),
    jsonb_build_object('title','LR','durationMinutes',30,'questions',jsonb_build_array(pg_temp.v('q2'), pg_temp.v('q3')))))::text,true);
set constraints all immediate; set constraints all deferred;
select set_config('probe.qa', id::text, true) from public.mock_sections where mock_id=pg_temp.v('sectioned') and title='QA';
select set_config('probe.lr', id::text, true) from public.mock_sections where mock_id=pg_temp.v('sectioned') and title='LR';
insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('sectioned'),current_setting('probe.admin')::uuid);

-- 2. No reading ahead.
select pg_temp.as_user('student');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('sectioned'),current_setting('probe.student')::uuid) returning set_config('probe.a',id::text,true);
select pg_temp.ok((select count(*)=0 from public.questions where id in (pg_temp.v('q1'),pg_temp.v('q2'),pg_temp.v('q3'))), 'before entering any section, no question of a sectioned paper is readable');
select pg_temp.ok((select count(*)=3 from public.attempt_outline(pg_temp.v('a'))), 'but the outline gives the paper''s shape: three questions');
insert into public.attempt_sections(attempt_id,mock_section_id) values (pg_temp.v('a'),pg_temp.v('qa'));
select pg_temp.ok((select count(*)=1 from public.questions where id=pg_temp.v('q1')), 'in QA, its question is readable');
select pg_temp.ok((select count(*)=0 from public.questions where id in (pg_temp.v('q2'),pg_temp.v('q3'))), 'in QA, the LR questions are not');
select pg_temp.as_user('other');
select pg_temp.ok((select count(*)=0 from public.attempt_outline(pg_temp.v('a'))), 'another student gets no outline of this attempt');

-- 1. Answers must fit their question.
select pg_temp.as_user('student');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a","b"]}')$q$, pg_temp.v('a'), pg_temp.v('q1')),
  '22023', 'two options on a single-answer MCQ are refused');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["z"]}')$q$, pg_temp.v('a'), pg_temp.v('q1')),
  '22023', 'an option the question does not have is refused');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a"],"extra":1}')$q$, pg_temp.v('a'), pg_temp.v('q1')),
  '22023', 'an extra key in the answer is refused');
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('a'),pg_temp.v('q1'),'{"options":["a"]}');
update public.attempt_sections set submitted_at=now() where attempt_id=pg_temp.v('a') and mock_section_id=pg_temp.v('qa');
insert into public.attempt_sections(attempt_id,mock_section_id) values (pg_temp.v('a'),pg_temp.v('lr'));
select pg_temp.ok((select count(*)=2 from public.questions where id in (pg_temp.v('q2'),pg_temp.v('q3'))), 'after entering LR, its questions are readable');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a","a"]}')$q$, pg_temp.v('a'), pg_temp.v('q2')),
  '22023', 'a repeated option on a multiple-correct MCQ is refused');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":[1]}')$q$, pg_temp.v('a'), pg_temp.v('q2')),
  '22023', 'a non-string option is refused');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"value":5}')$q$, pg_temp.v('a'), pg_temp.v('q3')),
  '22023', 'a typed answer that is not text is refused');
select pg_temp.refused(format($q$insert into public.attempt_responses(attempt_id,question_id,answer) values (%s,%s,'{"options":["a"]}')$q$, pg_temp.v('a'), pg_temp.v('q3')),
  '22023', 'choices on a typed question are refused');
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('a'),pg_temp.v('q2'),'{"options":["c","a"]}');
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('a'),pg_temp.v('q3'),'{"value":"1/2"}');
update public.attempt_responses set answer=null where attempt_id=pg_temp.v('a') and question_id=pg_temp.v('q3');
select pg_temp.ok((select count(*)=3 from public.attempt_responses where attempt_id=pg_temp.v('a')), 'well-formed answers, and clearing one, are accepted');

-- After submitting, the whole paper is readable again for review.
update public.attempts set status='submitted' where id=pg_temp.v('a');
select pg_temp.ok((select count(*)=3 from public.questions where id in (pg_temp.v('q1'),pg_temp.v('q2'),pg_temp.v('q3'))), 'after submitting, every question of the paper is readable');

reset role;
select pg_temp.ok(current_setting('probe.passes')::int=15, current_setting('probe.passes')||' security-fix checks passed, expected 15');
rollback;
