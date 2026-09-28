import "server-only";

import type { QuestionType } from "@/features/question-bank/question-input";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";

import { scoreAttempt, type ScoringQuestion } from "./scoring";

type Admin = ReturnType<typeof createAdminSupabaseClient>;

// What a score depends on besides the answers: each question's key, marks and
// type. Compared before and after writing, so a key corrected while this was
// scoring is never overwritten by a score worked out from the old one.
function fingerprint(questions: ScoringQuestion[]): string {
  return JSON.stringify([...questions].sort((a, b) => a.id - b.id).map((q) => [q.id, q.type, q.marks, q.key]));
}

async function readPaper(admin: Admin, mockId: number): Promise<ScoringQuestion[]> {
  const { data: placed, error } = await admin.from("mock_questions").select("question_id").eq("mock_id", mockId);
  if (error) throw new Error(`Unable to read the paper to score: ${error.message}`);
  const topIds = (placed ?? []).map((row) => row.question_id);
  if (topIds.length === 0) return [];

  // Every question in the paper as it was sat, archived or not: archiving a
  // question does not change what the student answered.
  const [topResult, childResult] = await Promise.all([
    admin.from("questions").select("id, type, marks").in("id", topIds),
    admin.from("questions").select("id, type, marks").in("parent_id", topIds),
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

  return rows.map((row) => ({
    id: row.id,
    key: keyById.get(row.id) ?? null,
    marks: row.marks,
    type: row.type as QuestionType,
  }));
}

// Scores one submitted attempt and stores the result. Safe to run again: it
// recomputes from the answers and the current keys, so the rescore after a key
// correction (Annexure A) calls exactly this.
//
// It writes with the server key because the attempt guards reserve marks and
// scores for the server (`private.is_trusted_writer`). Callers must have
// established, through the signed-in user's own session, that they may see the
// attempt before calling it.
export async function scoreAndStore(attemptId: number): Promise<number> {
  const admin = createAdminSupabaseClient();

  const { data: attempt, error } = await admin.from("attempts").select("id, mock_id, status").eq("id", attemptId).single();
  if (error) throw new Error(`Unable to read the attempt to score: ${error.message}`);
  if (attempt.status !== "submitted") throw new Error("Only a submitted attempt is scored.");

  const [mockResult, responseResult] = await Promise.all([
    admin.from("mocks").select("negative_marking, negative_marking_types").eq("id", attempt.mock_id).single(),
    admin.from("attempt_responses").select("question_id, answer").eq("attempt_id", attemptId),
  ]);
  if (mockResult.error) throw new Error(`Unable to read the mock to score: ${mockResult.error.message}`);
  if (responseResult.error) throw new Error(`Unable to read answers to score: ${responseResult.error.message}`);
  // A submitted attempt's answers never change (the response guard), so they
  // are read once; only the keys can move underneath.
  const answers = new Map((responseResult.data ?? []).map((row) => [row.question_id, row.answer as unknown]));

  // Three tries is generous: a retry is needed only when a question in this
  // paper is edited in the moments between reading its key and storing the
  // score, and each edit clears the score again for a later rescore anyway.
  for (let tries = 0; tries < 3; tries += 1) {
    const questions = await readPaper(admin, attempt.mock_id);
    const result = scoreAttempt(questions, answers, {
      negativeMarking: mockResult.data.negative_marking,
      negativeMarkingTypes: mockResult.data.negative_marking_types,
    });

    // Only rows the student created are updated; a question never opened has
    // no row, which is how "not answered" is told apart from "seen".
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

    if (fingerprint(await readPaper(admin, attempt.mock_id)) === fingerprint(questions)) return result.score;
  }

  // Still moving after three tries: leave it awaiting a score rather than
  // store one that may be stale. The next view or question save scores it.
  await admin.from("attempts").update({ score: null }).eq("id", attemptId);
  throw new Error("The paper kept changing while this attempt was being scored.");
}
