import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppRole } from "@/features/auth/types";

import {
  overall,
  paperMarks,
  scoreBuckets,
  scoreStats,
  sittingsFor,
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
  paperClient,
  readAll,
  readNames,
  readPapers,
  readResponses,
  sessionClient,
  toAttempt,
  type AttemptRow,
} from "./load";

export const analyticsPageSize = 25;
// The most attempts one overview reads. A student sits a handful of mocks.
const attemptLimit = 200;
// The most attempts one mock's analytics reads: 100 students, a few sittings each.
const mockAttemptLimit = 1000;

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

// ---------------------------------------------------------------------------
// One submitted attempt, for its student, an admin, or the assigned mentor.
// ---------------------------------------------------------------------------

export interface AttemptAnalytics {
  attempt: AttemptRow;
  breakdown: Breakdown;
  maxMarks: number;
  studentName: string | null;
  title: string;
}

// Null when the caller's own session is not shown the attempt (RLS), or it is
// not submitted yet: nothing is analysed while the clock is still running.
export async function getAttemptAnalytics(attemptId: number, role: AppRole): Promise<AttemptAnalytics | null> {
  const db = await sessionClient();
  const { data, error } = await db.from("attempts").select(attemptColumns).eq("id", attemptId).eq("status", "submitted").maybeSingle();
  if (error) throw new Error(`Unable to read the attempt: ${error.message}`);
  if (!data) return null;
  const attempt = toAttempt(data);

  const [papers, responses, names] = await Promise.all([
    readPapers(await paperClient(role), [attempt.mockId]),
    readResponses(db, [attempt.id]),
    role === "student" ? Promise.resolve(new Map<string, string>()) : readNames(db, [attempt.studentId]),
  ]);
  const paper = papers.get(attempt.mockId);
  if (!paper) return null;
  return {
    attempt,
    breakdown: breakdown(sittingsFor(paper.questions, responses.get(attempt.id) ?? new Map())),
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
  attempts: number;
  total: Tally;
  trends: MockTrend[];
  weakest: Tally[];
}

async function overviewOf(db: SupabaseClient, role: AppRole, studentId: string | null): Promise<StudentOverview> {
  let query = db.from("attempts").select(attemptColumns).eq("status", "submitted");
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query.order("submitted_at", { ascending: true }).limit(attemptLimit);
  if (error) throw new Error(`Unable to read attempts: ${error.message}`);
  const attempts = (data ?? []).map(toAttempt);

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
  return { attempts: attempts.length, total: overall(sittings), trends: [...trends.values()], weakest: weakestTopics(sittings) };
}

// The signed-in student's own. RLS returns only their attempts.
export async function getStudentOverview(): Promise<StudentOverview> {
  return overviewOf(await sessionClient(), "student", null);
}

export interface AdminStudentView {
  name: string;
  overview: StudentOverview;
}

// Null when the admin's session is not shown this student.
export async function getStudentForAdmin(studentId: string): Promise<AdminStudentView | null> {
  const db = await sessionClient();
  const { data, error } = await db.from("profiles").select("id, name").eq("id", studentId).eq("role", "student").maybeSingle();
  if (error) throw new Error(`Unable to read the student: ${error.message}`);
  if (!data) return null;
  return { name: data.name, overview: await overviewOf(db, "admin", studentId) };
}

// ---------------------------------------------------------------------------
// Admin: the lists, and one mock.
// ---------------------------------------------------------------------------

export interface MockListRow {
  attempts: number;
  average: number | null;
  id: number;
  students: number;
  title: string;
}

export async function listMocksForAnalytics(page: number): Promise<{ rows: MockListRow[]; total: number }> {
  const db = await sessionClient();
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

  return {
    rows: mocks.map((mock) => {
      const mine = attempts.filter((row) => row.mock_id === mock.id);
      const scores = mine.flatMap((row) => (row.score === null ? [] : [Number(row.score)]));
      return {
        attempts: mine.length,
        average: scoreStats(scores).average,
        id: mock.id,
        students: new Set(mine.map((row) => row.student_id)).size,
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
  const db = await sessionClient();
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
  return {
    rows: students.map((row) => ({ attempts: attempts.filter((a) => a.student_id === row.id).length, id: row.id, name: row.name })),
    total: count ?? 0,
  };
}

export interface QuestionStat {
  number: number;
  question: PaperQuestion;
  tally: Tally;
}

export interface MockAnalytics {
  attempts: (AttemptRow & { studentName: string })[];
  breakdown: Breakdown;
  buckets: Bucket[];
  maxMarks: number;
  proctored: number;
  questions: QuestionStat[];
  stats: ScoreStats;
  students: number;
  title: string;
  unproctored: number;
}

// Null when the admin's session is not shown the mock.
export async function getMockAnalytics(mockId: number): Promise<MockAnalytics | null> {
  const db = await sessionClient();
  const { data: mock, error } = await db.from("mocks").select("id").eq("id", mockId).maybeSingle();
  if (error) throw new Error(`Unable to read the mock: ${error.message}`);
  if (!mock) return null;

  const { data, error: attemptError } = await db
    .from("attempts")
    .select(attemptColumns)
    .eq("mock_id", mockId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(mockAttemptLimit);
  if (attemptError) throw new Error(`Unable to read attempts: ${attemptError.message}`);
  const attempts = (data ?? []).map(toAttempt);

  const [papers, responses, names] = await Promise.all([
    readPapers(db, [mockId]),
    readResponses(db, attempts.map((row) => row.id)),
    readNames(db, attempts.map((row) => row.studentId)),
  ]);
  const paper = papers.get(mockId);
  if (!paper) return null;

  const sittings = attempts.flatMap((attempt) => sittingsFor(paper.questions, responses.get(attempt.id) ?? new Map()));
  const perQuestion = new Map(tally(sittings, (question) => String(question.id)).map((row) => [row.label, row]));
  const scores = attempts.flatMap((row) => (row.score === null ? [] : [row.score]));
  const maxMarks = paperMarks(paper.questions);

  return {
    attempts: attempts.map((row) => ({ ...row, studentName: names.get(row.studentId) ?? "Unknown student" })),
    breakdown: breakdown(sittings),
    buckets: scores.length ? scoreBuckets(scores, maxMarks) : [],
    maxMarks,
    proctored: attempts.filter((row) => row.proctored).length,
    questions: paper.questions.flatMap((question, index) => {
      const row = perQuestion.get(String(question.id));
      return row ? [{ number: index + 1, question, tally: row }] : [];
    }),
    stats: scoreStats(scores),
    students: new Set(attempts.map((row) => row.studentId)).size,
    title: paper.title,
    unproctored: attempts.filter((row) => !row.proctored).length,
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
  const db = await sessionClient();
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
