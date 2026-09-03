import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface AccessStudent {
  email: string;
  granted: boolean;
  id: string;
  name: string;
}

// The contracted ceiling is a hundred registered users, per clause 3.1, so the
// student list behind the access picker is bounded by the agreement rather than
// by hope. The cap is here anyway: a picker is not a paginated listing, and a
// silently truncated one is better than a page that grows without limit.
const studentPickerLimit = 500;

// Who may read this document, and who could be given it.
//
// Both halves come back through the caller's own client. An admin sees their own
// organisation's students because `profiles_select_authorized` says so, and the
// grants because `content_access_select_authorized` does. Nothing here filters
// by organisation, and that absence is what the cross-organisation test in the
// audit actually proves.
export async function listDocumentAccess(
  documentId: number,
): Promise<AccessStudent[]> {
  const supabase = await createServerSupabaseClient();

  const [studentsResult, grantsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email")
      .eq("role", "student")
      .eq("status", "active")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(studentPickerLimit),
    supabase
      .from("content_access")
      .select("student_id")
      .eq("resource_type", "document")
      .eq("resource_id", documentId),
  ]);

  if (studentsResult.error) {
    throw new Error(
      `Unable to list students: ${studentsResult.error.message}`,
    );
  }

  if (grantsResult.error) {
    throw new Error(
      `Unable to list document access: ${grantsResult.error.message}`,
    );
  }

  const granted = new Set<string>();
  for (const entry of grantsResult.data ?? []) {
    const studentId = (entry as Record<string, unknown>).student_id;
    if (typeof studentId === "string") granted.add(studentId);
  }

  return (studentsResult.data ?? []).map((entry) => {
    const row = entry as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      typeof row.name !== "string" ||
      typeof row.email !== "string"
    ) {
      throw new Error("A profile row came back in an unexpected shape.");
    }

    return {
      email: row.email,
      granted: granted.has(row.id),
      id: row.id,
      name: row.name,
    };
  });
}
