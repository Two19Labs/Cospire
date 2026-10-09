import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  completionPercent,
  isItemComplete,
  type ProgressInput,
} from "../curriculum";
import { getCurriculum, type CurriculumSection } from "./get-curriculum";

export interface StudentProgramme {
  id: number;
  title: string;
}

export const studentProgrammesPageSize = 25;

// The programmes this student holds. `courses_select_authorized` returns only
// granted courses; `kind` is filtered because an ARS process is a course too.
export async function listStudentProgrammes(page: number): Promise<{
  page: number;
  pageCount: number;
  rows: StudentProgramme[];
}> {
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * studentProgrammesPageSize;
  const { count, data, error } = await supabase
    .from("courses")
    .select("id, title", { count: "exact" })
    .eq("kind", "programme")
    .order("sort_order")
    .order("id")
    .range(from, from + studentProgrammesPageSize - 1);
  if (error) throw new Error(`Unable to list programmes: ${error.message}`);
  return {
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / studentProgrammesPageSize)),
    rows: (data ?? []).map((row) => ({ id: row.id as number, title: row.title as string })),
  };
}

export interface ProgrammeView {
  complete: Set<number>;
  percent: number;
  programme: StudentProgramme;
  sections: CurriculumSection[];
}

// One programme for the signed-in student, with progress. Null when the
// student does not hold it (RLS hides the course row).
export async function getStudentProgramme(
  courseId: number,
  studentId: string,
): Promise<ProgrammeView | null> {
  const supabase = await createServerSupabaseClient();
  const { data: course, error } = await supabase
    .from("courses")
    .select("id, title")
    .eq("id", courseId)
    .eq("kind", "programme")
    .maybeSingle();
  if (error) throw new Error(`Unable to load the programme: ${error.message}`);
  if (!course) return null;

  const sections = await getCurriculum(courseId);
  const items = sections.flatMap((section) => section.items);
  const itemIds = items.map((item) => item.id);
  const mockIds = items
    .filter((item) => item.type === "test" && item.refId !== null)
    .map((item) => item.refId as number);

  const progress: ProgressInput = { stored: new Map(), submittedMocks: new Set() };

  if (itemIds.length > 0) {
    const { data, error: progressError } = await supabase
      .from("item_progress")
      .select("item_id, completed")
      .eq("student_id", studentId)
      .in("item_id", itemIds);
    if (progressError) throw new Error(`Unable to load progress: ${progressError.message}`);
    for (const row of data ?? []) progress.stored.set(row.item_id as number, row.completed === true);
  }

  // A test is complete once the student has submitted an attempt on it.
  if (mockIds.length > 0) {
    const { data, error: attemptError } = await supabase
      .from("attempts")
      .select("mock_id")
      .eq("student_id", studentId)
      .eq("status", "submitted")
      .in("mock_id", mockIds);
    if (attemptError) throw new Error(`Unable to load attempts: ${attemptError.message}`);
    for (const row of data ?? []) progress.submittedMocks.add(row.mock_id as number);
  }

  const complete = new Set(items.filter((item) => isItemComplete(item, progress)).map((item) => item.id));

  return {
    complete,
    percent: completionPercent(complete.size, items.length),
    programme: { id: course.id as number, title: course.title as string },
    sections,
  };
}
