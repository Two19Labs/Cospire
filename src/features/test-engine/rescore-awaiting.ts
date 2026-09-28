import "server-only";

import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";

import { scoreAndStore } from "./score-attempt";

// Scores the submitted attempts of one organisation that are awaiting a score:
// the ones a question edit cleared (20260927090000_test_engine_rescore), or any
// whose scoring failed part way. Bounded, oldest first, so one call never runs
// long; what is left is picked up by the next call or when a result is opened.
//
// Called with `after()` from the question save, so the admin's page returns
// first (operating manual §8: heavy work must not hang an admin's browser).
// Callers must be signed in to `orgId`; the organisation is the only input.
export async function rescoreAwaiting(orgId: number, limit = 100): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("attempts")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "submitted")
    .is("score", null)
    .order("submitted_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to list attempts awaiting a score: ${error.message}`);

  let scored = 0;
  for (const row of data ?? []) {
    await scoreAndStore(row.id);
    scored += 1;
  }
  return scored;
}
