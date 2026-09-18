import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

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

export async function listMentorReports(): Promise<MentorReportRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: runs, error } = await supabase
    .from("ars_process_runs")
    .select("id, course_id, student_id, completed_at")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (error) throw new Error(`Unable to load completed ARS processes: ${error.message}`);
  if (!runs?.length) return [];

  const runIds = runs.map((row) => row.id);
  const courseIds = [...new Set(runs.map((row) => row.course_id))];
  const studentIds = [...new Set(runs.map((row) => row.student_id))];

  const [coursesResult, studentsResult, reportsResult, templatesResult] =
    await Promise.all([
      supabase.from("courses").select("id, title").in("id", courseIds),
      supabase.from("profiles").select("id, name").in("id", studentIds),
      supabase.from("ars_reports").select("id, run_id, status").in("run_id", runIds),
      supabase
        .from("ars_report_templates")
        .select("id, course_id, name")
        .eq("is_active", true),
    ]);

  for (const result of [coursesResult, studentsResult, reportsResult, templatesResult]) {
    if (result.error) throw new Error(`Unable to build the mentor report queue: ${result.error.message}`);
  }

  const courses = new Map((coursesResult.data ?? []).map((row) => [row.id, row.title]));
  const students = new Map((studentsResult.data ?? []).map((row) => [row.id, row.name]));
  const reports = new Map((reportsResult.data ?? []).map((row) => [row.run_id, row]));
  const templates = templatesResult.data ?? [];

  return runs.map((run) => {
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
}

export async function listStudentReports(): Promise<StudentReportRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: reports, error } = await supabase
    .from("ars_reports")
    .select("id, run_id, overall_score, released_at")
    .eq("status", "released")
    .order("released_at", { ascending: false });

  if (error) throw new Error(`Unable to load released ARS reports: ${error.message}`);
  if (!reports?.length) return [];

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
  return reports.map((report) => ({
    courseTitle: courseNames.get(runCourses.get(report.run_id) ?? -1) ?? "Programme",
    overallScore: report.overall_score,
    releasedAt: report.released_at as string,
    reportId: report.id,
  }));
}
