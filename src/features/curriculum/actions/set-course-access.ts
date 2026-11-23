"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildKindCourseHref, parseCourseKind, parseCourseId } from "../list-params";

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

  // The section this was posted from, so granting on an ARS process returns to
  // the ARS screen rather than bouncing the admin into Programmes.
  const kind = parseCourseKind(formData.get("kind")) ?? "programme";

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
    redirect(buildKindCourseHref({ courseId, kind, error: "invalid-request" }));
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
    redirect(buildKindCourseHref({ courseId, kind, error: "access-change-failed" }));
  }

  revalidatePath(`/admin/courses/${courseId}`);
  redirect(
    buildKindCourseHref({
      courseId,
      kind,
      notice: intent === "grant" ? "granted" : "revoked",
    }),
  );
}

// The End-to-End enrolment (D62): a programme and an ARS process granted to one
// student together, posted from the programme's page.
//
// Not a stored bundle: it is the two `course` grants above, written as ONE
// INSERT statement, so Postgres commits both rows or neither and a student is
// never left half-enrolled. Every rule the single grant relies on (who may
// grant, an active student of the same organisation, a course of the same
// organisation) is enforced by the database on both rows. Revoking stays per
// grant, on each screen's own list.
export async function grantBundleAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const rawCourseId = formData.get("courseId");
  const programmeId = parseCourseId(
    typeof rawCourseId === "string" ? rawCourseId : undefined,
  );
  if (programmeId === null) redirect("/admin/courses?error=invalid-request");

  const rawProcessId = formData.get("processId");
  const processId = parseCourseId(
    typeof rawProcessId === "string" ? rawProcessId : undefined,
  );
  const studentId = formData.get("studentId");
  const back = (error: "invalid-request" | "access-change-failed") =>
    buildKindCourseHref({ courseId: programmeId, kind: "programme", error });

  if (processId === null || typeof studentId !== "string" || !uuidPattern.test(studentId)) {
    redirect(back("invalid-request"));
  }

  const supabase = await createServerSupabaseClient();

  // The database checks the organisation but not the kind, and the kind is the
  // whole point here: two programmes posted as a bundle is a mistake, not an
  // End-to-End enrolment. Read through the admin's own client, so a course of
  // another organisation is simply missing.
  const { data: courses, error: readError } = await supabase
    .from("courses")
    .select("id, kind")
    .in("id", [programmeId, processId]);
  const kindOf = new Map((courses ?? []).map((course) => [course.id, course.kind]));
  if (
    readError ||
    kindOf.get(programmeId) !== "programme" ||
    kindOf.get(processId) !== "ars_process"
  ) {
    redirect(back("invalid-request"));
  }

  // ON CONFLICT DO NOTHING, unlike a plain upsert, needs no UPDATE grant: a
  // grant the student already holds is skipped, the other is still written.
  const grant = (resourceId: number) => ({
    granted_by: admin.id,
    org_id: admin.orgId,
    resource_id: resourceId,
    resource_type: "course",
    student_id: studentId,
  });
  const { error } = await supabase
    .from("content_access")
    .upsert([grant(programmeId), grant(processId)], {
      ignoreDuplicates: true,
      onConflict: "student_id,resource_type,resource_id",
    });
  if (error) redirect(back("access-change-failed"));

  revalidatePath(`/admin/courses/${programmeId}`);
  revalidatePath(`/admin/ars/${processId}`);
  redirect(
    buildKindCourseHref({ courseId: programmeId, kind: "programme", notice: "bundle-granted" }),
  );
}
