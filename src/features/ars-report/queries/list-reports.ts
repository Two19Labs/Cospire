import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { mentorReportsPageSize, studentReportsPageSize } from "../list-params";

export interface MentorReportRow {
  completedAt: string;
  courseTitle: string;
  reportId: number | null;
  reportStatus: "draft" | "released" | null;
  runId: number;
  studentName: string;
  templateId: number | null;
  templateName: string | null;
}

export interface StudentReportRow {
  courseTitle: string;
  overallScore: number | null;
  releasedAt: string;
  reportId: number;
}

export interface MentorReportPage {
  page: number;
  pageCount: number;
  rows: MentorReportRow[];
  total: number;
}

export interface StudentReportPage {
  page: number;
  pageCount: number;
  rows: StudentReportRow[];
  total: number;
}

// No mentor filter and no organisation filter, for the same reason
// `listCourses` has none: the policies on ars_process_runs and ars_reports
// already scope a mentor to their assigned students and a student to
// themselves. Restating that here would be application code impersonating the
// access control, and would hide the difference if a policy ever changed.
export async function listMentorReports({ page }: { page: number }): Promise<MentorReportPage> {
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * mentorReportsPageSize;

  const { count, data: runs, error } = await supabase
    .from("ars_process_runs")
    .select("id, course_id, student_id, completed_at", { count: "exact" })
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    // A unique final sort key. Two runs completing in the same millisecond would
    // otherwise come back in an arbitrary order and could swap between pages,
    // showing one student twice and hiding another entirely.
    .order("id", { ascending: false })
    .range(from, from + mentorReportsPageSize - 1);

  if (error) throw new Error(`Unable to load completed ARS processes: ${error.message}`);

  const total = count ?? runs?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / mentorReportsPageSize));
  if (!runs?.length) return { page, pageCount, rows: [], total };

  // Every list below is bounded by the page above, so these `IN` lists carry at
  // most `mentorReportsPageSize` ids rather than however many rows exist.
  const runIds = runs.map((row) => row.id);
  const courseIds = [...new Set(runs.map((row) => row.course_id))];
  const studentIds = [...new Set(runs.map((row) => row.student_id))];

  const [coursesResult, studentsResult, reportsResult, templatesResult] =
    await Promise.all([
      supabase.from("courses").select("id, title").in("id", courseIds),
      supabase.from("profiles").select("id, name").in("id", studentIds),
      supabase.from("ars_reports").select("id, run_id, status").in("run_id", runIds),
      // Only the templates this page could actually use: one tied to a
      // programme on the page, or the organisation-wide default. The ids are
      // integers read back from the database, never user input.
      supabase
        .from("ars_report_templates")
        .select("id, course_id, name")
        .eq("is_active", true)
        .or(`course_id.in.(${courseIds.join(",")}),course_id.is.null`),
    ]);

  for (const result of [coursesResult, studentsResult, reportsResult, templatesResult]) {
    if (result.error) throw new Error(`Unable to build the mentor report queue: ${result.error.message}`);
  }

  const courses = new Map((coursesResult.data ?? []).map((row) => [row.id, row.title]));
  const students = new Map((studentsResult.data ?? []).map((row) => [row.id, row.name]));
  const reports = new Map((reportsResult.data ?? []).map((row) => [row.run_id, row]));
  const templates = templatesResult.data ?? [];

  const rows = runs.map((run) => {
    const report = reports.get(run.id);
    const template = templates.find((row) => row.course_id === run.course_id)
      ?? templates.find((row) => row.course_id === null);
    return {
      completedAt: run.completed_at as string,
      courseTitle: courses.get(run.course_id) ?? "Programme",
      reportId: report?.id ?? null,
      reportStatus: (report?.status as "draft" | "released" | undefined) ?? null,
      runId: run.id,
      studentName: students.get(run.student_id) ?? "Student",
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
    };
  });

  return { page, pageCount, rows, total };
}

export async function listStudentReports({ page }: { page: number }): Promise<StudentReportPage> {
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * studentReportsPageSize;

  const { count, data: reports, error } = await supabase
    .from("ars_reports")
    .select("id, run_id, overall_score, released_at", { count: "exact" })
    .eq("status", "released")
    .order("released_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + studentReportsPageSize - 1);

  if (error) throw new Error(`Unable to load released ARS reports: ${error.message}`);

  const total = count ?? reports?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / studentReportsPageSize));
  if (!reports?.length) return { page, pageCount, rows: [], total };

  const { data: runs, error: runsError } = await supabase
    .from("ars_process_runs")
    .select("id, course_id")
    .in("id", reports.map((row) => row.run_id));
  if (runsError) throw new Error(`Unable to load report programmes: ${runsError.message}`);

  const courseIds = [...new Set((runs ?? []).map((row) => row.course_id))];
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, title")
    .in("id", courseIds);
  if (coursesError) throw new Error(`Unable to load report programmes: ${coursesError.message}`);

  const runCourses = new Map((runs ?? []).map((row) => [row.id, row.course_id]));
  const courseNames = new Map((courses ?? []).map((row) => [row.id, row.title]));

  const rows = reports.map((report) => ({
    courseTitle: courseNames.get(runCourses.get(report.run_id) ?? -1) ?? "Programme",
    overallScore: report.overall_score,
    releasedAt: report.released_at as string,
    reportId: report.id,
  }));

  return { page, pageCount, rows, total };
}
