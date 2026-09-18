import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { toFormSpec, type FormSpec, type RoundMode } from "../form-schema";

export type RoundState = "done" | "locked" | "not_open" | "open" | "reviewed" | "waiting";

export interface ProcessRound {
  dueAt: string | null;
  id: number;
  isLate: boolean;
  name: string;
  opensAt: string | null;
  sortOrder: number;
  state: RoundState;
  submissionMode: RoundMode;
}

export interface StudentProcess {
  courseId: number;
  reportId: number | null;
  rounds: ProcessRound[];
  title: string;
}

export interface RoundForStudent {
  answer: Record<string, unknown>;
  courseId: number;
  courseTitle: string;
  dueAt: string | null;
  isLate: boolean;
  name: string;
  opensAt: string | null;
  roundId: number;
  spec: FormSpec | null;
  status: "draft" | "reviewed" | "submitted" | null;
  submissionMode: RoundMode;
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// What the student is allowed to do with a round right now.
//
// The sequence rule itself lives in `private.ars_begin_submission`, which
// refuses a submission to round two before round one is in. This mirrors it for
// display only -- the database remains the thing that decides, and this is the
// interface explaining the decision in advance rather than letting the student
// meet a raw error.
function decideState({
  hasEarlierUnanswered,
  opensAt,
  status,
}: {
  hasEarlierUnanswered: boolean;
  opensAt: string | null;
  status: string | null;
}): RoundState {
  if (status === "reviewed") return "reviewed";
  if (status === "submitted") return "waiting";
  if (hasEarlierUnanswered) return "locked";
  // A deadline that has passed does NOT lock the round. The decision of
  // 2026-09-18 is that late work is accepted and stamped, never refused.
  if (opensAt && new Date(opensAt).getTime() > Date.now()) return "not_open";
  return status === "draft" ? "open" : "open";
}

// No student filter anywhere below: `ars_rounds`, `ars_submissions` and
// `courses` are each scoped by their own policies, so this one query serves the
// signed-in student and nobody else. Restating the rule here would be
// application code impersonating the access control.
export async function listStudentProcesses(): Promise<StudentProcess[]> {
  const supabase = await createServerSupabaseClient();

  const [coursesResult, roundsResult, submissionsResult, reportsResult] = await Promise.all([
    supabase.from("courses").select("id, title").order("title", { ascending: true }).limit(50),
    supabase
      .from("ars_rounds")
      .select("id, course_id, name, submission_mode, sort_order, opens_at, due_at")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(200),
    supabase.from("ars_submissions").select("round_id, status, submitted_late").limit(200),
    supabase.from("ars_reports").select("id, run_id, status").eq("status", "released").limit(50),
  ]);

  for (const result of [coursesResult, roundsResult, submissionsResult, reportsResult]) {
    if (result.error) throw new Error(`Unable to load your ARS processes: ${result.error.message}`);
  }

  const submissions = new Map(
    (submissionsResult.data ?? []).map((row) => [row.round_id, row]),
  );

  const byCourse = new Map<number, ProcessRound[]>();
  for (const round of roundsResult.data ?? []) {
    const list = byCourse.get(round.course_id) ?? [];
    list.push({
      dueAt: round.due_at,
      id: round.id,
      isLate: submissions.get(round.id)?.submitted_late === true,
      name: round.name,
      opensAt: round.opens_at,
      sortOrder: round.sort_order,
      state: "open",
      submissionMode: round.submission_mode as RoundMode,
    });
    byCourse.set(round.course_id, list);
  }

  const processes: StudentProcess[] = [];
  for (const course of coursesResult.data ?? []) {
    const rounds = byCourse.get(course.id);
    // A programme with no rounds is not an ARS process and does not belong on
    // this screen. It may be a video course the student also holds.
    if (!rounds?.length) continue;

    let earlierUnanswered = false;
    for (const round of rounds) {
      const status = submissions.get(round.id)?.status ?? null;
      round.state = decideState({ hasEarlierUnanswered: earlierUnanswered, opensAt: round.opensAt, status });
      if (status === null || status === "draft") earlierUnanswered = true;
    }

    processes.push({ courseId: course.id, reportId: null, rounds, title: course.title });
  }

  return processes;
}

export async function getRoundForStudent(roundId: number): Promise<RoundForStudent | null> {
  const supabase = await createServerSupabaseClient();

  const { data: round, error } = await supabase
    .from("ars_rounds")
    .select("id, course_id, name, submission_mode, config, opens_at, due_at")
    .eq("id", roundId)
    .maybeSingle();

  // A round the student's grant does not reach comes back as no row, because RLS
  // filters it. That is indistinguishable from a deleted round and is meant to
  // be: both are "not found" to this caller.
  if (error) throw new Error(`Unable to load this round: ${error.message}`);
  if (!round) return null;

  const [courseResult, submissionResult] = await Promise.all([
    supabase.from("courses").select("title").eq("id", round.course_id).maybeSingle(),
    supabase
      .from("ars_submissions")
      .select("answer, status, submitted_late")
      .eq("round_id", roundId)
      .order("attempt_no", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (courseResult.error) throw new Error(`Unable to load the programme: ${courseResult.error.message}`);
  if (submissionResult.error) {
    throw new Error(`Unable to load your answers: ${submissionResult.error.message}`);
  }

  const mode = round.submission_mode as RoundMode;

  return {
    answer: toRecord(submissionResult.data?.answer),
    courseId: round.course_id,
    courseTitle: courseResult.data?.title ?? "Programme",
    dueAt: round.due_at,
    isLate: submissionResult.data?.submitted_late === true,
    name: round.name,
    opensAt: round.opens_at,
    roundId: round.id,
    spec: toFormSpec(round.config, mode),
    status: (submissionResult.data?.status as RoundForStudent["status"]) ?? null,
    submissionMode: mode,
  };
}
