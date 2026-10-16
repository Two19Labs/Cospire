-- Covers 20261014110000_essay_questions.sql: the essay question type, and who
-- may award its marks.
--
-- The write side is the half that matters here. A student who could write their
-- own `essay_marks` row would be marking their own paper, so the policies are
-- tested as the student, as an unrelated mentor, as the assigned mentor and as
-- an admin -- not just read back as the owner, which would prove nothing
-- (operating manual §11, "write-side RLS").

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;

select extensions.plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.orgs (name) values ('Essay test org');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'essay.admin@example.com', 'x', now(), now(), now()),
  ('dddddddd-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'essay.mentor@example.com', 'x', now(), now(), now()),
  ('dddddddd-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'essay.other.mentor@example.com', 'x', now(), now(), now()),
  ('dddddddd-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'essay.student@example.com', 'x', now(), now(), now());

insert into public.profiles (id, org_id, role, name, email)
select u.id, o.id, u.role_name, u.display_name, u.email
  from public.orgs as o,
       (values ('dddddddd-0000-0000-0000-000000000001'::uuid, 'admin',   'Essay Admin',  'essay.admin@example.com'),
               ('dddddddd-0000-0000-0000-000000000002'::uuid, 'mentor',  'Essay Mentor', 'essay.mentor@example.com'),
               ('dddddddd-0000-0000-0000-000000000003'::uuid, 'mentor',  'Other Mentor', 'essay.other.mentor@example.com'),
               ('dddddddd-0000-0000-0000-000000000004'::uuid, 'student', 'Essay Student','essay.student@example.com')
       ) as u(id, role_name, display_name, email)
 where o.name = 'Essay test org';

insert into public.mentor_assignments (mentor_id, student_id, org_id, assigned_by)
select 'dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', id,
       'dddddddd-0000-0000-0000-000000000001'
  from public.orgs where name = 'Essay test org';

-- Questions live in a question-bank section, so this org needs one of its own.
insert into public.question_sections (org_id, name)
select id, 'WAT' from public.orgs where name = 'Essay test org';

-- An essay question: no options, no key, worth 20 marks.
insert into public.questions (org_id, type, body, options, section_id, topic, difficulty, marks, created_by)
select o.id, 'essay', 'Write on failure.', '[]'::jsonb, qs.id, 'Essay', 'hard', 20,
       'dddddddd-0000-0000-0000-000000000001'
  from public.orgs as o
  join public.question_sections as qs on qs.org_id = o.id and qs.name = 'WAT'
 where o.name = 'Essay test org';

-- `save_question` writes a key row for every type but a stimulus, carrying the
-- solution and a null answer, so the essay keeps that shape rather than needing
-- `save_question` changed.
insert into public.question_keys (question_id, org_id, correct_answer, solution)
select id, org_id, null, 'A good answer names a failure and what changed.'
  from public.questions where body = 'Write on failure.';

-- `questions_require_valid_key` is a **deferred** constraint trigger, so it
-- would never run in a test that rolls back. Made immediate here, which is the
-- only way to see it at all.
set constraints all immediate;

select extensions.ok(
  (select count(*) from public.questions where body = 'Write on failure.') = 1,
  'an essay question is accepted with no options and a key row carrying no answer'
);

-- The rule itself, rather than the deferred trigger that applies it: an essay
-- has no key, exactly like a stimulus.
select extensions.ok(
  private.question_key_valid('essay', '[]'::jsonb, null),
  'an essay with no answer key is valid'
);

select extensions.ok(
  not private.question_key_valid('essay', '[]'::jsonb, '{"options": ["a"]}'::jsonb),
  'an essay carrying an answer key is not'
);

select extensions.ok(
  private.answer_fits_question('{"text": "Prose."}'::jsonb, 'essay', '[]'::jsonb)
  and not private.answer_fits_question('{"options": ["a"]}'::jsonb, 'essay', '[]'::jsonb)
  and not private.answer_fits_question('{"text": ""}'::jsonb, 'essay', '[]'::jsonb),
  'an essay answer is typed text, and nothing else fits one'
);

-- A mock with one section carrying the essay.
insert into public.mocks (org_id, title, duration_minutes)
select id, 'Essay mock', 30 from public.orgs where name = 'Essay test org';

insert into public.mock_sections (mock_id, org_id, title, duration_minutes, sort_order)
select id, org_id, 'WAT', null, 0 from public.mocks where title = 'Essay mock';

insert into public.mock_questions (mock_id, mock_section_id, question_id, org_id, sort_order)
select m.id, ms.id, q.id, m.org_id, 0
  from public.mocks as m
  join public.mock_sections as ms on ms.mock_id = m.id
  join public.questions as q on q.org_id = m.org_id and q.body = 'Write on failure.'
 where m.title = 'Essay mock';

-- A submitted attempt carrying an essay answer. The guards stamp the clock and
-- reserve the scoring columns, so the fixture writes as the table's owner with
-- them off, exactly as 003 does.
alter table public.attempts disable trigger attempts_guard_write;
alter table public.attempt_responses disable trigger attempt_responses_guard_write;

insert into public.attempts (org_id, mock_id, student_id, started_at, submitted_at, status, submitted_by, score)
select m.org_id, m.id, 'dddddddd-0000-0000-0000-000000000004', now() - interval '40 minutes',
       now() - interval '10 minutes', 'submitted', 'student', 0
  from public.mocks as m where m.title = 'Essay mock';

insert into public.attempt_responses (attempt_id, question_id, answer)
select a.id, q.id, '{"text": "Failure teaches."}'::jsonb
  from public.attempts as a
  join public.questions as q on q.body = 'Write on failure.'
 where a.mock_id = (select id from public.mocks where title = 'Essay mock');

alter table public.attempts enable trigger attempts_guard_write;
alter table public.attempt_responses enable trigger attempt_responses_guard_write;

select extensions.ok(
  (select count(*) from public.attempt_responses where answer ->> 'text' = 'Failure teaches.') = 1,
  'an essay answer is stored as { "text": ... }'
);

-- ---------------------------------------------------------------------------
-- Who may award the marks
-- ---------------------------------------------------------------------------

create temporary view target as
  select a.id as attempt_id, q.id as question_id
    from public.attempts as a
    join public.mocks as m on m.id = a.mock_id
    join public.questions as q on q.body = 'Write on failure.'
   where m.title = 'Essay mock';

set local role authenticated;

-- The student. **The case that matters:** marking their own essay.
select set_config('request.jwt.claims',
  '{"sub": "dddddddd-0000-0000-0000-000000000004", "role": "authenticated"}', true);

select extensions.is_empty(
  $$insert into public.essay_marks (attempt_id, question_id, marks)
    select attempt_id, question_id, 20 from target returning id$$,
  'a student cannot award marks for their own essay'
);

select extensions.is_empty(
  $$select id from public.essay_marks$$,
  'and nothing was written'
);

-- A mentor who is not this student's mentor.
select set_config('request.jwt.claims',
  '{"sub": "dddddddd-0000-0000-0000-000000000003", "role": "authenticated"}', true);

select extensions.is_empty(
  $$insert into public.essay_marks (attempt_id, question_id, marks)
    select attempt_id, question_id, 20 from target returning id$$,
  'a mentor this student is not assigned to cannot award marks'
);

-- The assigned mentor.
select set_config('request.jwt.claims',
  '{"sub": "dddddddd-0000-0000-0000-000000000002", "role": "authenticated"}', true);

select extensions.isnt_empty(
  $$insert into public.essay_marks (attempt_id, question_id, marks)
    select attempt_id, question_id, 14 from target returning id$$,
  'the assigned mentor awards the marks'
);

select extensions.is(
  (select marked_by from public.essay_marks), 'dddddddd-0000-0000-0000-000000000002'::uuid,
  'the mark is credited to the person who awarded it, not to whatever was posted'
);

select extensions.throws_ok(
  $$update public.essay_marks set marks = 21$$,
  '23514',
  null,
  'more than the essay is worth is refused'
);

-- Awarding put the attempt back to awaiting a score, so the one scorer
-- recomputes it rather than this migration adding a second one.
reset role;
select extensions.ok(
  (select score is null from public.attempts where mock_id = (select id from public.mocks where title = 'Essay mock')),
  'awarding a mark clears the attempt score, which is the awaiting-a-score state'
);

-- The student reads their mark once the attempt is submitted, as they read a key.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "dddddddd-0000-0000-0000-000000000004", "role": "authenticated"}', true);

select extensions.is(
  (select marks from public.essay_marks), 14::numeric,
  'the student reads the mark awarded on their own submitted attempt'
);

select extensions.is_empty(
  $$update public.essay_marks set marks = 20 returning id$$,
  'but cannot change it'
);

-- An admin of the organisation.
select set_config('request.jwt.claims',
  '{"sub": "dddddddd-0000-0000-0000-000000000001", "role": "authenticated"}', true);

select extensions.isnt_empty(
  $$update public.essay_marks set marks = 16 returning id$$,
  'an admin may change an awarded mark'
);

select extensions.is(
  (select marks from public.essay_marks), 16::numeric,
  'and the change stands'
);

reset role;
select * from extensions.finish();
rollback;
