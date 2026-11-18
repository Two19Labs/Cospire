-- Rollback-only database verification for shared modules, Phase 2: the
-- contract step (20261118100500) and the delete preview by programme
-- (20261118100600). Proves that a shared module's item now holds a separate
-- progress row per programme, written the way the Phase 2 actions write it
-- (upsert on student, programme and item), that a row without a programme is
-- refused, that the old upsert fails, and that the programme delete preview
-- counts module-item progress.
--
-- Run it AFTER both migrations are applied:
--
--   npx supabase db query --linked -f scripts/verify/modules-2.sql
--
-- Or before, with them spliced in after `begin;`, as `modules.sql` describes:
--
--   { sed -n '1,/^begin;$/p' scripts/verify/modules-2.sql
--     for f in supabase/migrations/2026111810050*.sql supabase/migrations/2026111810060*.sql; do sed '/^begin;$/d;/^commit;$/d' "$f"; done
--     sed -n '/^begin;$/,$p' scripts/verify/modules-2.sql | tail -n +2
--   } > coverage/modules-2-spliced.sql
--   npx supabase db query --linked -f coverage/modules-2-spliced.sql
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
grant execute on function pg_temp.ok(boolean,text), pg_temp.refused(text,text,text), pg_temp.as_user(text), pg_temp.v(text), pg_temp.u(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The contract step
-- ---------------------------------------------------------------------------
select pg_temp.ok(to_regclass('public.item_progress_student_item_legacy_key') is null, 'the legacy (student, item) key is gone');
select pg_temp.ok(not exists (select 1 from pg_trigger where tgrelid='public.item_progress'::regclass and tgname='item_progress_fill_course')
  and to_regprocedure('private.fill_item_progress_course()') is null, 'the course fill trigger and its function are gone');
select pg_temp.ok(to_regprocedure('private.student_may_record_progress(bigint,bigint)') is null
  and to_regprocedure('private.student_may_record_progress(bigint,bigint,bigint)') is not null,
  'only the three-argument progress check remains');

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' order by id limit 1;
select set_config('probe.s1', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select pg_temp.ok(current_setting('probe.s1', true) is not null and current_setting('probe.admin', true) is not null, 'the accounts this probe needs exist');

-- ---------------------------------------------------------------------------
-- Fixtures, as the admin: MU (p1) and Ashoka (p2), one module attached to the
-- QA subject of each, holding a PDF; MU also has a subject-level note. s1
-- holds both programmes.
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('admin');
insert into public.documents(org_id,title,folder,storage_path,uploaded_by)
  values (1,'Modules 2 probe PDF','Probe','org/1/'||gen_random_uuid()||'.pdf',pg_temp.u('admin'))
  returning set_config('probe.doc',id::text,true);
insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules 2 probe MU '||txid_current(),'programme',0)
  returning set_config('probe.p1',id::text,true);
insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules 2 probe Ashoka '||txid_current(),'programme',0)
  returning set_config('probe.p2',id::text,true);
insert into public.sections(org_id,course_id,title) values (1,pg_temp.v('p1'),'QA') returning set_config('probe.sub1',id::text,true);
insert into public.sections(org_id,course_id,title) values (1,pg_temp.v('p2'),'QA') returning set_config('probe.sub2',id::text,true);
insert into public.modules(org_id,title) values (1,'Time and Work') returning set_config('probe.m',id::text,true);
insert into public.section_modules(section_id,module_id,org_id,sort_order) values
  (pg_temp.v('sub1'),pg_temp.v('m'),1,0), (pg_temp.v('sub2'),pg_temp.v('m'),1,0);
insert into public.curriculum_items(org_id,module_id,type,ref_id,sort_order) values (1,pg_temp.v('m'),'document',pg_temp.v('doc'),0)
  returning set_config('probe.docitem',id::text,true);
insert into public.curriculum_items(org_id,section_id,type,title,body,sort_order) values (1,pg_temp.v('sub1'),'text','Subject note','Words',0)
  returning set_config('probe.subitem',id::text,true);
insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by) values
  (1,pg_temp.u('s1'),'course',pg_temp.v('p1'),pg_temp.u('admin')),
  (1,pg_temp.u('s1'),'course',pg_temp.v('p2'),pg_temp.u('admin'));

-- ---------------------------------------------------------------------------
-- Per-programme rows, written as the Phase 2 actions write them
-- ---------------------------------------------------------------------------
select pg_temp.as_user('s1');
insert into public.item_progress(student_id,course_id,item_id,org_id,percent,completed,completed_at)
  values (pg_temp.u('s1'),pg_temp.v('p1'),pg_temp.v('docitem'),1,100,true,now())
  on conflict (student_id,course_id,item_id) do nothing;
insert into public.item_progress(student_id,course_id,item_id,org_id,percent,last_position)
  values (pg_temp.u('s1'),pg_temp.v('p2'),pg_temp.v('docitem'),1,40,10)
  on conflict (student_id,course_id,item_id) do update set percent=excluded.percent, last_position=excluded.last_position;
select pg_temp.ok((select count(*)=2 from public.item_progress where student_id=pg_temp.u('s1') and item_id=pg_temp.v('docitem')),
  'the shared PDF holds one row in MU and one in Ashoka');
select pg_temp.ok((select completed and percent=100 from public.item_progress where student_id=pg_temp.u('s1') and course_id=pg_temp.v('p1') and item_id=pg_temp.v('docitem'))
  and (select not completed and percent=40 from public.item_progress where student_id=pg_temp.u('s1') and course_id=pg_temp.v('p2') and item_id=pg_temp.v('docitem')),
  'done in MU, 40% in Ashoka: each programme keeps its own state');

insert into public.item_progress(student_id,course_id,item_id,org_id,percent,last_position)
  values (pg_temp.u('s1'),pg_temp.v('p2'),pg_temp.v('docitem'),1,70,25)
  on conflict (student_id,course_id,item_id) do update set percent=excluded.percent, last_position=excluded.last_position;
select pg_temp.ok((select percent=70 and last_position=25 from public.item_progress where student_id=pg_temp.u('s1') and course_id=pg_temp.v('p2') and item_id=pg_temp.v('docitem'))
  and (select percent=100 from public.item_progress where student_id=pg_temp.u('s1') and course_id=pg_temp.v('p1') and item_id=pg_temp.v('docitem')),
  'a second upsert in Ashoka updates only Ashoka''s row');

insert into public.item_progress(student_id,course_id,item_id,org_id,percent,completed,completed_at)
  values (pg_temp.u('s1'),pg_temp.v('p1'),pg_temp.v('subitem'),1,100,true,now())
  on conflict (student_id,course_id,item_id) do nothing;
select pg_temp.ok((select count(*)=1 from public.item_progress where student_id=pg_temp.u('s1') and item_id=pg_temp.v('subitem') and course_id=pg_temp.v('p1')),
  'a subject item''s progress is written with its programme');

select pg_temp.refused(format('insert into public.item_progress(student_id,item_id,org_id,percent) values (%L,%s,1,100)', pg_temp.u('s1'), pg_temp.v('subitem')),
  '42501', 'a row that names no programme is refused, even for a subject item');
select pg_temp.refused(format('insert into public.item_progress(student_id,item_id,org_id,percent) values (%L,%s,1,100) on conflict (student_id,item_id) do nothing', pg_temp.u('s1'), pg_temp.v('subitem')),
  '42P10', 'the pre-Phase 2 upsert on (student, item) now fails, saving nothing');

-- ---------------------------------------------------------------------------
-- The programme delete preview counts progress by programme
-- ---------------------------------------------------------------------------
select pg_temp.as_user('admin');
select pg_temp.ok((select (public.content_delete_preview('programme', pg_temp.v('p1')) -> 'counts' ->> 'progressRows')::int = 2),
  'MU''s delete preview counts both of its progress rows, the module item''s included');
select pg_temp.ok((select (public.content_delete_preview('programme', pg_temp.v('p2')) -> 'counts' ->> 'progressRows')::int = 1),
  'Ashoka''s counts only its own row of the shared PDF');
select pg_temp.ok((select (public.content_delete_preview('document', pg_temp.v('doc')) -> 'counts' ->> 'progressRows')::int = 2),
  'the PDF''s own preview still counts its rows in every programme');

reset role;
delete from public.courses where id=pg_temp.v('p1');
select pg_temp.ok((select count(*)=0 from public.item_progress where course_id=pg_temp.v('p1'))
  and (select count(*)=1 from public.item_progress where course_id=pg_temp.v('p2')),
  'deleting MU removes exactly the rows its preview counted, and Ashoka''s row stays');

select pg_temp.ok(current_setting('probe.passes')::int=14, current_setting('probe.passes')||' modules-2 database checks passed, expected 14');
rollback;
