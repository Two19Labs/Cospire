-- Shared modules (D61), built to `docs/design/shared-modules.md` §1 and §2
-- (agreed, #123; the owner's decisions of 2026-11-13).
--
-- A module (Time and Work) is built once and attached, in order, to any number
-- of subjects (`sections`) in any number of programmes. Its items are ordinary
-- `curriculum_items` carrying `module_id` instead of `section_id`.
--
-- 1. New `modules` and `section_modules`, RLS enabled and forced here.
-- 2. `sections.kind`: 'subject' (the default, so every existing row is one) or
--    'mocks', at most one per programme, holding only test items.
-- 3. `curriculum_items.module_id`; `section_id` becomes nullable, and exactly
--    one of the two is set. Every existing row has `section_id`.
-- 4. Access (N11 unchanged): a programme grant reaches an item through
--    `item -> section -> course` (today) or
--    `item -> module -> section_modules -> section -> course`. Only
--    `private.student_has_programme_item` and the `curriculum_items` SELECT
--    policy change; documents, mocks, attempts and video OTPs already route
--    through the former.
--
-- Additive: two new tables, two new columns, one relaxed NOT NULL, one new
-- helper, two redefined functions that keep their old bodies and gain a branch,
-- one policy recreated with one more OR arm. The deployed code reads and writes
-- section items exactly as before.

begin;

-- ---------------------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------------------

create table public.modules (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  -- The title carries any variation: "Profit and Loss (tough)". No subject,
  -- difficulty or tag column until a library proves it needs filtering.
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modules_title_not_blank check (btrim(title) <> ''),
  constraint modules_title_length check (char_length(title) <= 200),
  constraint modules_title_normalized check (title = btrim(title)),
  constraint modules_id_org_unique unique (id, org_id)
);

create index modules_org_title_idx on public.modules (org_id, title, id);

create trigger modules_set_updated_at
before update on public.modules
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- sections.kind
-- ---------------------------------------------------------------------------

alter table public.sections
  add column kind text not null default 'subject',
  add constraint sections_kind_valid check (kind in ('subject', 'mocks'));

-- A programme's full mocks sit in its single 'mocks' section.
create unique index sections_one_mocks_per_course_idx
  on public.sections (course_id) where kind = 'mocks';

-- ---------------------------------------------------------------------------
-- section_modules: a module attached to a subject, in order
-- ---------------------------------------------------------------------------

create table public.section_modules (
  section_id bigint not null,
  module_id bigint not null,
  org_id bigint not null,
  -- Ties break on module_id.
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (section_id, module_id),
  -- Composite on both ends, so both sit in one organisation.
  constraint section_modules_section_fk foreign key (section_id, org_id)
    references public.sections (id, org_id) on delete cascade,
  -- Deleting a module detaches it from every programme (decision 4).
  constraint section_modules_module_fk foreign key (module_id, org_id)
    references public.modules (id, org_id) on delete cascade
);

-- The access lookup: "which subjects is this module attached to?"
create index section_modules_module_idx on public.section_modules (module_id);
create index section_modules_section_sort_idx
  on public.section_modules (section_id, sort_order, module_id);

-- ---------------------------------------------------------------------------
-- curriculum_items.module_id
-- ---------------------------------------------------------------------------

alter table public.curriculum_items
  add column module_id bigint,
  alter column section_id drop not null,
  add constraint curriculum_items_module_fk foreign key (module_id, org_id)
    references public.modules (id, org_id) on delete cascade,
  -- In exactly one module, or directly in a subject (a subject test) or the
  -- mocks section. Every existing row has section_id, so this holds today.
  add constraint curriculum_items_one_parent check (num_nonnulls(section_id, module_id) = 1);

create index curriculum_items_module_sort_idx
  on public.curriculum_items (module_id, sort_order, id) where module_id is not null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Redefined: the live body from 20261008120000 (programme only, own
-- organisation), plus: a section cannot become the mocks section while it holds
-- an attached module or a non-test item.
create or replace function private.validate_curriculum_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.courses
     where id = new.course_id and org_id = new.org_id and kind = 'programme'
  ) then
    raise exception 'a curriculum section may only belong to a programme';
  end if;
  if new.kind = 'mocks' and tg_op = 'UPDATE' and old.kind is distinct from 'mocks' then
    if exists (select 1 from public.section_modules where section_id = new.id) then
      raise exception 'the mocks section cannot hold modules';
    end if;
    if exists (select 1 from public.curriculum_items where section_id = new.id and type <> 'test') then
      raise exception 'the mocks section holds only test items';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_curriculum_section()
  from public, anon, authenticated;

-- A module attaches to a subject, never to the mocks section.
create or replace function private.validate_section_module()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.sections where id = new.section_id and kind = 'mocks') then
    raise exception 'a module cannot be attached to the mocks section';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_section_module()
  from public, anon, authenticated;

create trigger section_modules_validate
before insert or update on public.section_modules
for each row execute function private.validate_section_module();

-- The mocks section holds only test items. Kept apart from
-- validate_curriculum_item so that function's live body is untouched.
create or replace function private.validate_curriculum_item_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'test' and new.section_id is not null and exists (
    select 1 from public.sections where id = new.section_id and kind = 'mocks'
  ) then
    raise exception 'the mocks section holds only test items';
  end if;
  return new;
end;
$$;

revoke execute on function private.validate_curriculum_item_parent()
  from public, anon, authenticated;

create trigger curriculum_items_validate_parent
before insert or update on public.curriculum_items
for each row execute function private.validate_curriculum_item_parent();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- A module the caller reaches: attached to a subject in a programme they hold.
create or replace function private.student_reaches_module(target_module_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.section_modules
     where module_id = target_module_id
       and private.student_reaches_section(section_id)
  );
$$;

revoke execute on function private.student_reaches_module(bigint) from public, anon;
grant execute on function private.student_reaches_module(bigint) to authenticated;

-- Redefined: the live body from 20261008120000 with one change, the section an
-- item reaches is its own (today) OR any subject its module is attached to.
-- Revoking one programme leaves another programme's path to a shared module.
create or replace function private.student_has_programme_item(item_type text, target_ref_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.curriculum_items as item
    join public.sections as section
      on section.id = item.section_id
      or (
        item.module_id is not null
        and exists (
          select 1 from public.section_modules as attached
           where attached.module_id = item.module_id
             and attached.section_id = section.id
        )
      )
    join public.courses as course
      on course.id = section.course_id
     and course.kind = 'programme'
    join public.content_access as grant_row
      on grant_row.resource_type = 'course'
     and grant_row.resource_id = course.id
     and grant_row.org_id = course.org_id
    join public.profiles as student
      on student.id = grant_row.student_id
     and student.org_id = grant_row.org_id
    where item.type = item_type
      and item.ref_id = target_ref_id
      and grant_row.student_id = (select auth.uid())
      and student.role = 'student'
      and student.status = 'active'
  );
$$;

-- curriculum_items SELECT: the live policy from 20261017100000 with one more
-- arm for module items. Write policies are unchanged (admin only).
drop policy curriculum_items_select_authorized on public.curriculum_items;
create policy curriculum_items_select_authorized on public.curriculum_items
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      (select private.student_reaches_section(section_id))
      or (module_id is not null and (select private.student_reaches_module(module_id)))
    )
    and (type <> 'test' or (select private.mock_is_published(ref_id)))
  )
);

-- ---------------------------------------------------------------------------
-- RLS on the new tables
-- ---------------------------------------------------------------------------

alter table public.modules enable row level security;
alter table public.modules force row level security;
alter table public.section_modules enable row level security;
alter table public.section_modules force row level security;

create policy modules_select_authorized on public.modules
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_reaches_module(id))
  )
);

create policy modules_insert_admin on public.modules
for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy modules_update_admin on public.modules
for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy modules_delete_admin on public.modules
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

create policy section_modules_select_authorized on public.section_modules
for select to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (select private.student_reaches_section(section_id))
  )
);

create policy section_modules_insert_admin on public.section_modules
for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy section_modules_update_admin on public.section_modules
for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy section_modules_delete_admin on public.section_modules
for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.modules from anon, authenticated;
revoke all on table public.section_modules from anon, authenticated;
revoke all on sequence public.modules_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.modules to authenticated;
grant select, insert, update, delete on table public.section_modules to authenticated;
grant usage, select on sequence public.modules_id_seq to authenticated;

commit;
