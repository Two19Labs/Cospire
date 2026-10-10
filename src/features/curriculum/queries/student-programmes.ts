import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  completionPercent,
  isItemComplete,
  type CurriculumItemType,
  type ProgressInput,
} from "../curriculum";
import { getCurriculum, type CurriculumSection } from "./get-curriculum";

export interface StudentProgramme {
  id: number;
  title: string;
}

// A programme in a list, with how far through it this student is.
export interface StudentProgrammeRow extends StudentProgramme {
  complete: number;
  percent: number;
  total: number;
}

export const studentProgrammesPageSize = 25;

interface EmbeddedItem {
  id: number;
  ref_id: number | null;
  type: CurriculumItemType;
}

// This student's progress rows and submitted attempts, read once for a whole
// page of programmes. Their own rows only, so small and bounded.
async function readProgress(studentId: string): Promise<ProgressInput> {
  const supabase = await createServerSupabaseClient();
  const [stored, attempts] = await Promise.all([
    supabase.from("item_progress").select("item_id, completed").eq("student_id", studentId).limit(5000),
    supabase.from("attempts").select("mock_id").eq("student_id", studentId).eq("status", "submitted").limit(5000),
  ]);
  if (stored.error) throw new Error(`Unable to load progress: ${stored.error.message}`);
  if (attempts.error) throw new Error(`Unable to load attempts: ${attempts.error.message}`);
  return {
    stored: new Map((stored.data ?? []).map((row) => [row.item_id as number, row.completed === true])),
    submittedMocks: new Set((attempts.data ?? []).map((row) => row.mock_id as number)),
  };
}

// The programmes this student holds, with progress, in one round trip of
// three parallel reads: the courses with their items embedded, and the
// student's progress. `courses_select_authorized` returns only granted
// courses; `kind` is filtered because an ARS process is a course too.
export async function listStudentProgrammes(
  page: number,
  studentId: string,
  pageSize = studentProgrammesPageSize,
): Promise<{
  page: number;
  pageCount: number;
  rows: StudentProgrammeRow[];
}> {
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * pageSize;
  const [result, progress] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, sections(curriculum_items(id, type, ref_id))", { count: "exact" })
      .eq("kind", "programme")
      .order("sort_order")
      .order("id")
      .range(from, from + pageSize - 1),
    readProgress(studentId),
  ]);
  const { count, data, error } = result;
  if (error) throw new Error(`Unable to list programmes: ${error.message}`);
  return {
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    rows: (data ?? []).map((row) => {
      const items = ((row.sections ?? []) as { curriculum_items: EmbeddedItem[] | null }[]).flatMap(
        (section) => section.curriculum_items ?? [],
      );
      const complete = items.filter((item) =>
        isItemComplete({ id: item.id, refId: item.ref_id, type: item.type }, progress),
      ).length;
      return {
        complete,
        id: row.id as number,
        percent: completionPercent(complete, items.length),
        title: row.title as string,
        total: items.length,
      };
    }),
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
  // Everything at once rather than in turn. The curriculum, the student's
  // stored progress and their submitted attempts do not depend on the course
  // row; RLS hides a programme the student does not hold from every one of
  // these reads, and the course row still decides whether the page exists.
  // The progress and attempt reads are this student's own rows across the
  // platform, filtered to this programme's items below -- small, and bounded.
  const [courseResult, sections, progress] = await Promise.all([
    supabase.from("courses").select("id, title").eq("id", courseId).eq("kind", "programme").maybeSingle(),
    getCurriculum(courseId),
    readProgress(studentId),
  ]);
  if (courseResult.error) throw new Error(`Unable to load the programme: ${courseResult.error.message}`);
  const course = courseResult.data;
  if (!course) return null;

  // Progress rows belong to items and tests by id, so rows from the student's
  // other programmes simply match nothing here. A test is complete once the
  // student has submitted an attempt on it.
  const items = sections.flatMap((section) => section.items);
  const complete = new Set(items.filter((item) => isItemComplete(item, progress)).map((item) => item.id));

  return {
    complete,
    percent: completionPercent(complete.size, items.length),
    programme: { id: course.id as number, title: course.title as string },
    sections,
  };
}
