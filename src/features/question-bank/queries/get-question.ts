import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { storedToFormValues, type QuestionFormValues } from "../question-form";
import type { QuestionType } from "../question-input";
import { questionImagesBucket, questionImageUrlTtlSeconds } from "../storage";

export interface QuestionSummary {
  archived: boolean;
  body: string;
  id: number;
  marks: number;
  type: QuestionType;
}

export interface QuestionForEditing {
  archived: boolean;
  children: QuestionSummary[];
  id: number;
  imageUrls: Record<string, string>;
  parent: { body: string; id: number; sectionId: number } | null;
  type: QuestionType;
  values: QuestionFormValues;
}

// Signed with the author's own session, not the secret key: the
// `question_images_select_author` Storage policy lets an author read their
// organisation's images, so signing through RLS proves that policy rather than
// stepping round it.
export async function signQuestionImages(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from(questionImagesBucket)
    .createSignedUrls(paths, questionImageUrlTtlSeconds);
  if (error) return {};
  const urls: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}

// Returns null when the question does not exist or the caller cannot see it;
// the two are deliberately indistinguishable.
export async function getQuestion(questionId: number): Promise<QuestionForEditing | null> {
  const supabase = await createServerSupabaseClient();

  const [questionResult, keyResult, childResult] = await Promise.all([
    supabase
      .from("questions")
      .select("id, parent_id, type, body, options, images, section_id, topic, difficulty, marks, archived_at")
      .eq("id", questionId)
      .maybeSingle(),
    supabase.from("question_keys").select("correct_answer, solution").eq("question_id", questionId).maybeSingle(),
    supabase
      .from("questions")
      .select("id, type, body, marks, archived_at")
      .eq("parent_id", questionId)
      .order("id", { ascending: true })
      .limit(50),
  ]);

  if (questionResult.error) throw new Error(`Unable to read the question: ${questionResult.error.message}`);
  if (keyResult.error) throw new Error(`Unable to read the answer key: ${keyResult.error.message}`);
  if (childResult.error) throw new Error(`Unable to read the sub-questions: ${childResult.error.message}`);

  const row = questionResult.data;
  if (!row) return null;

  let parent: QuestionForEditing["parent"] = null;
  if (row.parent_id !== null) {
    const { data: parentRow, error } = await supabase
      .from("questions")
      .select("id, body, section_id")
      .eq("id", row.parent_id)
      .maybeSingle();
    if (error) throw new Error(`Unable to read the DI set: ${error.message}`);
    if (parentRow) {
      parent = { body: String(parentRow.body), id: Number(parentRow.id), sectionId: Number(parentRow.section_id) };
    }
  }

  const values = storedToFormValues({
    body: String(row.body),
    correctAnswer: keyResult.data?.correct_answer ?? null,
    difficulty: String(row.difficulty),
    images: row.images,
    marks: Number(row.marks),
    options: row.options,
    sectionId: Number(row.section_id),
    solution: keyResult.data?.solution ?? null,
    topic: String(row.topic),
  });

  return {
    archived: row.archived_at !== null,
    children: (childResult.data ?? []).map((child) => ({
      archived: child.archived_at !== null,
      body: String(child.body),
      id: Number(child.id),
      marks: Number(child.marks),
      type: child.type as QuestionType,
    })),
    id: Number(row.id),
    imageUrls: await signQuestionImages(values.images),
    parent,
    type: row.type as QuestionType,
    values,
  };
}

// For a new sub-question: the set it will join, so the editor can show the
// passage and lock the section to the set's.
export async function getParentSet(parentId: number): Promise<QuestionForEditing["parent"]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id, body, section_id, type")
    .eq("id", parentId)
    .maybeSingle();
  if (error) throw new Error(`Unable to read the DI set: ${error.message}`);
  if (!data || data.type !== "di_stimulus") return null;
  return { body: String(data.body), id: Number(data.id), sectionId: Number(data.section_id) };
}
