import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { allFields, toFormSpec, type FormField, type RoundMode } from "@/features/ars/form-schema";

export interface MentorSubmissionRow {
  attemptNo: number;
  courseTitle: string;
  id: number;
  isLate: boolean;
  roundName: string;
  status: "reviewed" | "submitted";
  studentName: string;
  submittedAt: string;
}

export interface ReviewAnswer {
  field: FormField;
  value: unknown;
}

export interface MentorSubmissionDetail extends MentorSubmissionRow {
  answers: ReviewAnswer[];
  reviewedAt: string | null;
}

export interface OfflineRoundRow {
  courseTitle: string;
  roundId: number;
  roundName: string;
  studentId: string;
  studentName: string;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function listMentorSubmissions(): Promise<MentorSubmissionRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: submissions, error } = await supabase
    .from("ars_submissions")
    .select("id, round_id, student_id, attempt_no, status, submitted_at, submitted_late")
    .in("status", ["submitted", "reviewed"])
    .order("status", { ascending: false })
    .order("submitted_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`Unable to load the review queue: ${error.message}`);
  if (!submissions?.length) return [];

  const roundIds = [...new Set(submissions.map((row) => row.round_id))];
  const studentIds = [...new Set(submissions.map((row) => row.student_id))];
  const [roundsResult, studentsResult] = await Promise.all([
    supabase.from("ars_rounds").select("id, course_id, name").in("id", roundIds),
    supabase.from("profiles").select("id, name").in("id", studentIds),
  ]);
  if (roundsResult.error || studentsResult.error) throw new Error("Unable to build the review queue.");

  const rounds = new Map((roundsResult.data ?? []).map((row) => [row.id, row]));
  const courseIds = [...new Set((roundsResult.data ?? []).map((row) => row.course_id))];
  const { data: courses, error: courseError } = await supabase
    .from("courses").select("id, title").in("id", courseIds);
  if (courseError) throw new Error(`Unable to load review programmes: ${courseError.message}`);
  const courseNames = new Map((courses ?? []).map((row) => [row.id, row.title]));
  const studentNames = new Map((studentsResult.data ?? []).map((row) => [row.id, row.name]));

  return submissions.map((submission) => {
    const round = rounds.get(submission.round_id);
    return {
      attemptNo: submission.attempt_no,
      courseTitle: courseNames.get(round?.course_id ?? -1) ?? "Programme",
      id: submission.id,
      isLate: submission.submitted_late === true,
      roundName: round?.name ?? "Round",
      status: submission.status as "reviewed" | "submitted",
      studentName: studentNames.get(submission.student_id) ?? "Student",
      submittedAt: submission.submitted_at ?? submission.id.toString(),
    };
  });
}

export async function listOfflineRoundsToRecord(): Promise<OfflineRoundRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: grants, error } = await supabase.from("content_access")
    .select("student_id, resource_id").eq("resource_type", "course").limit(500);
  if (error) throw new Error(`Unable to load off-platform rounds: ${error.message}`);
  if (!grants?.length) return [];
  const courseIds = [...new Set(grants.map((row) => row.resource_id))];
  const studentIds = [...new Set(grants.map((row) => row.student_id))];
  const [roundsResult, coursesResult, studentsResult, existingResult] = await Promise.all([
    supabase.from("ars_rounds").select("id, course_id, name").eq("submission_mode", "offline").in("course_id", courseIds),
    supabase.from("courses").select("id, title").in("id", courseIds),
    supabase.from("profiles").select("id, name").in("id", studentIds),
    supabase.from("ars_submissions").select("student_id, round_id").in("student_id", studentIds),
  ]);
  for (const result of [roundsResult, coursesResult, studentsResult, existingResult]) {
    if (result.error) throw new Error("Unable to build off-platform round list.");
  }
  const existing = new Set((existingResult.data ?? []).map((row) => `${row.student_id}:${row.round_id}`));
  const courses = new Map((coursesResult.data ?? []).map((row) => [row.id, row.title]));
  const students = new Map((studentsResult.data ?? []).map((row) => [row.id, row.name]));
  const rows: OfflineRoundRow[] = [];
  for (const grant of grants) for (const round of roundsResult.data ?? []) {
    if (round.course_id !== grant.resource_id || existing.has(`${grant.student_id}:${round.id}`)) continue;
    rows.push({ courseTitle: courses.get(round.course_id) ?? "Programme", roundId: round.id, roundName: round.name, studentId: grant.student_id, studentName: students.get(grant.student_id) ?? "Student" });
  }
  return rows;
}

export async function getMentorSubmission(id: number): Promise<MentorSubmissionDetail | null> {
  const supabase = await createServerSupabaseClient();
  const { data: submission, error } = await supabase
    .from("ars_submissions")
    .select("id, round_id, student_id, attempt_no, answer, status, submitted_at, submitted_late, reviewed_at")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load this submission: ${error.message}`);
  if (!submission || submission.status === "draft") return null;

  const [roundResult, studentResult] = await Promise.all([
    supabase.from("ars_rounds").select("course_id, name, config, submission_mode").eq("id", submission.round_id).maybeSingle(),
    supabase.from("profiles").select("name").eq("id", submission.student_id).maybeSingle(),
  ]);
  if (roundResult.error || studentResult.error || !roundResult.data) throw new Error("Unable to build this review.");
  const { data: course, error: courseError } = await supabase
    .from("courses").select("title").eq("id", roundResult.data.course_id).maybeSingle();
  if (courseError) throw new Error(`Unable to load the programme: ${courseError.message}`);

  const answer = record(submission.answer);
  const spec = toFormSpec(roundResult.data.config, roundResult.data.submission_mode as RoundMode);
  const fields = spec ? allFields(spec) : Object.keys(answer).map((key) => ({ key, label: key, type: "short_text" as const }));
  return {
    answers: fields.filter((field) => answer[field.key] !== undefined).map((field) => ({ field, value: answer[field.key] })),
    attemptNo: submission.attempt_no,
    courseTitle: course?.title ?? "Programme",
    id: submission.id,
    isLate: submission.submitted_late === true,
    reviewedAt: submission.reviewed_at,
    roundName: roundResult.data.name,
    status: submission.status as "reviewed" | "submitted",
    studentName: studentResult.data?.name ?? "Student",
    submittedAt: submission.submitted_at ?? submission.id.toString(),
  };
}

export function parseSubmissionId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
