import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppRole } from "@/features/auth/types";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  overall,
  paperMarks,
  scoreBuckets,
  scoreStats,
  sittingsFor,
  splitAwaiting,
  tally,
  tallyBy,
  weakestTopics,
  type Bucket,
  type PaperQuestion,
  type ScoreStats,
  type Sitting,
  type Tally,
} from "../aggregate";
import {
  attemptColumns,
  groupBy,
  paperClient,
  readAll,
  readNames,
  readPapers,
  readResponses,
  toAttempt,
  type AttemptRow,
} from "./load";

export const analyticsPageSize = 25;
// The most attempts one overview reads, newest first. A student sits a handful of mocks.
export const overviewAttemptLimit = 200;
// The most attempts one mock's analytics reads, newest first: 100 students, a few sittings each.
export const mockAttemptLimit = 1000;

// When a view read fewer attempts than exist, how many it read of how many.
export interface Capped {
  shown: number;
  total: number;
}

export interface Breakdown {
  bySection: Tally[];
  byDifficulty: Tally[];
  byTopic: Tally[];
  total: Tally;
}

function breakdown(sittings: Sitting[]): Breakdown {
  return {
    byDifficulty: tallyBy(sittings, "difficulty"),
    bySection: tallyBy(sittings, "section"),
    byTopic: tallyBy(sittings, "topic"),
    total: overall(sittings),
  };
}

function capped(shown: number, total: number | null): Capped | null {
  return total !== null && total > shown ? { shown, total } : null;
}

// ---------------------------------------------------------------------------
// One submitted attempt, for its student, an admin, or the assigned mentor.
// ---------------------------------------------------------------------------

export interface AttemptAnalytics {
  attempt: AttemptRow;
  // Null while the attempt awaits its score: nothing is counted until it has one.
  breakdown: Breakdown | null;
  maxMarks: number;
  studentName: string | null;
  title: string;
}

// Null when the caller's own session is not shown the attempt (RLS), or it is
// not submitted yet: nothing is analysed while the clock is still running.
export async function getAttemptAnalytics(attemptId: number, role: AppRole): Promise<AttemptAnalytics | null> {
  const db = await createServerSupabaseClient();
  const { data, error } = await db.from("attempts").select(attemptColumns).eq("id", attemptId).eq("status", "submitted").maybeSingle();
  if (error) throw new Error(`Unable to read the attempt: ${error.message}`);
  if (!data) return null;
  const attempt = toAttempt(data);

  const [papers, responses, names] = await Promise.all([
    readPapers(await paperClient(role), [attempt.mockId]),
    attempt.score === null ? Promise.resolve(new Map()) : readResponses(db, [attempt.id]),
    role === "student" ? Promise.resolve(new Map<string, string>()) : readNames(db, [attempt.studentId]),
  ]);
  const paper = papers.get(attempt.mockId);
  if (!paper) return null;
  return {
    attempt,
    breakdown: attempt.score === null ? null : breakdown(sittingsFor(paper.questions, responses.get(attempt.id) ?? new Map())),
    maxMarks: paperMarks(paper.questions),
    studentName: role === "student" ? null : (names.get(attempt.studentId) ?? "Unknown student"),
    title: paper.title,
  };
}

// ---------------------------------------------------------------------------
// Everything one student has submitted: the student's own overview, and the
// admin's view of one student.
// ---------------------------------------------------------------------------

export interface MockTrend {
  attempts: AttemptRow[];
  maxMarks: number;
  mockId: number;
  title: string;
}

export interface StudentOverview {
  awaiting: number;
  capped: Capped | null;
  scored: number;
  total: Tally;
  trends: MockTrend[];
  weakest: Tally[];
}

async function overviewOf(db: SupabaseClient, role: AppRole, studentId: string | null): Promise<StudentOverview> {
  let query = db.from("attempts").select(attemptColumns, { count: "exact" }).eq("status", "submitted");
  if (studentId) query = query.eq("student_id", studentId);
  const { count, data, error } = await query
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(overviewAttemptLimit);
  if (error) throw new Error(`Unable to read attempts: ${error.message}`);
  const newest = (data ?? []).map(toAttempt);
  const { awaiting, scored } = splitAwaiting(newest);
  // Oldest first from here on, so each mock's trend reads left to right in time.
  const attempts = [...scored].reverse();

  const [papers, responses] = await Promise.all([
    readPapers(await paperClient(role), attempts.map((row) => row.mockId)),
    readResponses(db, attempts.map((row) => row.id)),
  ]);

  const sittings: Sitting[] = [];
  const trends = new Map<number, MockTrend>();
  for (const attempt of attempts) {
    const paper = papers.get(attempt.mockId);
    if (!paper) continue;
    sittings.push(...sittingsFor(paper.questions, responses.get(attempt.id) ?? new Map()));
    const trend = trends.get(paper.mockId) ?? { attempts: [], maxMarks: paperMarks(paper.questions), mockId: paper.mockId, title: paper.title };
    trend.attempts.push(attempt);
    trends.set(paper.mockId, trend);
  }
  return {
    awaiting,
    capped: capped(newest.length, count),
    scored: attempts.length,
    total: overall(sittings),
    trends: [...trends.values()],
    weakest: weakestTopics(sittings),
  };
}

// The signed-in student's own. RLS returns only their attempts.
export async function getStudentOverview(): Promise<StudentOverview> {
  return overviewOf(await createServerSupabaseClient(), "student", null);
}

export interface AdminStudentView {
  name: string;
  overview: StudentOverview;
}

// Null when the admin's session is not shown this student.
export async function getStudentForAdmin(studentId: string): Promise<AdminStudentView | null> {
  const db = await createServerSupabaseClient();
  const { data, error } = await db.from("profiles").select("id, name").eq("id", studentId).eq("role", "student").maybeSingle();
  if (error) throw new Error(`Unable to read the student: ${error.message}`);
  if (!data) return null;
  return { name: data.name, overview: await overviewOf(db, "admin", studentId) };
}

// ---------------------------------------------------------------------------
// Admin: the lists, and one mock.
// ---------------------------------------------------------------------------

export interface MockListRow {
  awaiting: number;
  average: number | null;
  id: number;
  scored: number;
  students: number;
  title: string;
}

export async function listMocksForAnalytics(page: number): Promise<{ rows: MockListRow[]; total: number }> {
  const db = await createServerSupabaseClient();
  const from = (page - 1) * analyticsPageSize;
  const { count, data, error } = await db
    .from("mocks")
    .select("id, title", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + analyticsPageSize - 1);
  if (error) throw new Error(`Unable to list mocks: ${error.message}`);
  const mocks = data ?? [];
  const ids = mocks.map((mock) => mock.id);
  const attempts = ids.length
    ? await readAll<{ mock_id: number; score: number | string | null; student_id: string }>((start, end) =>
        db.from("attempts").select("id, mock_id, student_id, score").eq("status", "submitted").in("mock_id", ids).order("id").range(start, end),
      )
    : [];
  const byMock = groupBy(attempts, (row) => row.mock_id);

  return {
    rows: mocks.map((mock) => {
      const { awaiting, scored } = splitAwaiting((byMock.get(mock.id) ?? []).map((row) => ({ ...row, score: row.score === null ? null : Number(row.score) })));
      return {
        awaiting,
        average: scoreStats(scored.map((row) => row.score)).average,
        id: mock.id,
        scored: scored.length,
        students: new Set(scored.map((row) => row.student_id)).size,
        title: mock.title,
      };
    }),
    total: count ?? 0,
  };
}

export interface StudentListRow {
  attempts: number;
  id: string;
  name: string;
}

export async function listStudentsForAnalytics(page: number): Promise<{ rows: StudentListRow[]; total: number }> {
  const db = await createServerSupabaseClient();
  const from = (page - 1) * analyticsPageSize;
  const { count, data, error } = await db
    .from("profiles")
    .select("id, name", { count: "exact" })
    .eq("role", "student")
    .order("name")
    .order("id")
    .range(from, from + analyticsPageSize - 1);
  if (error) throw new Error(`Unable to list students: ${error.message}`);
  const students = data ?? [];
  const ids = students.map((row) => row.id);
  const attempts = ids.length
    ? await readAll<{ student_id: string }>((start, end) =>
        db.from("attempts").select("id, student_id").eq("status", "submitted").in("student_id", ids).order("id").range(start, end),
      )
    : [];
  const byStudent = groupBy(attempts, (row) => row.student_id);
  return {
    rows: students.map((row) => ({ attempts: byStudent.get(row.id)?.length ?? 0, id: row.id, name: row.name })),
    total: count ?? 0,
  };
}

export interface QuestionStat {
  question: PaperQuestion;
  tally: Tally;
}

export interface MockAnalytics {
  // Every attempt read, awaiting ones included, for the list.
  attempts: (AttemptRow & { studentName: string })[];
  awaiting: number;
  breakdown: Breakdown;
  buckets: Bucket[];
  capped: Capped | null;
  maxMarks: number;
  proctored: number;
  questions: QuestionStat[];
  scored: number;
  stats: ScoreStats;
  students: number;
  title: string;
  unproctored: number;
}

// Null when the admin's session is not shown the mock.
export async function getMockAnalytics(mockId: number): Promise<MockAnalytics | null> {
  const db = await createServerSupabaseClient();
  const [mockResult, attemptResult, papers] = await Promise.all([
    db.from("mocks").select("id").eq("id", mockId).maybeSingle(),
    db
      .from("attempts")
      .select(attemptColumns, { count: "exact" })
      .eq("mock_id", mockId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(mockAttemptLimit),
    readPapers(db, [mockId]),
  ]);
  if (mockResult.error) throw new Error(`Unable to read the mock: ${mockResult.error.message}`);
  if (attemptResult.error) throw new Error(`Unable to read attempts: ${attemptResult.error.message}`);
  const paper = papers.get(mockId);
  if (!mockResult.data || !paper) return null;

  const attempts = (attemptResult.data ?? []).map(toAttempt);
  const { awaiting, scored } = splitAwaiting(attempts);
  const [responses, names] = await Promise.all([
    readResponses(db, scored.map((row) => row.id)),
    readNames(db, attempts.map((row) => row.studentId)),
  ]);

  const sittings = scored.flatMap((attempt) => sittingsFor(paper.questions, responses.get(attempt.id) ?? new Map()));
  const perQuestion = new Map(tally(sittings, (question) => String(question.id)).map((row) => [row.label, row]));
  const scores = scored.map((row) => row.score);
  const maxMarks = paperMarks(paper.questions);

  return {
    attempts: attempts.map((row) => ({ ...row, studentName: names.get(row.studentId) ?? "Unknown student" })),
    awaiting,
    breakdown: breakdown(sittings),
    buckets: scores.length ? scoreBuckets(scores, maxMarks) : [],
    capped: capped(attempts.length, attemptResult.count),
    maxMarks,
    proctored: scored.filter((row) => row.proctored).length,
    questions: paper.questions.flatMap((question) => {
      const row = perQuestion.get(String(question.id));
      return row ? [{ question, tally: row }] : [];
    }),
    scored: scored.length,
    stats: scoreStats(scores),
    students: new Set(scored.map((row) => row.studentId)).size,
    title: paper.title,
    unproctored: scored.filter((row) => !row.proctored).length,
  };
}

// ---------------------------------------------------------------------------
// Mentor: the assigned students' submitted attempts.
// ---------------------------------------------------------------------------

export interface MentorAttemptRow extends AttemptRow {
  maxMarks: number | null;
  studentName: string;
  title: string;
}

// `attempts_select_mentor` returns the attempts of this mentor's assigned
// students and no others, so nothing here filters by assignment.
export async function listMentorAttempts(page: number): Promise<{ rows: MentorAttemptRow[]; total: number }> {
  const db = await createServerSupabaseClient();
  const from = (page - 1) * analyticsPageSize;
  const { count, data, error } = await db
    .from("attempts")
    .select(attemptColumns, { count: "exact" })
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + analyticsPageSize - 1);
  if (error) throw new Error(`Unable to list attempts: ${error.message}`);
  const attempts = (data ?? []).map(toAttempt);
  const [papers, names] = await Promise.all([
    readPapers(await paperClient("mentor"), attempts.map((row) => row.mockId)),
    readNames(db, attempts.map((row) => row.studentId)),
  ]);
  return {
    rows: attempts.map((row) => {
      const paper = papers.get(row.mockId);
      return {
        ...row,
        maxMarks: paper ? paperMarks(paper.questions) : null,
        studentName: names.get(row.studentId) ?? "Unknown student",
        title: paper?.title ?? `Mock ${row.mockId}`,
      };
    }),
    total: count ?? 0,
  };
}
