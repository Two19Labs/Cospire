import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { StagedQuestion } from "../import-spec";

export interface ImportBatchSummary {
  approved: number;
  batchId: string;
  createdAt: string;
  pending: number;
  rejected: number;
  sourceRef: string | null;
}

// Batches are not a table; they are the rows sharing a batch_id. This reads the
// newest rows and groups them, capped the way a facet is: 2,000 staged rows is
// ten full imports, and anything older than that is history rather than work.
const batchRowLimit = 2000;

export async function listImportBatches(): Promise<ImportBatchSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_imports")
    .select("batch_id, status, source_ref, created_at")
    .order("created_at", { ascending: false })
    .limit(batchRowLimit);

  if (error) throw new Error(`Unable to list imports: ${error.message}`);

  const batches = new Map<string, ImportBatchSummary>();
  for (const row of data ?? []) {
    const batchId = String(row.batch_id);
    const batch = batches.get(batchId) ?? {
      approved: 0,
      batchId,
      createdAt: String(row.created_at),
      pending: 0,
      rejected: 0,
      sourceRef: row.source_ref ? String(row.source_ref) : null,
    };
    if (row.status === "approved") batch.approved += 1;
    else if (row.status === "rejected") batch.rejected += 1;
    else batch.pending += 1;
    batches.set(batchId, batch);
  }
  return [...batches.values()];
}

export interface ImportRow {
  id: number;
  parsed: StagedQuestion | null;
  position: number;
  problems: string[];
  questionId: number | null;
  raw: Record<string, unknown>;
  status: "approved" | "pending_review" | "rejected";
}

export interface ImportBatch {
  createdAt: string;
  rows: ImportRow[];
  sourceRef: string | null;
}

// A batch holds at most 200 rows (`maxQuestionsPerImport`), so it is read whole;
// the page decides how many to render at once.
export async function getImportBatch(batchId: string): Promise<ImportBatch | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_imports")
    .select("id, position, raw, parsed, problems, status, question_id, source_ref, created_at")
    .eq("batch_id", batchId)
    .order("position", { ascending: true })
    .limit(250);

  if (error) throw new Error(`Unable to read the import: ${error.message}`);
  if (!data || data.length === 0) return null;

  return {
    createdAt: String(data[0].created_at),
    rows: data.map((row) => ({
      id: Number(row.id),
      parsed: (row.parsed ?? null) as StagedQuestion | null,
      position: Number(row.position),
      problems: Array.isArray(row.problems) ? row.problems.map(String) : [],
      questionId: row.question_id === null ? null : Number(row.question_id),
      raw: (row.raw ?? {}) as Record<string, unknown>,
      status: row.status as ImportRow["status"],
    })),
    sourceRef: data[0].source_ref ? String(data[0].source_ref) : null,
  };
}
