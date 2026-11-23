import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

// Whether the signed-in student holds an ARS process grant. Read with their own
// session, so RLS on `courses` is what decides: an ungranted process is no row.
// Cached per request because every screen's shell asks.
export const studentHasArs = cache(async (): Promise<boolean> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("courses").select("id").eq("kind", "ars_process").limit(1);
  // A failed read hides the ARS link rather than breaking every student screen;
  // /student/ars is guarded by RLS on its own.
  return !error && (data ?? []).length > 0;
});
