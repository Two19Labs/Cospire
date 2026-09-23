import "server-only";

import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { mockPageSize } from "../mock-form";

export interface MockSummary {
  id: number;
  title: string;
  durationMinutes: number;
  maxAttempts: number;
  allowMobile: boolean;
  proctoringEnabled: boolean;
  sectionCount: number;
  questionCount: number;
}

export interface MockEditorValue {
  id: number;
  title: string;
  instructions: string;
  durationMinutes: number;
  negativeMarking: string;
  negativeMarkingTypes: string[];
  maxAttempts: number;
  allowMobile: boolean;
  proctoringEnabled: boolean;
  sections: Array<{ id: number; title: string; durationMinutes: number | null; questionIds: number[] }>;
}

// PostgREST returns a many-to-one embed as an object, not a one-element array:
// `questions.section_id` points at one section. Reading it as an array left the
// picker's section column permanently "-". Both shapes are handled because the
// generated types describe the relationship, not the runtime payload, and one
// wrong guess here is silent.
function embeddedName(value: unknown): string {
  const row = Array.isArray(value) ? value[0] : value;
  const name = (row as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" && name.length > 0 ? name : "—";
}

export interface PickerQuestion {
  id: number;
  body: string;
  type: "mcq" | "mcq_multi" | "numerical" | "di_stimulus";
  topic: string;
  difficulty: string;
  marks: string;
  sectionName: string;
  childCount: number;
  // A DI stimulus with no sub-questions cannot go into a mock, and a question
  // archived after it was picked has to be removable from the one screen that
  // shows it. Both are offered, and both are refused selection.
  selectable: boolean;
  unselectableReason: string | null;
  archived: boolean;
}

function toPickerQuestion(
  row: { id: number; body: string; type: PickerQuestion["type"]; topic: string; difficulty: string; marks: number | string; question_sections: unknown; archived_at?: string | null },
  childCount: number,
): PickerQuestion {
  const archived = Boolean(row.archived_at);
  const childless = row.type === "di_stimulus" && childCount === 0;
  return {
    id: row.id,
    body: row.body,
    type: row.type,
    topic: row.topic,
    difficulty: row.difficulty,
    marks: String(row.marks),
    sectionName: embeddedName(row.question_sections),
    childCount,
    selectable: !archived && !childless,
    unselectableReason: archived ? "Archived" : childless ? "DI set with no sub-questions yet" : null,
    archived,
  };
}

async function countChildren(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  stimulusIds: number[],
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (stimulusIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("questions")
    .select("parent_id")
    .in("parent_id", stimulusIds)
    .is("archived_at", null);
  if (error) throw error;
  for (const child of data ?? []) {
    if (child.parent_id !== null) counts.set(child.parent_id, (counts.get(child.parent_id) ?? 0) + 1);
  }
  return counts;
}

export async function listMocks(page: number): Promise<{ rows: MockSummary[]; page: number; pageCount: number }> {
  await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * 25;
  const { data, error, count } = await supabase
    .from("mocks")
    .select("id,title,duration_minutes,max_attempts,allow_mobile,proctoring_enabled,mock_sections(id,mock_questions(question_id))", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, from + 24);
  if (error) throw error;
  return { rows: (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    durationMinutes: row.duration_minutes,
    maxAttempts: row.max_attempts,
    allowMobile: row.allow_mobile,
    proctoringEnabled: row.proctoring_enabled,
    sectionCount: row.mock_sections.length,
    questionCount: row.mock_sections.reduce((total, section) => total + section.mock_questions.length, 0),
  })), page, pageCount: Math.max(1, Math.ceil((count ?? 0) / 25)) };
}

export async function getMock(mockId: number): Promise<MockEditorValue> {
  await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("mocks")
    .select("id,title,instructions,duration_minutes,negative_marking,negative_marking_types,max_attempts,allow_mobile,proctoring_enabled,mock_sections(id,title,duration_minutes,sort_order,mock_questions(question_id,sort_order,questions(parent_id)))")
    .eq("id", mockId)
    .order("sort_order", { referencedTable: "mock_sections", ascending: true })
    .single();
  if (error || !data) notFound();
  return {
    id: data.id,
    title: data.title,
    instructions: data.instructions,
    durationMinutes: data.duration_minutes,
    negativeMarking: String(data.negative_marking),
    negativeMarkingTypes: data.negative_marking_types,
    maxAttempts: data.max_attempts,
    allowMobile: data.allow_mobile,
    proctoringEnabled: data.proctoring_enabled,
    sections: data.mock_sections.map((section) => ({
      id: section.id,
      title: section.title,
      durationMinutes: section.duration_minutes,
      questionIds: [...section.mock_questions]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((question) => question.questions?.parent_id === null)
        .map((question) => question.question_id),
    })),
  };
}

export async function listPickerQuestions(page: number): Promise<{ rows: PickerQuestion[]; page: number; pageCount: number }> {
  await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * mockPageSize;
  const { data, error, count } = await supabase
    .from("questions")
    .select("id,body,type,topic,difficulty,marks,question_sections(name)", { count: "exact" })
    .is("parent_id", null)
    .is("archived_at", null)
    .order("id", { ascending: false })
    .range(from, from + mockPageSize - 1);
  if (error) throw error;
  const roots = data ?? [];
  const childCounts = await countChildren(supabase, roots.filter((row) => row.type === "di_stimulus").map((row) => row.id));
  // Childless DI sets are shown and refused rather than filtered out. Filtering
  // happened after `.range()` had already paged, so `pageCount` counted rows the
  // page then dropped and pages came up short.
  return {
    rows: roots.map((row) => toPickerQuestion(row, childCounts.get(row.id) ?? 0)),
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / mockPageSize)),
  };
}

// The questions already in this mock that the current picker page does not
// show, including archived ones. They are rendered as ordinary rows so a
// selection can be removed from the screen that refuses it; as hidden inputs
// they were re-posted on every save and an archived one locked the mock.
export async function listSelectedQuestions(ids: number[]): Promise<PickerQuestion[]> {
  if (ids.length === 0) return [];
  await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id,body,type,topic,difficulty,marks,archived_at,question_sections(name)")
    .in("id", ids)
    .is("parent_id", null)
    .order("id", { ascending: false });
  if (error) throw error;
  const roots = data ?? [];
  const childCounts = await countChildren(supabase, roots.filter((row) => row.type === "di_stimulus").map((row) => row.id));
  return roots.map((row) => toPickerQuestion(row, childCounts.get(row.id) ?? 0));
}
