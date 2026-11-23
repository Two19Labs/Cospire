# Design: practice mode on topic pages

Status: **proposed, for the owner to agree.** No code or migration yet.
Decisions: D66 (no PDFs in the topic loop), D61 (shared modules, progress per
programme), D63 (built free). Inputs: *The Client's review of the home page and
aptitude course, 2026-11-23* and *The Client's written topic flow, 2026-11-12*
in `docs/context/meetings.md`. Replaces decision 5 of `shared-modules.md`
("quiz + view-only PDF").

## What is being built

A topic (module) page holds one video and then 20 to 25 practice questions,
embedded on the same page. Each question is checked on the server the moment the
student presses **Check**; the verdict, the key and the worked solution then
appear under it. Untimed, unproctored, no attempt, no score. A link at the
bottom points to the Practice bank (later, see section 4).

## 1. How a practice set attaches to a module

| Option | Verdict |
|---|---|
| Reuse a mock (`type = 'test'`, unproctored) | **No.** A mock is an attempt with a clock, sections, a submit and `max_attempts`, and its keys open only after submit (`private.student_may_read_key`). Instant per-question feedback fights every one of those |
| An id array on the item (`question_ids bigint[]`) | **No.** No foreign key, no index on the question, so archive checks, rescoring and "where is Q01234 used" become scans |
| **A new item type `practice`, with a join table** | **Recommended.** It is ordered among the module's items like any other, sits in the existing module meters, and is shared across programmes because the module is (D61) |

**Changed: `curriculum_items`.**

- `type` check gains `'practice'`.
- The shape check gains one arm: a practice item has `ref_id is null and body
  is null`, and an optional `title` (trimmed, not blank, at most 200; the screen
  shows "Practice" when it is null). Its questions are found through
  `practice_questions.item_id`, never through `ref_id`.
- `unique (id, org_id)`, added before the composite FK below needs it.

Every existing row passes. `validate_curriculum_item_parent` already keeps
non-test items out of a `mocks` section. `curriculum_items_ref_idx` is partial
(`where ref_id is not null`), so it simply skips practice rows.

**Code that branches on `ref_id` must learn the new type**, in the same change:
`loadItemTitles` in `curriculum/queries/get-curriculum.ts` (a practice item
would otherwise be titled "Unavailable"), `record-progress.ts` (practice records
nothing, see section 3), the student programme meters in
`curriculum/queries/student-programmes.ts`, and **Duplicate module** in
`modules/actions/module-actions.ts`, which copies `type, ref_id, title, body`
and must also copy the item's `practice_questions` rows.

**New: `practice_questions`** (the questions on one practice item, ordered)

| column | type | notes |
|---|---|---|
| item_id | bigint | FK `(item_id, org_id)` -> `curriculum_items`, on delete cascade |
| question_id | bigint | FK `(question_id, org_id)` -> `questions`, on delete restrict |
| org_id | bigint not null | both ends in one organisation |
| sort_order | integer not null default 0 | ties break on question_id |
| PK | (item_id, question_id) | a question appears once per set |

Index `(question_id)` for the reach check and "used in". A trigger refuses an
item whose type is not `practice`, an essay (it cannot be checked instantly),
and a DI sub-question placed on its own: a DI set is placed by its stimulus and
its children come with it. A set's size counts **answerable** questions, so a DI
set of four counts four toward the 20 to 25, and its stimulus counts nothing.

One practice item per module is the expected use; nothing enforces it.

**No question is both practice and mock** (until the Client answers open
question 3). A question's *root* is `coalesce(parent_id, id)`, so a DI set and
its children share one. A trigger on `practice_questions` refuses a question
whose root is already placed in any `mock_questions` row; a trigger on
`mock_questions` refuses one whose root is on any practice set. Both name the
other place in the error. Draft and archived mocks count. The mock builder and
mock-first import then surface that error as a refused question. This is what
keeps section 2's key and question reads from leaking a mock in progress.

Both triggers fire on `insert or update of question_id` and take
`pg_advisory_xact_lock(root)` first, so two concurrent saves cannot each pass
the check and both land. A root can also change under them: `save_question`
updates `parent_id`, moving a question into another DI set. So
`guard_question_write` gains an arm, on a `parent_id` change, that refuses when
the moved question is itself in `practice_questions`, or when its old and new
roots end up on opposite sides (one in a mock, the other on a practice set). The
same guard refuses changing a question's `type` to `essay` while it is on a
practice set.

## 2. Instant feedback without leaking keys

The check is a server action, `checkPracticeAnswer(courseId, itemId,
questionId, values)`:

1. Reads the question and its options **through the student's session**. RLS
   returns it only if the student reaches a practice set holding it (below).
2. Parses the post with the test engine's `readAnswer` (`test-engine/answer.ts`):
   unknown option ids and a second option on a single MCQ are refused, a typed
   value is kept as typed. A stimulus or an essay is refused.
3. Upserts the student's `practice_answers` row through their session (RLS
   checks reach and ownership; the guard trigger checks the answer's shape).
4. Reads the key and solution through the student's session; the row written in
   step 3 is what opens it (below).
5. Decides with `isAnswerCorrect` from `test-engine/scoring.ts`, unchanged. That
   is the same numerical normalisation (`question-bank/numerical.ts`: `0.5`,
   `1/2`, `.50`, tolerance) and the same all-or-nothing set rule for
   `mcq_multi`, so a practice verdict and a mock verdict can never disagree.
6. Writes the verdict, and `tries`, with the server key (trusted-writer only,
   as on `attempt_responses`), and returns verdict, key and solution to the
   page.

**Keys.** `question_keys` already has one student policy,
`question_keys_select_student`, opening a key only after the student's own
submitted attempt. This design adds a **second permissive policy**,
`question_keys_select_practice`: a student reads the key of a question for
which they hold their own `practice_answers` row **and** which is still on a
practice set they reach (`student_reaches_practice_question(question_id)`). The
second condition matters: an admin may take Q off a set and later put it in a
mock, and the old answer row alone would then open Q's key mid-mock. Permissive policies are
OR-ed, so the second one is safe only because no practice question can be in a
mock (section 1): there is no mock question whose key it could open. Nothing
is revealed before that student has answered that question, and the key is
never in page props or the question query.

**If overlap is ever allowed**, both the new key policy and the check action
must also carry `student_may_read_key`'s `not exists` clause (no
`in_progress` attempt by this student on a mock holding the question), and the
questions read below must too. Until then the triggers make that unnecessary.

**Questions.** `questions_select_student` is left as it is. A separate
permissive policy, `questions_select_practice`, opens a question when it, or its
DI parent, is on a practice item the student reaches
(`private.student_reaches_practice_question`). `questions` holds no key column,
and no practice question is a mock question, so this shows no mock early.

**DI sets.** The stimulus is shown once with its children under it; each child
is checked on its own and has its own key and solution. The stimulus has no
answer row.

## 3. Storing answers

**New: `practice_answers`** (one row per student, programme and question)

| column | type | notes |
|---|---|---|
| student_id | uuid | FK `(student_id, org_id)` -> `profiles`, on delete restrict |
| course_id | bigint | FK `(course_id, org_id)` -> `courses`, on delete cascade (as `item_progress_course_fk`); per programme (D61 decision 1) |
| question_id | bigint | FK `(question_id, org_id)` -> `questions`, on delete restrict |
| org_id | bigint not null | |
| answer | jsonb not null | the latest, as `readAnswer` stored it |
| first_answer | jsonb not null | the first try, written once |
| is_correct | boolean | latest verdict; trusted writer only |
| first_is_correct | boolean | verdict of `first_answer`; trusted writer only |
| tries | integer not null default 1 | trusted writer only |
| first_answered_at, answered_at | timestamptz | set by the trigger |
| PK | (student_id, course_id, question_id) | |

**Re-attempts: one row, overwritten, not a history.** "Try again" clears the
card and the next Check overwrites `answer` and `is_correct`. `first_answer`
and `first_is_correct` are the honest record for analytics and Revise, because
every later try was made after the solution was on screen. Keeping
`first_answer` is what lets a key correction recompute `first_is_correct`.
A history table is deferred until someone asks what the third try was.

The row is keyed by `question_id`, not by item: the same question answered in
two modules of one programme is one answer, and the Practice bank (section 4)
writes the same rows.

**The guard trigger** on `practice_answers` (`SECURITY DEFINER`), modelled on
`private.guard_attempt_response_write`:

- refuses a `di_stimulus` or `essay` question;
- refuses an `answer` that fails `private.answer_fits_question(answer, type,
  options)`;
- on insert, sets `first_answer = answer` and both timestamps, and refuses a
  non-null verdict or a `tries` other than 1 from an untrusted writer;
- on update by an untrusted writer, refuses any change to `is_correct`,
  `first_is_correct`, `first_answer`, `first_answered_at`, `answered_at` or
  `tries`, and **nulls `is_correct` and stamps `answered_at` whenever `answer`
  changes**, so a stale verdict never stands beside a new answer;
- the trusted writer (`private.is_trusted_writer()`, which includes the
  `cospire.system_write` flag the rescore sets) may change the verdicts and
  `tries`; nobody changes `first_answer` once written.

**Module progress is derived, never stored**, the way a test item's comes from
`attempts`. For a practice item in programme P: answered = the student's
`practice_answers` rows with `course_id = P` for the set's answerable questions
(standalone questions plus DI children); total = the count of those questions.
Done when answered = total, right or wrong. Adding questions to a set lowers the
figure honestly, with no stale row. No `item_progress` row is written for a
practice item and `student_may_record_progress` is unchanged. A score target
would be a gating rule, which §13.1 and Annexure B keep out.

**Key corrections.** The real path today: the triggers `question_keys_rescore`
and `questions_rescore` call `private.mark_for_rescore(question_id, change)`,
which sets `attempts.score = null` on affected submitted attempts under
`cospire.system_write` and writes a `rescore_events` row; then
`rescoreAwaiting(orgId)`, called with `after()` from the question save,
re-scores attempts whose score is null. Practice joins that path in two places:

- `mark_for_rescore` (redefined, its body otherwise unchanged) also sets
  `is_correct = null, first_is_correct = null` on `practice_answers` for that
  question, inside the same `system_write` window. `rescore_events` stays about
  attempts.
- `rescorePracticeAwaiting(orgId)` in `test-engine/rescore-awaiting.ts`, called
  beside `rescoreAwaiting`: bounded, it reads rows with a null verdict, the key
  and the question type with the server key, recomputes `is_correct` from
  `answer` and `first_is_correct` from `first_answer` with `isAnswerCorrect`,
  and writes both. A row left null meanwhile reads as "being re-checked".
  The module page also calls it with `after()` when it loads a null verdict, as
  `test-engine/queries/mock-attempts.ts` does for `rescoreAwaiting`, so a pass
  cut short is finished by the next visit.

Partial index `practice_answers (org_id) where is_correct is null` keeps the
pass cheap.

**RLS** (enabled and forced in the creating migration; helpers `STABLE SECURITY
DEFINER`, `search_path = ''`, `(select auth.uid())`, execute to
`authenticated` only):

- `private.student_reaches_practice_question(question_id)`: the question or its
  parent is in `practice_questions` on an item the student reaches
  (`student_reaches_section(section_id)` or `student_reaches_module(module_id)`).
- `private.student_may_practise(question_id, course_id, org_id)`: active
  student, own organisation, `student_reaches_programme(course_id)`, and the
  question (or parent) is on a practice item for which
  `course_has_item(course_id, item_id)` holds.
- `practice_questions`: admin SELECT / INSERT / UPDATE / DELETE via
  `is_admin_of_org(org_id)`; student SELECT when the item is reached. No student
  writes.
- `practice_answers`: student SELECT own; student INSERT and UPDATE own with
  `student_may_practise`; no DELETE. Admin SELECT for the organisation; mentor
  SELECT via `is_assigned_mentor(student_id)`. Verdicts as in the guard above.
- `question_keys`: new policy `question_keys_select_practice`, `exists` an own
  `practice_answers` row for that `question_id` **and**
  `student_reaches_practice_question(question_id)`.
- `questions`: new policy `questions_select_practice`, using
  `student_reaches_practice_question(id)`.

**Indexes.** `practice_questions (question_id)`; `practice_answers (question_id)`
for the rescore, `(course_id, org_id)` for the foreign key and per-programme
reads, and the partial index above. The PKs cover the student reads.

**Migrations (expand only; nothing is replaced, so no contract step):**

1. `curriculum_items`: `unique (id, org_id)`, the type and shape checks gain
   `practice`. `practice_questions` with RLS, its trigger, its index, the
   overlap triggers on both `practice_questions` and `mock_questions`, and the
   `parent_id` and essay arms in `guard_question_write`.
2. `practice_answers` with RLS, the guard trigger and indexes; the two helpers;
   `mark_for_rescore` redefined; `content_delete_preview` redefined so a
   programme's delete preview also counts its `practice_answers` rows (the
   delete itself cascades through the FK).
3. `question_keys_select_practice` and `questions_select_practice`.

Applied before the code merges. The deployed code never meets a practice item,
because none can exist until the new admin screen does.

`scripts/verify/practice.sql` (rolled back) asserts at least: a wrong student
reads no key, an unanswered question's key is unreadable, a student cannot set
`is_correct`, `first_is_correct` or `first_answer`, a changed answer nulls
`is_correct`, a student cannot insert an answer for another student or for a
programme they do not hold, a stimulus or essay answer is refused, a question
already in a mock cannot join a practice set (and the reverse, and not by a
`parent_id` move either), a practised question taken off its set opens no key,
deleting a programme removes its practice answers, a key
correction nulls both verdicts, and `0.50` against a `1/2` key is right.

## 4. What the same path gives the later features

| Later feature | Free from this design | Left for later |
|---|---|---|
| **Practice bank** (section/topic, difficulty, 15/30/45, untimed) | The check action, `practice_answers` (same rows, same `course_id`), the key policy, the question card | Which questions a course's bank holds (Client: tagging questions to colleges); one more arm on `student_may_practise` and `student_reaches_practice_question` for "in this course's bank", and the same no-overlap rule for bank questions; the picker screen. `questions.difficulty` is already NOT NULL |
| **Bookmarks and Revise** (N22) | Revise's "got it wrong" list is `practice_answers where first_is_correct = false` | A `practice_bookmarks (student_id, course_id, question_id)` table, own-row RLS; the Revise screen |
| **Recommended schedule** (N21) | Done / next can derive practice completion from `practice_answers` as above | All of it; nothing here constrains it |
| **Report a Question** | The card knows its question id, so the report can carry it | The shared review queue (D65) |

## 5. Admin side

On the module page (`/admin/modules/<id>`), **Add practice set** creates the
item; its editor offers two ways in, both writing the same ordered list:

- **Paste readable IDs** (`Q01234, Q01240, ...`), parsed with
  `parseQuestionRef` exactly as ID-list mocks are. Order = paste order.
- **Pick from the bank**: the existing question list query with its section,
  topic and difficulty filters, paginated, "Add" per row or per DI set.

The editor shows the count (a "20 to 25" hint, not a constraint), reorders and
removes, and flags a question that is archived (warned), an essay (refused),
or already in a mock (refused by the database, section 1). Saving is one SQL function, `save_practice_set`,
replacing the item's rows in one transaction, as `save_mock` does. Delete is
the item's existing remove.

## 6. Student screens

- **Module page** (`/student/programmes/[id]/modules/[moduleId]`): the items in
  order; a practice item renders **inline**, not as a link, so video and
  questions are one page (D66). A heading with "12 of 22 answered, 9 right
  first time".
- **Question card**: body, images, options (radio, or checkboxes for
  `mcq_multi` labelled "Select all that apply") or a text field for numerical;
  **Check** via `SubmitButton` with a pending label. After: right or wrong, the
  correct answer, the worked solution, **Try again**. A card already answered
  loads in its answered state. Each card is a small client component; the page
  stays a Server Component.
- **Mobile**: one column, full-width inputs and buttons, `inputmode="decimal"`
  on numerical fields, options as large tap targets. No proctoring and no
  attempt, so §1.5 does not apply; there is nothing to mark unproctored.
- **Skeleton**: no new route, so no new `loading.tsx`; the module page's
  existing one gains a block of question-card placeholders below the items.
- **Progress**: the practice heading and the module meter read the derived
  figure from section 3.

## 7. Deferred, and open questions

**Deferred:** the Practice bank, bookmarks and Revise, the schedule (section 4);
a per-try history; timing or scoring practice; analytics over practice (the
Client is to say what they want); the video "complete at length minus 45 s" rule
(a separate change in the video feature).

**Open questions**

| # | Question | Recommendation | Who |
|---|---|---|---|
| 1 | May a student retry a question after seeing the solution? | Yes, with `first_is_correct` kept | Owner |
| 2 | Does the practice set count toward the module meter by "answered" or by "right"? | Answered | Owner |
| 3 | May a practice question ever also be in a mock? Once checked its key is visible, so practising it gives the mock answer away | No; the database refuses it today (section 1) | Client |
| 4 | Where do the 20 to 25 per topic come from: the existing 1,349-question bank or new questions? | Client says | Client |
| 5 | Are `difficulty` values on the loaded bank real or defaulted? (Matters for the bank's filter) | Check before the bank | Owner, then Client |
| 6 | Which questions a course's Practice bank holds (tagging to colleges) | Blocks the bank only | Client |
