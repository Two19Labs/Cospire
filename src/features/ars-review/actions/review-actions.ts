"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parseSubmissionId } from "../queries/mentor-submissions";

export async function markSubmissionReviewedAction(formData: FormData): Promise<void> {
  await requireRole("mentor");
  const id = parseSubmissionId(String(formData.get("submissionId") ?? ""));
  if (id === null) redirect("/mentor?error=invalid-request");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_submissions").update({ status: "reviewed" }).eq("id", id).eq("status", "submitted").select("id");
  if (error || (data ?? []).length !== 1) redirect(`/mentor/ars/${id}?error=review-failed`);
  revalidatePath("/mentor");
  revalidatePath(`/mentor/ars/${id}`);
  redirect(`/mentor/ars/${id}?notice=reviewed`);
}

export async function recordOfflineRoundAction(formData: FormData): Promise<void> {
  const mentor = await requireRole("mentor");
  const roundId = parseSubmissionId(String(formData.get("roundId") ?? ""));
  const studentId = String(formData.get("studentId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (roundId === null || !/^[0-9a-f-]{36}$/i.test(studentId) || !["completed", "passed", "needs_follow_up"].includes(outcome) || note.length > 2000) redirect("/mentor?error=invalid-request");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("ars_submissions").insert({
    answer: { outcome, ...(note ? { note } : {}) }, org_id: mentor.orgId, round_id: roundId, status: "submitted", student_id: studentId,
  });
  if (error) redirect(`/mentor?error=${error.code === "42501" ? "earlier-round-first" : "offline-save-failed"}`);
  revalidatePath("/mentor");
  redirect("/mentor?notice=offline-recorded");
}
