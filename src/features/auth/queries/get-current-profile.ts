import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { isAppRole, type Profile } from "../types";

// Anonymous and "signed in but has no active profile" are deliberately distinct.
// Collapsing them sends a successfully authenticated user back to the sign-in
// screen with no explanation, where signing in again repeats the loop: the
// credentials are correct every time, so nothing tells them what is wrong. That
// state is reachable whenever an Auth user exists without an active profile,
// which is exactly the gap between an admin creating the account and the profile
// row existing, and is also what a disabled user hits.
export type SessionState =
  | { status: "anonymous" }
  | { status: "orphaned"; userId: string }
  | { status: "active"; profile: Profile };

// Wrapped in React's per-request `cache`, so asking twice in one render costs
// one token verification and one profile query rather than two of each.
//
// Today every page calls this exactly once through `requireRole`, so it changes
// nothing measurable. It is here for the moment that stops being true: the
// natural next step for this app is a layout per role that renders the shell,
// and at that point the layout and the page both want the profile. Without this
// that day silently doubles the auth cost of every screen, and nothing would
// say so.
export const getSessionState = cache(async function getSessionState(): Promise<SessionState> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return { status: "anonymous" };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, org_id, role, name, email")
    .eq("id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the signed-in profile: ${error.message}`);
  }

  if (!data) return { status: "orphaned", userId };

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
    status: "active",
    profile: {
      email: row.email,
      id: row.id,
      name: row.name,
      orgId: row.org_id,
      role: row.role,
    },
  };
});
