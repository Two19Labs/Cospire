// What a student's answer looks like when it is stored, and reading one from a
// form post. Stored in the same shape the key uses for choices, so scoring
// compares like with like:
//
//   mcq, mcq_multi  { options: ["b"] }
//   numerical       { value: "1/2" }   -- exactly as typed; scoring normalises
//   essay           { text: "..." }    -- as typed, newlines and all
//
// A typed answer is kept as typed rather than normalised on the way in, so a
// student's review shows what they entered and a later fix to the normaliser
// rescores it correctly.

import { numericalAnswerMaxLength } from "@/features/question-bank/numerical";
import type { QuestionType } from "@/features/question-bank/question-input";

// Matches `private.answer_fits_question` in 20261014110000: the database is the
// enforcer, this is so the screen can say so first. About 3000 words, well past
// any on-the-spot essay.
export const essayAnswerMaxLength = 20000;

export type StoredAnswer = { options: string[] } | { text: string } | { value: string };

export interface AnswerableQuestion {
  options: { id: string }[];
  type: QuestionType;
}

// From the raw form values for one question. Returns null for "no answer",
// which is a legitimate thing to save (clearing a response), and "invalid" for
// a post that names an option the question does not have -- a crafted request,
// since the form cannot produce one.
export function readAnswer(
  question: AnswerableQuestion,
  values: string[],
): StoredAnswer | null | "invalid" {
  const given = values.map((value) => value.trim()).filter((value) => value !== "");

  if (question.type === "di_stimulus") return "invalid";

  // An essay is prose: whitespace inside it is the student's, so only the ends
  // are trimmed and an answer of nothing but whitespace is no answer. It is
  // posted as one field, so a second value is a crafted request.
  if (question.type === "essay") {
    if (values.length > 1) return "invalid";
    const text = (values[0] ?? "").replace(/\r\n/g, "\n").trim();
    if (text === "") return null;
    if (text.length > essayAnswerMaxLength) return "invalid";
    return { text };
  }

  if (question.type === "numerical") {
    if (given.length === 0) return null;
    if (given.length > 1 || given[0].length > numericalAnswerMaxLength) return "invalid";
    return { value: given[0] };
  }

  if (given.length === 0) return null;
  const known = new Set(question.options.map((option) => option.id));
  const chosen = [...new Set(given)];
  if (chosen.some((id) => !known.has(id))) return "invalid";
  if (question.type === "mcq" && chosen.length > 1) return "invalid";
  // Stored in the question's own option order, so two identical choices always
  // serialise the same way.
  return { options: question.options.map((option) => option.id).filter((id) => chosen.includes(id)) };
}

// Whether a stored value counts as answered. Anything unreadable counts as not
// answered rather than as an error, because it came from the database, where a
// student may have written it directly.
export function isAnswered(answer: unknown): boolean {
  if (answer === null || typeof answer !== "object") return false;
  const record = answer as Record<string, unknown>;
  if (Array.isArray(record.options)) return record.options.length > 0;
  if (typeof record.text === "string") return record.text.trim() !== "";
  return typeof record.value === "string" && record.value.trim() !== "";
}
