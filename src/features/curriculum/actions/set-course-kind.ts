"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildKindCourseHref, parseCourseId, parseCourseKind } from "../list-params";

// Moving a row between Programmes and ARS.
//
// This exists because the backfill that introduced `courses.kind` classified
// every existing row by one rule -- a course with ARS rounds is a process --
// and a rule that good is still a rule that can be wrong about a particular
// row. "Ashoka" moved to ARS on the strength of a single round called "ARS
// Template". Without this control that classification would be permanent, and a
// screen you cannot get out of is the same dead end as a list with no way in.
//
// Written through the signed-in admin's own client, never the secret key, so
// `courses_update_admin` still decides who may write and to which organisation.
export async function setCourseKindAction(formData: FormData): Promise<void> {
  await requireRole("admin");

  const courseId = parseCourseId(
    typeof formData.get("courseId") === "string" ? String(formData.get("courseId")) : undefined,
  );
  if (courseId === null) redirect("/admin/courses?error=invalid-request");

  // Where it is now, and where it is going. Both come from the closed set, so
  // neither can steer the redirect anywhere but one of two literal paths.
  const from = parseCourseKind(formData.get("kind"));
  const to = parseCourseKind(formData.get("target"));

  if (!from || !to || from === to) {
    redirect(buildKindCourseHref({ courseId, error: "invalid-request", kind: from ?? "programme" }));
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("courses")
    .update({ kind: to })
    .eq("id", courseId)
    .eq("kind", from)
    .select("id");

  // Row count, not the absence of an error. RLS filters a disallowed update to
  // zero rows and PostgREST reports success -- the shape this project has been
  // caught by twice. The `.eq("kind", from)` also makes this idempotent: a
  // double-submitted form changes nothing the second time and says so.
  if (error || (data ?? []).length !== 1) {
    redirect(buildKindCourseHref({ courseId, error: "move-failed", kind: from }));
  }

  revalidatePath("/admin/courses");
  revalidatePath("/admin/ars");
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/admin/ars/${courseId}`);

  // Land in the section it has moved to, because that is where it now is.
  redirect(buildKindCourseHref({ courseId, kind: to, notice: "moved" }));
}
