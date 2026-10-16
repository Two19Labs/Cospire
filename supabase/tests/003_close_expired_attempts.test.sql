-- Covers `private.close_expired_attempts`, added by
-- 20261014100000_close_expired_attempts.sql: the pg_cron sweep that closes an
-- attempt nobody submitted (N6, step 4.5).
--
-- The cases that matter are the ones where it must NOT close an attempt. A
-- sweep that closes early ends a real student's exam, which is the same failure
-- the warn-and-log proctoring decision exists to avoid (operating manual
-- §13.1); a sweep that never closes is merely untidy. So each positive case has
-- its negative twin: still inside the clock, a section not yet entered, an
-- untimed section that follows the paper's clock, and an attempt a student
-- already submitted by hand.
--
-- The fixtures need attempts whose clock started in the past, and
-- `private.guard_attempt_write` stamps `started_at := now()` on insert and
-- refuses to let it move afterwards -- correctly, it is the whole of rule §1.1.
-- So the guard is disabled for the fixture inserts only, as the table's owner,
-- and switched back on before the function under test runs: the write it makes
-- must go through the guard like any other.

begin;

create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated;

select extensions.plan(14);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.orgs (name) values ('Sweep test org');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'sweep.student@example.com', 'x', now(), now(), now());

insert into public.profiles (id, org_id, role, name, email)
select 'cccccccc-0000-0000-0000-000000000001', id, 'student', 'Sweep Student', 'sweep.student@example.com'
  from public.orgs where name = 'Sweep test org';

-- Four mocks: one unsectioned-in-effect (a single untimed section), one with
-- two timed sections, one mixing a timed and an untimed section, and one used
-- for the attempt a student submits by hand.
insert into public.mocks (org_id, title, duration_minutes)
select id, t.title, t.minutes
  from public.orgs, (values ('Paper clock mock', 120),
                            ('Timed sections mock', 600),
                            ('Mixed sections mock', 600),
                            ('By hand mock', 120)) as t(title, minutes)
 where public.orgs.name = 'Sweep test org';

insert into public.mock_sections (mock_id, org_id, title, duration_minutes, sort_order)
select m.id, m.org_id, s.title, s.minutes, s.ord
  from public.mocks as m,
       (values ('Paper clock mock', 'Only', null::integer, 0),
               ('Timed sections mock', 'One', 30, 0),
               ('Timed sections mock', 'Two', 30, 1),
               ('Mixed sections mock', 'Timed', 30, 0),
               ('Mixed sections mock', 'Untimed', null, 1),
               ('By hand mock', 'Only', null, 0)) as s(mock, title, minutes, ord)
 where m.title = s.mock;

alter table public.attempts disable trigger attempts_guard_write;
alter table public.attempt_sections disable trigger attempt_sections_guard_write;

-- 1. past the paper clock and the grace: must close
-- 2. inside the paper clock: must not
-- 3. both timed sections entered and expired, paper clock still running: must close
-- 4. one timed section not yet entered: must not
-- 5. the timed section expired but an untimed one follows the paper clock: must not
-- 6. submitted by hand already: must be left exactly as it is
insert into public.attempts (org_id, mock_id, student_id, started_at)
select m.org_id, m.id, 'cccccccc-0000-0000-0000-000000000001', now() - a.ago
  from public.mocks as m,
       (values ('Paper clock mock',    interval '121 minutes'),
               ('Timed sections mock', interval '70 minutes'),
               ('Mixed sections mock', interval '70 minutes'),
               ('By hand mock',        interval '10 minutes')) as a(mock, ago)
 where m.title = a.mock;

-- The two rows that need a second attempt on the same mock: case 2 (inside the
-- clock) and case 4 (a section not entered) reuse 'Paper clock mock' and
-- 'Timed sections mock', so they are inserted for a second student.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('cccccccc-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'sweep.second@example.com', 'x', now(), now(), now());

insert into public.profiles (id, org_id, role, name, email)
select 'cccccccc-0000-0000-0000-000000000002', id, 'student', 'Second Student', 'sweep.second@example.com'
  from public.orgs where name = 'Sweep test org';

insert into public.attempts (org_id, mock_id, student_id, started_at, status)
select m.org_id, m.id, 'cccccccc-0000-0000-0000-000000000002', now() - a.ago, 'in_progress'
  from public.mocks as m,
       (values ('Paper clock mock',    interval '5 minutes'),
               ('Timed sections mock', interval '70 minutes')) as a(mock, ago)
 where m.title = a.mock;

-- The by-hand attempt is closed in one statement, because status, submitted_at
-- and submitted_by have to agree for the row's check constraints.
update public.attempts
   set status = 'submitted', submitted_at = now() - interval '5 minutes', submitted_by = 'student'
 where mock_id = (select id from public.mocks where title = 'By hand mock');

-- Sections entered. Case 3: both timed sections entered 65 minutes ago, so both
-- 30-minute clocks are long past. Case 4: only the first entered. Case 5: both
-- entered, the timed one expired, the untimed one still live on the paper clock.
insert into public.attempt_sections (attempt_id, mock_section_id, started_at)
select a.id, ms.id, now() - interval '65 minutes'
  from public.attempts as a
  join public.mocks as m on m.id = a.mock_id
  join public.mock_sections as ms on ms.mock_id = m.id
 where (m.title = 'Timed sections mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001')
    or (m.title = 'Mixed sections mock');

insert into public.attempt_sections (attempt_id, mock_section_id, started_at)
select a.id, ms.id, now() - interval '65 minutes'
  from public.attempts as a
  join public.mocks as m on m.id = a.mock_id
  join public.mock_sections as ms on ms.mock_id = m.id and ms.sort_order = 0
 where m.title = 'Timed sections mock'
   and a.student_id = 'cccccccc-0000-0000-0000-000000000002';

alter table public.attempts enable trigger attempts_guard_write;
alter table public.attempt_sections enable trigger attempt_sections_guard_write;

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------

create temporary table swept (closed integer);
insert into swept select private.close_expired_attempts();

select extensions.is(
  (select closed from swept), 2,
  'the sweep closes exactly the two attempts that can no longer be answered'
);

-- Case 1: the paper clock ran out.
select extensions.is(
  (select status from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Paper clock mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001'),
  'submitted', 'an attempt past the paper clock is closed'
);
select extensions.is(
  (select submitted_by from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Paper clock mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001'),
  'timer', 'it is recorded as the timer''s, not the student''s'
);
-- Stamped when the clock ran out (a minute ago), not when the sweep ran.
select extensions.ok(
  (select submitted_at < now() - interval '30 seconds' from public.attempts as a
     join public.mocks as m on m.id = a.mock_id
    where m.title = 'Paper clock mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001'),
  'it is stamped at the moment the clock ran out, not the moment the sweep ran'
);
select extensions.ok(
  (select score is null from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Paper clock mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001'),
  'the sweep does not score: the attempt is left awaiting a score'
);

-- Case 2: still inside the paper clock.
select extensions.is(
  (select status from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Paper clock mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000002'),
  'in_progress', 'an attempt still inside its clock is left alone'
);

-- Case 3: every timed section entered and expired, paper clock still running.
select extensions.is(
  (select status from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Timed sections mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001'),
  'submitted', 'an attempt whose every section clock has run out is closed'
);
select extensions.is(
  (select submitted_by from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Timed sections mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001'),
  'timer', 'that one is the timer''s too'
);
select extensions.ok(
  (select submitted_at < now() - interval '30 minutes' from public.attempts as a
     join public.mocks as m on m.id = a.mock_id
    where m.title = 'Timed sections mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000001'),
  'it is stamped when the last section ended, well before the paper''s own end'
);

-- Case 4: a section never entered is not a section that is over.
select extensions.is(
  (select status from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Timed sections mock' and a.student_id = 'cccccccc-0000-0000-0000-000000000002'),
  'in_progress', 'an attempt with a section not yet entered is left alone'
);

-- Case 5: an untimed section follows the paper clock, so the attempt cannot be
-- over before the paper is.
select extensions.is(
  (select status from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'Mixed sections mock'),
  'in_progress', 'an untimed section keeps the attempt open until the paper''s own clock ends'
);

-- Case 6: a student's own submit stands.
select extensions.is(
  (select submitted_by from public.attempts as a join public.mocks as m on m.id = a.mock_id
    where m.title = 'By hand mock'),
  'student', 'an attempt the student submitted is not re-stamped as the timer''s'
);

-- Running again closes nothing: the only open attempts left are the ones that
-- must stay open.
select extensions.is(
  private.close_expired_attempts(), 0,
  'the sweep is idempotent: a second run closes nothing'
);

-- The job itself is registered, once, every minute.
select extensions.is(
  (select count(*)::integer from cron.job where jobname = 'close-expired-attempts'), 1,
  'exactly one cron job is scheduled for the sweep'
);

select * from extensions.finish();
rollback;
