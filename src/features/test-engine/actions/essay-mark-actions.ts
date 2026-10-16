"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

// Awarding the marks for one essay answer.
//
// **The write goes through the marker's own session**, so the database decides
// whether they may: `essay_marks_insert_staff` and `essay_marks_update_staff`
// admit an admin of the organisation or this student's assigned mentor and
// nobody else, and `private.guard_essay_mark_write` refuses a mark above what
// the essay is worth, a question that is not an essay in this paper, and an
// attempt that is not submitted. None of that is restated here, because a
// second copy of a rule is a second place for it to be wrong.
//
// Nothing scores here either. The database clears the attempt's score when a
// mark lands (`essay_marks_awaits_score`), which puts the attempt in the
// awaiting-a-score state the existing path already drains -- the result screen
// scores it on the next read. One scorer, as the rescore after a key
// correction uses.

// Up to two decimal places, like every other marks value in this system, and
// never negative. The ceiling is the question's, which only the database knows.
function parseMarks(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(text)) return null;
  return Number(text);
}

export async function awardEssayMarkAction(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (profile.role === "student") redirect("/student");

  const attemptId = parseId(stringOf(formData.get("attemptId")));
  const questionId = parseId(stringOf(formData.get("questionId")));
  if (attemptId === null || questionId === null) redirect(`/${profile.role}/analytics/attempts`);

  const back = `/${profile.role}/analytics/attempts/${attemptId}`;
  const marks = parseMarks(formData.get("marks"));
  if (marks === null) redirect(`${back}?essay=invalid`);

  const db = await createServerSupabaseClient();
  // `org_id`, `marked_by` and `marked_at` are the trigger's to set; whatever is
  // sent for them is overwritten, so they are not sent.
  const { error } = await db
    .from("essay_marks")
    .upsert({ attempt_id: attemptId, marks, question_id: questionId }, { onConflict: "attempt_id,question_id" });

  // 23514 is the trigger's "worth N marks" refusal; anything else is a refusal
  // to mark at all, which for a marker who may not mark this attempt is what
  // RLS returns.
  if (error) redirect(`${back}?essay=${error.code === "23514" ? "toomany" : "failed"}`);

  revalidatePath(back);
  redirect(`${back}?essay=marked`);
}

function stringOf(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}
