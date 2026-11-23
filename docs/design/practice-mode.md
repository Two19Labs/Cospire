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
| **A new item type `practice`, with a join table** | **Recommended.** It is ordered among the module's items like any other, gets `item_progress` for free, and is shared across programmes because the module is (D61) |

**Changed: `curriculum_items`.** `type` check gains `'practice'`; the shape check
gains one arm: a practice item has `ref_id`, `body` null and an optional `title`
(default shown: "Practice"). Every existing row passes both checks.
`validate_curriculum_item_parent` already keeps non-test items out of a `mocks`
section.

**New: `practice_questions`** (the questions on one practice item, ordered)

| column | type | notes |
|---|---|---|
| item_id | bigint | FK `(item_id, org_id)` -> `curriculum_items`, on delete cascade |
| question_id | bigint | FK `(question_id, org_id)` -> `questions`, on delete restrict |
| org_id | bigint not null | both ends in one organisation |
| sort_order | integer not null default 0 | ties break on question_id |
| PK | (item_id, question_id) | a question appears once per set |

Index `(question_id)` for the reach check, rescoring and "used in". A trigger
refuses an item whose type is not `practice`, an essay (it cannot be checked
instantly), and a DI sub-question placed on its own: a DI set is placed by its
stimulus and its children come with it, exactly as `mock_questions` works.

One practice item per module is the expected use; nothing enforces it.

## 2. Instant feedback without leaking keys

The check is a server action, `checkPracticeAnswer(courseId, itemId,
questionId, values)`:

1. Reads the question and its options **through the student's session**. RLS
   returns it only if the student reaches a practice set holding it (below).
2. Parses the post with the test engine's `readAnswer` (`test-engine/answer.ts`):
   unknown option ids and a second option on a single MCQ are refused, a typed
   value is kept as typed.
3. Upserts the student's `practice_answers` row through their session (RLS
   checks reach and ownership).
4. Reads the key and solution through the student's session; the row written in
   step 3 is what opens it (below).
5. Decides with `isAnswerCorrect` from `test-engine/scoring.ts`, unchanged. That
   is the same numerical normalisation (`question-bank/numerical.ts`: `0.5`,
   `1/2`, `.50`, tolerance) and the same all-or-nothing set rule for
   `mcq_multi`, so a practice verdict and a mock verdict can never disagree.
6. Writes the verdict with the server key (verdict columns are trusted-writer
   only, as on `attempt_responses`), records `item_progress`, and returns
   verdict, key and solution to the page.

**Keys.** CONTEXT.md's finding reads as though `question_keys` has no student
policy; since Phase 4 it has one, `question_keys_select_student`, opening a key
only after the student's own submitted attempt. This design adds a **second,
separate policy**: a student reads the key of a question **for which they hold
a `practice_answers` row**. Nothing is revealed before that student has answered
that question. The key is never sent to the browser before Check, never in page
props, never in the question query.

**Questions.** `questions_select_student` today opens a question only through an
attempt. One more policy arm: the question, or its DI parent, is on a practice
item the student reaches (`private.student_reaches_practice_question`, below).
`questions` holds no key column, so this exposes nothing new.

**DI sets.** The stimulus is shown once with its children under it; each child
is checked on its own and has its own key and solution. The stimulus has no
answer row.

**The crib risk (needs the Client).** Once checked, the key is visible. If a
practice question is also in a published mock, practising it gives away the
mock answer. Recommended: practice sets draw on questions that are not in any
mock, and the admin picker warns when one is.

## 3. Storing answers

**New: `practice_answers`** (one row per student, programme and question)

| column | type | notes |
|---|---|---|
| student_id | uuid | FK `(student_id, org_id)` -> `profiles`, on delete restrict |
| course_id | bigint | FK `(course_id, org_id)` -> `courses`; per programme (D61 decision 1) |
| question_id | bigint | FK `(question_id, org_id)` -> `questions`, on delete restrict |
| org_id | bigint not null | |
| answer | jsonb not null | the latest, as `readAnswer` stored it |
| is_correct | boolean | latest verdict; trusted writer only |
| first_is_correct | boolean | verdict of the first try, never overwritten; trusted writer only |
| tries | integer not null default 1 | |
| first_answered_at, answered_at | timestamptz | |
| PK | (student_id, course_id, question_id) | |

**Re-attempts: one row, overwritten, not a history.** "Try again" clears the
card and the next Check overwrites `answer` and `is_correct` and bumps `tries`.
`first_is_correct` is the honest number for analytics and Revise, because every
later try was made after the solution was on screen. A history table is
deferred until someone asks what the third try was.

The row is keyed by `question_id`, not by item: the same question answered in
two modules of one programme is one answer, and the Practice bank (section 4)
writes the same rows.

**Module progress.** The practice item's `item_progress` row (already per
`(student_id, course_id, item_id)`): `percent` = questions answered / questions
on the set, `completed` when all are answered, right or wrong. A score target
would be a gating rule, which §13.1 and Annexure B keep out.
`student_may_record_progress` gains `'practice'` in its type list.

**Key corrections.** No score exists, so there is no `rescore_events` row. The
existing rescore path, after it rescored the attempts, re-runs `isAnswerCorrect`
over `practice_answers` for that question and updates `is_correct` and
`first_is_correct` (server key). One extra query, same code.

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
  `student_may_practise`; no DELETE. A guard trigger refuses any change to
  `is_correct`, `first_is_correct`, `tries` or the timestamps unless
  `private.is_trusted_writer()`, as on `attempt_responses`. Admin SELECT for the
  organisation; mentor SELECT via `is_assigned_mentor(student_id)`.
- `question_keys`: new policy `question_keys_select_practice`, `exists` an own
  `practice_answers` row for that `question_id`.
- `questions`: `questions_select_student` gains the
  `student_reaches_practice_question(id)` arm.

**Indexes.** `practice_questions (question_id)`; `practice_answers (question_id)`
for rescoring, `(course_id, org_id)` for the foreign key and per-programme
reads. The PKs cover the student reads.

**Migrations (expand only; nothing is replaced, so no contract step):**

1. `curriculum_items` checks gain `practice`; `practice_questions` with RLS,
   trigger and index.
2. `practice_answers` with RLS, guard trigger and indexes; the two helpers;
   `student_may_record_progress` redefined with `'practice'`.
3. The new arms on `questions` and `question_keys`.

Applied before the code merges. The deployed code never meets a practice item,
because none can exist until the new admin screen does.

`scripts/verify/practice.sql` (rolled back) asserts at least: a wrong student
reads no key, an unanswered question's key is unreadable, a student cannot set
`is_correct`, a student cannot insert an answer for another student or for a
programme they do not hold, and `0.50` against a `1/2` key is right.

## 4. What the same path gives the later features

| Later feature | Free from this design | Left for later |
|---|---|---|
| **Practice bank** (section/topic, difficulty, 15/30/45, untimed) | The check action, `practice_answers` (same rows, same `course_id`), the key policy, the question card | Which questions a course's bank holds (Client: tagging questions to colleges); one more arm on `student_may_practise` and `student_reaches_practice_question` for "in this course's bank"; the picker screen. `questions.difficulty` is already NOT NULL |
| **Bookmarks and Revise** (N22) | Revise's "got it wrong" list is `practice_answers where first_is_correct = false` | A `practice_bookmarks (student_id, course_id, question_id)` table, own-row RLS; the Revise screen |
| **Recommended schedule** (N21) | Done / next reads `item_progress`, which practice now writes | All of it; nothing here constrains it |
| **Report a Question** | The card knows its question id, so the report can carry it | The shared review queue (D65) |

## 5. Admin side

On the module page (`/admin/modules/<id>`), **Add practice set** creates the
item; its editor offers two ways in, both writing the same ordered list:

- **Paste readable IDs** (`Q01234, Q01240, ...`), parsed with
  `parseQuestionRef` exactly as ID-list mocks are. Order = paste order.
- **Pick from the bank**: the existing question list query with its section,
  topic and difficulty filters, paginated, "Add" per row or per DI set.

The editor shows the count (a "20 to 25" hint, not a constraint), reorders and
removes, and flags a question that is archived, an essay (refused), or already
in a published mock (warned). Saving is one SQL function, `save_practice_set`,
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
| 3 | Are practice questions kept out of mocks (the crib risk in section 2)? | Yes; picker warns | Client |
| 4 | Where do the 20 to 25 per topic come from: the existing 1,349-question bank or new questions? | Client says | Client |
| 5 | Are `difficulty` values on the loaded bank real or defaulted? (Matters for the bank's filter) | Check before the bank | Owner, then Client |
| 6 | Which questions a course's Practice bank holds (tagging to colleges) | Blocks the bank only | Client |
