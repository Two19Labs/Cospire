-- Rollback-only database verification for shared modules, Phase 1
-- (`docs/design/shared-modules.md`, migrations 20261118100000 to 20261118100400).
-- Proves the access rule (a shared module reached through either programme,
-- and through neither), per-programme progress, per-programme attempt limits
-- and the write-side refusals (the wrong student, non-admin writers).
--
-- Run it AFTER the five migrations are applied:
--
--   npx supabase db query --linked -f scripts/verify/modules.sql
--
-- Or before, with the migrations spliced in after `begin;` (their own
-- `begin;`/`commit;` stripped), as `delete.sql` describes:
--
--   { sed -n '1,/^begin;$/p' scripts/verify/modules.sql
--     for f in supabase/migrations/2026111810*.sql; do sed '/^begin;$/d;/^commit;$/d' "$f"; done
--     sed -n '/^begin;$/,$p' scripts/verify/modules.sql | tail -n +2
--   } > coverage/modules-spliced.sql
--   npx supabase db query --linked -f coverage/modules-spliced.sql
--
-- The whole thing rolls back, so it writes nothing. It never names a real row
-- except existing accounts: every module, programme, mock, document, grant,
-- progress row and attempt it touches is one it created in this transaction.
-- Needs, in org 1: one active admin, one active mentor and two active students;
-- and one active admin in another organisation.
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
grant execute on function pg_temp.ok(boolean,text), pg_temp.refused(text,text,text), pg_temp.as_user(text), pg_temp.v(text), pg_temp.u(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select pg_temp.ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('public.modules'::regclass, 'public.section_modules'::regclass)),
  'RLS is enabled and forced on modules and section_modules');
select pg_temp.ok((select count(distinct cmd)=4 from pg_policies where schemaname='public' and tablename='modules')
  and (select count(distinct cmd)=4 from pg_policies where schemaname='public' and tablename='section_modules'),
  'both new tables carry a policy for all four verbs, not only SELECT');
select pg_temp.ok((select count(*)=0 from information_schema.role_table_grants where grantee='anon' and table_schema='public'
  and table_name in ('modules','section_modules')), 'anon holds no grant on either new table');
select pg_temp.ok((select count(*)=0 from information_schema.columns where table_schema='public'
  and table_name in ('modules','section_modules','item_progress','attempts') and data_type='timestamp without time zone'),
  'no bare timestamp column');
select pg_temp.ok((select count(*)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.prosecdef and p.provolatile='s'
    and p.oid in ('private.student_reaches_module(bigint)'::regprocedure, 'private.course_has_item(bigint,bigint)'::regprocedure,
                  'private.student_may_record_progress(bigint,bigint,bigint)'::regprocedure,
                  'private.student_has_programme_item(text,bigint)'::regprocedure)),
  'the access helpers are STABLE SECURITY DEFINER');
select pg_temp.ok((select not has_function_privilege('anon','private.student_reaches_module(bigint)','execute')
  and not has_function_privilege('anon','private.student_may_record_progress(bigint,bigint,bigint)','execute')
  and has_function_privilege('authenticated','private.student_may_record_progress(bigint,bigint,bigint)','execute')),
  'anon cannot execute the new helpers; authenticated can');
select pg_temp.ok((select array_agg(a.attname order by k.ord)::text = '{student_id,course_id,item_id}'
  from pg_constraint c cross join unnest(c.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
  where c.conrelid='public.item_progress'::regclass and c.contype='p'),
  'item_progress is keyed per student, programme and item');
select pg_temp.ok((select attnotnull from pg_attribute where attrelid='public.item_progress'::regclass and attname='course_id')
  and not (select attnotnull from pg_attribute where attrelid='public.attempts'::regclass and attname='course_id')
  and not (select attnotnull from pg_attribute where attrelid='public.curriculum_items'::regclass and attname='section_id'),
  'item_progress.course_id is required; attempts.course_id and curriculum_items.section_id are optional');

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' order by id limit 1;
select set_config('probe.mentor', id::text, true) from public.profiles where org_id=1 and role='mentor' and status='active' order by id limit 1;
select set_config('probe.s1', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select set_config('probe.s2', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id offset 1 limit 1;
select set_config('probe.rival', id::text, true) from public.profiles where org_id<>1 and role='admin' and status='active' order by id limit 1;
select pg_temp.ok(current_setting('probe.s2', true) is not null and current_setting('probe.mentor', true) is not null
  and current_setting('probe.rival', true) is not null, 'the accounts this probe needs exist');

-- ---------------------------------------------------------------------------
-- Fixtures, as the admin. MU (p1) and Ashoka (p2) each have a QA subject; one
-- module, Time and Work, is attached to both. p3 is a third programme that
-- does not contain it. s1 holds all three programmes; s2 holds none.
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('admin');

insert into public.question_sections(org_id,name) values(1,'Modules probe '||txid_current()) returning set_config('probe.qsection',id::text,true);
select set_config('probe.q1', public.save_question(null,'mcq','Modules probe question','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('qsection'),'Probe','easy',1,'{"options":["a"]}',null)::text,true);
-- max_attempts 1, phones allowed.
select set_config('probe.mock', public.save_mock(null,'Modules probe topic test','',30,0,array['mcq'],1,true,false,
  jsonb_build_array(jsonb_build_object('title','All questions','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q1')))))::text,true);
update public.mocks set status='published' where id=pg_temp.v('mock');
insert into public.documents(org_id,title,folder,storage_path,uploaded_by)
  values (1,'Modules probe PDF','Probe','org/1/'||gen_random_uuid()||'.pdf',pg_temp.u('admin'))
  returning set_config('probe.doc',id::text,true);

insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules probe MU '||txid_current(),'programme',0)
  returning set_config('probe.p1',id::text,true);
insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules probe Ashoka '||txid_current(),'programme',0)
  returning set_config('probe.p2',id::text,true);
insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules probe other '||txid_current(),'programme',0)
  returning set_config('probe.p3',id::text,true);
insert into public.sections(org_id,course_id,title) values (1,pg_temp.v('p1'),'QA') returning set_config('probe.sub1',id::text,true);
insert into public.sections(org_id,course_id,title) values (1,pg_temp.v('p2'),'QA') returning set_config('probe.sub2',id::text,true);
insert into public.sections(org_id,course_id,title) values (1,pg_temp.v('p3'),'QA') returning set_config('probe.sub3',id::text,true);
insert into public.sections(org_id,course_id,title,kind) values (1,pg_temp.v('p1'),'Mocks','mocks') returning set_config('probe.mocks1',id::text,true);

insert into public.modules(org_id,title) values (1,'Time and Work') returning set_config('probe.m',id::text,true);
insert into public.modules(org_id,title) values (1,'Percentages (tough)') returning set_config('probe.m_unattached',id::text,true);
insert into public.section_modules(section_id,module_id,org_id,sort_order) values
  (pg_temp.v('sub1'),pg_temp.v('m'),1,0), (pg_temp.v('sub2'),pg_temp.v('m'),1,0);
insert into public.curriculum_items(org_id,module_id,type,ref_id,sort_order) values (1,pg_temp.v('m'),'document',pg_temp.v('doc'),0)
  returning set_config('probe.docitem',id::text,true);
insert into public.curriculum_items(org_id,module_id,type,ref_id,sort_order) values (1,pg_temp.v('m'),'test',pg_temp.v('mock'),1)
  returning set_config('probe.testitem',id::text,true);
insert into public.curriculum_items(org_id,module_id,type,title,body,sort_order) values (1,pg_temp.v('m'),'text','Notes','Words',2);
-- A subject-level item, the shape the deployed code writes today.
insert into public.curriculum_items(org_id,section_id,type,title,body,sort_order) values (1,pg_temp.v('sub1'),'text','Subject note','Words',0)
  returning set_config('probe.subitem',id::text,true);
insert into public.curriculum_items(org_id,module_id,type,title,body) values (1,pg_temp.v('m_unattached'),'text','Hidden','Words');

insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,pg_temp.u('s1'),'course',pg_temp.v('p1'),pg_temp.u('admin')),
  (1,pg_temp.u('s1'),'course',pg_temp.v('p2'),pg_temp.u('admin')),
  (1,pg_temp.u('s1'),'course',pg_temp.v('p3'),pg_temp.u('admin'));

-- ---------------------------------------------------------------------------
-- Shape rules
-- ---------------------------------------------------------------------------
select pg_temp.ok((select kind='subject' from public.sections where id=pg_temp.v('sub1')), 'a new section is a subject by default');
select pg_temp.refused(format('insert into public.sections(org_id,course_id,title,kind) values (1,%s,''Mocks 2'',''mocks'')', pg_temp.v('p1')),
  '23505', 'a programme has at most one mocks section');
select pg_temp.refused(format('insert into public.section_modules(section_id,module_id,org_id) values (%s,%s,1)', pg_temp.v('mocks1'), pg_temp.v('m')),
  'P0001', 'a module cannot be attached to the mocks section');
select pg_temp.refused(format('insert into public.curriculum_items(org_id,section_id,type,title,body) values (1,%s,''text'',''x'',''y'')', pg_temp.v('mocks1')),
  'P0001', 'the mocks section refuses a non-test item');
insert into public.curriculum_items(org_id,section_id,type,ref_id) values (1,pg_temp.v('mocks1'),'test',pg_temp.v('mock'));
select pg_temp.ok(true, 'the mocks section accepts a test item');
select pg_temp.refused(format('update public.sections set kind=''mocks'' where id=%s', pg_temp.v('sub2')),
  'P0001', 'a subject holding a module cannot become the mocks section');
select pg_temp.refused(format('insert into public.curriculum_items(org_id,section_id,module_id,type,title,body) values (1,%s,%s,''text'',''x'',''y'')', pg_temp.v('sub1'), pg_temp.v('m')),
  '23514', 'an item cannot sit in a section and a module at once');
select pg_temp.refused('insert into public.curriculum_items(org_id,type,title,body) values (1,''text'',''x'',''y'')',
  '23514', 'an item must sit in a section or a module');

-- ---------------------------------------------------------------------------
-- The access rule
-- ---------------------------------------------------------------------------
select pg_temp.as_user('s1');
select pg_temp.ok((select count(*)=1 from public.modules where id in (pg_temp.v('m'),pg_temp.v('m_unattached'))),
  's1 reads the attached module and not the unattached one');
select pg_temp.ok((select count(*)=3 from public.curriculum_items where module_id=pg_temp.v('m')), 's1 reads the module''s three items');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where module_id=pg_temp.v('m_unattached')), 's1 reads no item of the unattached module');
select pg_temp.ok((select count(*)=2 from public.section_modules where module_id=pg_temp.v('m')), 's1 reads both attachments');
select pg_temp.ok((select private.student_has_document_grant(pg_temp.v('doc'))), 'the module''s PDF opens for s1 through the programme grant');
select pg_temp.ok((select private.student_has_mock_grant(pg_temp.v('mock'))), 'the module''s topic test opens for s1 through the programme grant');
select pg_temp.ok((select count(*)=1 from public.documents where id=pg_temp.v('doc')), 's1 reads the document row');

select pg_temp.as_user('s2');
select pg_temp.ok((select count(*)=0 from public.modules where id in (pg_temp.v('m'),pg_temp.v('m_unattached'))), 's2, holding neither programme, reads no module');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where module_id=pg_temp.v('m')), 's2 reads none of its items');
select pg_temp.ok((select count(*)=0 from public.section_modules where module_id=pg_temp.v('m')), 's2 reads no attachment');
select pg_temp.ok(not (select private.student_has_document_grant(pg_temp.v('doc'))), 'the PDF is closed to s2');
select pg_temp.ok(not (select private.student_has_mock_grant(pg_temp.v('mock'))), 'the topic test is closed to s2');

-- ---------------------------------------------------------------------------
-- Non-admin writes are refused
-- ---------------------------------------------------------------------------
select pg_temp.as_user('s1');
select pg_temp.refused('insert into public.modules(org_id,title) values (1,''Student module'')', '42501', 'a student cannot create a module');
select pg_temp.refused(format('insert into public.section_modules(section_id,module_id,org_id) values (%s,%s,1)', pg_temp.v('sub3'), pg_temp.v('m')),
  '42501', 'a student cannot attach a module');
select pg_temp.refused(format('insert into public.curriculum_items(org_id,module_id,type,title,body) values (1,%s,''text'',''x'',''y'')', pg_temp.v('m')),
  '42501', 'a student cannot add an item to a module');
update public.modules set title='Renamed by student' where id=pg_temp.v('m');
delete from public.section_modules where module_id=pg_temp.v('m');
delete from public.modules where id=pg_temp.v('m');
select pg_temp.as_user('mentor');
select pg_temp.refused('insert into public.modules(org_id,title) values (1,''Mentor module'')', '42501', 'a mentor cannot create a module');
select pg_temp.refused(format('insert into public.section_modules(section_id,module_id,org_id) values (%s,%s,1)', pg_temp.v('sub3'), pg_temp.v('m')),
  '42501', 'a mentor cannot attach a module');
update public.modules set title='Renamed by mentor' where id=pg_temp.v('m');
select pg_temp.as_user('rival');
select pg_temp.ok((select count(*)=0 from public.modules where id=pg_temp.v('m')), 'another organisation''s admin reads no module here');
select pg_temp.refused(format('insert into public.section_modules(section_id,module_id,org_id) values (%s,%s,1)', pg_temp.v('sub3'), pg_temp.v('m')),
  '42501', 'another organisation''s admin cannot attach a module here');
update public.modules set title='Renamed by rival' where id=pg_temp.v('m');
select pg_temp.as_user('admin');
select pg_temp.ok((select title='Time and Work' from public.modules where id=pg_temp.v('m')), 'no student, mentor or rival update changed the module');
select pg_temp.ok((select count(*)=2 from public.section_modules where module_id=pg_temp.v('m')), 'and the student''s deletes removed nothing');

-- ---------------------------------------------------------------------------
-- Per-programme progress
-- ---------------------------------------------------------------------------
select pg_temp.as_user('s2');
select pg_temp.refused(format('insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (%L,%s,%s,1,100)', pg_temp.u('s1'), pg_temp.v('p1'), pg_temp.v('docitem')),
  '42501', 'the wrong student cannot write s1''s progress');
select pg_temp.refused(format('insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (%L,%s,%s,1,100)', pg_temp.u('s2'), pg_temp.v('p1'), pg_temp.v('docitem')),
  '42501', 'nor their own, in a programme they do not hold');

select pg_temp.as_user('s1');
select pg_temp.refused(format('insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (%L,%s,%s,1,100)', pg_temp.u('s2'), pg_temp.v('p1'), pg_temp.v('docitem')),
  '42501', 's1 cannot write s2''s progress');
select pg_temp.refused(format('insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (%L,%s,%s,1,100)', pg_temp.u('s1'), pg_temp.v('p3'), pg_temp.v('docitem')),
  '42501', 's1 cannot record progress on an item through a programme that does not contain it');
select pg_temp.refused(format('insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (%L,%s,%s,1,100)', pg_temp.u('s1'), pg_temp.v('p1'), pg_temp.v('testitem')),
  '42501', 'a test item''s progress is never stored');
select pg_temp.refused(format('insert into public.item_progress(student_id,item_id,org_id,percent) values (%L,%s,1,100)', pg_temp.u('s1'), pg_temp.v('docitem')),
  '42501', 'a module item''s progress must name its programme (RLS refuses it before NOT NULL would)');

-- The deployed actions send no course_id: the programme is filled in.
insert into public.item_progress(student_id,item_id,org_id,percent,completed,completed_at)
  values (pg_temp.u('s1'),pg_temp.v('subitem'),1,100,true,now())
  on conflict (student_id,item_id) do nothing;
select pg_temp.ok((select course_id=pg_temp.v('p1') from public.item_progress where student_id=pg_temp.u('s1') and item_id=pg_temp.v('subitem')),
  'a subject item''s progress written as the deployed code writes it is stamped with its programme');

insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (pg_temp.u('s1'),pg_temp.v('p1'),pg_temp.v('docitem'),1,100);
select pg_temp.ok((select count(*)=1 from public.item_progress where student_id=pg_temp.u('s1') and item_id=pg_temp.v('docitem') and course_id=pg_temp.v('p1')),
  's1 records progress on the shared PDF in MU');
select pg_temp.ok((select count(*)=0 from public.item_progress where student_id=pg_temp.u('s1') and item_id=pg_temp.v('docitem') and course_id=pg_temp.v('p2')),
  'and it does not show in Ashoka');
select pg_temp.refused(format('insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (%L,%s,%s,1,100)', pg_temp.u('s1'), pg_temp.v('p2'), pg_temp.v('docitem')),
  '23505', 'until the contract step, the legacy (student, item) key allows one row per item');
select pg_temp.refused(format('update public.item_progress set course_id=%s where student_id=%L and item_id=%s', pg_temp.v('p3'), pg_temp.u('s1'), pg_temp.v('docitem')),
  '42501', 's1 cannot move a progress row to a programme that does not contain the item');

-- The contract step, simulated inside this rolled-back transaction: with the
-- legacy key gone, MU and Ashoka each hold their own row.
reset role;
drop index public.item_progress_student_item_legacy_key;
set local role authenticated;
insert into public.item_progress(student_id,course_id,item_id,org_id,percent) values (pg_temp.u('s1'),pg_temp.v('p2'),pg_temp.v('docitem'),1,40);
select pg_temp.ok((select count(*)=2 from public.item_progress where student_id=pg_temp.u('s1') and item_id=pg_temp.v('docitem')),
  'after the contract step the shared PDF carries a separate row per programme');

-- ---------------------------------------------------------------------------
-- Per-programme attempts (max_attempts = 1)
-- ---------------------------------------------------------------------------
select pg_temp.refused(format('insert into public.attempts(org_id,mock_id,student_id,course_id) values (1,%s,%L,%s)', pg_temp.v('mock'), pg_temp.u('s2'), pg_temp.v('p1')),
  '42501', 's1 cannot start an attempt as s2');
select pg_temp.refused(format('insert into public.attempts(org_id,mock_id,student_id,course_id) values (1,%s,%L,%s)', pg_temp.v('mock'), pg_temp.u('s1'), pg_temp.v('p3')),
  '42501', 'an attempt cannot claim a programme whose curriculum does not hold the mock');

insert into public.attempts(org_id,mock_id,student_id,course_id) values (1,pg_temp.v('mock'),pg_temp.u('s1'),pg_temp.v('p1'))
  returning set_config('probe.a1',id::text,true);
update public.attempts set status='submitted' where id=pg_temp.v('a1');
select pg_temp.ok((select course_id=pg_temp.v('p1') and status='submitted' from public.attempts where id=pg_temp.v('a1')), 's1 sits the topic test in MU');
select pg_temp.refused(format('insert into public.attempts(org_id,mock_id,student_id,course_id) values (1,%s,%L,%s)', pg_temp.v('mock'), pg_temp.u('s1'), pg_temp.v('p1')),
  '42501', 'the one attempt in MU is used up');
insert into public.attempts(org_id,mock_id,student_id,course_id) values (1,pg_temp.v('mock'),pg_temp.u('s1'),pg_temp.v('p2'))
  returning set_config('probe.a2',id::text,true);
update public.attempts set status='submitted' where id=pg_temp.v('a2');
select pg_temp.ok(true, 'the same test in Ashoka has its own attempt');
select pg_temp.refused(format('insert into public.attempts(org_id,mock_id,student_id,course_id) values (1,%s,%L,%s)', pg_temp.v('mock'), pg_temp.u('s1'), pg_temp.v('p2')),
  '42501', 'and Ashoka''s one attempt is used up too');
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('mock'),pg_temp.u('s1')) returning set_config('probe.a0',id::text,true);
select pg_temp.ok((select course_id is null from public.attempts where id=pg_temp.v('a0')), 'an attempt outside any programme counts on its own, as before');
update public.attempts set status='submitted' where id=pg_temp.v('a0');
select pg_temp.ok((select count(*)=1 from public.attempts where mock_id=pg_temp.v('mock') and student_id=pg_temp.u('s1') and status='submitted' and course_id=pg_temp.v('p1')),
  'MU''s result reads only MU''s attempt');
select pg_temp.refused(format('update public.attempts set course_id=%s where id=%s', pg_temp.v('p2'), pg_temp.v('a1')),
  '42501', 'an attempt cannot be moved to another programme');
select pg_temp.refused(format('update public.attempts set course_id=null where id=%s', pg_temp.v('a1')),
  '42501', 'nor taken out of its programme to free an attempt');

-- s2 holds the mock directly but not MU: naming MU is refused.
select pg_temp.as_user('admin');
insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values (1,pg_temp.u('s2'),'mock',pg_temp.v('mock'),pg_temp.u('admin'));
select pg_temp.as_user('s2');
select pg_temp.refused(format('insert into public.attempts(org_id,mock_id,student_id,course_id) values (1,%s,%L,%s)', pg_temp.v('mock'), pg_temp.u('s2'), pg_temp.v('p1')),
  '42501', 'a programme id sent by a student who does not hold it is refused');

-- ---------------------------------------------------------------------------
-- Revoking one programme leaves the other path; deleting a programme keeps
-- its attempts and drops its progress
-- ---------------------------------------------------------------------------
select pg_temp.as_user('admin');
delete from public.content_access where student_id=pg_temp.u('s1') and resource_type='course' and resource_id=pg_temp.v('p1');
select pg_temp.as_user('s1');
select pg_temp.ok((select count(*)=1 from public.modules where id=pg_temp.v('m')), 'with MU revoked, s1 still reaches the module through Ashoka');
select pg_temp.ok((select private.student_has_document_grant(pg_temp.v('doc'))), 'and its PDF');
select pg_temp.as_user('admin');
delete from public.content_access where student_id=pg_temp.u('s1') and resource_type='course' and resource_id=pg_temp.v('p2');
select pg_temp.as_user('s1');
select pg_temp.ok((select count(*)=0 from public.modules where id=pg_temp.v('m')), 'with both revoked, s1 reaches nothing');
select pg_temp.ok(not (select private.student_has_document_grant(pg_temp.v('doc'))), 'and the PDF is closed');

reset role;
delete from public.courses where id=pg_temp.v('p2');
select pg_temp.ok((select course_id is null from public.attempts where id=pg_temp.v('a2')), 'deleting Ashoka keeps its attempt, outside any programme');
select pg_temp.ok((select count(*)=0 from public.item_progress where course_id=pg_temp.v('p2')), 'and removes the progress made in it');
select pg_temp.ok((select count(*)=1 from public.section_modules where module_id=pg_temp.v('m')), 'the module stays attached to MU');
delete from public.modules where id=pg_temp.v('m');
select pg_temp.ok((select count(*)=0 from public.section_modules where module_id=pg_temp.v('m'))
  and (select count(*)=0 from public.curriculum_items where module_id=pg_temp.v('m')),
  'deleting a module detaches it everywhere and takes its items');

select pg_temp.ok(current_setting('probe.passes')::int=69, current_setting('probe.passes')||' modules database checks passed, expected 69');
rollback;
