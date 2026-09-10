"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildRoundsHref, parseRoundId } from "../list-params";

// Removing a round an admin added by mistake.
//
// Safe today because `ars_submissions` does not exist yet, so a round has
// nothing hanging off it. **That changes in step 3**, and the decision belongs
// with the table that creates the dependency: `ars_submissions.round_id` must be
// ON DELETE RESTRICT, so a round a student has already answered cannot be
// deleted at all. Losing a submission is losing a student's work, and the
// schema should refuse rather than the interface remembering to.
//
// Recorded here as well as in CONTEXT.md because this is the file that would
// have to change, and a note beside the FK is easier to miss than one beside
// the delete.
export async function deleteRoundAction(formData: FormData): Promise<void> {
  await requireRole("admin");

  const rawCourseId = formData.get("courseId");
  const rawRoundId = formData.get("roundId");

  const courseId = parseRoundId(
    typeof rawCourseId === "string" ? rawCourseId : undefined,
  );
  const roundId = parseRoundId(
    typeof rawRoundId === "string" ? rawRoundId : undefined,
  );

  if (courseId === null) {
    redirect("/admin/courses?error=invalid-request");
  }

  if (roundId === null) {
    redirect(buildRoundsHref({ courseId, error: "invalid-request" }));
  }

  const supabase = await createServerSupabaseClient();

  // Counting the affected rows, not trusting the absence of an error.
  //
  // When RLS filters a write to zero rows, PostgREST returns no error at all,
  // so an action that only checks `error` reports success for a change that
  // never happened. Told "Round removed" while it is still there, an admin has
  // no reason to look again.
  //
  // Scoped by `course_id` as well as `id`: without it, a hand-posted round id
  // from another programme would be deleted and the admin returned to a page
  // that looks unchanged. RLS would still refuse another organisation's round,
  // but not another programme's within the same organisation.
  const { data, error } = await supabase
    .from("ars_rounds")
    .delete()
    .eq("id", roundId)
    .eq("course_id", courseId)
    .select("id");

  if (error || (data ?? []).length !== 1) {
    redirect(buildRoundsHref({ courseId, error: "delete-failed" }));
  }

  revalidatePath(`/admin/courses/${courseId}`);
  redirect(buildRoundsHref({ courseId, notice: "removed" }));
}
