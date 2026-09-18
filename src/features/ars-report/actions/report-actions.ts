"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

function positiveId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function score(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
}

export async function createReportAction(formData: FormData): Promise<void> {
  const mentor = await requireRole("mentor");
  const runId = positiveId(formData.get("runId"));
  const templateId = positiveId(formData.get("templateId"));
  if (runId === null || templateId === null) redirect("/mentor?reportError=invalid-request");

  const supabase = await createServerSupabaseClient();
  const { data: run, error: runError } = await supabase
    .from("ars_process_runs")
    .select("student_id, completed_at")
    .eq("id", runId)
    .maybeSingle();
  if (runError || !run?.completed_at) redirect("/mentor?reportError=run-unavailable");

  const { data, error } = await supabase
    .from("ars_reports")
    .insert({
      org_id: mentor.orgId,
      run_id: runId,
      student_id: run.student_id,
      template_id: templateId,
    })
    .select("id")
    .single();
  if (error || !data) redirect("/mentor?reportError=create-failed");
  redirect(`/mentor/reports/${data.id}`);
}

export async function saveReportComponentAction(formData: FormData): Promise<void> {
  const mentor = await requireRole("mentor");
  const reportId = positiveId(formData.get("reportId"));
  const templateComponentId = positiveId(formData.get("templateComponentId"));
  const componentScore = score(formData.get("score"));
  const readinessTag = optionalText(formData.get("readinessTag"));
  if (reportId === null || templateComponentId === null || componentScore === null || !readinessTag) {
    redirect(reportId ? `/mentor/reports/${reportId}?error=invalid-component` : "/mentor");
  }

  const supabase = await createServerSupabaseClient();
  const { data: definition, error: definitionError } = await supabase
    .from("ars_report_template_components")
    .select("metric_names, metric_has_scores, metric_has_notes")
    .eq("id", templateComponentId)
    .maybeSingle();
  if (definitionError || !definition || !Array.isArray(definition.metric_names)) {
    redirect(`/mentor/reports/${reportId}?error=save-failed`);
  }

  const metrics: Array<Record<string, string | number | null>> = [];
  for (const [index, rawName] of definition.metric_names.entries()) {
    if (typeof rawName !== "string") continue;
    metrics.push({
      name: rawName,
      note: definition.metric_has_notes
        ? optionalText(formData.get(`metricNote_${index}`))
        : null,
      score: definition.metric_has_scores
        ? score(formData.get(`metricScore_${index}`))
        : null,
    });
  }

  const payload = {
    action_plan: optionalText(formData.get("actionPlan")),
    development_areas: optionalText(formData.get("developmentAreas")),
    metrics,
    next_step: optionalText(formData.get("nextStep")),
    readiness_tag: readinessTag,
    score: componentScore,
    strengths: optionalText(formData.get("strengths")),
    timeline: optionalText(formData.get("timeline")),
  };

  const { data: existing, error: lookupError } = await supabase
    .from("ars_report_components")
    .select("id")
    .eq("report_id", reportId)
    .eq("template_component_id", templateComponentId)
    .maybeSingle();
  if (lookupError) redirect(`/mentor/reports/${reportId}?error=save-failed`);

  const result = existing
    ? await supabase.from("ars_report_components").update(payload).eq("id", existing.id).select("id")
    : await supabase.from("ars_report_components").insert({
        ...payload,
        org_id: mentor.orgId,
        report_id: reportId,
        template_component_id: templateComponentId,
      }).select("id");

  if (result.error || (result.data ?? []).length !== 1) {
    redirect(`/mentor/reports/${reportId}?error=save-failed`);
  }
  revalidatePath(`/mentor/reports/${reportId}`);
  redirect(`/mentor/reports/${reportId}?notice=saved`);
}

export async function releaseReportAction(formData: FormData): Promise<void> {
  await requireRole("mentor");
  const reportId = positiveId(formData.get("reportId"));
  if (reportId === null) redirect("/mentor");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_reports")
    .update({
      closing_note: optionalText(formData.get("closingNote")),
      overall_level: optionalText(formData.get("overallLevel")),
      status: "released",
    })
    .eq("id", reportId)
    .select("id");

  if (error || (data ?? []).length !== 1) redirect(`/mentor/reports/${reportId}?error=release-failed`);
  revalidatePath("/mentor");
  revalidatePath("/student");
  redirect(`/mentor/reports/${reportId}?notice=released`);
}
