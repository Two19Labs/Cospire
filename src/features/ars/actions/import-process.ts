"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildRoundsHref, parseRoundId } from "../list-params";
import { parseImportedProcess } from "../import-spec";
import { initialImportState, type ImportState } from "../import-state";

// Reading a pasted process, and then writing it.
//
// Two actions rather than one, because a human decides between them. The first
// only reads: it parses the paste and hands back what would be created, and
// touches no table at all. The second is the only one that writes, and it runs
// the parse again from the pasted text rather than trusting anything the
// browser sends back with it.
//
// That re-parse is the point. The preview travels to the client and returns, so
// treating it as the thing to insert would let a crafted post write whatever
// rounds it liked -- a Server Action is a public endpoint and the preview is
// just a form field. The raw paste is the only input, both times.
//
// Both write through the signed-in admin's own client, never the secret key, so
// `ars_rounds_insert_admin` and the composite foreign key still decide what may
// be written and into whose organisation.

function readPaste(formData: FormData): string {
  const raw = formData.get("pasted");
  // Bounded before it is parsed rather than after. A megabyte of pasted text
  // costs a megabyte of JSON parsing on the server, and no real process
  // description approaches this.
  return typeof raw === "string" ? raw.slice(0, 200_000) : "";
}

export async function previewImportAction(
  _state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole("admin");

  const pasted = readPaste(formData);
  if (pasted.trim() === "") {
    return { ...initialImportState, pasted, problems: ["Paste the model's answer first."] };
  }

  const { problems, programmeName, rounds } = parseImportedProcess(pasted);

  return {
    pasted,
    problems,
    programmeName,
    rounds: problems.length === 0 ? rounds : null,
  };
}

export async function createImportedProcessAction(
  _state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const admin = await requireRole("admin");

  const courseId = parseRoundId(
    typeof formData.get("courseId") === "string" ? String(formData.get("courseId")) : undefined,
  );
  if (courseId === null) {
    redirect("/admin/courses?error=invalid-request");
  }

  const pasted = readPaste(formData);
  const { problems, programmeName, rounds } = parseImportedProcess(pasted);

  // Re-parsed, so a paste that was valid a moment ago and is not now -- because
  // the admin edited the box before confirming -- is refused rather than
  // half-applied.
  if (problems.length > 0 || rounds.length === 0) {
    return {
      pasted,
      problems: problems.length > 0 ? problems : ["There is nothing to create."],
      programmeName,
      rounds: null,
    };
  }

  const supabase = await createServerSupabaseClient();

  // The programme's existing rounds, which an import replaces.
  const { data: existing, error: readError } = await supabase
    .from("ars_rounds")
    .select("id")
    .eq("course_id", courseId);

  if (readError) {
    return {
      pasted,
      problems: ["That programme could not be read. Nothing was changed."],
      programmeName,
      rounds,
    };
  }

  const existingIds = (existing ?? []).map((row) => row.id as number);

  if (existingIds.length > 0) {
    // One statement, so it is all or nothing. That matters more than it looks:
    // `ars_submissions.round_id` and `ars_attempt_grants.round_id` are both ON
    // DELETE RESTRICT, so if any single round has been answered the whole
    // delete is refused and the process is left exactly as it was, rather than
    // losing the rounds nobody had reached yet.
    const { error: deleteError } = await supabase
      .from("ars_rounds")
      .delete()
      .eq("course_id", courseId)
      .in("id", existingIds);

    if (deleteError) {
      return {
        pasted,
        problems: [
          deleteError.code === "23503"
            ? "A student has already answered one of this programme's rounds, so they cannot be replaced. Nothing was changed."
            : "This programme's existing rounds could not be replaced. Nothing was changed.",
        ],
        programmeName,
        rounds,
      };
    }
  }

  // Also one statement, for the same reason. The rounds keep the order the
  // document gave them: `sort_order` defaults to 0 for every row and
  // `listRounds` breaks that tie on `id`, so inserting in order is enough and
  // no ordering column has to be managed here.
  const { error: insertError } = await supabase.from("ars_rounds").insert(
    rounds.map((round) => ({
      config: round.config,
      course_id: courseId,
      due_at: round.dueAt,
      name: round.name,
      opens_at: round.opensAt,
      org_id: admin.orgId,
      requires_review: round.requiresReview,
      submission_mode: round.submissionMode,
    })),
  );

  if (insertError) {
    // The one genuinely bad outcome: the old rounds are gone and the new ones
    // did not land. Said plainly, with the paste still in the box, because the
    // fix is to press the button again.
    return {
      pasted,
      problems: [
        existingIds.length > 0
          ? "The old rounds were removed but the new ones could not be created. The programme has no rounds right now — press Create again."
          : "Those rounds could not be created. Nothing was changed.",
      ],
      programmeName,
      rounds,
    };
  }

  revalidatePath(`/admin/ars/${courseId}`);
  redirect(buildRoundsHref({ courseId, notice: "imported" }));
}
