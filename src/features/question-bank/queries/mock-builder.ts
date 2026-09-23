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

export interface PickerQuestion {
  id: number;
  body: string;
  type: "mcq" | "mcq_multi" | "numerical" | "di_stimulus";
  topic: string;
  difficulty: string;
  marks: string;
  sectionName: string;
  childCount: number;
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
  const stimulusIds = roots.filter((row) => row.type === "di_stimulus").map((row) => row.id);
  const childCounts = new Map<number, number>();
  if (stimulusIds.length > 0) {
    const { data: children, error: childError } = await supabase
      .from("questions")
      .select("parent_id")
      .in("parent_id", stimulusIds)
      .is("archived_at", null);
    if (childError) throw childError;
    for (const child of children ?? []) {
      if (child.parent_id !== null) childCounts.set(child.parent_id, (childCounts.get(child.parent_id) ?? 0) + 1);
    }
  }
  const total = count ?? 0;
  return {
    rows: roots
      .filter((row) => row.type !== "di_stimulus" || (childCounts.get(row.id) ?? 0) > 0)
      .map((row) => ({
        id: row.id,
        body: row.body,
        type: row.type,
        topic: row.topic,
        difficulty: row.difficulty,
        marks: String(row.marks),
        sectionName: row.question_sections[0]?.name ?? "—",
        childCount: childCounts.get(row.id) ?? 0,
      })),
    page,
    pageCount: Math.max(1, Math.ceil(total / mockPageSize)),
  };
}
