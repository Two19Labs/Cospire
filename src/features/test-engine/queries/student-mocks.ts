import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { pageCourse, resolveAttemptCourse, type AttemptCourse } from "../attempt-course";
import type { PaperSection } from "../paper";

export interface AttemptSummary {
  courseId: number | null;
  id: number;
  proctored: boolean;
  score: number | null;
  startedAt: string;
  status: "in_progress" | "submitted";
  submittedAt: string | null;
  submittedBy: string | null;
}

export interface StudentMock {
  allowMobile: boolean;
  attempts: AttemptSummary[];
  durationMinutes: number;
  id: number;
  instructions: string;
  maxAttempts: number;
  negativeMarking: number;
  negativeMarkingTypes: string[];
  proctoringEnabled: boolean;
  sections: PaperSection[];
  title: string;
}

const mockColumns =
  "id, title, instructions, duration_minutes, negative_marking, negative_marking_types, max_attempts, allow_mobile, proctoring_enabled";

function toAttempt(row: {
  course_id: number | null; id: number; proctored: boolean; score: number | null; started_at: string; status: string;
  submitted_at: string | null; submitted_by: string | null;
}): AttemptSummary {
  return {
    courseId: row.course_id,
    id: row.id,
    proctored: row.proctored,
    score: row.score,
    startedAt: row.started_at,
    status: row.status === "submitted" ? "submitted" : "in_progress",
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
  };
}

// The mocks this student may sit. RLS returns only granted ones
// (`mocks_select_student`), so nothing here filters by grant.
export async function listStudentMocks(): Promise<StudentMock[]> {
  const supabase = await createServerSupabaseClient();
  // Both at once: RLS returns a student only their own attempts, so the
  // attempt read needs no mock ids and need not wait for the mock list.
  const [mockResult, attemptResult] = await Promise.all([
    supabase.from("mocks").select(mockColumns).order("created_at", { ascending: false }).limit(100),
    supabase
      .from("attempts")
      .select("id, mock_id, course_id, proctored, score, started_at, status, submitted_at, submitted_by")
      .order("started_at", { ascending: false })
      .limit(1000),
  ]);
  const { data: mocks, error } = mockResult;
  if (error) throw new Error(`Unable to list mocks: ${error.message}`);
  const { data: attempts, error: attemptError } = attemptResult;
  if (attemptError) throw new Error(`Unable to list attempts: ${attemptError.message}`);

  return (mocks ?? []).map((mock) => ({
    allowMobile: mock.allow_mobile,
    attempts: (attempts ?? []).filter((row) => row.mock_id === mock.id).map(toAttempt),
    durationMinutes: mock.duration_minutes,
    id: mock.id,
    instructions: mock.instructions,
    maxAttempts: mock.max_attempts,
    negativeMarking: mock.negative_marking,
    negativeMarkingTypes: mock.negative_marking_types,
    proctoringEnabled: mock.proctoring_enabled,
    sections: [],
    title: mock.title,
  }));
}

// One mock with its sections and this student's attempts, or null when the
// student holds no grant for it. The attempts are those taken in `courseId`'s
// programme, or outside any programme when it is null (shared modules,
// decisions 1 and 2): the database counts `max_attempts` the same way. The
// student's open attempt is always included, whatever its programme, so a
// running paper always shows as Resume.
export async function getStudentMock(mockId: number, courseId: number | null = null): Promise<StudentMock | null> {
  const supabase = await createServerSupabaseClient();
  const attemptQuery = supabase
    .from("attempts")
    .select("id, course_id, proctored, score, started_at, status, submitted_at, submitted_by")
    .eq("mock_id", mockId);
  const [mockResult, sectionResult, attemptResult] = await Promise.all([
    supabase.from("mocks").select(mockColumns).eq("id", mockId).maybeSingle(),
    supabase.from("mock_sections").select("id, title, duration_minutes, sort_order").eq("mock_id", mockId).order("sort_order"),
    attemptQuery
      .or(`${courseId === null ? "course_id.is.null" : `course_id.eq.${courseId}`},status.eq.in_progress`)
      .order("started_at", { ascending: false }),
  ]);
  if (mockResult.error) throw new Error(`Unable to read the mock: ${mockResult.error.message}`);
  if (!mockResult.data) return null;
  if (sectionResult.error) throw new Error(`Unable to read sections: ${sectionResult.error.message}`);
  if (attemptResult.error) throw new Error(`Unable to read attempts: ${attemptResult.error.message}`);

  const mock = mockResult.data;
  return {
    allowMobile: mock.allow_mobile,
    attempts: (attemptResult.data ?? []).map(toAttempt),
    durationMinutes: mock.duration_minutes,
    id: mock.id,
    instructions: mock.instructions,
    maxAttempts: mock.max_attempts,
    negativeMarking: mock.negative_marking,
    negativeMarkingTypes: mock.negative_marking_types,
    proctoringEnabled: mock.proctoring_enabled,
    sections: (sectionResult.data ?? []).map((section) => ({
      durationMinutes: section.duration_minutes,
      id: section.id,
      sortOrder: section.sort_order,
      title: section.title,
    })),
    title: mock.title,
  };
}

// The direct grant and the programmes holding this mock, read through RLS:
// a student reads their own grants, and sections only of programmes they hold.
async function readMockAccess(studentId: string, mockId: number): Promise<{ directGrant: boolean; programmeIds: number[] }> {
  const supabase = await createServerSupabaseClient();
  const [grant, items] = await Promise.all([
    supabase
      .from("content_access")
      .select("id")
      .eq("student_id", studentId)
      .eq("resource_type", "mock")
      .eq("resource_id", mockId)
      .limit(1),
    supabase
      .from("curriculum_items")
      .select("module_id, sections(course_id)")
      .eq("type", "test")
      .eq("ref_id", mockId)
      .limit(100),
  ]);
  const programmeIds: number[] = [];
  const moduleIds: number[] = [];
  for (const item of items.data ?? []) {
    const section = item.sections as unknown as { course_id: number } | null;
    if (section) programmeIds.push(section.course_id);
    if (item.module_id !== null) moduleIds.push(item.module_id);
  }
  if (moduleIds.length) {
    const { data } = await supabase.from("section_modules").select("sections(course_id)").in("module_id", moduleIds).limit(100);
    for (const row of data ?? []) {
      const section = row.sections as unknown as { course_id: number } | null;
      if (section) programmeIds.push(section.course_id);
    }
  }
  return { directGrant: (grant.data ?? []).length > 0, programmeIds };
}

export async function courseForPlainStart(studentId: string, mockId: number): Promise<AttemptCourse> {
  const access = await readMockAccess(studentId, mockId);
  return resolveAttemptCourse(access.directGrant, access.programmeIds);
}

// The programme the mock page is for: the requested one when a programme the
// student holds contains the mock, else the plain-start bucket.
export async function courseForMockPage(studentId: string, mockId: number, requested: number | null): Promise<number | null> {
  const access = await readMockAccess(studentId, mockId);
  return pageCourse(requested, access.directGrant, access.programmeIds);
}
