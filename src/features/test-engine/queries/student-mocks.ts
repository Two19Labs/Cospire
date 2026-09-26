import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { PaperSection } from "../paper";

export interface AttemptSummary {
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
  sections: PaperSection[];
  title: string;
}

const mockColumns =
  "id, title, instructions, duration_minutes, negative_marking, negative_marking_types, max_attempts, allow_mobile";

function toAttempt(row: {
  id: number; proctored: boolean; score: number | null; started_at: string; status: string;
  submitted_at: string | null; submitted_by: string | null;
}): AttemptSummary {
  return {
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
  const { data: mocks, error } = await supabase
    .from("mocks")
    .select(mockColumns)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Unable to list mocks: ${error.message}`);

  const ids = (mocks ?? []).map((mock) => mock.id);
  const { data: attempts, error: attemptError } = ids.length
    ? await supabase
        .from("attempts")
        .select("id, mock_id, proctored, score, started_at, status, submitted_at, submitted_by")
        .in("mock_id", ids)
        .order("started_at", { ascending: false })
    : { data: [], error: null };
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
    sections: [],
    title: mock.title,
  }));
}

// One mock with its sections and this student's attempts, or null when the
// student holds no grant for it.
export async function getStudentMock(mockId: number): Promise<StudentMock | null> {
  const supabase = await createServerSupabaseClient();
  const [mockResult, sectionResult, attemptResult] = await Promise.all([
    supabase.from("mocks").select(mockColumns).eq("id", mockId).maybeSingle(),
    supabase.from("mock_sections").select("id, title, duration_minutes, sort_order").eq("mock_id", mockId).order("sort_order"),
    supabase
      .from("attempts")
      .select("id, proctored, score, started_at, status, submitted_at, submitted_by")
      .eq("mock_id", mockId)
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
    sections: (sectionResult.data ?? []).map((section) => ({
      durationMinutes: section.duration_minutes,
      id: section.id,
      sortOrder: section.sort_order,
      title: section.title,
    })),
    title: mock.title,
  };
}
