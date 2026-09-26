import "server-only";

import type { QuestionType } from "@/features/question-bank/question-input";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";

import { scoreAttempt, type ScoringQuestion } from "./scoring";

// Scores one submitted attempt and stores the result. Safe to run again: it
// recomputes from the answers and the current keys, so the rescore after a key
// correction (Annexure A) calls exactly this.
//
// It writes with the server key because the attempt guards reserve marks and
// scores for the server (`private.is_trusted_writer`). Callers must have
// established that the attempt is one the signed-in student owns, through
// their own session, before calling it.
export async function scoreAndStore(attemptId: number): Promise<number> {
  const admin = createAdminSupabaseClient();

  const { data: attempt, error } = await admin
    .from("attempts")
    .select("id, mock_id, status")
    .eq("id", attemptId)
    .single();
  if (error) throw new Error(`Unable to read the attempt to score: ${error.message}`);
  if (attempt.status !== "submitted") throw new Error("Only a submitted attempt is scored.");

  const [mockResult, placedResult, responseResult] = await Promise.all([
    admin.from("mocks").select("negative_marking, negative_marking_types").eq("id", attempt.mock_id).single(),
    admin.from("mock_questions").select("question_id").eq("mock_id", attempt.mock_id),
    admin.from("attempt_responses").select("question_id, answer").eq("attempt_id", attemptId),
  ]);
  if (mockResult.error) throw new Error(`Unable to read the mock to score: ${mockResult.error.message}`);
  if (placedResult.error) throw new Error(`Unable to read the paper to score: ${placedResult.error.message}`);
  if (responseResult.error) throw new Error(`Unable to read answers to score: ${responseResult.error.message}`);

  const topIds = (placedResult.data ?? []).map((row) => row.question_id);
  const [topResult, childResult] = await Promise.all([
    admin.from("questions").select("id, type, marks").in("id", topIds),
    admin.from("questions").select("id, type, marks").in("parent_id", topIds).is("archived_at", null),
  ]);
  if (topResult.error || childResult.error) throw new Error("Unable to read questions to score.");

  // A DI set is placed as its passage and each sub-question, so a question can
  // arrive through both reads. Scored once.
  const rows = [...new Map([...(topResult.data ?? []), ...(childResult.data ?? [])].map((row) => [row.id, row])).values()];
  const { data: keys, error: keyError } = await admin
    .from("question_keys")
    .select("question_id, correct_answer")
    .in("question_id", rows.map((row) => row.id));
  if (keyError) throw new Error(`Unable to read keys to score: ${keyError.message}`);
  const keyById = new Map((keys ?? []).map((key) => [key.question_id, key.correct_answer]));

  const questions: ScoringQuestion[] = rows.map((row) => ({
    id: row.id,
    key: keyById.get(row.id) ?? null,
    marks: row.marks,
    type: row.type as QuestionType,
  }));
  const answers = new Map((responseResult.data ?? []).map((row) => [row.question_id, row.answer as unknown]));
  const result = scoreAttempt(questions, answers, {
    negativeMarking: mockResult.data.negative_marking,
    negativeMarkingTypes: mockResult.data.negative_marking_types,
  });

  // Only rows the student created are updated; a question never opened has no
  // row, which is how "not answered" is told apart from "seen".
  const stored = result.responses.filter((response) => answers.has(response.questionId));
  if (stored.length) {
    const { error: writeError } = await admin.from("attempt_responses").upsert(
      stored.map((response) => ({
        attempt_id: attemptId,
        is_correct: response.isCorrect,
        marks_awarded: response.marksAwarded,
        question_id: response.questionId,
      })),
      { onConflict: "attempt_id,question_id" },
    );
    if (writeError) throw new Error(`Unable to store marks: ${writeError.message}`);
  }

  const { error: scoreError } = await admin.from("attempts").update({ score: result.score }).eq("id", attemptId);
  if (scoreError) throw new Error(`Unable to store the score: ${scoreError.message}`);
  return result.score;
}
