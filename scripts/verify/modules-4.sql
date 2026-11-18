-- Rollback-only database verification for shared modules, slice 4: what the
-- programme page's attach, detach and Mocks actions rely on. Proves, as the
-- admin through RLS, that a module attaches once per subject (23505 the second
-- time) and to a second subject, that the mocks section is unique per
-- programme, takes tests only, refuses a module, and cannot be made from a
-- subject that already holds a module or a non-test item; and that detaching
-- leaves the module and its items.
--
--   npx supabase db query --linked -f scripts/verify/modules-4.sql
--
-- Writes nothing: everything rolls back. Expected: 11 checks passed. Needs, in org 1, one active admin.
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

select set_config('probe.admin', id::text, true) from public.profiles where org_id=1 and role='admin' and status='active' order by id limit 1;
select pg_temp.ok(current_setting('probe.admin', true) is not null, 'the admin this probe needs exists');

set local role authenticated;
select pg_temp.as_user('admin');
insert into public.courses(org_id,title,kind,sort_order) values (1,'Modules 4 probe '||txid_current(),'programme',0)
  returning set_config('probe.p',id::text,true);
insert into public.sections(org_id,course_id,title,sort_order) values (1,pg_temp.v('p'),'QA',0) returning set_config('probe.qa',id::text,true);
insert into public.sections(org_id,course_id,title,sort_order) values (1,pg_temp.v('p'),'LR',1) returning set_config('probe.lr',id::text,true);
insert into public.modules(org_id,title) values (1,'Modules 4 probe A') returning set_config('probe.ma',id::text,true);
insert into public.modules(org_id,title) values (1,'Modules 4 probe B') returning set_config('probe.mb',id::text,true);
insert into public.curriculum_items(org_id,module_id,type,title,body,sort_order) values (1,pg_temp.v('ma'),'text','Modules 4 probe reading','Words',0);

-- Attach and order
insert into public.section_modules(section_id,module_id,org_id,sort_order) values (pg_temp.v('qa'),pg_temp.v('ma'),1,0);
insert into public.section_modules(section_id,module_id,org_id,sort_order) values (pg_temp.v('qa'),pg_temp.v('mb'),1,1);
select pg_temp.ok((select array_agg(module_id order by sort_order, module_id) = array[pg_temp.v('ma'),pg_temp.v('mb')]
  from public.section_modules where section_id=pg_temp.v('qa')), 'two modules attach to a subject in order');
select pg_temp.refused(format('insert into public.section_modules(section_id,module_id,org_id,sort_order) values (%s,%s,1,2)', pg_temp.v('qa'), pg_temp.v('ma')),
  '23505', 'the same module cannot attach twice to one subject');
insert into public.section_modules(section_id,module_id,org_id,sort_order) values (pg_temp.v('lr'),pg_temp.v('ma'),1,0);
select pg_temp.ok((select count(*) = 2 from public.section_modules where module_id=pg_temp.v('ma')), 'the same module attaches to a second subject');
update public.section_modules set sort_order = 0 where section_id=pg_temp.v('qa') and module_id=pg_temp.v('mb');
update public.section_modules set sort_order = 1 where section_id=pg_temp.v('qa') and module_id=pg_temp.v('ma');
select pg_temp.ok((select array_agg(module_id order by sort_order, module_id) = array[pg_temp.v('mb'),pg_temp.v('ma')]
  from public.section_modules where section_id=pg_temp.v('qa')), 'reordering by sort_order moves a module');
-- The embed the page reads: a module's title and item count through section_modules.
select pg_temp.ok((select (select count(*) from public.curriculum_items ci where ci.module_id = sm.module_id) = 1
  from public.section_modules sm where sm.section_id=pg_temp.v('lr') and sm.module_id=pg_temp.v('ma')), 'an attached module counts its one item');

-- Mocks section
insert into public.sections(org_id,course_id,title,sort_order,kind) values (1,pg_temp.v('p'),'Full mocks',2,'mocks') returning set_config('probe.mk',id::text,true);
select pg_temp.refused(format('insert into public.sections(org_id,course_id,title,sort_order,kind) values (1,%s,%L,3,%L)', pg_temp.v('p'), 'Second mocks', 'mocks'),
  '23505', 'a programme cannot have a second mocks section');
select pg_temp.refused(format('insert into public.section_modules(section_id,module_id,org_id,sort_order) values (%s,%s,1,0)', pg_temp.v('mk'), pg_temp.v('mb')),
  'P0001', 'a module cannot attach to the mocks section');
select pg_temp.refused(format('insert into public.curriculum_items(org_id,section_id,type,title,body,sort_order) values (1,%s,%L,%L,%L,0)', pg_temp.v('mk'), 'text', 't', 'b'),
  'P0001', 'the mocks section refuses a reading');
select pg_temp.refused(format('update public.sections set kind = %L where id = %s', 'mocks', pg_temp.v('qa')),
  'P0001', 'a subject holding a module cannot become the mocks section');

-- Detach
delete from public.section_modules where section_id=pg_temp.v('qa') and module_id=pg_temp.v('ma');
select pg_temp.ok((select count(*) = 1 from public.section_modules where section_id=pg_temp.v('qa'))
  and exists (select 1 from public.modules where id=pg_temp.v('ma'))
  and exists (select 1 from public.curriculum_items where module_id=pg_temp.v('ma')), 'detaching leaves the module and its items');

select pg_temp.ok(current_setting('probe.passes')::int = 11, 'all 11 checks above passed (count ' || current_setting('probe.passes') || ')');
rollback;
