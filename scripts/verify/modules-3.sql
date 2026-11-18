-- Rollback-only database verification for shared modules, slice 3: deleting a
-- module (20261118110000_delete_module.sql). Proves the preview names the
-- programmes a module is attached to, that a student cannot preview or delete,
-- that a wrong name is refused, and that deleting an attached module removes its
-- attachments from both programmes and its items with their progress, while the
-- programmes, their subjects and the library content (a document) stay.
--
-- Run it AFTER the migration is applied (and 20261118100500 to 100700):
--
--   npx supabase db query --linked -f scripts/verify/modules-3.sql
--
-- Or before, with the migration spliced in after `begin;`:
--
--   { sed -n '1,/^begin;$/p' scripts/verify/modules-3.sql
--     sed '/^begin;$/d;/^commit;$/d' supabase/migrations/20261118110000_delete_module.sql
--     sed -n '/^begin;$/,$p' scripts/verify/modules-3.sql | tail -n +2
--   } > coverage/modules-3-spliced.sql
--   npx supabase db query --linked -f coverage/modules-3-spliced.sql
--
-- Writes nothing: everything rolls back. Expected: 16 checks passed. Needs, in
-- org 1, one active admin and one active student.
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
-- The functions
-- ---------------------------------------------------------------------------
select pg_temp.ok((select p.prosecdef and p.prosrc like '%''module''%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='delete_content')
  and (select p.prosecdef and p.provolatile='s' and p.proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='content_delete_preview'),
  'both functions are SECURITY DEFINER with an empty search_path, the preview stable, and know the module kind');
select pg_temp.ok((select not has_function_privilege('anon','public.delete_content(text,bigint,text)','execute')
  and not has_function_privilege('anon','public.content_delete_preview(text,bigint)','execute')
  and has_function_privilege('authenticated','public.delete_content(text,bigint,text)','execute')
  and has_function_privilege('authenticated','public.content_delete_preview(text,bigint)','execute')),
  'anon cannot execute either function; authenticated can');

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' order by id limit 1;
select set_config('probe.s1', id::text, true) from public.profiles where org_id=1 and role='student' and status='active' order by id limit 1;
select pg_temp.ok(current_setting('probe.s1', true) is not null and current_setting('probe.admin', true) is not null, 'the accounts this probe needs exist');

-- ---------------------------------------------------------------------------
-- Fixtures, as the admin: one module (a PDF and a reading) attached to the QA
-- subject of two programmes; a second module attached nowhere. s1 holds MU and
-- has progress on the PDF there.
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('admin');
insert into public.documents(org_id,title,folder,storage_path,uploaded_by)
  values (1,'Modules 3 probe PDF','Probe','org/1/'||gen_random_uuid()||'.pdf',pg_temp.u('admin'))
  returning set_config('probe.doc',id::text,true);
insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules 3 probe MU '||txid_current(),'programme',0)
  returning set_config('probe.p1',id::text,true);
insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules 3 probe Ashoka '||txid_current(),'programme',0)
  returning set_config('probe.p2',id::text,true);
insert into public.sections(org_id,course_id,title) values (1,pg_temp.v('p1'),'QA') returning set_config('probe.sub1',id::text,true);
insert into public.sections(org_id,course_id,title) values (1,pg_temp.v('p2'),'QA') returning set_config('probe.sub2',id::text,true);
insert into public.modules(org_id,title) values (1,'Modules 3 probe Time and Work') returning set_config('probe.m',id::text,true);
insert into public.modules(org_id,title) values (1,'Modules 3 probe Unattached') returning set_config('probe.m0',id::text,true);
insert into public.section_modules(section_id,module_id,org_id,sort_order) values
  (pg_temp.v('sub1'),pg_temp.v('m'),1,0), (pg_temp.v('sub2'),pg_temp.v('m'),1,0);
insert into public.curriculum_items(org_id,module_id,type,ref_id,sort_order) values (1,pg_temp.v('m'),'document',pg_temp.v('doc'),0)
  returning set_config('probe.docitem',id::text,true);
insert into public.curriculum_items(org_id,module_id,type,title,body,sort_order) values (1,pg_temp.v('m'),'text','Modules 3 probe reading','Words',1);
insert into public.content_access(org_id,student_id,resource_type,resource_id,granted_by)
  values (1,pg_temp.u('s1'),'course',pg_temp.v('p1'),pg_temp.u('admin'));
select pg_temp.as_user('s1');
insert into public.item_progress(student_id,course_id,item_id,org_id,percent,completed,completed_at)
  values (pg_temp.u('s1'),pg_temp.v('p1'),pg_temp.v('docitem'),1,100,true,now());

-- ---------------------------------------------------------------------------
-- The preview
-- ---------------------------------------------------------------------------
select pg_temp.as_user('admin');
select pg_temp.ok((select (r -> 'counts' ->> 'moduleItems')::int = 2 and (r -> 'counts' ->> 'attachments')::int = 2
  and (r -> 'counts' ->> 'progressRows')::int = 1 and r ->> 'label' = 'Modules 3 probe Time and Work' and r -> 'blockedBy' = 'null'::jsonb
  from (select public.content_delete_preview('module', pg_temp.v('m')) r) x),
  'the preview counts 2 items, 2 attachments and 1 progress row, and does not block');
select pg_temp.ok((select jsonb_array_length(r -> 'attachedTo') = 2
  and r -> 'attachedTo' ->> 0 like 'Modules 3 probe Ashoka%' and r -> 'attachedTo' ->> 1 like 'Modules 3 probe MU%'
  from (select public.content_delete_preview('module', pg_temp.v('m')) r) x),
  'the preview names both programmes the module is attached to, in order');
select pg_temp.ok((select r -> 'attachedTo' = '[]'::jsonb and (r -> 'counts' ->> 'attachments')::int = 0
  from (select public.content_delete_preview('module', pg_temp.v('m0')) r) x),
  'an unattached module previews no programmes');
select pg_temp.ok((select (public.content_delete_preview('programme', pg_temp.v('p1')) -> 'counts' ->> 'progressRows')::int = 1
  and public.content_delete_preview('programme', pg_temp.v('p1')) ? 'attachedTo'),
  'the programme preview still works and carries an empty attachedTo');
select pg_temp.refused(format('select public.content_delete_preview(%L, 999999999)', 'module'), 'P0002', 'a module that is not there previews as not found');

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------
select pg_temp.as_user('s1');
select pg_temp.refused(format('select public.content_delete_preview(%L, %s)', 'module', pg_temp.v('m')), '42501', 'a student cannot preview a module delete');
select pg_temp.refused(format('select public.delete_content(%L, %s, %L)', 'module', pg_temp.v('m'), 'Modules 3 probe Time and Work'), '42501', 'a student cannot delete a module');
select pg_temp.as_user('admin');
select pg_temp.refused(format('select public.delete_content(%L, %s, %L)', 'module', pg_temp.v('m'), 'wrong name'), '22023', 'a wrong typed name is refused');
select pg_temp.ok((select count(*)=1 from public.modules where id=pg_temp.v('m')) and (select count(*)=2 from public.section_modules where module_id=pg_temp.v('m')),
  'after the refusals the module and both attachments are still there');

-- ---------------------------------------------------------------------------
-- The delete
-- ---------------------------------------------------------------------------
select pg_temp.ok((select (r ->> 'label') = 'Modules 3 probe Time and Work' and r -> 'cleanupId' = 'null'::jsonb
  from (select public.delete_content('module', pg_temp.v('m'), '  Modules 3 probe   Time and Work ') r) x),
  'the attached module is deleted with the name typed, whitespace-normalised, and needs no external cleanup');
reset role;
select pg_temp.ok((select count(*)=0 from public.modules where id=pg_temp.v('m'))
  and (select count(*)=0 from public.section_modules where module_id=pg_temp.v('m')),
  'the module and its attachments are gone, from both programmes');
select pg_temp.ok((select count(*)=0 from public.curriculum_items where module_id=pg_temp.v('m'))
  and (select count(*)=0 from public.item_progress where item_id=pg_temp.v('docitem')),
  'its items and their progress rows are gone');
select pg_temp.ok((select count(*)=1 from public.documents where id=pg_temp.v('doc'))
  and (select count(*)=2 from public.sections where id in (pg_temp.v('sub1'), pg_temp.v('sub2')))
  and (select count(*)=2 from public.courses where id in (pg_temp.v('p1'), pg_temp.v('p2')))
  and (select count(*)=1 from public.modules where id=pg_temp.v('m0')),
  'the library PDF, both programmes and subjects, and the other module are untouched');

select pg_temp.ok(current_setting('probe.passes')::int=16, current_setting('probe.passes')||' modules-3 database checks passed, expected 16');
rollback;
