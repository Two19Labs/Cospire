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
  // null for a DI passage, which carries no key and no marks.
  key: unknown;
  // What a correct answer earns in this mock: effectiveMarks, already applied.
  marks: number;
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

// Marks are kept to two decimal places, as the columns hold them, and summed
// in hundredths so 0.1 + 0.2 never reaches the student as 0.30000000000000004.
function hundredths(value: number): number {
  return Math.round(value * 100);
}

export function scoreAttempt(
  questions: ScoringQuestion[],
  answers: Map<number, unknown>,
  rules: ScoringRules,
): AttemptScore {
  const responses: ResponseScore[] = [];
  let total = 0;

  for (const question of questions) {
    if (question.type === "di_stimulus") continue;
    const answer = answers.get(question.id) ?? null;

    if (!isAnswered(answer)) {
      responses.push({ isCorrect: null, marksAwarded: null, questionId: question.id });
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
