-- Rollback-only database verification for Phase 3 PR 4.
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
  exception when others then if sqlstate='P0099' or sqlstate<>state then raise; end if; end;
  set constraints all deferred;
  perform pg_temp.ok(true, message);
end $$;
create or replace function pg_temp.as_user(key text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('probe.'||key), 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.ok(boolean,text), pg_temp.refused(text,text,text), pg_temp.as_user(text) to authenticated;

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' limit 1;
select set_config('probe.mentor', id::text, true) from public.profiles where org_id=1 and role='mentor' and status='active' limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' limit 1;
select set_config('probe.rival', id::text, true) from public.profiles where org_id<>1 and role='admin' and status='active' limit 1;

set local role authenticated;
select pg_temp.as_user('admin');
insert into public.question_sections(org_id,name) values(1,'Mock probe '||txid_current()) returning set_config('probe.section',id::text,true);
select set_config('probe.q', public.save_question(null,'mcq','Mock probe question','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,current_setting('probe.section')::bigint,'Probe','easy',3,'{"options":["a"]}',null)::text,true);

select set_config('probe.mock', public.save_mock(null,'Overall probe','',120,0,array['mcq','mcq_multi'],1,true,false,
  jsonb_build_array(jsonb_build_object('title','All questions','durationMinutes',null,'questions',jsonb_build_array(current_setting('probe.q')::bigint))))::text,true);
set constraints all immediate; set constraints all deferred;
select pg_temp.ok((select count(*)=1 from public.mock_sections where mock_id=current_setting('probe.mock')::bigint and duration_minutes is null),'overall mock has one implicit untimed section');
select pg_temp.ok((select count(*)=1 from public.mock_questions where mock_id=current_setting('probe.mock')::bigint),'selected question is attached');

select set_config('probe.mock2', public.save_mock(null,'Sectional probe','',120,1,array['mcq'],2,false,true,
  '[{"title":"QA","durationMinutes":60,"questions":[]},{"title":"LR","durationMinutes":60,"questions":[]}]')::text,true);
set constraints all immediate; set constraints all deferred;
select pg_temp.ok((select sum(duration_minutes)=120 from public.mock_sections where mock_id=current_setting('probe.mock2')::bigint),'section durations equal full duration');

select pg_temp.refused($q$select public.save_mock(null,'Bad duration','',120,0,array['mcq'],1,true,false,'[{"title":"QA","durationMinutes":50,"questions":[]},{"title":"LR","durationMinutes":50,"questions":[]}]')$q$,'23514','mismatched section sum is refused');

update public.questions set archived_at=now() where id=current_setting('probe.q')::bigint;
select pg_temp.refused(format($q$select public.save_mock(null,'Archived','',60,0,array['mcq'],1,true,false,'[{"title":"All questions","durationMinutes":null,"questions":[%s]}]')$q$,current_setting('probe.q')),'23514','archived question is refused');
update public.questions set archived_at=null where id=current_setting('probe.q')::bigint;

select pg_temp.as_user('mentor');
select pg_temp.refused($q$select public.save_mock(null,'Mentor mock','',60,0,array['mcq'],1,true,false,'[{"title":"All questions","durationMinutes":null,"questions":[]}]')$q$,'42501','mentor cannot create a mock');
select pg_temp.ok((select count(*)=0 from public.mocks),'mentor reads no mocks');
select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=0 from public.mocks),'student reads no mocks');
select pg_temp.as_user('rival');
select pg_temp.ok((select count(*)=0 from public.mocks where id=current_setting('probe.mock')::bigint),'rival admin cannot read the mock');

reset role;
select pg_temp.ok(current_setting('probe.passes')::int=9,'9 of 9 mock-builder database checks passed');
rollback;
