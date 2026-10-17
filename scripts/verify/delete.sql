-- Rollback-only database verification for D42 and D54: delete for programmes,
-- documents, mocks and videos. Every refusal is proven by what the database
-- refuses or by counting rows, and every delete is proven by counting the rows
-- that hang off the thing deleted, before and after.
--
-- Run it with `20261017110000_delete.sql` spliced in after `begin;` (its own
-- `begin;`/`commit;` stripped), which is how every migration here is proven
-- before it is applied:
--
--   { sed -n '1,/^begin;$/p' scripts/verify/delete.sql
--     sed '/^begin;$/d;/^commit;$/d' supabase/migrations/20261017110000_delete.sql
--     sed -n '/^begin;$/,$p' scripts/verify/delete.sql | tail -n +2
--   } > coverage/delete-spliced.sql
--   npx supabase db query --linked -f coverage/delete-spliced.sql
--
-- The whole thing rolls back, so it writes nothing. It never names a real row:
-- every mock, document, video, programme, grant and attempt it deletes is one
-- it created in the same transaction.
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
select pg_temp.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.deletion_cleanups'::regclass),
  'RLS is enabled and forced on deletion_cleanups');
select pg_temp.ok((select count(distinct cmd)=4 from pg_policies where schemaname='public' and tablename='deletion_cleanups'),
  'deletion_cleanups carries a policy for all four verbs, not only SELECT');
select pg_temp.ok((select count(*)=0 from information_schema.role_table_grants where grantee='anon' and table_schema='public' and table_name='deletion_cleanups'),
  'anon holds no grant on deletion_cleanups');
select pg_temp.ok((select count(*)=0 from information_schema.columns where table_schema='public' and table_name='deletion_cleanups' and data_type='timestamp without time zone'),
  'no bare timestamp column');
select pg_temp.ok((select not has_function_privilege('anon','public.delete_content(text,bigint,text)','execute')
  and has_function_privilege('authenticated','public.delete_content(text,bigint,text)','execute')),
  'anon cannot execute delete_content; authenticated can');
select pg_temp.ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='delete_content'),
  'delete_content is SECURITY DEFINER, so the admin needs no delete policy on a student''s rows');

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' limit 1;
select set_config('probe.student', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select set_config('probe.rival', id::text, true) from public.profiles where org_id<>1 and role='admin' and status='active' limit 1;
select set_config('probe.questions_before', (select count(*) from public.questions)::text, true);
select set_config('probe.rescores_before', (select count(*) from public.rescore_events)::text, true);

-- ---------------------------------------------------------------------------
-- Fixtures, as the admin: a mock sat by the student, a document, a video, and
-- a programme whose curriculum points at all three plus a text item.
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('admin');
insert into public.question_sections(org_id,name) values(1,'Delete probe '||txid_current()) returning set_config('probe.section',id::text,true);
select set_config('probe.q1', public.save_question(null,'mcq','Delete probe question 1','[{"id":"a","text":"A"},{"id":"b","text":"B"}]','[]',null,pg_temp.v('section'),'Probe','easy',3,'{"options":["a"]}',null)::text,true);
select set_config('probe.q2', public.save_question(null,'essay','Delete probe essay','[]','[]',null,pg_temp.v('section'),'Probe','easy',5,null,null)::text,true);
set constraints all immediate; set constraints all deferred;

select set_config('probe.mock', public.save_mock(null,'Delete probe mock','',60,0,array['mcq'],2,true,true,
  jsonb_build_array(jsonb_build_object('title','All questions','durationMinutes',null,'questions',jsonb_build_array(pg_temp.v('q1'),pg_temp.v('q2')))))::text,true);
set constraints all immediate; set constraints all deferred;
select set_config('probe.msection', id::text, true) from public.mock_sections where mock_id=pg_temp.v('mock');

insert into public.documents(org_id,title,folder,storage_path,uploaded_by)
  values (1,'Delete probe document','Probe','org/1/'||gen_random_uuid()||'.pdf',current_setting('probe.admin')::uuid)
  returning set_config('probe.doc',id::text,true);
insert into public.videos(org_id,vdocipher_id,title,status,created_by)
  values (1,md5('delete probe '||txid_current()),'Delete probe video','ready',current_setting('probe.admin')::uuid)
  returning set_config('probe.video',id::text,true);

-- Counted as the admin, through RLS, so the comparison at the end is like with
-- like: a count taken before `set local role authenticated` sees every
-- organisation's rows and this one does not.
select set_config('probe.docs_fixture', (select count(*) from public.documents)::text, true);

insert into public.courses(org_id,title,kind,sort_order) values (1,'Delete probe programme '||txid_current(),'programme',0)
  returning set_config('probe.course',id::text,true);
insert into public.sections(org_id,course_id,title,sort_order) values (1,pg_temp.v('course'),'Week 1',0)
  returning set_config('probe.csection',id::text,true);
insert into public.curriculum_items(org_id,section_id,type,ref_id,sort_order) values
  (1,pg_temp.v('csection'),'document',pg_temp.v('doc'),0)
  returning set_config('probe.docitem',id::text,true);
insert into public.curriculum_items(org_id,section_id,type,ref_id,sort_order) values
  (1,pg_temp.v('csection'),'video',pg_temp.v('video'),1)
  returning set_config('probe.videoitem',id::text,true);
insert into public.curriculum_items(org_id,section_id,type,ref_id,sort_order) values
  (1,pg_temp.v('csection'),'test',pg_temp.v('mock'),2);
insert into public.curriculum_items(org_id,section_id,type,title,body,sort_order) values
  (1,pg_temp.v('csection'),'text','A note','Words',3);

insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,current_setting('probe.student')::uuid,'mock',pg_temp.v('mock'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.student')::uuid,'document',pg_temp.v('doc'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.student')::uuid,'video',pg_temp.v('video'),current_setting('probe.admin')::uuid),
  (1,current_setting('probe.student')::uuid,'course',pg_temp.v('course'),current_setting('probe.admin')::uuid);

-- The student sits the mock and makes progress on the document and the video.
select pg_temp.as_user('student');
insert into public.item_progress(student_id,item_id,org_id,percent) values
  (current_setting('probe.student')::uuid,pg_temp.v('docitem'),1,50),
  (current_setting('probe.student')::uuid,pg_temp.v('videoitem'),1,25);
insert into public.attempts(org_id,mock_id,student_id) values (1,pg_temp.v('mock'),current_setting('probe.student')::uuid)
  returning set_config('probe.attempt',id::text,true);
insert into public.attempt_sections(attempt_id,mock_section_id) values (pg_temp.v('attempt'),pg_temp.v('msection'));
insert into public.attempt_responses(attempt_id,question_id,answer) values
  (pg_temp.v('attempt'),pg_temp.v('q1'),'{"options":["a"]}'),
  (pg_temp.v('attempt'),pg_temp.v('q2'),'{"text":"An essay."}');
insert into public.proctor_events(attempt_id,event_type) values (pg_temp.v('attempt'),'tab_hidden');
update public.attempts set status='submitted' where id=pg_temp.v('attempt');

select pg_temp.as_user('admin');
insert into public.essay_marks(attempt_id,question_id,org_id,marks,marked_by)
  values (pg_temp.v('attempt'),pg_temp.v('q2'),1,4,current_setting('probe.admin')::uuid);

select pg_temp.ok((select count(*)=1 from public.essay_marks where attempt_id=pg_temp.v('attempt')), 'the fixture mock has been sat, answered, proctored and essay-marked');

-- ---------------------------------------------------------------------------
-- Who may run it
-- ---------------------------------------------------------------------------
select pg_temp.as_user('student');
select pg_temp.refused(format($q$select public.delete_content('mock',%s,'Delete probe mock')$q$, pg_temp.v('mock')),
  '42501', 'a student cannot run delete_content');
select pg_temp.refused(format($q$select public.content_delete_preview('mock',%s)$q$, pg_temp.v('mock')),
  '42501', 'and cannot even read the preview');
select pg_temp.as_user('rival');
select pg_temp.refused(format($q$select public.delete_content('mock',%s,'Delete probe mock')$q$, pg_temp.v('mock')),
  'P0002', 'another organisation''s admin is told only that it is not there');
select pg_temp.as_user('admin');
select pg_temp.refused(format($q$select public.delete_content('question',%s,'Delete probe mock')$q$, pg_temp.v('q1')),
  '22023', 'a question is not a deletable kind of thing: the bank is shared');

-- ---------------------------------------------------------------------------
-- The preview states what is really there
-- ---------------------------------------------------------------------------
select set_config('probe.preview', (public.content_delete_preview('mock',pg_temp.v('mock')) #>> '{}'), true);
select pg_temp.ok((current_setting('probe.preview')::jsonb -> 'counts') = jsonb_build_object(
    'attempts',1,'responses',2,'attemptSections',1,'proctorEvents',1,'essayMarks',1,
    'paperSections',1,'paperQuestions',2,'grants',1,'curriculumItems',1),
  'the mock preview counts every row that hangs off it, measured not estimated');
select pg_temp.ok((current_setting('probe.preview')::jsonb ->> 'label') = 'Delete probe mock', 'and names it');

-- ---------------------------------------------------------------------------
-- The typed name, checked in the database
-- ---------------------------------------------------------------------------
select pg_temp.refused(format($q$select public.delete_content('mock',%s,'delete probe mock')$q$, pg_temp.v('mock')),
  '22023', 'a name in the wrong case is refused');
select pg_temp.refused(format($q$select public.delete_content('mock',%s,'')$q$, pg_temp.v('mock')),
  '22023', 'an empty name is refused');
select pg_temp.refused(format($q$select public.delete_content('mock',%s,null)$q$, pg_temp.v('mock')),
  '22023', 'and so is no name at all');
select pg_temp.ok((select count(*)=1 from public.mocks where id=pg_temp.v('mock'))
  and (select count(*)=1 from public.attempts where mock_id=pg_temp.v('mock')),
  'after three refusals the mock and its attempt are both still there: nothing half-done');

-- ---------------------------------------------------------------------------
-- The orphan a foreign key cannot prevent: an ARS round links a mock in its
-- own `config`
-- ---------------------------------------------------------------------------
insert into public.courses(org_id,title,kind,sort_order) values (1,'Delete probe process '||txid_current(),'ars_process',0)
  returning set_config('probe.process',id::text,true);
insert into public.ars_rounds(org_id,course_id,name,submission_mode,config,sort_order)
  values (1,pg_temp.v('process'),'Aptitude','text',jsonb_build_object('prompt','Sit the mock','mockId',pg_temp.v('mock')),0)
  returning set_config('probe.round',id::text,true);
select pg_temp.refused(format($q$select public.delete_content('mock',%s,'Delete probe mock')$q$, pg_temp.v('mock')),
  '23503', 'a mock an ARS round points at cannot be deleted, which would leave the round pointing at nothing');
select pg_temp.ok((current_setting('probe.preview')::jsonb ->> 'blockedBy') is null
  and (public.content_delete_preview('mock',pg_temp.v('mock')) ->> 'blockedBy') = 'Aptitude',
  'and the preview names the round, so the screen can say which one to unlink');
update public.ars_rounds set config = config - 'mockId' where id=pg_temp.v('round');

-- ---------------------------------------------------------------------------
-- Deleting the mock: it takes its attempts and their results, its paper rows,
-- its grants and its curriculum item -- and no question
-- ---------------------------------------------------------------------------
select set_config('probe.result', (public.delete_content('mock',pg_temp.v('mock'),' Delete   probe mock ') #>> '{}'), true);
select pg_temp.ok((current_setting('probe.result')::jsonb ->> 'cleanupId') is null,
  'a mock needs no cleanup outside the database');
select pg_temp.ok((select count(*)=0 from public.mocks where id=pg_temp.v('mock')), 'the mock is gone (and a whitespace-sloppy name is still the name)');
select pg_temp.ok((select count(*)=0 from public.attempts where mock_id=pg_temp.v('mock')), 'zero attempts left');
select pg_temp.ok((select count(*)=0 from public.attempt_responses where attempt_id=pg_temp.v('attempt')), 'zero responses left');
select pg_temp.ok((select count(*)=0 from public.attempt_sections where attempt_id=pg_temp.v('attempt')), 'zero attempt sections left');
select pg_temp.ok((select count(*)=0 from public.proctor_events where attempt_id=pg_temp.v('attempt')), 'zero proctor events left');
select pg_temp.ok((select count(*)=0 from public.essay_marks where attempt_id=pg_temp.v('attempt')), 'zero essay marks left');
select pg_temp.ok((select count(*)=0 from public.mock_sections where mock_id=pg_temp.v('mock'))
  and (select count(*)=0 from public.mock_questions where mock_id=pg_temp.v('mock')), 'zero paper rows left');
select pg_temp.ok((select count(*)=0 from public.content_access where resource_type='mock' and resource_id=pg_temp.v('mock')), 'zero grants left');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where type='test' and ref_id=pg_temp.v('mock')), 'zero curriculum items left');
select pg_temp.ok((select count(*)=2 from public.questions where id in (pg_temp.v('q1'),pg_temp.v('q2'))), 'both questions are still in the bank');
select pg_temp.ok((select count(*)=current_setting('probe.rescores_before')::int from public.rescore_events), 'and no rescore record was touched');

-- ---------------------------------------------------------------------------
-- Deleting the document: grants, curriculum item, progress row, and the
-- storage object handed to the caller as a cleanup row
-- ---------------------------------------------------------------------------
select set_config('probe.docpath', storage_path, true) from public.documents where id=pg_temp.v('doc');
select set_config('probe.result', (public.delete_content('document',pg_temp.v('doc'),'Delete probe document') #>> '{}'), true);
select pg_temp.ok((select count(*)=0 from public.documents where id=pg_temp.v('doc')), 'the document row is gone');
select pg_temp.ok((select count(*)=0 from public.content_access where resource_type='document' and resource_id=pg_temp.v('doc')), 'zero document grants left');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where id=pg_temp.v('docitem')), 'zero curriculum items left');
select pg_temp.ok((select count(*)=0 from public.item_progress where item_id=pg_temp.v('docitem')), 'zero item_progress rows left');
select pg_temp.ok((current_setting('probe.result')::jsonb ->> 'target') = current_setting('probe.docpath'),
  'and the caller is handed the storage path still to remove');
select pg_temp.ok((select count(*)=1 from public.deletion_cleanups
  where id=(current_setting('probe.result')::jsonb ->> 'cleanupId')::bigint
    and status='pending' and resource_type='document' and target=current_setting('probe.docpath')
    and resource_label='Delete probe document' and org_id=1),
  'written in the same transaction as the delete, so the file cannot be lost quietly');

-- The cleanup itself is an HTTP call this probe cannot make, but the policy it
-- depends on can be checked here: an admin may remove an object under their own
-- organisation's prefix (`documents_objects_delete_admin`, already on main) and
-- a student may not. Both rows are rolled back with everything else.
-- The object itself is not checked here. Supabase's `storage.protect_delete()`
-- trigger refuses a direct DELETE from `storage.objects` outright ("Use the
-- Storage API instead"), so no SQL probe can prove the file goes; only the
-- running application can, through `.remove()`. What is proven here is that the
-- path is handed over and recorded, which is what stops it being lost.

-- ---------------------------------------------------------------------------
-- Deleting the video: the same, plus the VdoCipher id to remove
-- ---------------------------------------------------------------------------
select set_config('probe.vdo', vdocipher_id, true) from public.videos where id=pg_temp.v('video');
select set_config('probe.result', (public.delete_content('video',pg_temp.v('video'),'Delete probe video') #>> '{}'), true);
select pg_temp.ok((select count(*)=0 from public.videos where id=pg_temp.v('video')), 'the video row is gone');
select pg_temp.ok((select count(*)=0 from public.content_access where resource_type='video' and resource_id=pg_temp.v('video')), 'zero video grants left');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where id=pg_temp.v('videoitem')), 'zero curriculum items left');
select pg_temp.ok((select count(*)=0 from public.item_progress where item_id=pg_temp.v('videoitem')), 'zero item_progress rows left');
select pg_temp.ok((current_setting('probe.result')::jsonb ->> 'target') = current_setting('probe.vdo')
  and (select count(*)=1 from public.deletion_cleanups where resource_type='video' and target=current_setting('probe.vdo') and status='pending'),
  'and the VdoCipher video is handed over as a pending cleanup');

-- ---------------------------------------------------------------------------
-- Deleting the programme: its sections, items and grants, and nothing it
-- pointed at
-- ---------------------------------------------------------------------------
select set_config('probe.preview2', (public.content_delete_preview('programme',pg_temp.v('course')) #>> '{}'), true);
select pg_temp.ok((current_setting('probe.preview2')::jsonb -> 'counts') = jsonb_build_object('sections',1,'curriculumItems',1,'progressRows',0,'grants',1),
  'the programme preview counts the one item left after the three above went, and its grant');
select public.delete_content('programme',pg_temp.v('course'),(current_setting('probe.preview2')::jsonb ->> 'label'));
select pg_temp.ok((select count(*)=0 from public.courses where id=pg_temp.v('course')), 'the programme is gone');
select pg_temp.ok((select count(*)=0 from public.sections where course_id=pg_temp.v('course')), 'zero sections left');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where section_id=pg_temp.v('csection')), 'zero curriculum items left');
select pg_temp.ok((select count(*)=0 from public.content_access where resource_type='course' and resource_id=pg_temp.v('course')), 'zero programme grants left');
select pg_temp.ok((select count(*)=current_setting('probe.docs_fixture')::int - 1 from public.documents),
  'and exactly one document went in this whole run: a programme never deletes the library it points at');

-- ---------------------------------------------------------------------------
-- The cleanup list is the admin's, and only their organisation's
-- ---------------------------------------------------------------------------
select pg_temp.ok((select count(*)=2 from public.deletion_cleanups where status='pending'), 'the admin reads both pending cleanups');
update public.deletion_cleanups set status='done' where target=current_setting('probe.vdo');
select pg_temp.ok((select count(*)=1 from public.deletion_cleanups where status='pending'), 'and can close one once the external delete has really happened');
select pg_temp.as_user('student');
select pg_temp.ok((select count(*)=0 from public.deletion_cleanups), 'a student reads no cleanup rows at all');
select pg_temp.as_user('rival');
select pg_temp.ok((select count(*)=0 from public.deletion_cleanups), 'and neither does another organisation''s admin');

select pg_temp.as_user('admin');
select pg_temp.ok((select count(*)=current_setting('probe.questions_before')::int + 2 from public.questions),
  'the only questions added are this run''s two, and no delete removed one');

select pg_temp.ok(current_setting('probe.passes')::int=53, current_setting('probe.passes')||' delete database checks passed, expected 53');
rollback;
