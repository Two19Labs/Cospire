-- Phase 5a, step 2: ARS rounds.
--
-- One round engine, not four screens. Annexure A names four rounds -- mock
-- application, mock video essay, guesstimates, email writing -- and commits to
-- admins adding further types over time. A route per round would mean the first
-- round an admin adds after handover has no screen, and the Client has to call
-- us for something the agreement says they can do themselves.
--
-- So a round declares its own shape: `submission_mode` says which of the three
-- input shapes it uses, and `config` carries whatever that shape needs. One
-- student route renders whichever the round declares. Adding a round is then
-- data entry.
--
-- `course_id` is here from birth, per the decision of 2026-09-06. ARS rounds
-- differ per institution -- Ashoka's rounds are not Masters' Union's -- and
-- without the link every student would see every institution's rounds. Adding it
-- later is a retrofit in the week the plan already calls overloaded.
--
-- Access needs no new mechanism and `content_access.resource_type` does not need
-- widening: a round belongs to a programme, and granting the programme reaches
-- it.
--
-- Additive only: one new table, two new helpers, one new policy on an existing
-- table. Nothing here can break the currently deployed code.

begin;

-- First, because the composite foreign key below cannot reference it otherwise.
--
-- `courses` has id alone as its primary key, and Postgres will only accept a
-- foreign key that matches a unique constraint on exactly the referenced
-- columns. This one is redundant against the primary key by design: it exists
-- to be referenced, and it is what the cross-tenant guarantee rests on.
alter table public.courses
  add constraint courses_id_org_unique unique (id, org_id);

create table public.ars_rounds (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs (id) on delete restrict,
  course_id bigint not null,
  name text not null,
  -- The three input shapes. A check constraint rather than an enum: adding a
  -- fourth shape to an enum requires ALTER TYPE, which is a migration an admin
  -- cannot run, and the whole point of this table is that admins extend it.
  -- A new shape still needs a renderer, so this stays a closed set until one is
  -- written -- but widening a check constraint is a one-line migration.
  submission_mode text not null,
  -- Whatever the declared shape needs. Deliberately JSONB rather than columns:
  -- a prompt applies to all three, `fields` only to `form`, and a future shape
  -- will want something not thought of yet. Shape-specific columns would be
  -- null for every other mode and would need a migration each time.
  --
  -- Today: { "prompt": text } for every mode, plus
  -- { "fields": [ { "label": text } ] } for `form`. A field type, a maximum
  -- length or an accepted-file list can be added to this object without a
  -- migration, which is the reason it is JSONB.
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ars_rounds_name_not_blank check (btrim(name) <> ''),
  constraint ars_rounds_name_length check (char_length(name) <= 200),
  constraint ars_rounds_name_normalized check (name = btrim(name)),
  constraint ars_rounds_submission_mode_valid check (
    submission_mode in ('text', 'file', 'form')
  ),
  -- `config` must be an object. Without this it could be a bare array, a string
  -- or a number, and every reader would need to defend against that.
  constraint ars_rounds_config_is_object check (jsonb_typeof(config) = 'object'),
  -- A `form` round with no fields renders an empty page with a submit button.
  -- Refused here rather than left to the interface to notice.
  constraint ars_rounds_form_has_fields check (
    submission_mode <> 'form'
    or (
      jsonb_typeof(config -> 'fields') = 'array'
      and jsonb_array_length(config -> 'fields') > 0
    )
  ),
  constraint ars_rounds_name_unique_per_course unique (course_id, name),

  -- The composite key, not a bare reference to courses (id). This is what makes
  -- it impossible for a round to sit in one organisation while its programme
  -- sits in another -- the same cross-tenant hole that `documents` closes with
  -- its uploader key. ON DELETE CASCADE because a round without its programme is
  -- meaningless, and the programme is what access is granted against.
  constraint ars_rounds_course_org_fkey
    foreign key (course_id, org_id)
    references public.courses (id, org_id)
    on delete cascade
);

-- The student's list and the admin's are both "this programme's rounds, in
-- order". id is the tiebreaker so the sort is fully served by the index and two
-- rounds sharing a sort_order cannot swap places between reads.
create index ars_rounds_course_id_sort_order_idx
  on public.ars_rounds (course_id, sort_order, id);

create trigger ars_rounds_set_updated_at
before update on public.ars_rounds
for each row execute function private.set_updated_at();

-- Can the calling mentor reach this programme?
--
-- True when they are the active assigned mentor of at least one active student
-- who holds a grant for it. That is the narrowest rule that lets the review
-- queue work: a mentor sees the programmes their own students are on, and
-- nothing else.
--
-- Written as a helper rather than inline in the policies, per operating manual
-- §9.7, and used by both the new `courses` policy and the `ars_rounds` one.
create or replace function private.mentor_reaches_course(target_course_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.content_access as grant_row
    join public.mentor_assignments as assignment
      on assignment.student_id = grant_row.student_id
     and assignment.org_id = grant_row.org_id
    join public.profiles as student
      on student.id = grant_row.student_id
     and student.org_id = grant_row.org_id
    join public.profiles as mentor
      on mentor.id = assignment.mentor_id
     and mentor.org_id = assignment.org_id
    where grant_row.resource_type = 'course'
      and grant_row.resource_id = target_course_id
      and assignment.mentor_id = (select auth.uid())
      and mentor.role = 'mentor'
      and mentor.status = 'active'
      and student.role = 'student'
      and student.status = 'active'
  )
$$;

revoke execute on function private.mentor_reaches_course(bigint) from public, anon;
grant execute on function private.mentor_reaches_course(bigint) to authenticated;

-- Does the calling student hold the programme this round belongs to?
--
-- A round carries no grant of its own; the programme is the unit of access. This
-- resolves the round to its course and defers to the existing helper, so there
-- is one definition of "holds a programme" rather than two that can drift.
create or replace function private.student_reaches_round(target_round_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ars_rounds as round
    where round.id = target_round_id
      and private.student_has_course_grant(round.course_id)
  )
$$;

revoke execute on function private.student_reaches_round(bigint) from public, anon;
grant execute on function private.student_reaches_round(bigint) to authenticated;

alter table public.ars_rounds enable row level security;
alter table public.ars_rounds force row level security;

create policy ars_rounds_select_authorized
on public.ars_rounds
for select
to authenticated
using (
  (select private.is_admin_of_org(org_id))
  or (
    org_id = (select private.current_org_id())
    and (
      (select private.student_has_course_grant(course_id))
      or (select private.mentor_reaches_course(course_id))
    )
  )
);

create policy ars_rounds_insert_admin
on public.ars_rounds
for insert
to authenticated
with check ((select private.is_admin_of_org(org_id)));

create policy ars_rounds_update_admin
on public.ars_rounds
for update
to authenticated
using ((select private.is_admin_of_org(org_id)))
with check ((select private.is_admin_of_org(org_id)));

create policy ars_rounds_delete_admin
on public.ars_rounds
for delete
to authenticated
using ((select private.is_admin_of_org(org_id)));

revoke all on table public.ars_rounds from anon, authenticated;
revoke all on sequence public.ars_rounds_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.ars_rounds to authenticated;
grant usage, select on sequence public.ars_rounds_id_seq to authenticated;

-- Mentors could not see a programme at all until now, which was correct while
-- nothing a mentor did touched one. The review queue changes that: a mentor
-- opening a submission needs the round, and the round needs its programme.
--
-- Added as a separate permissive policy rather than by rewriting
-- courses_select_authorized. Permissive policies are ORed, so this widens
-- access without touching a rule that is already tested and deployed.
create policy courses_select_mentor
on public.courses
for select
to authenticated
using (
  org_id = (select private.current_org_id())
  and (select private.mentor_reaches_course(id))
);

commit;
