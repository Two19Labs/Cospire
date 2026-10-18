-- Rollback-only database verification for D41: a mock has a draft state, and a
-- draft is invisible to students. Every refusal is proven by what the database
-- refuses or by counting rows, never by the absence of an error.
--
-- Run it with `20261017100000_mock_drafts.sql` spliced in after `begin;` (its
-- own `begin;`/`commit;` stripped), which is how every migration here is proven
-- before it is applied:
--
--   { sed -n '1,/^begin;$/p' scripts/verify/mock-drafts.sql
--     sed '/^begin;$/d;/^commit;$/d' supabase/migrations/20261017100000_mock_drafts.sql
--     sed -n '/^begin;$/,$p' scripts/verify/mock-drafts.sql | tail -n +2
--   } > coverage/mock-drafts-spliced.sql
--   npx supabase db query --linked -f coverage/mock-drafts-spliced.sql
--
-- The whole thing rolls back, so it writes nothing: the mocks, questions,
-- programme, grants and attempt it makes are all gone at the end.
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

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select pg_temp.ok((select is_nullable='NO' and column_default like '%draft%' and data_type='text'
  from information_schema.columns where table_schema='public' and table_name='mocks' and column_name='status'),
  'mocks.status exists, is NOT NULL and defaults to a draft');
select pg_temp.ok((select count(*)=0 from public.mocks where status<>'published'),
  'every mock that existed before this migration is published, so students see exactly what they see now');
select pg_temp.ok((select count(*)=1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='mock_is_published' and p.prosecdef and p.provolatile='s'),
  'private.mock_is_published is one STABLE SECURITY DEFINER helper');
select pg_temp.ok((select not has_function_privilege('anon','private.mock_is_published(bigint)','execute')
  and has_function_privilege('authenticated','private.mock_is_published(bigint)','execute')),
  'anon cannot execute it; authenticated can');
select pg_temp.ok((select count(*)=1 from pg_trigger where tgrelid='public.mocks'::regclass and tgname='mocks_guard_publish_change'),
  'the unpublish guard is a trigger on mocks, not application code');

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select set_config('probe.events_before', (select count(*) from public.rescore_events)::text, true);

-- ---------------------------------------------------------------------------
-- Fixtures, as the admin: two questions, two mocks, a programme holding both
-- as `test` items, and the student granted the programme and both mocks.
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('admin');
insert into public.question_sections(org_id,name) values(1,'Draft probe '||txid_current()) returning set_config('probe.section',id::text,true);
select set_config('probe.q'||n, public.save_question(null,'mcq','Draft probe question '||n,'[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["a"]}',null)::text,true)
  from generate_series(1,2) as n;
set constraints all immediate; set constraints all deferred;

select set_config('probe.draft', public.save_mock(null,'Draft probe mock','',60,0,array['mcq'],2,true,false,
  jsonb_build_array(jsonb_build_object('title','All questions','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q1')))))::text,true);
select set_config('probe.live', public.save_mock(null,'Published probe mock','',60,0,array['mcq'],2,true,false,
  jsonb_build_array(jsonb_build_object('title','All questions','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q2')))))::text,true);
set constraints all immediate; set constraints all deferred;

select pg_temp.ok((select count(*)=2 from public.mocks where id in (pg_temp.v('draft'),pg_temp.v('live')) and status='draft'),
  'a mock built by save_mock starts as a draft');
select pg_temp.ok((select count(*)=2 from public.mocks where id in (pg_temp.v('draft'),pg_temp.v('live'))),
  'the admin reads both drafts');
select pg_temp.refused(format($q$update public.mocks set status='live' where id=%s$q$, pg_temp.v('draft')),
  '23514', 'a status outside draft and published is refused');

insert into public.courses(org_id,title,kind,sort_order) values (1,'Draft probe programme '||txid_current(),'programme',0)
  returning set_config('probe.course',id::text,true);
insert into public.sections(org_id,course_id,title,sort_order) values (1,pg_temp.v('course'),'Week 1',0)
  returning set_config('probe.csection',id::text,true);
insert into public.curriculum_items(org_id,section_id,type,ref_id,sort_order) values
  (1,pg_temp.v('csection'),'test',pg_temp.v('draft'),0),
  (1,pg_temp.v('csection'),'test',pg_temp.v('live'),1);

insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('draft'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('live'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.student')::uuid,'course',pg_temp.v('course'),current_setting('probe.admin')::uuid);

-- ---------------------------------------------------------------------------
-- A draft is invisible to the student, grant or no grant. These are the same
-- policies the mock list, the mock page and a direct URL all read through, so
-- there is no door the screen closes and the database leaves open.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=0 from public.mocks where id in (pg_temp.v('draft'),pg_temp.v('live'))),
  'while both are drafts, a granted student reads neither mock');
select pg_temp.ok((select count(*)=0 from public.mock_sections where mock_id=pg_temp.v('draft')),
  'and reads none of a draft''s sections');
select pg_temp.ok((select count(*)=0 from public.mock_questions where mock_id=pg_temp.v('draft')),
  'and reads none of a draft''s questions');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where ref_id in (pg_temp.v('draft'),pg_temp.v('live')) and type='test'),
  'and a draft is not in the programme''s curriculum either, though the programme is granted');
select pg_temp.refused(format($q$insert into public.attempts(org_id,mock_id,student_id) values (1,%s,%L)$q$, pg_temp.v('draft'), current_setting('probe.student')),
  '42501', 'a student cannot start an attempt on a draft');

-- ---------------------------------------------------------------------------
-- Published: everything opens, and only for the mock published.
-- ---------------------------------------------------------------------------
select pg_temp.as_user('admin');
update public.mocks set status='published' where id=pg_temp.v('live');
select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=1 and min(id)=pg_temp.v('live') from public.mocks where id in (pg_temp.v('draft'),pg_temp.v('live'))),
  'once published, the student reads that mock and still not the draft');
select pg_temp.ok((select count(*)=1 from public.mock_sections where mock_id=pg_temp.v('live')),
  'and reads its sections');
select pg_temp.ok((select count(*)=1 from public.curriculum_items where ref_id=pg_temp.v('live') and type='test'),
  'and it appears in the programme''s curriculum, while the draft beside it does not');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('live'),current_setting('probe.student')::uuid)
  returning set_config('probe.attempt',id::text,true);
select pg_temp.ok((select status='in_progress' from public.attempts where id=pg_temp.v('attempt')),
  'and the student may start an attempt on it');
-- Sat properly, so the rescore below has an answered, submitted attempt to act
-- on: a key or marks change rescores the attempts that answered the question.
insert into public.attempt_sections(attempt_id,mock_section_id)
  values (pg_temp.v('attempt'),(select id from public.mock_sections where mock_id=pg_temp.v('live')));
insert into public.attempt_responses(attempt_id,question_id,answer) values (pg_temp.v('attempt'),pg_temp.v('q2'),'{"options":["a"]}');
update public.attempts set status='submitted' where id=pg_temp.v('attempt');
select pg_temp.ok((select status='submitted' and submitted_at is not null from public.attempts where id=pg_temp.v('attempt')),
  'and submit it');

-- ---------------------------------------------------------------------------
-- Once it has been sat: the paper is fixed, the publication is fixed, the
-- marks are not. (The first two guards are `private.guard_sat_mock_structure`
-- and `private.guard_mock_publish_change`.)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('admin');
select pg_temp.refused(format($q$update public.mocks set status='draft' where id=%s$q$, pg_temp.v('live')),
  '42501', 'a mock that has been sat cannot go back to a draft, which would hide the student''s own result');
select pg_temp.ok((select status='published' from public.mocks where id=pg_temp.v('live')), 'and it is still published');
select pg_temp.refused(format($q$select public.save_mock(%s,'Published probe mock','',90,0,array['mcq'],2,true,false,
  jsonb_build_array(jsonb_build_object('title','All questions','durationMinutes',null,'questions',jsonb_build_array(%s))))$q$, pg_temp.v('live'), pg_temp.v('q2')),
  '42501', 'after an attempt, the mock''s duration cannot be changed');
select pg_temp.ok((select duration_minutes=60 from public.mocks where id=pg_temp.v('live')), 'and the duration is unchanged');
select pg_temp.refused(format($q$update public.mock_sections set duration_minutes=30 where mock_id=%s$q$, pg_temp.v('live')),
  '42501', 'after an attempt, a section and its timer cannot be changed');
select pg_temp.refused(format($q$insert into public.mock_questions(mock_id,mock_section_id,question_id,org_id,sort_order)
  values (%s,(select id from public.mock_sections where mock_id=%s),%s,1,1)$q$, pg_temp.v('live'), pg_temp.v('live'), pg_temp.v('q1')),
  '42501', 'and the questions it contains cannot be changed');

-- Marks stay correctable, through the existing rescore path.
select public.save_question(pg_temp.v('q2'),'mcq','Draft probe question 2','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',5,'{"options":["a"]}',null);
set constraints all immediate; set constraints all deferred;
select pg_temp.ok((select marks=5 from public.questions where id=pg_temp.v('q2')),
  'a mark on a question in a sat mock is still correctable');
select pg_temp.ok((select count(*)=1 from public.rescore_events where question_id=pg_temp.v('q2') and reason='marks changed'),
  'and the correction records a rescore_events row');

-- A draft with no attempts moves either way.
select pg_temp.ok((select count(*)=0 from public.attempts where mock_id=pg_temp.v('draft')), 'the other mock has no attempt');
update public.mocks set status='published' where id=pg_temp.v('draft');
update public.mocks set status='draft' where id=pg_temp.v('draft');
select pg_temp.ok((select status='draft' from public.mocks where id=pg_temp.v('draft')),
  'a mock nobody has sat can be published and returned to a draft freely');

select pg_temp.ok(current_setting('probe.passes')::int=28, current_setting('probe.passes')||' mock draft database checks passed, expected 28');
rollback;
