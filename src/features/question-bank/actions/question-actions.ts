"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { rescoreAwaiting } from "@/features/test-engine/rescore-awaiting";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildQuestionHref, parseId, questionBankBase } from "../list-params";
import { draftToFormValues, readQuestionForm, type QuestionEditorState } from "../question-form";
import { toSaveQuestionArgs, validateQuestion } from "../question-input";
import { requireAuthor } from "../queries/require-author";
import { questionImagesBucket } from "../storage";

// Turning a database refusal into a sentence. The triggers raise their own
// readable messages (a sub-question in the wrong section, a stimulus changed
// into a question); a raw constraint violation is not readable, so it gets the
// general sentence instead.
function describeSaveError(error: { code?: string; message?: string }): string {
  if (error.code === "P0002") return "That question no longer exists, or you cannot edit it.";
  if (error.code === "42501") return "You do not have permission to save questions here.";
  const message = error.message ?? "";
  if (error.code === "23514" && !/violates check constraint/.test(message)) {
    return message.charAt(0).toUpperCase() + message.slice(1) + ".";
  }
  return "The question could not be saved. Check every field and try again.";
}

export async function saveQuestionAction(
  _state: QuestionEditorState,
  formData: FormData,
): Promise<QuestionEditorState> {
  // Re-checked here, not inherited from the page: a Server Action is a public
  // endpoint any signed-in session can post to.
  const profile = await requireAuthor();
  const base = questionBankBase(profile.role);

  const { draft, questionId } = readQuestionForm(formData);
  const values = draftToFormValues(draft);
  const { problems, question } = validateQuestion(draft, profile.orgId);
  if (!question) return { problems, values };

  const supabase = await createServerSupabaseClient();

  // What the question carries now, read before the save so the images it drops
  // can be deleted after. Storage is not covered by the row policies and an
  // orphaned object is invisible: nothing lists it, and it counts against the
  // 1GB Free-plan budget until someone goes looking in the dashboard.
  const previousImages = questionId === null
    ? []
    : ((await supabase.from("questions").select("images").eq("id", questionId).maybeSingle()).data?.images ?? []);

  const { data, error } = await supabase.rpc("save_question", toSaveQuestionArgs(question, questionId));

  if (error) return { problems: [describeSaveError(error)], values };

  const savedId = typeof data === "number" ? data : Number(data);
  if (!Number.isSafeInteger(savedId) || savedId <= 0) {
    return { problems: ["The question could not be saved. Nothing was changed."], values };
  }

  // Deleted only once the row that referenced them is saved, so a failed save
  // leaves every image where the question still expects it. A failure to delete
  // is not worth failing the save over: the question is correct either way.
  const dropped = (Array.isArray(previousImages) ? previousImages : [])
    .filter((path): path is string => typeof path === "string")
    .filter((path) => !question.images.includes(path));
  if (dropped.length > 0) await supabase.storage.from(questionImagesBucket).remove(dropped);

  // An edited key, option set or marks value has cleared the scores it affects
  // (the rescore trigger, in the same transaction as the save). Recompute them
  // once this response has gone, so the admin is not kept waiting.
  if (questionId !== null) after(() => rescoreAwaiting(profile.orgId));

  revalidatePath(base);
  // A new sub-question goes back to its set, where it is read in context.
  redirect(buildQuestionHref(base, question.parentId && questionId === null ? question.parentId : savedId, "saved"));
}

export async function setQuestionArchivedAction(formData: FormData): Promise<void> {
  const profile = await requireAuthor();
  const base = questionBankBase(profile.role);

  const questionId = parseId(formData.get("questionId"));
  const archive = formData.get("archive") === "1";
  if (questionId === null) redirect(base);

  const supabase = await createServerSupabaseClient();
  const archivedAt = archive ? new Date().toISOString() : null;

  // Rows counted, not errors: a policy that filters the update to nothing
  // reports success.
  const { data, error } = await supabase
    .from("questions")
    .update({ archived_at: archivedAt })
    .eq("id", questionId)
    .select("id, type");

  if (error || !data || data.length !== 1) redirect(`${base}/${questionId}?error=archive-failed`);

  // A set is archived or restored whole: a sub-question on its own, without the
  // passage it refers to, cannot be answered.
  if (data[0].type === "di_stimulus") {
    const { error: childError } = await supabase
      .from("questions")
      .update({ archived_at: archivedAt })
      .eq("parent_id", questionId);
    if (childError) redirect(`${base}/${questionId}?error=archive-failed`);
  }

  revalidatePath(base);
  redirect(buildQuestionHref(base, questionId, archive ? "archived" : "restored"));
}
