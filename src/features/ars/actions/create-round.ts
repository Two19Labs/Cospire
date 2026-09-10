"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildRoundsHref, parseRoundId, type RoundError } from "../list-params";
import { validateNewRound } from "../round-input";

// Phase 5a step 2: an admin adds a round to a programme.
//
// Annexure A commits to admins adding further round types over time, so this
// writes a row rather than needing a developer. The round declares its own shape
// in `submission_mode` and `config`, and one student route will render whichever
// shape it declares.
//
// Written through the signed-in admin's own client, never the secret key, so
// `ars_rounds_insert_admin` still decides who may write and the composite
// foreign key still refuses a programme in another organisation.
export async function createRoundAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const rawCourseId = formData.get("courseId");
  const courseId = parseRoundId(
    typeof rawCourseId === "string" ? rawCourseId : undefined,
  );

  if (courseId === null) {
    // Nowhere sensible to send them: without a valid programme id there is no
    // detail page to return to.
    redirect("/admin/courses?error=invalid-request");
  }

  const { errors, value } = validateNewRound({
    fields: formData.get("fields"),
    name: formData.get("name"),
    prompt: formData.get("prompt"),
    submissionMode: formData.get("submissionMode"),
  });

  if (!value) {
    // Mapped onto the closed error set rather than reflected back, so nothing
    // the admin typed is ever put into a URL and rendered.
    const error: RoundError = errors.name
      ? "name-invalid"
      : errors.submissionMode
        ? "mode-invalid"
        : errors.prompt
          ? "prompt-invalid"
          : "fields-invalid";

    redirect(buildRoundsHref({ courseId, error }));
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("ars_rounds").insert({
    config: value.config,
    course_id: courseId,
    name: value.name,
    org_id: admin.orgId,
    submission_mode: value.submissionMode,
  });

  if (error) {
    // 23505 is `ars_rounds_name_unique_per_course`. That is a sentence the admin
    // can act on -- rename it, or find the one already there -- rather than a
    // generic failure, so it is separated out.
    redirect(
      buildRoundsHref({
        courseId,
        error: error.code === "23505" ? "duplicate-name" : "create-failed",
      }),
    );
  }

  revalidatePath(`/admin/courses/${courseId}`);
  redirect(buildRoundsHref({ courseId, notice: "created" }));
}
