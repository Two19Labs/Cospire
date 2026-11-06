"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { readAnswer } from "../answer-checks";
import { fieldsForStep, sectionShown, toFormSpec, type RoundMode } from "../form-schema";
import { parseRoundId } from "../list-params";

// A student answering a round.
//
// Written through the student's own client, never the secret key, so
// `ars_submissions_insert_student` still decides what may be written and
// `private.ars_begin_submission` still enforces the round sequence and the
// attempt allowance. Using the secret key here would work and would silently
// take every one of those rules out of the path.
//
// Every value is validated at runtime. A Server Action is a public HTTP endpoint
// and TypeScript's parameter types are erased at that boundary, so the posted
// body may contain anything at all -- including keys for fields this round does
// not have.

function hrefFor(roundId: number, params?: { error?: string; notice?: string; step?: number }): string {
  const search = new URLSearchParams();
  if (params?.step && params.step > 1) search.set("step", String(params.step));
  if (params?.error) search.set("error", params.error);
  if (params?.notice) search.set("notice", params.notice);
  const query = search.toString();
  return query ? `/student/ars/${roundId}?${query}` : `/student/ars/${roundId}`;
}

async function loadRound(roundId: number) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_rounds")
    .select("id, org_id, submission_mode, config")
    .eq("id", roundId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function saveAnswers(
  formData: FormData,
  { status }: { status: "draft" | "submitted" },
): Promise<void> {
  const student = await requireRole("student");

  const roundId = parseRoundId(String(formData.get("roundId") ?? ""));
  if (roundId === null) redirect("/student/ars?error=invalid-request");

  const round = await loadRound(roundId);
  if (!round) redirect("/student/ars?error=not-found");

  const spec = toFormSpec(round.config, round.submission_mode as RoundMode);
  if (!spec) redirect(hrefFor(roundId, { error: "no-form" }));

  const stepIndex = Number.parseInt(String(formData.get("stepIndex") ?? "0"), 10);
  if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex >= spec.steps.length) {
    redirect(hrefFor(roundId, { error: "invalid-request" }));
  }

  const supabase = await createServerSupabaseClient();

  // Merge onto whatever is already stored rather than replacing it, because a
  // step saves only its own fields and must not wipe the others.
  const { data: existing, error: readError } = await supabase
    .from("ars_submissions")
    .select("id, answer, status")
    .eq("round_id", roundId)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) redirect(hrefFor(roundId, { error: "save-failed" }));

  if (existing && existing.status !== "draft") {
    // Handed-in work is fixed. The database refuses this too; saying so plainly
    // is better than letting the student meet a policy failure.
    redirect(hrefFor(roundId, { error: "already-submitted" }));
  }

  const merged: Record<string, unknown> =
    typeof existing?.answer === "object" && existing.answer !== null && !Array.isArray(existing.answer)
      ? { ...(existing.answer as Record<string, unknown>) }
      : {};

  const step = spec.steps[stepIndex];
  for (const field of fieldsForStep(step)) {
    if (field.prefill) continue; // Server-owned; never taken from the body.
    // Uploads are transferred directly to Storage and attached to the draft by
    // upload-actions.ts. A plain form post carries no bytes and must preserve
    // the already-recorded metadata rather than deleting it.
    if (field.type === "file") continue;
    const { error, value } = readAnswer((name) => formData.get(name), field);
    if (error) redirect(hrefFor(roundId, { error, step: stepIndex + 1 }));
    if (value === undefined) delete merged[field.key];
    else merged[field.key] = value;
  }

  // A hidden section's inputs are still in the page and still posted. Its answers
  // are dropped, so switching 12th results from Yes to No does not hand in a
  // results row the student can no longer see. Uploads stay: their files exist.
  for (const section of step.sections) {
    if (sectionShown(section, merged)) continue;
    for (const field of section.fields) if (field.type !== "file") delete merged[field.key];
  }

  // On submit, every required field across the WHOLE form must be answered --
  // not just this step's, or a student could submit from step one.
  if (status === "submitted") {
    for (const stepToCheck of spec.steps) {
      if (stepToCheck.optional) continue;
      for (const section of stepToCheck.sections) {
        if (!sectionShown(section, merged)) continue;
        for (const field of section.fields) {
          if (field.required && !field.prefill && merged[field.key] === undefined) {
            redirect(hrefFor(roundId, { error: "missing-required", step: spec.steps.indexOf(stepToCheck) + 1 }));
          }
        }
      }
    }
  }

  if (existing) {
    const { data, error } = await supabase
      .from("ars_submissions")
      .update({ answer: merged, status })
      .eq("id", existing.id)
      .select("id");
    // Row count, not the absence of an error: RLS filters a disallowed update to
    // zero rows and PostgREST reports success.
    if (error || (data ?? []).length !== 1) redirect(hrefFor(roundId, { error: "save-failed" }));
  } else {
    const { error } = await supabase.from("ars_submissions").insert({
      answer: merged,
      org_id: student.orgId,
      round_id: roundId,
      status,
      student_id: student.id,
    });
    if (error) {
      // 42501 is the sequence rule or the attempt allowance refusing, which is
      // the one failure a student can act on.
      const blocked = error.code === "42501";
      redirect(hrefFor(roundId, { error: blocked ? "not-your-turn" : "save-failed" }));
    }
  }

  revalidatePath("/student/ars");
  revalidatePath(`/student/ars/${roundId}`);

  if (status === "submitted") redirect(hrefFor(roundId, { notice: "submitted" }));
  redirect(hrefFor(roundId, { notice: "saved", step: stepIndex + 2 }));
}

export async function saveDraftAction(formData: FormData): Promise<void> {
  await saveAnswers(formData, { status: "draft" });
}

export async function submitRoundAction(formData: FormData): Promise<void> {
  await saveAnswers(formData, { status: "submitted" });
}
