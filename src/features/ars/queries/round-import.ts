import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { withImportBatch, withRoundMock } from "../round-mock";

// D8: the mock-first importer opened from an ARS aptitude round. Everything is
// read and written through the admin's own session, so `ars_rounds_update_
// admin` decides whether this admin may edit the round, and a refusal shows up
// as zero rows changed rather than as an error.

export interface ImportRound { courseId: number; id: number; name: string }

// The round an import is being started for: an off-platform round this admin
// can read. Null for anything else.
export async function getImportRound(roundId: number): Promise<ImportRound | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_rounds").select("id, course_id, name, submission_mode").eq("id", roundId).maybeSingle();
  if (error || !data || data.submission_mode !== "offline") return null;
  return { courseId: data.course_id, id: data.id, name: data.name };
}

// Marks the round with the import's batch. True only when exactly that round
// was written, which is the proof the admin may edit it.
export async function markRoundForImport(roundId: number, batchId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data: round, error } = await supabase
    .from("ars_rounds").select("id, config, submission_mode").eq("id", roundId).maybeSingle();
  if (error || !round || round.submission_mode !== "offline") return false;
  const { data, error: updateError } = await supabase
    .from("ars_rounds").update({ config: withImportBatch(round.config, batchId) }).eq("id", roundId).select("id");
  return !updateError && (data ?? []).length === 1;
}

// The round waiting for this import's mock, if any.
export async function findImportRound(batchId: string): Promise<ImportRound | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_rounds").select("id, course_id, name")
    .eq("submission_mode", "offline").eq("config->>importBatchId", batchId)
    .order("id").limit(1);
  if (error || !data?.length) return null;
  return { courseId: data[0].course_id, id: data[0].id, name: data[0].name };
}

// Links the mock just built to the round waiting for it. "none" when no round
// is waiting; "failed" when one is and the write was refused.
export async function linkImportRound(batchId: string, mockId: number): Promise<"failed" | "linked" | "none"> {
  const supabase = await createServerSupabaseClient();
  const { data: rounds, error } = await supabase
    .from("ars_rounds").select("id, config")
    .eq("submission_mode", "offline").eq("config->>importBatchId", batchId)
    .order("id").limit(1);
  if (error) return "failed";
  const round = rounds?.[0];
  if (!round) return "none";
  const { data, error: updateError } = await supabase
    .from("ars_rounds").update({ config: withRoundMock(round.config, mockId) }).eq("id", round.id).select("id");
  return !updateError && (data ?? []).length === 1 ? "linked" : "failed";
}
