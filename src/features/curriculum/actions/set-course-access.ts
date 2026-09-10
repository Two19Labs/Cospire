"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildCourseHref, parseCourseId } from "../list-params";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Granting a student a programme.
//
// A thin layer over rules the database already enforces:
// `content_access_insert_admin` decides who may grant, the
// `content_access_validate_roles` trigger refuses a target who is not an active
// student in the same organisation, and the `course` branch added to
// `validate_content_access_resource` refuses a programme belonging to another
// organisation. None of those rules are restated here, because two copies of a
// rule is how the copies drift apart.
export async function setCourseAccessAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const rawCourseId = formData.get("courseId");
  const courseId = parseCourseId(
    typeof rawCourseId === "string" ? rawCourseId : undefined,
  );

  if (courseId === null) {
    // Nowhere sensible to send them: without a valid programme id there is no
    // detail page to return to.
    redirect("/admin/courses?error=invalid-request");
  }

  const studentId = formData.get("studentId");
  const intent = formData.get("intent");

  if (
    typeof studentId !== "string" ||
    !uuidPattern.test(studentId) ||
    (intent !== "grant" && intent !== "revoke")
  ) {
    redirect(buildCourseHref({ courseId, error: "invalid-request" }));
  }

  const supabase = await createServerSupabaseClient();
  let failed = false;

  if (intent === "grant") {
    // A plain insert, not an upsert. `content_access` is granted only SELECT,
    // INSERT and DELETE to `authenticated` and carries no UPDATE policy, so an
    // upsert compiles to INSERT ... ON CONFLICT DO UPDATE, is refused with
    // 42501, and writes nothing at all. That exact mistake shipped in the
    // documents slice past typecheck, lint, 58 tests and a build.
    const { error } = await supabase.from("content_access").insert({
      granted_by: admin.id,
      org_id: admin.orgId,
      resource_id: courseId,
      resource_type: "course",
      student_id: studentId,
    });

    // 23505 is `content_access_grant_unique` firing: this student already holds
    // this programme. That is the state the admin asked for, so it is success.
    failed = error !== null && error.code !== "23505";
  } else {
    // Counting the affected rows, not trusting the absence of an error.
    //
    // When RLS filters a write to zero rows, PostgREST returns no error at all,
    // so an action that only checks `error` reports success for a change that
    // never happened. A revoke that silently did nothing would leave an admin
    // believing they had removed access that is still live, which is the worst
    // possible direction for this particular mistake.
    const { data, error } = await supabase
      .from("content_access")
      .delete()
      .eq("student_id", studentId)
      .eq("resource_type", "course")
      .eq("resource_id", courseId)
      .select("id");

    // Zero rows is only acceptable when the grant genuinely was not there, and
    // that is indistinguishable from a policy refusal at this layer. Both are
    // reported as a failure rather than quietly as success; re-reading the list
    // is what tells the admin which it was.
    failed = Boolean(error) || (data ?? []).length !== 1;
  }

  if (failed) {
    redirect(buildCourseHref({ courseId, error: "access-change-failed" }));
  }

  revalidatePath(`/admin/courses/${courseId}`);
  redirect(
    buildCourseHref({
      courseId,
      notice: intent === "grant" ? "granted" : "revoked",
    }),
  );
}
