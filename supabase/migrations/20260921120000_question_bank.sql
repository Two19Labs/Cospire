-- Phase 3, step 1: the question bank.
--
-- Four things decided before this was written, and each shapes a table here:
--
-- 1. **The answer key is not on the question row.** Admins and students both
--    connect as `authenticated`, so a column grant cannot hide `correct_answer`
--    from one and show it to the other. A student who can read a question row
--    must not be able to read its key, so the key lives in `question_keys`,
--    which has no student policy at all. Phase 4 adds the one student read it
--    needs -- after their own attempt is submitted -- and nothing else.
--
-- 2. **Questions stay editable** (owner, 2026-09-21), including after a mock
--    containing them has been attempted. A student's review screen shows the
--    question as it reads now. A changed key, option set or marks value is what
--    the contracted rescore handles in Phase 4; nothing here freezes a row.
--
-- 3. **Sections are a fixed list per organisation** (owner, 2026-09-21), kept on
--    one admin screen, because section is the axis the analytics group on and
--    free text would split "QA" from "Quant". Topics stay free text, snapped to
--    an existing spelling when saved.
--
-- 4. **Every scored question has a valid key**, enforced by the database at
--    commit rather than remembered by a form. So the only way to write a scored
--    question is inside one transaction that also writes its key, which is what
--    `public.save_question` is for.
--
-- Additive throughout: new tables, new functions, nothing the deployed code
-- reads.

begin;

-- ---------------------------------------------------------------------------
-- Who may author
-- ---------------------------------------------------------------------------

-- Annexure A: "Question authoring by admins and mentors". A disabled account
-- authors nothing, the same rule as every other helper here.
create or replace function private.is_author_of_org(target_org_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.org_id = target_org_id
      and p.role in ('admin', 'mentor')
      and p.status = 'active'
  )
$$;

revoke execute on function private.is_author_of_org(bigint) from public, anon;
grant execute on function private.is_author_of_org(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------

create table public.question_sections (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_sections_name_not_blank check (btrim(name) <> ''),
  constraint question_sections_name_length check (char_length(name) <= 60),
  constraint question_sections_name_normalized
    check (name = regexp_replace(btrim(name), '\s+', ' ', 'g')),
  constraint question_sections_id_org_unique unique (id, org_id)
);

-- "QA" and "qa" are the same section to anyone reading a report.
create unique index question_sections_name_unique_per_org
  on public.question_sections (org_id, lower(name));

create index question_sections_org_sort_idx
  on public.question_sections (org_id, sort_order, id);

create trigger question_sections_set_updated_at
before update on public.question_sections
for each row execute function private.set_updated_at();

alter table public.question_sections enable row level security;
alter table public.question_sections force row level security;

create policy question_sections_select_author
on public.question_sections
for select
to authenticated
using ((select private.is_author_of_org(org_id)));

create policy question_sections_insert_admin
on public.question_sections
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy question_sections_update_admin
on public.question_sections
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

-- A section still holding questions cannot go: questions.section_id is ON
-- DELETE RESTRICT, so the delete is refused with 23503 and the action says so.
create policy question_sections_delete_admin
on public.question_sections
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.question_sections from anon, authenticated;
grant select, insert, update, delete on table public.question_sections to authenticated;
grant usage, select on sequence public.question_sections_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Shape checks, used by CHECK constraints
-- ---------------------------------------------------------------------------
--
-- Each returns a real boolean for every input, never NULL, because a CHECK
-- passes when its expression is NULL (see *The NULL that passed a CHECK* in
-- CONTEXT.md). The constraints still say `is true` so that stays true if one of
-- these is ever edited carelessly.

-- Options are [{ "id": "a", "text": "..." }, ...]. Ids are assigned by the
-- application, never by an importer's model, and a key refers to them.
create or replace function private.question_options_valid(p_type text, p_options jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    case
      when jsonb_typeof(p_options) is distinct from 'array' then false
      when p_type in ('mcq', 'mcq_multi') then
        jsonb_array_length(p_options) between 2 and 10
        and not exists (
          select 1
          from jsonb_array_elements(p_options) as option_row (value)
          where jsonb_typeof(option_row.value) is distinct from 'object'
             or jsonb_typeof(option_row.value -> 'id') is distinct from 'string'
             or (option_row.value ->> 'id') !~ '^[a-z0-9]{1,8}$'
             or jsonb_typeof(option_row.value -> 'text') is distinct from 'string'
             or btrim(option_row.value ->> 'text') = ''
             or char_length(option_row.value ->> 'text') > 2000
        )
        and (
          select count(distinct option_row.value ->> 'id')
          from jsonb_array_elements(p_options) as option_row (value)
        ) = jsonb_array_length(p_options)
      else p_options = '[]'::jsonb
    end,
    false
  )
$$;

-- Images are Storage paths in the question-images bucket, beneath the question's
-- own organisation. A row can never point at another organisation's file.
create or replace function private.question_images_valid(p_images jsonb, p_org_id bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_images) = 'array'
    and jsonb_array_length(p_images) <= 10
    and not exists (
      select 1
      from jsonb_array_elements(p_images) as image_row (value)
      where jsonb_typeof(image_row.value) is distinct from 'string'
         or (image_row.value #>> '{}') !~ (
              '^org/' || p_org_id::text
              || '/questions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|gif|webp)$'
            )
    ),
    false
  )
$$;

-- The key's shape against the question it answers:
--   mcq          { "options": ["b"] }            exactly one option id
--   mcq_multi    { "options": ["a", "c"] }       one or more, no repeats
--   numerical    { "accepted": ["0.5", "1/2"],   the equivalent forms, and an
--                  "tolerance": 0.01 }           optional absolute tolerance
--   di_stimulus  no key; it is not answered
-- Whether each accepted numerical form actually parses is checked by the
-- application's normaliser, which is the code that will compare answers.
create or replace function private.question_key_valid(
  p_type text,
  p_options jsonb,
  p_answer jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    case
      when p_type = 'di_stimulus' then p_answer is null
      when jsonb_typeof(p_answer) is distinct from 'object' then false
      -- Separate arms so no array function ever meets a non-array: CASE arms
      -- are evaluated in order, AND operands are not.
      when p_type in ('mcq', 'mcq_multi')
           and jsonb_typeof(p_answer -> 'options') is distinct from 'array' then false
      when p_type = 'numerical'
           and jsonb_typeof(p_answer -> 'accepted') is distinct from 'array' then false
      when p_type in ('mcq', 'mcq_multi') then
        (
          case p_type
            when 'mcq' then jsonb_array_length(p_answer -> 'options') = 1
            else jsonb_array_length(p_answer -> 'options') >= 1
          end
        )
        and not exists (
          select 1
          from jsonb_array_elements(p_answer -> 'options') as chosen (value)
          where jsonb_typeof(chosen.value) is distinct from 'string'
             or not exists (
               select 1
               from jsonb_array_elements(p_options) as option_row (value)
               where option_row.value ->> 'id' = chosen.value #>> '{}'
             )
        )
        and (
          select count(distinct chosen.value)
          from jsonb_array_elements(p_answer -> 'options') as chosen (value)
        ) = jsonb_array_length(p_answer -> 'options')
      when p_type = 'numerical' then
        jsonb_array_length(p_answer -> 'accepted') between 1 and 20
        and not exists (
          select 1
          from jsonb_array_elements(p_answer -> 'accepted') as form_row (value)
          where jsonb_typeof(form_row.value) is distinct from 'string'
             or btrim(form_row.value #>> '{}') = ''
             or char_length(form_row.value #>> '{}') > 50
        )
        and (
          not (p_answer ? 'tolerance')
          or (
            case
              when jsonb_typeof(p_answer -> 'tolerance') = 'number'
                then (p_answer ->> 'tolerance')::numeric >= 0
              else false
            end
          )
        )
      else false
    end,
    false
  )
$$;

revoke execute on function private.question_options_valid(text, jsonb) from public, anon;
revoke execute on function private.question_images_valid(jsonb, bigint) from public, anon;
revoke execute on function private.question_key_valid(text, jsonb, jsonb) from public, anon;
grant execute on function private.question_options_valid(text, jsonb) to authenticated;
grant execute on function private.question_images_valid(jsonb, bigint) to authenticated;
grant execute on function private.question_key_valid(text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------------

create table public.questions (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  -- A DI set is one `di_stimulus` row and its sub-questions pointing at it.
  parent_id bigint,
  type text not null,
  -- Plain text with line breaks kept. Notation is Unicode (½, x², √, ≤);
  -- anything that needs typesetting goes in as an image.
  body text not null,
  options jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  -- The four mandatory tags. NOT NULL, no default, no "skip" path: they are
  -- the entire reason the Phase 4 analytics can exist (operating manual §1.4).
  section_id bigint not null,
  topic text not null,
  difficulty text not null,
  marks numeric(5, 2) not null,
  created_by uuid,
  updated_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_type_valid
    check (type in ('mcq', 'mcq_multi', 'numerical', 'di_stimulus')),
  constraint questions_body_not_blank check (btrim(body) <> ''),
  constraint questions_body_length check (char_length(body) <= 20000),
  constraint questions_options_valid
    check (private.question_options_valid(type, options) is true),
  constraint questions_images_valid
    check (private.question_images_valid(images, org_id) is true),
  constraint questions_topic_not_blank check (btrim(topic) <> ''),
  constraint questions_topic_length check (char_length(topic) <= 100),
  constraint questions_topic_normalized
    check (topic = regexp_replace(btrim(topic), '\s+', ' ', 'g')),
  constraint questions_difficulty_valid check (difficulty in ('easy', 'medium', 'hard')),
  -- A stimulus is read, not answered, so it carries no marks of its own; its
  -- sub-questions carry them. Every other question is worth something.
  constraint questions_marks_valid check (
    case
      when type = 'di_stimulus' then marks = 0
      else marks > 0 and marks <= 100
    end is true
  ),
  constraint questions_id_org_unique unique (id, org_id),
  constraint questions_parent_fk foreign key (parent_id, org_id)
    references public.questions (id, org_id) on delete restrict,
  constraint questions_section_fk foreign key (section_id, org_id)
    references public.question_sections (id, org_id) on delete restrict,
  constraint questions_created_by_fk foreign key (created_by, org_id)
    references public.profiles (id, org_id) on delete restrict,
  constraint questions_updated_by_fk foreign key (updated_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

-- The list screen: this organisation's live questions, newest first, filtered
-- by section and topic.
create index questions_org_live_idx
  on public.questions (org_id, id desc)
  where archived_at is null;
create index questions_org_section_topic_idx
  on public.questions (org_id, section_id, topic);
create index questions_parent_id_idx
  on public.questions (parent_id)
  where parent_id is not null;
create index questions_section_id_idx on public.questions (section_id, org_id);
create index questions_created_by_idx on public.questions (created_by, org_id);
create index questions_updated_by_idx on public.questions (updated_by, org_id);

create trigger questions_set_updated_at
before update on public.questions
for each row execute function private.set_updated_at();

-- What a row policy cannot say: who wrote it, and the rules of a DI set.
create or replace function private.guard_question_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  parent_row public.questions%rowtype;
begin
  if tg_op = 'INSERT' then
    new.created_by := caller;
    new.updated_by := caller;
  else
    if new.org_id is distinct from old.org_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'a question cannot change organisation or author'
        using errcode = '42501';
    end if;

    -- A stimulus with sub-questions is the anchor of a set; turning it into a
    -- scored question, or a scored question into a stimulus, would leave either
    -- orphaned children or a key with nothing to answer.
    if (old.type = 'di_stimulus') <> (new.type = 'di_stimulus') then
      raise exception 'a question cannot be changed to or from a DI stimulus'
        using errcode = '23514';
    end if;

    new.updated_by := coalesce(caller, old.updated_by);
  end if;

  if new.parent_id is not null then
    if new.type = 'di_stimulus' then
      raise exception 'a DI stimulus cannot sit inside another set'
        using errcode = '23514';
    end if;

    select * into parent_row
      from public.questions
     where id = new.parent_id
       and org_id = new.org_id;

    if parent_row.id is null or parent_row.type <> 'di_stimulus' then
      raise exception 'a sub-question must belong to a DI stimulus'
        using errcode = '23514';
    end if;

    -- A set is read as one block in one section, so its sub-questions share
    -- the stimulus's section. Topic and difficulty may differ per question.
    if new.section_id <> parent_row.section_id then
      raise exception 'a sub-question must be in the same section as its DI stimulus'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_question_write() from public, anon, authenticated;

create trigger questions_guard_write
before insert or update on public.questions
for each row execute function private.guard_question_write();

-- Moving a stimulus to another section moves its set with it, rather than
-- refusing until every sub-question has been moved by hand first.
create or replace function private.cascade_stimulus_section()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'di_stimulus' and new.section_id <> old.section_id then
    update public.questions
       set section_id = new.section_id
     where parent_id = new.id
       and org_id = new.org_id;
  end if;
  return null;
end;
$$;

revoke execute on function private.cascade_stimulus_section() from public, anon, authenticated;

create trigger questions_cascade_stimulus_section
after update of section_id on public.questions
for each row execute function private.cascade_stimulus_section();

alter table public.questions enable row level security;
alter table public.questions force row level security;

-- Students have no policy on this table in Phase 3. They meet a question only
-- inside an attempt, and Phase 4 adds exactly that read.
create policy questions_select_author
on public.questions
for select
to authenticated
using ((select private.is_author_of_org(org_id)));

create policy questions_insert_author
on public.questions
for insert
to authenticated
with check ((select private.is_author_of_org(org_id)));

create policy questions_update_author
on public.questions
for update
to authenticated
using ((select private.is_author_of_org(org_id)))
with check ((select private.is_author_of_org(org_id)));

-- Removal is an admin decision. Everyday removal is archiving, which is an
-- update; a hard delete is refused anyway once a question has sub-questions
-- (parent_id) or, from Phase 4, sits in a mock.
create policy questions_delete_admin
on public.questions
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.questions from anon, authenticated;
grant select, insert, delete on table public.questions to authenticated;
-- Column-scoped: org_id, created_by and created_at are not updatable at all,
-- and the trigger above stamps updated_by.
grant update (
  parent_id, type, body, options, images, section_id, topic, difficulty, marks,
  updated_by, archived_at
) on table public.questions to authenticated;
grant usage, select on sequence public.questions_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Answer keys
-- ---------------------------------------------------------------------------

create table public.question_keys (
  question_id bigint primary key,
  org_id bigint not null,
  correct_answer jsonb,
  solution text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_keys_solution_length
    check (solution is null or char_length(solution) <= 20000),
  constraint question_keys_question_fk foreign key (question_id, org_id)
    references public.questions (id, org_id) on delete cascade,
  constraint question_keys_updated_by_fk foreign key (updated_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

create index question_keys_updated_by_idx on public.question_keys (updated_by, org_id);

create trigger question_keys_set_updated_at
before update on public.question_keys
for each row execute function private.set_updated_at();

create or replace function private.stamp_question_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.question_id is distinct from old.question_id
          or new.org_id is distinct from old.org_id) then
    raise exception 'an answer key cannot be moved to another question'
      using errcode = '42501';
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

revoke execute on function private.stamp_question_key() from public, anon, authenticated;

create trigger question_keys_stamp
before insert or update on public.question_keys
for each row execute function private.stamp_question_key();

-- The rule that makes the key trustworthy: at commit, every scored question
-- has a key, and the key matches the question as it now stands. Checked at
-- commit rather than per statement because a question and its key are two
-- rows written one after the other, and because an edit that removes option
-- "c" must be refused if the key still says "c".
create or replace function private.check_question_has_valid_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Read through to_jsonb because this function serves two tables, and a
  -- PL/pgSQL reference to a field the row does not have fails even in a branch
  -- that is never taken.
  target_id bigint := (
    to_jsonb(new) ->> case when tg_table_name = 'questions' then 'id' else 'question_id' end
  )::bigint;
  question_row public.questions%rowtype;
  key_row public.question_keys%rowtype;
begin
  select * into question_row from public.questions where id = target_id;
  if question_row.id is null then
    return null;
  end if;

  select * into key_row from public.question_keys where question_id = target_id;

  if question_row.type = 'di_stimulus' then
    if key_row.question_id is not null and key_row.correct_answer is not null then
      raise exception 'a DI stimulus has no answer key'
        using errcode = '23514';
    end if;
    return null;
  end if;

  if key_row.question_id is null then
    raise exception 'question % has no answer key', target_id
      using errcode = '23514';
  end if;

  if not private.question_key_valid(question_row.type, question_row.options, key_row.correct_answer) then
    raise exception 'the answer key for question % does not match its type and options', target_id
      using errcode = '23514';
  end if;

  return null;
end;
$$;

revoke execute on function private.check_question_has_valid_key() from public, anon, authenticated;

create constraint trigger questions_require_valid_key
after insert or update on public.questions
deferrable initially deferred
for each row execute function private.check_question_has_valid_key();

create constraint trigger question_keys_require_valid_key
after insert or update on public.question_keys
deferrable initially deferred
for each row execute function private.check_question_has_valid_key();

alter table public.question_keys enable row level security;
alter table public.question_keys force row level security;

-- No student policy. See the head of this file.
create policy question_keys_select_author
on public.question_keys
for select
to authenticated
using ((select private.is_author_of_org(org_id)));

create policy question_keys_insert_author
on public.question_keys
for insert
to authenticated
with check ((select private.is_author_of_org(org_id)));

create policy question_keys_update_author
on public.question_keys
for update
to authenticated
using ((select private.is_author_of_org(org_id)))
with check ((select private.is_author_of_org(org_id)));

-- No DELETE grant: a key goes only when its question does, by cascade.
revoke all on table public.question_keys from anon, authenticated;
grant select, insert on table public.question_keys to authenticated;
grant update (correct_answer, solution, updated_by) on table public.question_keys to authenticated;

-- ---------------------------------------------------------------------------
-- The one write path for a question and its key
-- ---------------------------------------------------------------------------
--
-- SECURITY INVOKER: it runs as the caller, so every policy above still decides
-- what may be written. It exists for atomicity, not privilege -- PostgREST
-- commits each request separately, and the deferred key check needs the
-- question and its key in one transaction.
--
-- Returns the question's id. An update that RLS filters to nothing raises
-- rather than returning quietly, because "no error" must never read as "saved".
create or replace function public.save_question(
  p_question_id bigint,
  p_type text,
  p_body text,
  p_options jsonb,
  p_images jsonb,
  p_parent_id bigint,
  p_section_id bigint,
  p_topic text,
  p_difficulty text,
  p_marks numeric,
  p_correct_answer jsonb,
  p_solution text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_org bigint := private.current_org_id();
  clean_topic text := regexp_replace(btrim(coalesce(p_topic, '')), '\s+', ' ', 'g');
  existing_topic text;
  clean_solution text := nullif(btrim(coalesce(p_solution, '')), '');
  saved_id bigint;
begin
  if caller_org is null then
    raise exception 'no active account' using errcode = '42501';
  end if;

  -- "percentages" typed where "Percentages" already exists becomes
  -- "Percentages", so the topic analysis does not split one topic in two.
  select q.topic into existing_topic
    from public.questions as q
   where q.org_id = caller_org
     and q.section_id = p_section_id
     and lower(q.topic) = lower(clean_topic)
   order by q.id
   limit 1;
  clean_topic := coalesce(existing_topic, clean_topic);

  if p_question_id is null then
    insert into public.questions (
      org_id, parent_id, type, body, options, images,
      section_id, topic, difficulty, marks
    )
    values (
      caller_org, p_parent_id, p_type, p_body, coalesce(p_options, '[]'::jsonb),
      coalesce(p_images, '[]'::jsonb), p_section_id, clean_topic, p_difficulty, p_marks
    )
    returning id into saved_id;
  else
    update public.questions
       set parent_id = p_parent_id,
           type = p_type,
           body = p_body,
           options = coalesce(p_options, '[]'::jsonb),
           images = coalesce(p_images, '[]'::jsonb),
           section_id = p_section_id,
           topic = clean_topic,
           difficulty = p_difficulty,
           marks = p_marks
     where id = p_question_id
       and org_id = caller_org
    returning id into saved_id;

    if saved_id is null then
      raise exception 'question % was not found', p_question_id using errcode = 'P0002';
    end if;
  end if;

  if p_type <> 'di_stimulus' then
    -- Not an upsert: that compiles to INSERT ... ON CONFLICT DO UPDATE and the
    -- conflict arm needs UPDATE on every column it names (see the documents
    -- slice). Two plain statements, each counted.
    update public.question_keys
       set correct_answer = p_correct_answer,
           solution = clean_solution
     where question_id = saved_id;

    if not found then
      insert into public.question_keys (question_id, org_id, correct_answer, solution)
      values (saved_id, caller_org, p_correct_answer, clean_solution);
    end if;
  end if;

  return saved_id;
end;
$$;

revoke execute on function public.save_question(
  bigint, text, text, jsonb, jsonb, bigint, bigint, text, text, numeric, jsonb, text
) from public, anon;
grant execute on function public.save_question(
  bigint, text, text, jsonb, jsonb, bigint, bigint, text, text, numeric, jsonb, text
) to authenticated;

commit;
