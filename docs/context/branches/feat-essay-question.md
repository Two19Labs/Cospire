# feat/essay-question — the essay question type

Branch for the on-the-spot essays in the full MESA and Ashoka mocks (owner,
2026-10-13; no quote needed). Worktree `Cospire-engine`, port 3040.

## The modelling choices

**1. `essay` is a question type, not a feature of its own.** It goes in
`questions.type` beside `mcq`, `numerical` and `di_stimulus`, so it is
authored, imported, placed in a mock, sat under the section timer, and reviewed
by everything that already handles a question. Nothing is special-cased except
the two places where an essay genuinely differs: it has no key, and a person
awards its marks.

**2. The answer is `{ "text": "..." }`.** The same shape family as
`{ "options": [...] }` and `{ "value": "..." }`, validated by
`private.answer_fits_question`, up to 20000 characters (about 3000 words, past
any on-the-spot essay, and the same ceiling `questions.body` carries). It is
saved through the exam screen's existing background save; no new save path.

**3. An essay keeps a `question_keys` row with a null answer.** `save_question`
writes a key row for every type but a stimulus, and that row is also where the
solution lives, so the essay keeps the shape rather than `save_question` being
changed. `private.question_key_valid` now accepts "no answer" for an essay
exactly as it does for a stimulus, and refuses one that carries an answer.

**4. The awarded mark is its own table, `essay_marks`, not
`attempt_responses.marks_awarded`.** They are different facts: the mark is the
**marker's input**, which must survive every recomputation, while
`marks_awarded` is the **scorer's output** and is rewritten on every rescore. A
table of its own also carries who marked it and when, and lets the write be
governed by its own policies instead of widening a student-facing table.

**5. Nothing new scores.** Awarding a mark clears `attempts.score`
(`essay_marks_awaits_score`), which is this repository's existing
"awaiting a score" state; `rescoreAwaiting` and the result screen drain it, and
`scoreAndStore` — the one scorer, the same one the Annexure A rescore uses —
reads `essay_marks` as an input. `attempt_responses_scored_together` is widened
so `marks_awarded` may stand without `is_correct`, because a person's mark is
not a right-or-wrong verdict. The reverse, a verdict with no marks, is still
refused.

**6. Pending is never wrong.** An answered, unmarked essay stores exactly what
an unscored answer stores — no verdict, no marks — so the question's type is
what tells them apart (`isEssayPending`). The tally counts it as `pending`,
leaves `correct` and `wrong` alone, and accuracy is now taken over the answers
that *have* a verdict, which for a paper of auto-scored questions is every
attempted one, exactly as before. Both the student's result screen and the
admin and mentor review say the score is not final while an essay is pending.

**7. "Choose 1 of 2" is the scorer's rule, with no column to model it.** A
section's essays are a choice: the student answers either, and if both are
answered the **higher-marked one counts** (`bestEssayPerSection`). A section
with one essay is the same rule with one entrant. **This is the decision for
the owner** — see the pull request. The upgrade path, if a mock ever needs two
essays that both count, is a `choice_group` column on `mock_questions`, which
this does not foreclose.

**8. Who may mark is RLS, not a route.** `essay_marks_insert_staff` and
`essay_marks_update_staff` admit an admin of the organisation or this student's
assigned mentor; there is no student write policy at all, so a student cannot
mark their own essay whatever a route does. `private.guard_essay_mark_write`
refuses a mark above what the essay is worth **on this mock** (the section's
marks when it sets them, the question's own when it does not — decision D19),
a question that is not an essay in that paper, and an attempt that is not
submitted; it stamps `org_id`, `marked_by` and `marked_at` itself. The student
reads the mark only once the attempt is submitted, the rule the answer key
follows.

## Files

- `supabase/migrations/20261014110000_essay_questions.sql` — the type, the two
  redefined validators, the widened response constraint, `essay_marks` with its
  policies, its guard and the awaiting-a-score trigger. Timestamp confirmed
  unused on every branch.
- `supabase/tests/004_essay_questions.test.sql` — 16 pgTAP assertions, write
  side first.
- `src/features/question-bank/question-input.ts`, `components/question-editor.tsx`
  — authoring: the type, its labels, its prompt wording, no options and no key.
- `src/features/question-bank/import-spec.ts`, `import-prompt.ts` — the
  importer: `essay`, `WAT` and `long answer` as type words, options or a key
  invented for an essay dropped with a note, and the model told an essay has
  neither.
- `src/features/test-engine/answer.ts`, `scoring.ts`, `score-attempt.ts` — the
  answer shape, pending, the choice rule, and the awarded marks as a scoring
  input.
- `src/features/test-engine/components/exam-sitting.tsx`, `exam.module.css` — a
  textarea with a live word count, on the existing background save.
- `src/features/test-engine/queries/essay-answers.ts`,
  `actions/essay-mark-actions.ts`, `components/essay-marking-panel.tsx` — the
  marking panel on the attempt review.
- `src/features/analytics/aggregate.ts`, `components/screens.tsx`,
  `components/routes.tsx`, `src/features/test-engine/components/result-screen.tsx`
  — pending shown as pending everywhere a score is.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`: pass.
  **626 unit tests**, 20 of them new: 10 for essay scoring (pending, never
  penalised, the awarded mark in the score, the best-of-two choice, the
  per-section rule, the ceiling, an unanswered essay, and reading a typed
  answer), 4 for the tally (pending not wrong, a marked essay's marks counted,
  accuracy, unattempted), and the importer reading an essay and dropping an
  invented key. Three existing tests used `"essay"` as their stand-in for an
  *invalid* type and now use `"sonnet"`.
- **The SQL has not been executed anywhere.** Docker is unavailable, so
  `npm run db:test` and `supabase db lint` cannot run, and `DATABASE_URL` in
  `.env.local` is empty, so there is no reachable Postgres. The migration and
  the pgTAP file are written and reviewed but never run. The owner applies the
  migration, and should run `npm run db:test` where Docker exists first.
- **Nothing was exercised in a browser**, local or deployed: no essay has been
  authored, sat, or marked, because the type does not exist in the hosted
  database until the migration is applied. The whole feature is verified by
  unit tests and reading, and by nothing else.
- `npx supabase db push --dry-run`: see the pull request.
