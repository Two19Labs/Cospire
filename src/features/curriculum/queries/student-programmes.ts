import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  completionPercent,
  isItemComplete,
  progressByCourse,
  summariseProgress,
  uniqueItems,
  type CurriculumItemType,
  type ProgressInput,
} from "../curriculum";
import { getCurriculum, loadItemTitles, type CurriculumSection } from "./get-curriculum";

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
// page of programmes and split by the programme each was made in. Their own
// rows only, so small and bounded.
async function readProgress(studentId: string): Promise<(courseId: number) => ProgressInput> {
  const supabase = await createServerSupabaseClient();
  const [stored, attempts] = await Promise.all([
    supabase.from("item_progress").select("item_id, course_id, completed").eq("student_id", studentId).limit(5000),
    supabase
      .from("attempts")
      .select("mock_id, course_id")
      .eq("student_id", studentId)
      .eq("status", "submitted")
      .not("course_id", "is", null)
      .limit(5000),
  ]);
  if (stored.error) throw new Error(`Unable to load progress: ${stored.error.message}`);
  if (attempts.error) throw new Error(`Unable to load attempts: ${attempts.error.message}`);
  return progressByCourse(stored.data ?? [], attempts.data ?? []);
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
      .select("id, title, sections(curriculum_items(id, type, ref_id), section_modules(modules(curriculum_items(id, type, ref_id))))", { count: "exact" })
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
      const sections = (row.sections ?? []) as unknown as {
        curriculum_items: EmbeddedItem[] | null;
        section_modules: { modules: { curriculum_items: EmbeddedItem[] | null } | null }[] | null;
      }[];
      // Subject items plus every attached module's items, each counted once.
      const items = sections
        .flatMap((section) => [
          ...(section.curriculum_items ?? []),
          ...(section.section_modules ?? []).flatMap((link) => link.modules?.curriculum_items ?? []),
        ])
        .map((item) => ({ id: item.id, refId: item.ref_id, type: item.type }));
      const { complete, percent, total } = summariseProgress(items, progress(row.id as number));
      return { complete, id: row.id as number, percent, title: row.title as string, total };
    }),
  };
}

// An item inside a module. The title is null for a document, test or video
// (read from its library row on the module page) and set for a reading.
export interface ModuleItem {
  body: string | null;
  id: number;
  refId: number | null;
  sortOrder: number;
  title: string | null;
  type: CurriculumItemType;
}

export interface StudentModule {
  complete: number;
  id: number;
  items: ModuleItem[];
  percent: number;
  title: string;
  total: number;
}

export interface ProgrammeView {
  complete: Set<number>;
  // Attached modules per subject (section id), in order, with this programme's progress.
  modules: Map<number, StudentModule[]>;
  percent: number;
  programme: StudentProgramme;
  sections: CurriculumSection[];
  total: number;
}

interface ModuleRow {
  curriculum_items: { body: string | null; id: number; ref_id: number | null; sort_order: number; title: string | null; type: CurriculumItemType }[] | null;
  id: number;
  title: string;
}

function toModuleItems(rows: ModuleRow["curriculum_items"]): ModuleItem[] {
  return (rows ?? [])
    .map((row) => ({ body: row.body, id: row.id, refId: row.ref_id, sortOrder: row.sort_order, title: row.title, type: row.type }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

type Client = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const moduleSelect = "modules(id, title, curriculum_items(id, type, ref_id, title, body, sort_order))";

// One programme for the signed-in student, with progress. Null when the
// student does not hold it (RLS hides the course row).
export async function getStudentProgramme(
  courseId: number,
  studentId: string,
): Promise<ProgrammeView | null> {
  const supabase = await createServerSupabaseClient();
  // Everything at once rather than in turn. RLS hides a programme the student
  // does not hold from every one of these reads, and the course row still
  // decides whether the page exists. The progress and attempt reads are this
  // student's own rows across the platform -- small, and bounded.
  const [courseResult, sections, progressFor, links] = await Promise.all([
    supabase.from("courses").select("id, title").eq("id", courseId).eq("kind", "programme").maybeSingle(),
    getCurriculum(courseId),
    readProgress(studentId),
    supabase
      .from("section_modules")
      .select(`section_id, module_id, sort_order, ${moduleSelect}, sections!inner(course_id)`)
      .eq("sections.course_id", courseId)
      .order("sort_order")
      .order("module_id")
      .limit(2000),
  ]);
  if (courseResult.error) throw new Error(`Unable to load the programme: ${courseResult.error.message}`);
  if (links.error) throw new Error(`Unable to load the modules: ${links.error.message}`);
  const course = courseResult.data;
  if (!course) return null;

  // Only rows and attempts made in this programme count: a shared module's
  // item done in another programme is not done here. A test is complete once
  // the student has submitted an attempt on it from this programme.
  const progress = progressFor(courseId);
  const modules = new Map<number, StudentModule[]>();
  for (const link of (links.data ?? []) as unknown as { module_id: number; modules: ModuleRow | null; section_id: number }[]) {
    if (!link.modules) continue;
    const items = toModuleItems(link.modules.curriculum_items);
    const list = modules.get(link.section_id) ?? [];
    list.push({ ...summariseProgress(items, progress), id: link.modules.id, items, title: link.modules.title });
    modules.set(link.section_id, list);
  }

  const items = uniqueItems([
    ...sections.flatMap((section) => section.items),
    ...[...modules.values()].flat().flatMap((module) => module.items),
  ]);
  const complete = new Set(items.filter((item) => isItemComplete(item, progress)).map((item) => item.id));

  return {
    complete,
    modules,
    percent: completionPercent(complete.size, items.length),
    programme: { id: course.id as number, title: course.title as string },
    sections,
    total: items.length,
  };
}

export interface ModuleView {
  complete: Set<number>;
  items: (ModuleItem & { title: string })[];
  module: { id: number; title: string };
  percent: number;
  programme: StudentProgramme;
  total: number;
}

// One module as seen from one programme. Null unless the module is attached to
// a subject of this programme and RLS lets the student see it.
export async function getStudentModule(
  courseId: number,
  moduleId: number,
  studentId: string,
  client?: Client,
): Promise<ModuleView | null> {
  const supabase = client ?? (await createServerSupabaseClient());
  const [course, link, progressFor] = await Promise.all([
    supabase.from("courses").select("id, title").eq("id", courseId).eq("kind", "programme").maybeSingle(),
    supabase
      .from("section_modules")
      .select(`${moduleSelect}, sections!inner(course_id)`)
      .eq("module_id", moduleId)
      .eq("sections.course_id", courseId)
      .limit(1),
    readProgress(studentId),
  ]);
  if (course.error) throw new Error(`Unable to load the programme: ${course.error.message}`);
  if (link.error) throw new Error(`Unable to load the module: ${link.error.message}`);
  const mod = ((link.data ?? [])[0] as unknown as { modules: ModuleRow | null } | undefined)?.modules;
  if (!course.data || !mod) return null;

  const rows = toModuleItems(mod.curriculum_items);
  const titles = await loadItemTitles(supabase, rows.map((row) => ({ ref_id: row.refId, type: row.type })));
  const items = rows.map((row) => ({ ...row, title: row.title ?? titles.get(`${row.type}:${row.refId}`) ?? "Unavailable" }));
  const progress = progressFor(courseId);
  const { percent, total } = summariseProgress(items, progress);
  return {
    complete: new Set(items.filter((item) => isItemComplete(item, progress)).map((item) => item.id)),
    items,
    module: { id: mod.id, title: mod.title },
    percent,
    programme: { id: course.data.id as number, title: course.data.title as string },
    total,
  };
}
