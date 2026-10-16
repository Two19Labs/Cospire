// Scoring one attempt, per operating manual §13.1:
//
//   unanswered                            ->  0
//   correct                               ->  +marks (see effectiveMarks)
//   wrong, type in negative_marking_types ->  -mocks.negative_marking
//   wrong, type not in the list           ->  0
//
// Pure, so the rescore after a key correction runs exactly this code again.
// A multiple-correct MCQ is right only when the chosen set equals the key's;
// there is no partial credit, because the agreement promises none.

import { isNumericalAnswerCorrect, type NumericalKey } from "@/features/question-bank/numerical";
import type { QuestionType } from "@/features/question-bank/question-input";
import { isAnswered } from "./answer";

export interface ScoringQuestion {
  id: number;
  // null for a DI passage, which carries no key and no marks, and for an essay,
  // which is marked by a person.
  key: unknown;
  // What a correct answer earns in this mock: effectiveMarks, already applied.
  marks: number;
  // Which section of the paper it sits in. Essays are a choice within a
  // section: see `bestEssayPerSection`.
  sectionId: number | null;
  type: QuestionType;
}

// Marks belong to the mock (decision D19, 2026-10-01). A mock section that sets
// marks overrides the question's own; one that does not (every mock saved
// before 2026-10-02) keeps the question's. A DI passage is read, not answered,
// so it earns nothing whatever its section says.
export function effectiveMarks(question: { marks: number; type: string }, sectionMarks: number | null | undefined): number {
  if (question.type === "di_stimulus") return 0;
  return sectionMarks ?? Number(question.marks);
}

export interface ScoringRules {
  negativeMarking: number;
  negativeMarkingTypes: string[];
}

export interface ResponseScore {
  // Both null when unanswered: "not answered" is kept apart from "wrong".
  isCorrect: boolean | null;
  marksAwarded: number | null;
  questionId: number;
}

export interface AttemptScore {
  responses: ResponseScore[];
  score: number;
}

// Exactly the same options, each once. A stored answer is untrusted -- a
// student can write their own row through the API -- so a repeated option is
// never allowed to stand in for a different one: ["a","a"] is not ["a","c"].
function sameSet(given: unknown[], key: unknown[]): boolean {
  if (!given.every((value) => typeof value === "string")) return false;
  const chosen = new Set(given);
  const expected = new Set(key);
  if (chosen.size !== given.length || chosen.size !== expected.size) return false;
  return [...chosen].every((value) => expected.has(value));
}

export function isAnswerCorrect(question: ScoringQuestion, answer: unknown): boolean {
  if (!isAnswered(answer) || question.key === null || typeof question.key !== "object") return false;
  const given = answer as Record<string, unknown>;
  const key = question.key as Record<string, unknown>;

  if (question.type === "numerical") {
    if (typeof given.value !== "string" || !Array.isArray(key.accepted)) return false;
    return isNumericalAnswerCorrect(given.value, key as unknown as NumericalKey);
  }

  if (question.type === "mcq" || question.type === "mcq_multi") {
    if (!Array.isArray(given.options) || !Array.isArray(key.options)) return false;
    return sameSet(given.options, key.options);
  }

  return false;
}

// An answered essay with no marks is **pending**, which results and analytics
// must show as such and never as wrong. The row looks exactly like an
// unanswered one -- no verdict, no marks -- so the answer is what tells them
// apart, which is why this takes the answer rather than the stored score.
export function isEssayPending(question: { type: QuestionType }, answer: unknown, marksAwarded: number | null): boolean {
  return question.type === "essay" && isAnswered(answer) && marksAwarded === null;
}

// Marks are kept to two decimal places, as the columns hold them, and summed
// in hundredths so 0.1 + 0.2 never reaches the student as 0.30000000000000004.
function hundredths(value: number): number {
  return Math.round(value * 100);
}

// **"Choose 1 of 2", in its simplest form** (owner to confirm; see the pull
// request for `feat/essay-question`). A section's essays are a choice: the
// student answers either, and if they answer both, the higher-marked one
// counts. So the essay carrying the best awarded mark in a section scores and
// the rest score nothing, with no choice-group column to model and no change to
// the mock builder. A section with one essay is the same rule with one entrant.
//
// An essay still awaiting its mark is not in the running: when it is marked the
// attempt goes back to awaiting a score and this runs again over both.
function bestEssayPerSection(questions: ScoringQuestion[], essayMarks: Map<number, number>): Set<number> {
  const best = new Map<string, { id: number; marks: number }>();
  for (const question of questions) {
    if (question.type !== "essay") continue;
    const awarded = essayMarks.get(question.id);
    if (awarded === undefined) continue;
    const key = String(question.sectionId);
    const standing = best.get(key);
    // Ties go to the lower question id, so the same answers always score the
    // same way however the rows come back.
    if (!standing || awarded > standing.marks) best.set(key, { id: question.id, marks: awarded });
  }
  return new Set([...best.values()].map((entry) => entry.id));
}

export function scoreAttempt(
  questions: ScoringQuestion[],
  answers: Map<number, unknown>,
  rules: ScoringRules,
  // What an admin or the assigned mentor has awarded for each essay, by
  // question id. An essay missing from this map has not been marked yet.
  essayMarks: Map<number, number> = new Map(),
): AttemptScore {
  const responses: ResponseScore[] = [];
  const counting = bestEssayPerSection(questions, essayMarks);
  let total = 0;

  for (const question of questions) {
    if (question.type === "di_stimulus") continue;
    const answer = answers.get(question.id) ?? null;

    if (!isAnswered(answer)) {
      responses.push({ isCorrect: null, marksAwarded: null, questionId: question.id });
      continue;
    }

    // An essay is never right or wrong and is never penalised. Until it is
    // marked it is **pending**, which is written as the unscored shape -- no
    // verdict, no marks -- and read back as pending rather than wrong because
    // the answer is there (see `isEssayPending`).
    if (question.type === "essay") {
      const awarded = essayMarks.get(question.id);
      if (awarded === undefined) {
        responses.push({ isCorrect: null, marksAwarded: null, questionId: question.id });
        continue;
      }
      const counted = counting.has(question.id) ? Math.min(awarded, question.marks) : 0;
      total += hundredths(counted);
      responses.push({ isCorrect: null, marksAwarded: hundredths(counted) / 100, questionId: question.id });
      continue;
    }

    const correct = isAnswerCorrect(question, answer);
    const penalised = rules.negativeMarking > 0 && rules.negativeMarkingTypes.includes(question.type);
    const marks = correct ? question.marks : penalised ? -rules.negativeMarking : 0;
    total += hundredths(marks);
    responses.push({ isCorrect: correct, marksAwarded: hundredths(marks) / 100, questionId: question.id });
  }

  return { responses, score: total / 100 };
}
