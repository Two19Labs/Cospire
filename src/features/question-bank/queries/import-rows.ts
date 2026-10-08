import "server-only";

import type { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { StagedQuestion } from "../import-spec";

export type SessionClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export interface BatchRow {
  id: number;
  parsed: StagedQuestion | null;
  position: number;
  problems: string[];
  questionId: number | null;
  status: string;
}

// One import's rows in paper order, through the caller's own session. Shared by
// the review actions and the mock builder. It lives here rather than in a
// "use server" file, where every export becomes a public endpoint.
export async function readBatchRows(supabase: SessionClient, batchId: string): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from("question_imports")
    .select("id, position, parsed, problems, status, question_id")
    .eq("batch_id", batchId)
    .order("position");
  if (error) throw new Error(`Unable to read the import: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    parsed: (row.parsed ?? null) as StagedQuestion | null,
    position: Number(row.position),
    problems: Array.isArray(row.problems) ? row.problems.map(String) : [],
    questionId: row.question_id === null ? null : Number(row.question_id),
    status: String(row.status),
  }));
}

// The questions a decided paper put in the bank, in paper order: each
// standalone question and each DI set's passage once, whether newly created or
// linked to one the bank already held. Sub-questions travel with their passage.
export function paperQuestionIds(rows: BatchRow[]): number[] {
  const ids: number[] = [];
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    if (row.status !== "approved" || row.questionId === null || row.parsed?.parentPosition != null) continue;
    if (!ids.includes(row.questionId)) ids.push(row.questionId);
  }
  return ids;
}
