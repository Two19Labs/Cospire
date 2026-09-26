import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { questionsPageSize, type QuestionFilters } from "../list-params";
import { parseQuestionRef } from "../question-id";
import type { Difficulty, QuestionType } from "../question-input";

export interface QuestionListRow {
  archived: boolean;
  body: string;
  childCount: number;
  difficulty: Difficulty;
  id: number;
  marks: number;
  sectionId: number;
  topic: string;
  type: QuestionType;
}

export interface QuestionListPage {
  page: number;
  pageCount: number;
  rows: QuestionListRow[];
  total: number;
}

// The bank's list. It shows standalone questions and DI sets; a set's
// sub-questions are reached through the set, where they are read in context.
//
// No organisation filter: `questions_select_author` scopes the rows, and
// writing the scope here too would be application code impersonating the
// access control.
export async function listQuestions(filters: QuestionFilters): Promise<QuestionListPage> {
  const supabase = await createServerSupabaseClient();
  const from = (filters.page - 1) * questionsPageSize;

  let query = supabase
    .from("questions")
    .select("id, type, body, topic, difficulty, marks, section_id, archived_at", { count: "exact" })
    .is("parent_id", null)
    .order("id", { ascending: false })
    .range(from, from + questionsPageSize - 1);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  // A search that is a question ID is a lookup, not a text match. `Q00042` never
  // appears in a question's body, so searching the text for it finds nothing and
  // reads as "that question is gone".
  const searchedId = parseQuestionRef(filters.search);
  if (searchedId !== null) query = query.eq("id", searchedId);
  else if (filters.search) query = query.ilike("body", `%${filters.search}%`);
  if (filters.sectionId) query = query.eq("section_id", filters.sectionId);
  if (filters.topic) query = query.eq("topic", filters.topic);
  if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
  if (filters.type) query = query.eq("type", filters.type);

  const { count, data, error } = await query;
  if (error) throw new Error(`Unable to list questions: ${error.message}`);

  const rows: QuestionListRow[] = (data ?? []).map((row) => ({
    archived: row.archived_at !== null,
    body: String(row.body),
    childCount: 0,
    difficulty: row.difficulty as Difficulty,
    id: Number(row.id),
    marks: Number(row.marks),
    sectionId: Number(row.section_id),
    topic: String(row.topic),
    type: row.type as QuestionType,
  }));

  // Sub-question counts for the sets on this page only, so the query is
  // bounded by the page size rather than by the bank.
  const setIds = rows.filter((row) => row.type === "di_stimulus").map((row) => row.id);
  if (setIds.length > 0) {
    const { data: children, error: childError } = await supabase
      .from("questions")
      .select("parent_id")
      .in("parent_id", setIds)
      .is("archived_at", null)
      .limit(setIds.length * 50);
    if (childError) throw new Error(`Unable to count sub-questions: ${childError.message}`);
    for (const child of children ?? []) {
      const parent = rows.find((row) => row.id === Number(child.parent_id));
      if (parent) parent.childCount += 1;
    }
  }

  const total = count ?? rows.length;
  return {
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / questionsPageSize)),
    rows,
    total,
  };
}

// The IDs behind the current filter, for the "copy IDs" box on the bank -- the
// whole filtered set, not just the page, because "every hard DILR question" is
// the list an admin wants to paste into a mock document.
//
// Bounded, and honest about the bound. An unbounded id query is the screen that
// is fine at 500 questions and dies at 50,000, which operating manual §8
// forbids; silently returning the first 2,000 without saying so would build a
// mock that quietly missed the rest.
export const questionIdCopyLimit = 2000;

export async function listQuestionIds(
  filters: QuestionFilters,
): Promise<{ ids: number[]; truncated: boolean }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("questions")
    .select("id")
    .is("parent_id", null)
    .order("id", { ascending: true })
    .limit(questionIdCopyLimit + 1);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const searchedId = parseQuestionRef(filters.search);
  if (searchedId !== null) query = query.eq("id", searchedId);
  else if (filters.search) query = query.ilike("body", `%${filters.search}%`);
  if (filters.sectionId) query = query.eq("section_id", filters.sectionId);
  if (filters.topic) query = query.eq("topic", filters.topic);
  if (filters.difficulty) query = query.eq("difficulty", filters.difficulty);
  if (filters.type) query = query.eq("type", filters.type);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to list question IDs: ${error.message}`);
  const ids = (data ?? []).map((row) => Number(row.id));
  return { ids: ids.slice(0, questionIdCopyLimit), truncated: ids.length > questionIdCopyLimit };
}
