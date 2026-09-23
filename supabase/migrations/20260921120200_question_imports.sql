-- Phase 3: the staging area for imported questions.
--
-- Annexure A: imported questions are placed "in a staging area for admin review
-- and approval before they enter the live question bank". So an import writes
-- here and only here, one row per question the model produced, and a question
-- reaches `questions` only through `approve_question_import`, which an admin
-- calls for that one row after looking at it.
--
-- The import mechanism is the paste-a-prompt one the founder agreed on
-- 2026-09-16, so `source_type` is 'paste' today. 'google_doc' is accepted now
-- so that fetching a Google Doc's images later (clause 3.15) is an application
-- change rather than a constraint change.
--
-- Admins only, on every operation. Mentors author questions by hand; approving
-- an import into the bank is the admin review the agreement names.
--
-- Additive: one new table, two functions.

begin;

create table public.question_imports (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  -- One paste is one batch; its rows are reviewed together, in document order.
  batch_id uuid not null,
  position integer not null,
  source_type text not null default 'paste',
  -- The document's name, as the admin gave it. Never the document itself.
  source_ref text,
  -- The question exactly as the model gave it, kept beside the parse so the
  -- review screen can show the two together.
  raw jsonb not null,
  -- The normalised question the review screen starts from, or null where the
  -- parser could not make one and `problems` says why.
  parsed jsonb,
  problems text[] not null default '{}',
  status text not null default 'pending_review',
  question_id bigint,
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_imports_source_type_valid check (source_type in ('paste', 'google_doc')),
  constraint question_imports_source_ref_length
    check (source_ref is null or char_length(source_ref) <= 200),
  constraint question_imports_status_valid
    check (status in ('pending_review', 'approved', 'rejected')),
  constraint question_imports_position_valid check (position >= 0),
  constraint question_imports_reviewed_stamped check (
    (status = 'pending_review') = (reviewed_at is null)
  ),
  constraint question_imports_batch_position_unique unique (batch_id, position),
  -- If the approved question is later deleted the import row stays, as a record
  -- that it was approved, with only its link cleared.
  constraint question_imports_question_fk foreign key (question_id, org_id)
    references public.questions (id, org_id) on delete set null (question_id),
  constraint question_imports_created_by_fk foreign key (created_by, org_id)
    references public.profiles (id, org_id) on delete restrict,
  constraint question_imports_reviewed_by_fk foreign key (reviewed_by, org_id)
    references public.profiles (id, org_id) on delete restrict
);

-- The review queue: this organisation's batches, newest first, and within one
-- batch its rows in document order.
create index question_imports_org_created_idx
  on public.question_imports (org_id, created_at desc);
create index question_imports_org_batch_idx
  on public.question_imports (org_id, batch_id, position);
create index question_imports_question_id_idx
  on public.question_imports (question_id, org_id)
  where question_id is not null;
create index question_imports_created_by_idx on public.question_imports (created_by, org_id);
create index question_imports_reviewed_by_idx on public.question_imports (reviewed_by, org_id);

create trigger question_imports_set_updated_at
before update on public.question_imports
for each row execute function private.set_updated_at();

-- A decision is made once. The staged content never changes after it is
-- written, so what the admin approved is what was imported.
create or replace function private.guard_question_import_write()
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
    new.status := 'pending_review';
    new.question_id := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  if new.org_id is distinct from old.org_id
     or new.batch_id is distinct from old.batch_id
     or new.position is distinct from old.position
     or new.raw is distinct from old.raw
     or new.parsed is distinct from old.parsed
     or new.created_by is distinct from old.created_by then
    raise exception 'staged import rows cannot be edited' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending_review' then
      raise exception 'this import has already been decided' using errcode = '23514';
    end if;
    if new.status = 'approved' and new.question_id is null then
      raise exception 'an approved import must name its question' using errcode = '23514';
    end if;
    new.reviewed_by := caller;
    new.reviewed_at := now();
  elsif new.question_id is distinct from old.question_id
        and new.question_id is not null then
    raise exception 'an import is linked to a question only when it is approved'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_question_import_write() from public, anon, authenticated;

create trigger question_imports_guard_write
before insert or update on public.question_imports
for each row execute function private.guard_question_import_write();

alter table public.question_imports enable row level security;
alter table public.question_imports force row level security;

create policy question_imports_select_admin
on public.question_imports
for select
to authenticated
using ((select private.is_admin_of_org(org_id)));

create policy question_imports_insert_admin
on public.question_imports
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy question_imports_update_admin
on public.question_imports
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

-- Discarding a whole batch that was pasted by mistake.
create policy question_imports_delete_admin
on public.question_imports
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.question_imports from anon, authenticated;
grant select, insert, delete on table public.question_imports to authenticated;
grant update (status, question_id) on table public.question_imports to authenticated;
grant usage, select on sequence public.question_imports_id_seq to authenticated;

-- Approving one staged question: the question and its key are written, and the
-- staging row is marked approved, in one transaction. If the staging row is not
-- this admin's to decide, or was already decided, nothing is written at all --
-- the question insert rolls back with it rather than leaving a live question
-- whose import still reads "pending".
--
-- The fields are passed in rather than read from `parsed`, because the admin
-- may have corrected them on the review screen. The application validates them
-- first; save_question and the table constraints validate them again.
create or replace function public.approve_question_import(
  p_import_id bigint,
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
  saved_id bigint;
  decided_id bigint;
begin
  saved_id := public.save_question(
    null, p_type, p_body, p_options, p_images, p_parent_id,
    p_section_id, p_topic, p_difficulty, p_marks, p_correct_answer, p_solution
  );

  update public.question_imports
     set status = 'approved',
         question_id = saved_id
   where id = p_import_id
     and status = 'pending_review'
  returning id into decided_id;

  if decided_id is null then
    raise exception 'import % is not awaiting review', p_import_id using errcode = 'P0002';
  end if;

  return saved_id;
end;
$$;

revoke execute on function public.approve_question_import(
  bigint, text, text, jsonb, jsonb, bigint, bigint, text, text, numeric, jsonb, text
) from public, anon;
grant execute on function public.approve_question_import(
  bigint, text, text, jsonb, jsonb, bigint, bigint, text, text, numeric, jsonb, text
) to authenticated;

commit;
