"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildUsersHref, parsePageNumber, sanitizeUserSearch } from "../list-params";

// Matches a UUID as Postgres will accept it. Checked before the round trip so an
// obviously malformed id is refused here rather than surfacing as a database
// type error the admin cannot act on.
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assignMentorAction(formData: FormData): Promise<void> {
  // Re-checked here, not inherited from the page. A Server Action is a public
  // endpoint that any signed-in session can post to directly.
  const admin = await requireRole("admin");

  const rawPage = formData.get("page");
  const rawSearch = formData.get("q");
  const page = parsePageNumber(
    typeof rawPage === "string" ? rawPage : undefined,
  );
  const search = sanitizeUserSearch(
    typeof rawSearch === "string" ? rawSearch : "",
  );

  const studentId = formData.get("studentId");
  const mentorId = formData.get("mentorId");

  if (
    typeof studentId !== "string" ||
    !uuidPattern.test(studentId) ||
    typeof mentorId !== "string" ||
    (mentorId !== "" && !uuidPattern.test(mentorId))
  ) {
    redirect(buildUsersHref({ error: "invalid-request", page, search }));
  }

  const supabase = await createServerSupabaseClient();
  let failed = false;

  if (mentorId === "") {
    // Unassign. `mentor_assignments_delete_admin` decides whether this admin
    // may, and the row simply not existing is a success, not an error.
    const { error } = await supabase
      .from("mentor_assignments")
      .delete()
      .eq("student_id", studentId);

    failed = Boolean(error);
  } else {
    // `mentor_assignments_student_unique` allows a student exactly one mentor,
    // so reassignment is an upsert on that constraint rather than a
    // delete-then-insert, which would briefly leave the student unassigned and
    // could fail halfway.
    //
    // Nothing here checks that the mentor is really a mentor, that the student
    // is really a student, or that both sit in this organisation. The
    // `mentor_assignments_validate_roles` trigger already refuses every one of
    // those, and duplicating the rules in application code is how the two
    // versions drift apart.
    const { error } = await supabase.from("mentor_assignments").upsert(
      {
        assigned_by: admin.id,
        mentor_id: mentorId,
        org_id: admin.orgId,
        student_id: studentId,
      },
      { onConflict: "student_id" },
    );

    failed = Boolean(error);
  }

  if (failed) {
    redirect(buildUsersHref({ error: "assignment-failed", page, search }));
  }

  revalidatePath("/admin/users");
  redirect(buildUsersHref({ page, search }));
}
