import "server-only";

import { questionImagesBucket, questionImageUrlTtlSeconds } from "@/features/question-bank/storage";
import type { QuestionType } from "@/features/question-bank/question-input";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildItems, type EnteredSection, type PaperItem, type PaperSection, type PlacedQuestion } from "../paper";
import type { AttemptSummary } from "./student-mocks";

export interface PaperQuestion {
  body: string;
  id: number;
  imageUrls: string[];
  marks: number;
  options: { id: string; text: string }[];
  type: QuestionType;
}

export interface Response {
  answer: unknown;
  isCorrect: boolean | null;
  marksAwarded: number | null;
  markedForReview: boolean;
}

export interface AttemptView {
  attempt: AttemptSummary & { mockId: number };
  entered: EnteredSection[];
  items: PaperItem[];
  mock: { durationMinutes: number; negativeMarking: number; negativeMarkingTypes: string[]; title: string };
  questions: Map<number, PaperQuestion>;
  responses: Map<number, Response>;
  sections: PaperSection[];
}

function readOptions(raw: unknown): { id: string; text: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) =>
    entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.text === "string"
      ? [{ id: entry.id, text: entry.text }]
      : [],
  );
}

function readImagePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object" && typeof entry.path === "string") return [entry.path];
    return [];
  });
}

// Everything one attempt screen needs, read through the student's own session:
// RLS returns the attempt only to its owner and the paper's questions only
// while they have an attempt on it. Null when either is refused.
//
// Question images are the one read that is not the student's. The image bucket
// has no student policy, so after RLS has returned the question -- which is the
// proof the student may see it -- its images are signed with the server key for
// ten minutes. The key never leaves the server.
export async function getAttemptView(attemptId: number): Promise<AttemptView | null> {
  const supabase = await createServerSupabaseClient();

  const { data: attempt, error } = await supabase
    .from("attempts")
    .select("id, mock_id, proctored, score, started_at, status, submitted_at, submitted_by")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`Unable to read the attempt: ${error.message}`);
  if (!attempt) return null;

  const [mockResult, sectionResult, placedResult, enteredResult, responseResult] = await Promise.all([
    supabase
      .from("mocks")
      .select("title, duration_minutes, negative_marking, negative_marking_types")
      .eq("id", attempt.mock_id)
      .maybeSingle(),
    supabase.from("mock_sections").select("id, title, duration_minutes, sort_order").eq("mock_id", attempt.mock_id),
    supabase
      .from("mock_questions")
      .select("question_id, mock_section_id, sort_order")
      .eq("mock_id", attempt.mock_id)
      .order("sort_order"),
    supabase.from("attempt_sections").select("mock_section_id, started_at, submitted_at").eq("attempt_id", attemptId),
    supabase
      .from("attempt_responses")
      .select("question_id, answer, marked_for_review, is_correct, marks_awarded")
      .eq("attempt_id", attemptId),
  ]);
  for (const result of [mockResult, sectionResult, placedResult, enteredResult, responseResult]) {
    if (result.error) throw new Error(`Unable to read the paper: ${result.error.message}`);
  }
  if (!mockResult.data) return null;

  const topIds = (placedResult.data ?? []).map((row) => row.question_id);
  const questionColumns = "id, parent_id, type, body, options, images, marks, archived_at";
  const [topResult, childResult] = topIds.length
    ? await Promise.all([
        supabase.from("questions").select(questionColumns).in("id", topIds),
        supabase.from("questions").select(questionColumns).in("parent_id", topIds).is("archived_at", null).order("id"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (topResult.error) throw new Error(`Unable to read questions: ${topResult.error.message}`);
  if (childResult.error) throw new Error(`Unable to read questions: ${childResult.error.message}`);

  // The builder places a DI set as its passage *and* each sub-question, so a
  // question can arrive through both reads. One row per question.
  const rows = [...new Map([...(topResult.data ?? []), ...(childResult.data ?? [])].map((row) => [row.id, row])).values()];
  const parentOf = new Map(rows.map((row) => [row.id, row.parent_id]));
  const placedIds = new Set(topIds);
  const allPaths = rows.flatMap((row) => readImagePaths(row.images));
  const signed = new Map<string, string>();
  if (allPaths.length) {
    const { data } = await createAdminSupabaseClient()
      .storage.from(questionImagesBucket)
      .createSignedUrls(allPaths, questionImageUrlTtlSeconds);
    for (const entry of data ?? []) if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }

  const questions = new Map<number, PaperQuestion>();
  for (const row of rows) {
    questions.set(row.id, {
      body: row.body,
      id: row.id,
      imageUrls: readImagePaths(row.images).flatMap((path) => signed.get(path) ?? []),
      marks: row.marks,
      options: readOptions(row.options),
      type: row.type as QuestionType,
    });
  }

  const sections: PaperSection[] = (sectionResult.data ?? []).map((row) => ({
    durationMinutes: row.duration_minutes,
    id: row.id,
    sortOrder: row.sort_order,
    title: row.title,
  }));
  // Only top-level rows lay out the paper; a sub-question placed alongside its
  // passage is reached through the passage, not listed a second time.
  const topLevel = (placedResult.data ?? []).filter((row) => {
    const parent = parentOf.get(row.question_id);
    return parent === null || parent === undefined || !placedIds.has(parent);
  });
  const placed: PlacedQuestion[] = topLevel.map((row) => ({
    childIds: (childResult.data ?? []).filter((child) => child.parent_id === row.question_id).map((child) => child.id),
    isStimulus: questions.get(row.question_id)?.type === "di_stimulus",
    questionId: row.question_id,
    sectionId: row.mock_section_id,
  }));

  return {
    attempt: {
      id: attempt.id,
      mockId: attempt.mock_id,
      proctored: attempt.proctored,
      score: attempt.score,
      startedAt: attempt.started_at,
      status: attempt.status === "submitted" ? "submitted" : "in_progress",
      submittedAt: attempt.submitted_at,
      submittedBy: attempt.submitted_by,
    },
    entered: (enteredResult.data ?? []).map((row) => ({
      sectionId: row.mock_section_id,
      startedAt: new Date(row.started_at),
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
    })),
    items: buildItems(sections, placed),
    mock: {
      durationMinutes: mockResult.data.duration_minutes,
      negativeMarking: mockResult.data.negative_marking,
      negativeMarkingTypes: mockResult.data.negative_marking_types,
      title: mockResult.data.title,
    },
    questions,
    responses: new Map(
      (responseResult.data ?? []).map((row) => [
        row.question_id,
        { answer: row.answer, isCorrect: row.is_correct, markedForReview: row.marked_for_review, marksAwarded: row.marks_awarded },
      ]),
    ),
    sections,
  };
}
