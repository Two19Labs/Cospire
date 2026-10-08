import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  arsSubmissionsPageSize,
  type ArsSubmissionFilters,
  type ArsSubmissionStatus,
} from "../ars-submissions-params";

// Every ARS submission in the admin's organisation, across students, rounds and
// processes. Read through the admin's own session: `ars_submissions_select_
// authorized` already lets an admin read every row in their organisation, so
// no filter here restates that and no server key is involved.
//
// Indexed reads only: a round filter uses `ars_submissions_round_id_idx`, a
// status filter `ars_submissions_org_status_submitted_idx`, and the order is
// the primary key, newest first.

export interface ArsSubmissionListRow {
  attemptNo: number;
  id: number;
  isLate: boolean;
  processTitle: string;
  roundName: string;
  status: ArsSubmissionStatus;
  studentEmail: string;
  studentName: string;
  submittedAt: string | null;
}

export interface ArsFilterOption { id: number; label: string }

export interface ArsSubmissionListPage {
  page: number;
  pageCount: number;
  processes: ArsFilterOption[];
  rounds: ArsFilterOption[];
  rows: ArsSubmissionListRow[];
  total: number;
}

export async function listArsSubmissions(filters: ArsSubmissionFilters): Promise<ArsSubmissionListPage> {
  const supabase = await createServerSupabaseClient();
  const empty = { page: filters.page, pageCount: 1, rows: [], total: 0 };

  const { data: processes, error: processError } = await supabase
    .from("courses").select("id, title").eq("kind", "ars_process").order("title").limit(200);
  if (processError) throw new Error(`Unable to load ARS processes: ${processError.message}`);

  // The round filter only offers rounds of the chosen process, and a round id
  // that is not in that process is ignored rather than trusted.
  let rounds: { course_id: number; id: number; name: string }[] = [];
  if (filters.processId !== null) {
    const { data, error } = await supabase
      .from("ars_rounds").select("id, name, course_id").eq("course_id", filters.processId)
      .order("sort_order").limit(200);
    if (error) throw new Error(`Unable to load ARS rounds: ${error.message}`);
    rounds = data ?? [];
  }
  const roundOptions = rounds.map((round) => ({ id: round.id, label: round.name }));
  const processOptions = (processes ?? []).map((row) => ({ id: row.id, label: row.title }));
  const roundId = rounds.some((round) => round.id === filters.roundId) ? filters.roundId : null;

  if (filters.processId !== null && rounds.length === 0) {
    return { ...empty, processes: processOptions, rounds: roundOptions };
  }

  const from = (filters.page - 1) * arsSubmissionsPageSize;
  let query = supabase
    .from("ars_submissions")
    .select("id, round_id, student_id, attempt_no, status, submitted_at, submitted_late", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, from + arsSubmissionsPageSize - 1);
  if (roundId !== null) query = query.eq("round_id", roundId);
  else if (filters.processId !== null) query = query.in("round_id", rounds.map((round) => round.id));
  if (filters.status) query = query.eq("status", filters.status);

  const { count, data, error } = await query;
  if (error) throw new Error(`Unable to list ARS submissions: ${error.message}`);
  const submissions = data ?? [];
  const total = count ?? submissions.length;
  const page = { page: filters.page, pageCount: Math.max(1, Math.ceil(total / arsSubmissionsPageSize)), total };
  if (!submissions.length) return { ...page, processes: processOptions, rounds: roundOptions, rows: [] };

  // Names for this page only, so the cost does not grow with the organisation.
  const [roundsResult, studentsResult] = await Promise.all([
    supabase.from("ars_rounds").select("id, name, course_id").in("id", [...new Set(submissions.map((row) => row.round_id))]),
    supabase.from("profiles").select("id, name, email").in("id", [...new Set(submissions.map((row) => row.student_id))]),
  ]);
  if (roundsResult.error || studentsResult.error) throw new Error("Unable to name the ARS submissions.");
  const roundById = new Map((roundsResult.data ?? []).map((row) => [row.id, row]));
  const studentById = new Map((studentsResult.data ?? []).map((row) => [row.id, row]));
  const processById = new Map(processOptions.map((row) => [row.id, row.label]));

  return {
    ...page,
    processes: processOptions,
    rounds: roundOptions,
    rows: submissions.map((row) => {
      const round = roundById.get(row.round_id);
      const student = studentById.get(row.student_id);
      return {
        attemptNo: row.attempt_no,
        id: row.id,
        isLate: row.submitted_late === true,
        processTitle: processById.get(round?.course_id ?? -1) ?? "Process",
        roundName: round?.name ?? "Round",
        status: row.status as ArsSubmissionStatus,
        studentEmail: student?.email ?? "",
        studentName: student?.name ?? "Student",
        submittedAt: row.submitted_at,
      };
    }),
  };
}
