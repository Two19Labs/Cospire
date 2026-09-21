-- Rollback-only verification for the question bank migrations
-- (20260921120000_question_bank, 20260921120200_question_imports).
--
-- Run with:
--   npx supabase db query --linked --file scripts/verify/question-bank.sql
--
-- Uses the existing baseline identities, writes only transaction-scoped rows,
-- switches to the real `authenticated` role for every access assertion, and
-- rolls everything back. Refusals are asserted by the error they raise AND by
-- counting rows afterwards, never by the absence of an error.
--
-- The key rule is a DEFERRED constraint trigger, which fires at commit, and
-- this transaction never commits. So every checkpoint runs
-- `set constraints all immediate`, which fires the pending checks there.

begin;

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void
language plpgsql
as $$
begin
  if ok is not true then
    raise exception 'PROBE FAILED: %', message;
  end if;
  raise notice 'pass: %', message;
  perform set_config('probe.passes', (coalesce(nullif(current_setting('probe.passes', true), ''), '0')::int + 1)::text, true);
end;
$$;

-- Runs a statement that must be refused with the given SQLSTATE, inside a
-- subtransaction so whatever it wrote before failing is undone with it.
create or replace function pg_temp.assert_refused(statement text, expected text, message text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    execute 'set constraints all immediate';
    raise exception 'PROBE FAILED (accepted): %', message using errcode = 'P0099';
  exception
    when others then
      if sqlstate = 'P0099' then
        raise;
      end if;
      if sqlstate <> expected then
        raise exception 'PROBE FAILED (% instead of %: %): %', sqlstate, expected, sqlerrm, message;
      end if;
  end;
  execute 'set constraints all deferred';
  raise notice 'pass: %', message;
  perform set_config('probe.passes', (coalesce(nullif(current_setting('probe.passes', true), ''), '0')::int + 1)::text, true);
end;
$$;

create or replace function pg_temp.act_as(who text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', current_setting('probe.' || who), 'role', 'authenticated')::text,
    true
  )
$$;

grant execute on function pg_temp.assert_true(boolean, text) to authenticated;
grant execute on function pg_temp.assert_refused(text, text, text) to authenticated;
grant execute on function pg_temp.act_as(text) to authenticated;

-- Baseline identities, captured without printing any personal data.
select set_config('probe.admin', id::text, true)
from public.profiles
where org_id = 1 and role = 'admin' and status = 'active'
order by created_at
limit 1;

select set_config('probe.mentor', mentor_id::text, true),
       set_config('probe.student', student_id::text, true)
from public.mentor_assignments
where org_id = 1
limit 1;

select set_config('probe.rival_admin', id::text, true)
from public.profiles
where org_id <> 1 and role = 'admin' and status = 'active'
limit 1;

select pg_temp.assert_true(
  current_setting('probe.admin', true) is not null
  and current_setting('probe.mentor', true) is not null
  and current_setting('probe.student', true) is not null
  and current_setting('probe.rival_admin', true) is not null,
  'baseline identities found'
);

-- ---------------------------------------------------------------------------
-- Sections: admin writes, mentor reads, student sees nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('admin');

insert into public.question_sections (org_id, name)
values (1, 'Verify QA ' || txid_current())
returning set_config('probe.section', id::text, true);

insert into public.question_sections (org_id, name)
values (1, 'Verify LR ' || txid_current())
returning set_config('probe.section2', id::text, true);

select pg_temp.assert_refused(
  format($q$insert into public.question_sections (org_id, name) values (1, %L)$q$,
         lower('Verify QA ' || txid_current())),
  '23505',
  'a section differing only in case is refused'
);

select pg_temp.act_as('mentor');

select pg_temp.assert_true(
  (select count(*) = 1 from public.question_sections
    where id = current_setting('probe.section')::bigint),
  'mentor reads the section list'
);

select pg_temp.assert_refused(
  $q$insert into public.question_sections (org_id, name) values (1, 'Mentor section')$q$,
  '42501',
  'mentor cannot create a section'
);

-- ---------------------------------------------------------------------------
-- Writing questions through save_question
-- ---------------------------------------------------------------------------

select pg_temp.act_as('admin');

select set_config('probe.mcq', public.save_question(
  null, 'mcq', 'If x + 2 = 5, x = ?',
  '[{"id":"a","text":"2"},{"id":"b","text":"3"},{"id":"c","text":"4"},{"id":"d","text":"5"}]'::jsonb,
  '[]'::jsonb, null, current_setting('probe.section')::bigint,
  'Linear   Equations ', 'easy', 3, '{"options":["b"]}'::jsonb, 'Subtract 2.'
)::text, true);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (select topic = 'Linear Equations' and created_by = current_setting('probe.admin')::uuid
     from public.questions where id = current_setting('probe.mcq')::bigint),
  'an MCQ and its key are saved; topic whitespace normalised; author stamped'
);

select pg_temp.act_as('mentor');

select set_config('probe.numerical', public.save_question(
  null, 'numerical', 'What is 1 divided by 2?', '[]'::jsonb, '[]'::jsonb, null,
  current_setting('probe.section')::bigint, 'linear equations', 'medium', 3,
  '{"accepted":["0.5","1/2"],"tolerance":0}'::jsonb, null
)::text, true);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (select topic = 'Linear Equations' and created_by = current_setting('probe.mentor')::uuid
     from public.questions where id = current_setting('probe.numerical')::bigint),
  'a mentor authors a question; the topic snaps to the existing spelling'
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.question_keys
    where question_id = current_setting('probe.numerical')::bigint),
  'the mentor reads the key they wrote'
);

-- ---------------------------------------------------------------------------
-- The mandatory metadata and the key rule, refused by the database
-- ---------------------------------------------------------------------------

select pg_temp.act_as('admin');

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, '   ', 'easy', 1, '{"options":["a"]}', null)$q$, current_setting('probe.section')),
  '23514',
  'a blank topic is refused'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, 'T', null, 1, '{"options":["a"]}', null)$q$, current_setting('probe.section')),
  '23502',
  'a missing difficulty is refused'
);

select pg_temp.assert_refused(
  $q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, null, 'T', 'easy', 1, '{"options":["a"]}', null)$q$,
  '23502',
  'a missing section is refused'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, 'T', 'easy', 0, '{"options":["a"]}', null)$q$, current_setting('probe.section')),
  '23514',
  'zero marks on a scored question is refused'
);

select pg_temp.assert_refused(
  format($q$insert into public.questions (org_id, type, body, options, section_id, topic, difficulty, marks)
    values (1, 'mcq', 'No key', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]', %s, 'T', 'easy', 1)$q$,
    current_setting('probe.section')),
  '23514',
  'a scored question with no answer key is refused at commit'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, 'T', 'easy', 1, '{"options":["z"]}', null)$q$, current_setting('probe.section')),
  '23514',
  'a key naming an option that does not exist is refused'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, 'T', 'easy', 1, '{"options":["a","b"]}', null)$q$, current_setting('probe.section')),
  '23514',
  'a single-correct MCQ with two answers is refused'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'numerical', 'Q', '[]', '[]', null, %s, 'T', 'easy', 1,
    '{"accepted":[]}', null)$q$, current_setting('probe.section')),
  '23514',
  'a numerical key with no accepted form is refused'
);

select pg_temp.assert_refused(
  format($q$update public.questions set options = '[{"id":"a","text":"2"},{"id":"c","text":"4"}]'
    where id = %s$q$, current_setting('probe.mcq')),
  '23514',
  'removing the option the key points at is refused'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '["org/5/questions/00000000-0000-0000-0000-000000000000.png"]', null, %s, 'T', 'easy', 1,
    '{"options":["a"]}', null)$q$, current_setting('probe.section')),
  '23514',
  'an image path in another organisation is refused'
);

-- Questions stay editable (owner, 2026-09-21): the wording, options and key
-- change together through save_question.
select public.save_question(
  current_setting('probe.mcq')::bigint, 'mcq', 'If x + 2 = 6, x = ?',
  '[{"id":"a","text":"2"},{"id":"b","text":"3"},{"id":"c","text":"4"}]'::jsonb,
  '[]'::jsonb, null, current_setting('probe.section')::bigint,
  'Linear Equations', 'easy', 3, '{"options":["c"]}'::jsonb, 'Subtract 2 from 6.'
);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (select q.body = 'If x + 2 = 6, x = ?' and k.correct_answer = '{"options":["c"]}'::jsonb
     from public.questions as q join public.question_keys as k on k.question_id = q.id
    where q.id = current_setting('probe.mcq')::bigint),
  'an edit changes the question and its key together'
);

-- ---------------------------------------------------------------------------
-- DI sets
-- ---------------------------------------------------------------------------

select set_config('probe.stimulus', public.save_question(
  null, 'di_stimulus', 'The table shows sales by quarter.', '[]'::jsonb, '[]'::jsonb, null,
  current_setting('probe.section')::bigint, 'Tables', 'medium', 0, null, null
)::text, true);

select set_config('probe.child', public.save_question(
  null, 'numerical', 'Total sales in Q1?', '[]'::jsonb, '[]'::jsonb,
  current_setting('probe.stimulus')::bigint, current_setting('probe.section')::bigint,
  'Tables', 'medium', 3, '{"accepted":["120"]}'::jsonb, null
)::text, true);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (select parent_id = current_setting('probe.stimulus')::bigint
     from public.questions where id = current_setting('probe.child')::bigint),
  'a DI stimulus with a sub-question is saved'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', %s, %s, 'T', 'easy', 1, '{"options":["a"]}', null)$q$,
    current_setting('probe.mcq'), current_setting('probe.section')),
  '23514',
  'a sub-question under a question that is not a stimulus is refused'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', %s, %s, 'T', 'easy', 1, '{"options":["a"]}', null)$q$,
    current_setting('probe.stimulus'), current_setting('probe.section2')),
  '23514',
  'a sub-question in a different section from its stimulus is refused'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'di_stimulus', 'S', '[]', '[]', null, %s, 'T', 'easy', 2, null, null)$q$,
    current_setting('probe.section')),
  '23514',
  'a stimulus carrying marks is refused'
);

select pg_temp.assert_refused(
  format($q$update public.questions set type = 'mcq' where id = %s$q$, current_setting('probe.stimulus')),
  '23514',
  'a stimulus cannot be turned into a scored question'
);

update public.questions
   set section_id = current_setting('probe.section2')::bigint
 where id = current_setting('probe.stimulus')::bigint;

select pg_temp.assert_true(
  (select section_id = current_setting('probe.section2')::bigint
     from public.questions where id = current_setting('probe.child')::bigint),
  'moving a stimulus to another section moves its sub-questions'
);

select pg_temp.assert_refused(
  format($q$update public.questions set created_by = %L where id = %s$q$,
         current_setting('probe.mentor'), current_setting('probe.mcq')),
  '42501',
  'the author of a question cannot be rewritten'
);

-- ---------------------------------------------------------------------------
-- Students and other organisations see nothing, and write nothing
-- ---------------------------------------------------------------------------

select pg_temp.act_as('student');

select pg_temp.assert_true(
  (select count(*) = 0 from public.questions where org_id = 1),
  'a student reads 0 questions'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.question_keys where org_id = 1),
  'a student reads 0 answer keys'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.question_sections where org_id = 1),
  'a student reads 0 sections'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(null, 'mcq', 'Q', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, 'T', 'easy', 1, '{"options":["a"]}', null)$q$, current_setting('probe.section')),
  '42501',
  'a student cannot write a question'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(%s, 'mcq', 'Hijacked', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, 'T', 'easy', 1, '{"options":["a"]}', null)$q$,
    current_setting('probe.mcq'), current_setting('probe.section')),
  'P0002',
  'a student cannot edit a question (0 rows reached, reported as not found)'
);

select pg_temp.act_as('rival_admin');

select pg_temp.assert_true(
  (select count(*) = 0 from public.questions where org_id = 1)
  and (select count(*) = 0 from public.question_keys where org_id = 1),
  'another organisation''s admin reads 0 questions and 0 keys'
);

select pg_temp.assert_refused(
  format($q$select public.save_question(%s, 'mcq', 'Hijacked', '[{"id":"a","text":"1"},{"id":"b","text":"2"}]',
    '[]', null, %s, 'T', 'easy', 1, '{"options":["a"]}', null)$q$,
    current_setting('probe.mcq'), current_setting('probe.section')),
  'P0002',
  'another organisation''s admin cannot edit a question'
);

reset role;

select pg_temp.assert_true(
  (select body = 'If x + 2 = 6, x = ?' from public.questions
    where id = current_setting('probe.mcq')::bigint),
  'after every refused edit the question is unchanged'
);

-- ---------------------------------------------------------------------------
-- Import staging and approval
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('admin');

select set_config('probe.batch', gen_random_uuid()::text, true);

insert into public.question_imports (org_id, batch_id, position, raw, parsed, status, question_id)
values (
  1, current_setting('probe.batch')::uuid, 0,
  '{"question":"2 + 2?"}'::jsonb, '{"type":"numerical"}'::jsonb,
  'approved', current_setting('probe.mcq')::bigint
)
returning set_config('probe.import', id::text, true);

select pg_temp.assert_true(
  (select status = 'pending_review' and question_id is null
          and created_by = current_setting('probe.admin')::uuid
     from public.question_imports where id = current_setting('probe.import')::bigint),
  'a staged row cannot be inserted pre-approved; it lands pending review'
);

select pg_temp.assert_refused(
  format($q$update public.question_imports set raw = '{"question":"edited"}' where id = %s$q$,
         current_setting('probe.import')),
  '42501',
  'the staged content cannot be edited'
);

select pg_temp.act_as('mentor');

select pg_temp.assert_true(
  (select count(*) = 0 from public.question_imports
    where id = current_setting('probe.import')::bigint),
  'a mentor reads 0 staged imports'
);

select set_config('probe.count_before', (select count(*) from public.questions where org_id = 1)::text, true);

select pg_temp.assert_refused(
  format($q$select public.approve_question_import(%s, 'numerical', '2 + 2?', '[]', '[]', null, %s,
    'Arithmetic', 'easy', 1, '{"accepted":["4"]}', null)$q$,
    current_setting('probe.import'), current_setting('probe.section')),
  'P0002',
  'a mentor cannot approve an import'
);

select pg_temp.assert_true(
  (select count(*) from public.questions where org_id = 1)::text = current_setting('probe.count_before'),
  'the refused approval left no question behind'
);

select pg_temp.act_as('admin');

select set_config('probe.approved', public.approve_question_import(
  current_setting('probe.import')::bigint, 'numerical', '2 + 2?', '[]'::jsonb, '[]'::jsonb, null,
  current_setting('probe.section')::bigint, 'Arithmetic', 'easy', 1,
  '{"accepted":["4"]}'::jsonb, null
)::text, true);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (select status = 'approved'
          and question_id = current_setting('probe.approved')::bigint
          and reviewed_by = current_setting('probe.admin')::uuid
          and reviewed_at is not null
     from public.question_imports where id = current_setting('probe.import')::bigint),
  'an admin approval writes the question and marks the row approved, stamped'
);

select set_config('probe.count_before', (select count(*) from public.questions where org_id = 1)::text, true);

select pg_temp.assert_refused(
  format($q$select public.approve_question_import(%s, 'numerical', '2 + 2?', '[]', '[]', null, %s,
    'Arithmetic', 'easy', 1, '{"accepted":["4"]}', null)$q$,
    current_setting('probe.import'), current_setting('probe.section')),
  'P0002',
  'an import cannot be approved twice'
);

select pg_temp.assert_true(
  (select count(*) from public.questions where org_id = 1)::text = current_setting('probe.count_before'),
  'the second approval created no duplicate question'
);

reset role;

-- The CLI prints only the last result, so the run ends by saying how many
-- checks passed. Any failure raises before reaching this line.
select current_setting('probe.passes') as checks_passed;

rollback;
