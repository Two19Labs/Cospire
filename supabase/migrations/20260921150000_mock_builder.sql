-- Phase 3, PR 4: the admin-only mock builder.
-- Additive throughout. Phase 4 adds student attempt reads; there is deliberately
-- no student or mentor policy on these tables today.

begin;

create or replace function private.mock_negative_types_valid(p_types text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_types <@ array['mcq', 'mcq_multi', 'numerical']::text[]
    and cardinality(p_types) = (
      select count(distinct value) from unnest(p_types) as value
    ),
    false
  )
$$;

revoke execute on function private.mock_negative_types_valid(text[]) from public, anon;
grant execute on function private.mock_negative_types_valid(text[]) to authenticated;

create table public.mocks (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  title text not null,
  instructions text not null default '',
  duration_minutes integer not null,
  negative_marking numeric(5, 2) not null default 0,
  negative_marking_types text[] not null default array['mcq', 'mcq_multi']::text[],
  max_attempts integer not null default 1,
  allow_mobile boolean not null default true,
  proctoring_enabled boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mocks_title_not_blank check (btrim(title) <> ''),
  constraint mocks_title_length check (char_length(title) <= 160),
  constraint mocks_title_normalized check (title = regexp_replace(btrim(title), '\s+', ' ', 'g')),
  constraint mocks_instructions_length check (char_length(instructions) <= 20000),
  constraint mocks_duration_valid check (duration_minutes between 1 and 1440),
  constraint mocks_negative_marking_valid check (negative_marking between 0 and 100),
  constraint mocks_negative_types_valid check (
    private.mock_negative_types_valid(negative_marking_types) is true
    and (negative_marking = 0 or cardinality(negative_marking_types) > 0)
  ),
  constraint mocks_max_attempts_valid check (max_attempts between 1 and 100),
  constraint mocks_id_org_unique unique (id, org_id),
  constraint mocks_created_by_fk foreign key (created_by, org_id)
    references public.profiles (id, org_id) on delete restrict,
  constraint mocks_updated_by_fk foreign key (updated_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

create index mocks_org_created_idx on public.mocks (org_id, id desc);
create index mocks_created_by_idx on public.mocks (created_by, org_id);
create index mocks_updated_by_idx on public.mocks (updated_by, org_id);

create table public.mock_sections (
  id bigint generated always as identity primary key,
  mock_id bigint not null,
  org_id bigint not null,
  title text not null,
  duration_minutes integer,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mock_sections_title_not_blank check (btrim(title) <> ''),
  constraint mock_sections_title_length check (char_length(title) <= 100),
  constraint mock_sections_title_normalized check (title = regexp_replace(btrim(title), '\s+', ' ', 'g')),
  constraint mock_sections_duration_valid check (duration_minutes is null or duration_minutes > 0),
  constraint mock_sections_sort_valid check (sort_order between 0 and 99),
  constraint mock_sections_mock_fk foreign key (mock_id, org_id)
    references public.mocks (id, org_id) on delete cascade,
  constraint mock_sections_id_mock_org_unique unique (id, mock_id, org_id),
  constraint mock_sections_order_unique unique (mock_id, sort_order),
  constraint mock_sections_title_unique unique (mock_id, title)
);

create index mock_sections_mock_order_idx on public.mock_sections (mock_id, sort_order, id);
create index mock_sections_org_idx on public.mock_sections (org_id, mock_id);

create table public.mock_questions (
  mock_id bigint not null,
  mock_section_id bigint not null,
  question_id bigint not null,
  org_id bigint not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint mock_questions_pk primary key (mock_id, question_id),
  constraint mock_questions_sort_valid check (sort_order between 0 and 9999),
  constraint mock_questions_section_fk foreign key (mock_section_id, mock_id, org_id)
    references public.mock_sections (id, mock_id, org_id) on delete cascade,
  constraint mock_questions_question_fk foreign key (question_id, org_id)
    references public.questions (id, org_id) on delete restrict,
  constraint mock_questions_order_unique unique (mock_section_id, sort_order)
);

create index mock_questions_section_order_idx
  on public.mock_questions (mock_section_id, sort_order, question_id);
create index mock_questions_question_idx on public.mock_questions (question_id, org_id);
create index mock_questions_org_idx on public.mock_questions (org_id, mock_id);

create trigger mocks_set_updated_at
before update on public.mocks
for each row execute function private.set_updated_at();

create trigger mock_sections_set_updated_at
before update on public.mock_sections
for each row execute function private.set_updated_at();

create or replace function private.guard_mock_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.created_by := caller;
    new.updated_by := caller;
  else
    if new.org_id is distinct from old.org_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'a mock cannot change organisation or author' using errcode = '42501';
    end if;
    new.updated_by := coalesce(caller, old.updated_by);
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_mock_write() from public, anon, authenticated;

create trigger mocks_guard_write
before insert or update on public.mocks
for each row execute function private.guard_mock_write();

-- Runs at commit, after save_mock has replaced the complete structure. A mock
-- is either one implicit untimed section, or a fully sectional mock whose
-- section durations add up exactly to the overall duration (owner, 2026-09-21).
create or replace function private.validate_mock_structure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_mock_id bigint := coalesce(new.mock_id, old.mock_id, new.id, old.id);
  mock_row public.mocks%rowtype;
  section_count integer;
  untimed_count integer;
  section_total integer;
begin
  select * into mock_row from public.mocks where id = target_mock_id;
  if mock_row.id is null then return null; end if;

  select count(*), count(*) filter (where duration_minutes is null),
         coalesce(sum(duration_minutes), 0)
    into section_count, untimed_count, section_total
    from public.mock_sections where mock_id = target_mock_id;

  if section_count = 0 then
    raise exception 'a mock needs at least one section' using errcode = '23514';
  end if;
  if untimed_count > 0 and not (section_count = 1 and untimed_count = 1) then
    raise exception 'only the implicit section may have no sectional limit' using errcode = '23514';
  end if;
  if untimed_count = 0 and section_total <> mock_row.duration_minutes then
    raise exception 'section durations must equal the full mock duration' using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.mock_questions mq
      join public.questions q on q.id = mq.question_id and q.org_id = mq.org_id
     where mq.mock_id = target_mock_id and q.archived_at is not null
  ) then
    raise exception 'an archived question cannot be added to a mock' using errcode = '23514';
  end if;

  -- A DI set is indivisible: stimulus and every child are present in one mock
  -- section. An archived member makes the entire set unavailable.
  if exists (
    select 1
      from public.mock_questions mq
      join public.questions q on q.id = mq.question_id and q.org_id = mq.org_id
     where mq.mock_id = target_mock_id
       and q.parent_id is not null
       and not exists (
         select 1 from public.mock_questions parent_mq
          where parent_mq.mock_id = mq.mock_id
            and parent_mq.question_id = q.parent_id
            and parent_mq.mock_section_id = mq.mock_section_id
       )
  ) or exists (
    select 1
      from public.mock_questions stimulus_mq
      join public.questions stimulus
        on stimulus.id = stimulus_mq.question_id and stimulus.org_id = stimulus_mq.org_id
     where stimulus_mq.mock_id = target_mock_id
       and stimulus.type = 'di_stimulus'
       and exists (
         select 1 from public.questions child
          where child.parent_id = stimulus.id
            and child.org_id = stimulus.org_id
            and not exists (
              select 1 from public.mock_questions child_mq
               where child_mq.mock_id = stimulus_mq.mock_id
                 and child_mq.question_id = child.id
                 and child_mq.mock_section_id = stimulus_mq.mock_section_id
            )
       )
  ) then
    raise exception 'a DI set must be added whole to one section' using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function private.validate_mock_structure() from public, anon, authenticated;

create constraint trigger mocks_validate_structure
after insert or update on public.mocks deferrable initially deferred
for each row execute function private.validate_mock_structure();
create constraint trigger mock_sections_validate_structure
after insert or update or delete on public.mock_sections deferrable initially deferred
for each row execute function private.validate_mock_structure();
create constraint trigger mock_questions_validate_structure
after insert or update or delete on public.mock_questions deferrable initially deferred
for each row execute function private.validate_mock_structure();

alter table public.mocks enable row level security;
alter table public.mocks force row level security;
alter table public.mock_sections enable row level security;
alter table public.mock_sections force row level security;
alter table public.mock_questions enable row level security;
alter table public.mock_questions force row level security;

create policy mocks_select_admin on public.mocks for select to authenticated
using ((select private.is_admin_of_org(org_id)));
create policy mocks_insert_admin on public.mocks for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));
create policy mocks_update_admin on public.mocks for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));
create policy mocks_delete_admin on public.mocks for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

create policy mock_sections_select_admin on public.mock_sections for select to authenticated
using ((select private.is_admin_of_org(org_id)));
create policy mock_sections_insert_admin on public.mock_sections for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));
create policy mock_sections_update_admin on public.mock_sections for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));
create policy mock_sections_delete_admin on public.mock_sections for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

create policy mock_questions_select_admin on public.mock_questions for select to authenticated
using ((select private.is_admin_of_org(org_id)));
create policy mock_questions_insert_admin on public.mock_questions for insert to authenticated
with check ((select private.is_admin_of_org(org_id)));
create policy mock_questions_update_admin on public.mock_questions for update to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));
create policy mock_questions_delete_admin on public.mock_questions for delete to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.mocks, public.mock_sections, public.mock_questions from anon, authenticated;
grant select, insert, update, delete on table public.mocks, public.mock_sections, public.mock_questions to authenticated;
grant usage, select on sequence public.mocks_id_seq, public.mock_sections_id_seq to authenticated;

commit;
