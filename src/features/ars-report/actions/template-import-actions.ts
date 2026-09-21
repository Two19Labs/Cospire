"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parseOptionalId } from "../template-input";
import { parseImportedTemplate } from "../template-import-spec";
import { initialTemplateImportState, type TemplateImportState } from "../template-import-state";

function paste(formData: FormData): string {
  const raw = formData.get("pasted");
  return typeof raw === "string" ? raw.slice(0, 200_000) : "";
}

export async function previewTemplateImportAction(_state: TemplateImportState, formData: FormData): Promise<TemplateImportState> {
  await requireRole("admin");
  const pasted = paste(formData);
  if (!pasted.trim()) return { ...initialTemplateImportState, pasted, problems: ["Paste the model's answer first."] };
  const result = parseImportedTemplate(pasted);
  return { pasted, ...result };
}

export async function createImportedTemplateAction(_state: TemplateImportState, formData: FormData): Promise<TemplateImportState> {
  const admin = await requireRole("admin");
  const pasted = paste(formData);
  const parsed = parseImportedTemplate(pasted);
  if (!parsed.template) return { pasted, ...parsed };
  const course = parseOptionalId(formData.get("courseId"));
  if (!course.ok) return { pasted, problems: ["Choose a valid programme."], template: parsed.template };

  const supabase = await createServerSupabaseClient();
  // Imported round names are suggestions only. Linking is a separate manual
  // choice on the template detail screen, so import never guesses a match.
  const unmatched: typeof parsed.template.components = [];
  if (unmatched.length) return { pasted, problems: unmatched.map((component) => `No round named “${component.roundName}” exists in the selected programme. Remove that round name or choose the matching programme.`), template: parsed.template };

  const { data: created, error } = await supabase.from("ars_report_templates").insert({
    course_id: course.value, is_active: false, name: parsed.template.name, org_id: admin.orgId,
    overall_levels: parsed.template.overallLevels, readiness_tags: parsed.template.readinessTags,
  }).select("id").single();
  if (error || !created) return { pasted, problems: ["The template could not be created."], template: parsed.template };

  const { error: componentError } = await supabase.from("ars_report_template_components").insert(parsed.template.components.map((component, index) => ({
    metric_has_notes: component.metricHasNotes, metric_has_scores: component.metricHasScores,
    metric_label: component.metricLabel, metric_names: component.metricNames, org_id: admin.orgId,
    round_id: null,
    sort_order: index, template_id: created.id, title: component.title,
    uses_action_plan: component.usesActionPlan, uses_development_areas: component.usesDevelopmentAreas,
    uses_strengths: component.usesStrengths, weightage_pct: component.weightagePct,
  })));
  if (componentError) {
    await supabase.from("ars_report_templates").delete().eq("id", created.id);
    return { pasted, problems: ["The components could not be created. Nothing was kept."], template: parsed.template };
  }
  revalidatePath("/admin/report-templates");
  redirect(`/admin/report-templates/${created.id}?templateNotice=created`);
}
