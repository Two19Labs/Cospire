"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  buildUsersHref,
  parsePageNumber,
  sanitizeUserSearch,
} from "../list-params";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deactivation rather than deletion, decided 2026-09-01.
//
// Three reasons, in order of how expensive they are to discover later:
//
// 1. `content_access.granted_by` and `mentor_assignments.assigned_by` reference
//    `profiles` with ON DELETE RESTRICT, so any admin who has ever granted a
//    document or assigned a mentor cannot be deleted at all. A delete button
//    would work on fresh accounts and be refused on exactly the busiest ones.
// 2. Deleting a student cascades through their assignments and grants, and from
//    Phase 4 will take `attempts` with them. Rescoring after an answer-key
//    correction is a contracted deliverable that operates on historical
//    attempts, so destroying them is not recoverable.
// 3. `profiles.status` already exists and Phase 0 verified that a disabled user
//    sees nothing at all, so this needs no migration.
//
// A disabled user is not signed out immediately -- their JWT stays valid until
// it expires -- but `getSessionState` only matches an active profile, so their
// next request is treated as orphaned and the session is ended with an
// explanation.
export async function setUserStatusAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const rawPage = formData.get("page");
  const rawSearch = formData.get("q");
  const page = parsePageNumber(
    typeof rawPage === "string" ? rawPage : undefined,
  );
  const search = sanitizeUserSearch(
    typeof rawSearch === "string" ? rawSearch : "",
  );

  const userId = formData.get("userId");
  const status = formData.get("status");

  if (
    typeof userId !== "string" ||
    !uuidPattern.test(userId) ||
    (status !== "active" && status !== "disabled") ||
    // The screen does not render this control on the admin's own row, so
    // reaching here means the request was made by hand. Refused rather than
    // trusted: an admin disabling themselves while a second admin exists is
    // legal to the database but is never what someone meant to do.
    userId === admin.id
  ) {
    redirect(buildUsersHref({ error: "invalid-request", page, search }));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId);

  if (error) {
    // `profiles_keep_one_active_admin` raises restrict_violation (23001) when a
    // change would leave the organisation with no active admin. Worth naming,
    // because "could not be updated" gives the admin nothing to act on.
    const reason = error.code === "23001" ? "last-admin" : "status-change-failed";
    redirect(buildUsersHref({ error: reason, page, search }));
  }

  revalidatePath("/admin/users");
  redirect(buildUsersHref({ page, search }));
}
