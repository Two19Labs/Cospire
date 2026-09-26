import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface QuestionKey {
  correctAnswer: unknown;
  solution: string | null;
}

// The answer keys for a paper, through the student's own session. RLS returns
// them only once their attempt is submitted and no retake is open
// (`question_keys_select_student`), so an empty map before then is the
// database working, not a bug to route around.
export async function getAttemptKeys(questionIds: number[]): Promise<Map<number, QuestionKey>> {
  if (questionIds.length === 0) return new Map();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_keys")
    .select("question_id, correct_answer, solution")
    .in("question_id", questionIds);
  if (error) throw new Error(`Unable to read answer keys: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.question_id, { correctAnswer: row.correct_answer, solution: row.solution }]));
}
