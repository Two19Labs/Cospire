import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

// The essays in one submitted attempt, with what the student wrote and what has
// been awarded so far.
//
// **Read through the caller's own session**, so RLS alone decides who sees it:
// `attempt_responses_select_*` for the answers and `essay_marks_select_*` for
// the marks. There is no role check here and there must not be one -- a mentor
// who is not this student's mentor gets no rows because the database says so,
// not because this file remembered to ask (operating manual §1.2).
//
// It is read on one attempt's review screen only, so the whole essay text is
// fetched. Nothing else in analytics reads question bodies, which is why this
// is its own query rather than a widening of `readPapers`.

export interface EssayAnswer {
  // The awarded mark, or null while it is pending.
  awarded: number | null;
  markedAt: string | null;
  // What the essay is worth on this mock: the section's marks when the section
  // sets them, the question's own when it does not (decision D19).
  maxMarks: number;
  prompt: string;
  questionId: number;
  sectionTitle: string;
  // What the student wrote, or null when they left it blank.
  text: string | null;
}

export async function listEssayAnswers(attemptId: number): Promise<EssayAnswer[]> {
  const db = await createServerSupabaseClient();

  const { data: attempt, error: attemptError } = await db
    .from("attempts")
    .select("id, mock_id")
    .eq("id", attemptId)
    .eq("status", "submitted")
    .maybeSingle();
  if (attemptError) throw new Error(`Unable to read the attempt: ${attemptError.message}`);
  if (!attempt) return [];

  // Essays are standalone questions, so they are placed in `mock_questions`
  // directly: there is no stimulus to reach through.
  const { data: placed, error: placedError } = await db
    .from("mock_questions")
    .select("question_id, sort_order, mock_sections(title, marks), questions!inner(id, body, marks, type)")
    .eq("mock_id", attempt.mock_id)
    .eq("questions.type", "essay")
    .order("sort_order");
  if (placedError) throw new Error(`Unable to read the paper's essays: ${placedError.message}`);
  if (!placed?.length) return [];

  const questionIds = placed.map((row) => row.question_id as number);
  const [responses, marks] = await Promise.all([
    db.from("attempt_responses").select("question_id, answer").eq("attempt_id", attemptId).in("question_id", questionIds),
    db.from("essay_marks").select("question_id, marks, marked_at").eq("attempt_id", attemptId).in("question_id", questionIds),
  ]);
  if (responses.error) throw new Error(`Unable to read the essay answers: ${responses.error.message}`);
  if (marks.error) throw new Error(`Unable to read the awarded marks: ${marks.error.message}`);

  const answerOf = new Map(
    (responses.data ?? []).map((row) => {
      const answer = row.answer as { text?: unknown } | null;
      const text = answer && typeof answer.text === "string" ? answer.text : null;
      return [row.question_id as number, text !== null && text.trim() !== "" ? text : null];
    }),
  );
  const markOf = new Map(
    (marks.data ?? []).map((row) => [row.question_id as number, { at: row.marked_at as string, marks: Number(row.marks) }]),
  );

  return placed.map((row) => {
    const question = row.questions as unknown as { body: string; id: number; marks: number };
    const section = row.mock_sections as unknown as { marks: number | null; title: string } | null;
    const mark = markOf.get(question.id) ?? null;
    return {
      awarded: mark ? mark.marks : null,
      markedAt: mark ? mark.at : null,
      maxMarks: section?.marks === null || section?.marks === undefined ? Number(question.marks) : Number(section.marks),
      prompt: question.body,
      questionId: question.id,
      sectionTitle: section?.title ?? "Essay",
      text: answerOf.get(question.id) ?? null,
    };
  });
}
