import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { isAppRole, type Profile } from "../types";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, org_id, role, name, email")
    .eq("id", claimsData.claims.sub)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the signed-in profile: ${error.message}`);
  }

  if (!data) return null;

  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.org_id !== "number" ||
    !isAppRole(row.role) ||
    typeof row.name !== "string" ||
    typeof row.email !== "string"
  ) {
    throw new Error("The signed-in profile has an invalid shape.");
  }

  return {
    email: row.email,
    id: row.id,
    name: row.name,
    orgId: row.org_id,
    role: row.role,
  };
}
