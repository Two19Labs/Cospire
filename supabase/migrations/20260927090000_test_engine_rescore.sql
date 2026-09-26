-- Phase 4: rescoring after a question changes (Annexure A: the system
-- "records that a rescore took place").
--
-- Questions stay editable after they have been sat (decided 2026-09-21). When
-- an answer key, an option set, a question type or a marks value changes, every
-- submitted attempt that answered the question has its score cleared, and a
-- `rescore_events` row records the change, in the same transaction as the edit.
--
-- The score itself is recomputed by the application's scoring code
-- (`src/features/test-engine/score-attempt.ts`), which is TypeScript because it
-- shares the tested numerical normaliser. A submitted attempt with no score is
-- "awaiting scoring"; the app rescores such attempts right after a question is
-- saved, and whenever a result or a mock's attempts are next shown.
--
-- Additive: one function redefined, four new functions, two triggers, one
-- index. Nothing dropped or renamed.

begin;

-- Redefined from 20260926103000. The rescore trigger acts for the system, not
-- for the admin editing the question, so it sets the transaction-local flag
-- `cospire.system_write` for the length of its own statement. No client can set
-- it: PostgREST exposes no way to run SET, and no function reachable through
-- the API calls set_config.
create or replace function private.is_trusted_writer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when current_setting('cospire.system_write', true) = 'on' then true
    when nullif(current_setting('request.jwt.claims', true), '') is null then true
    else (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
         is not distinct from 'service_role'
  end
$$;

revoke execute on function private.is_trusted_writer() from public, anon, authenticated;

-- Clears the score of every submitted attempt that answered `target_question_id`
-- and records one rescore event. Only an answered question can change a score:
-- a changed key or option set changes whether an answer is right, and a changed
-- marks value changes what a right one earns.
create or replace function private.mark_for_rescore(target_question_id bigint, change text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
  question_org bigint;
  editor uuid := (select auth.uid());
begin
  perform set_config('cospire.system_write', 'on', true);

  update public.attempts as a
     set score = null
   where a.status = 'submitted'
     and exists (
       select 1 from public.attempt_responses as r
        where r.attempt_id = a.id
          and r.question_id = target_question_id
          and r.answer is not null
     );
  get diagnostics affected = row_count;

  perform set_config('cospire.system_write', 'off', true);

  if affected > 0 then
    select org_id into question_org from public.questions where id = target_question_id;
    -- The editor is recorded when the change came through a signed-in session
    -- in the question's own organisation; a console edit records nobody.
    if editor is not null and not exists (
      select 1 from public.profiles where id = editor and org_id = question_org
    ) then
      editor := null;
    end if;
    insert into public.rescore_events (org_id, question_id, changed_by, attempts_affected, reason)
    values (question_org, target_question_id, editor, affected, change);
  end if;
end;
$$;

revoke execute on function private.mark_for_rescore(bigint, text) from public, anon, authenticated;

create or replace function private.rescore_on_key_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.correct_answer is distinct from old.correct_answer then
    perform private.mark_for_rescore(new.question_id, 'answer key changed');
  end if;
  return null;
end;
$$;

revoke execute on function private.rescore_on_key_change() from public, anon, authenticated;

create trigger question_keys_rescore
after update on public.question_keys
for each row execute function private.rescore_on_key_change();

create or replace function private.rescore_on_question_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes text[] := array[]::text[];
begin
  if new.marks is distinct from old.marks then changes := changes || 'marks changed'::text; end if;
  if new.options is distinct from old.options then changes := changes || 'options changed'::text; end if;
  if new.type is distinct from old.type then changes := changes || 'question type changed'::text; end if;
  if cardinality(changes) > 0 then
    perform private.mark_for_rescore(new.id, array_to_string(changes, ', '));
  end if;
  return null;
end;
$$;

revoke execute on function private.rescore_on_question_change() from public, anon, authenticated;

create trigger questions_rescore
after update of marks, options, type on public.questions
for each row execute function private.rescore_on_question_change();

-- Attempts awaiting scoring. The set is empty almost always, so the index is
-- partial and tiny.
create index attempts_awaiting_score_idx on public.attempts (org_id, submitted_at)
  where status = 'submitted' and score is null;

commit;
