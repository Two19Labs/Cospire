"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildTemplateHref, buildTemplatesHref } from "../list-params";
import {
  orderWeightageChanges,
  parseFlag,
  parseId,
  parseMetricNames,
  parseOptionalId,
  parseVocabulary,
  validateComponentTitle,
  validateMetricLabel,
  validateTemplateName,
  validateWeightage,
} from "../template-input";

// Admin authoring for the ARS report template.
//
// This is the slice that makes the report usable at all. Until it existed, a
// template could only be created by hand-written SQL against the live database,
// which operating manual §4.5 forbids -- so the feature shipped with no way for
// the Client to switch it on.
//
// Everything is written through the signed-in admin's own client, never the
// secret key, so the `_insert_admin` and `_update_admin` policies still decide
// which organisation may be written to. Using the secret key here would work and
// would silently take RLS out of the path.
//
// Every argument is validated at runtime. A Server Action is a public endpoint
// and TypeScript's parameter types are erased at that boundary.

export async function createTemplateAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const name = validateTemplateName(formData.get("name"));
  if (!name) redirect(buildTemplatesHref({ error: "name-invalid" }));

  const course = parseOptionalId(formData.get("courseId"));
  if (!course.ok) redirect(buildTemplatesHref({ error: "invalid-request" }));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_report_templates")
    .insert({
      course_id: course.value,
      name,
      org_id: admin.orgId,
      // Seeded from the Client's own report so a new template is usable
      // immediately. They are data, and the admin edits them on the next screen.
      overall_levels: ["Strong", "Moderate", "Emerging"],
      readiness_tags: ["Ready", "Developing", "Needs Work"],
    })
    .select("id")
    .single();

  if (error || !data) redirect(buildTemplatesHref({ error: "save-failed" }));

  revalidatePath("/admin/report-templates");
  redirect(buildTemplateHref({ notice: "created", templateId: data.id }));
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  await requireRole("admin");

  const templateId = parseId(formData.get("templateId"));
  if (templateId === null) redirect(buildTemplatesHref({ error: "invalid-request" }));

  const name = validateTemplateName(formData.get("name"));
  if (!name) redirect(buildTemplateHref({ error: "name-invalid", templateId }));

  const course = parseOptionalId(formData.get("courseId"));
  const readinessTags = parseVocabulary(formData.get("readinessTags"));
  const overallLevels = parseVocabulary(formData.get("overallLevels"));

  if (!course.ok || readinessTags === null || overallLevels === null) {
    redirect(buildTemplateHref({ error: "invalid-request", templateId }));
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_report_templates")
    .update({
      course_id: course.value,
      is_active: parseFlag(formData.get("isActive")),
      name,
      overall_levels: overallLevels,
      readiness_tags: readinessTags,
    })
    .eq("id", templateId)
    .select("id");

  // Row count, not the absence of an error. RLS filters a disallowed update to
  // zero rows and PostgREST reports success -- the shape this project has been
  // caught by twice.
  if (error || (data ?? []).length !== 1) {
    redirect(buildTemplateHref({ error: "save-failed", templateId }));
  }

  revalidatePath(`/admin/report-templates/${templateId}`);
  redirect(buildTemplateHref({ notice: "saved", templateId }));
}

export async function addComponentAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const templateId = parseId(formData.get("templateId"));
  if (templateId === null) redirect(buildTemplatesHref({ error: "invalid-request" }));

  const title = validateComponentTitle(formData.get("title"));
  const weightage = validateWeightage(formData.get("weightagePct"));
  const metricLabel = validateMetricLabel(formData.get("metricLabel"));
  const metricNames = parseMetricNames(formData.get("metricNames"));
  const round = parseOptionalId(formData.get("roundId"));

  if (!title || metricLabel === null || metricNames === null || !round.ok) {
    redirect(buildTemplateHref({ error: "component-invalid", templateId }));
  }
  if (weightage === null) {
    redirect(buildTemplateHref({ error: "weightage-invalid", templateId }));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("ars_report_template_components").insert({
    metric_has_notes: parseFlag(formData.get("metricHasNotes")),
    metric_has_scores: parseFlag(formData.get("metricHasScores")),
    metric_label: metricLabel,
    metric_names: metricNames,
    org_id: admin.orgId,
    round_id: round.value,
    sort_order: Number(formData.get("sortOrder")) || 0,
    template_id: templateId,
    title,
    uses_action_plan: parseFlag(formData.get("usesActionPlan")),
    uses_development_areas: parseFlag(formData.get("usesDevelopmentAreas")),
    uses_strengths: parseFlag(formData.get("usesStrengths")),
    weightage_pct: weightage,
  });

  if (error) {
    // 23514 is the weightage-total trigger refusing to let the components sum
    // past 100. It is the one failure here an admin can actually act on, so it
    // gets its own sentence rather than the generic one.
    const overHundred = error.code === "23514" && error.message.includes("more than 100");
    redirect(
      buildTemplateHref({
        error: overHundred ? "weightage-over-100" : "component-invalid",
        templateId,
      }),
    );
  }

  revalidatePath(`/admin/report-templates/${templateId}`);
  redirect(buildTemplateHref({ notice: "component-added", templateId }));
}

export async function removeComponentAction(formData: FormData): Promise<void> {
  await requireRole("admin");

  const templateId = parseId(formData.get("templateId"));
  const componentId = parseId(formData.get("componentId"));
  if (templateId === null || componentId === null) {
    redirect(buildTemplatesHref({ error: "invalid-request" }));
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ars_report_template_components")
    .delete()
    .eq("id", componentId)
    .eq("template_id", templateId)
    .select("id");

  // A component a report has already used is refused by the foreign key, which
  // is the schema protecting someone's written assessment rather than the
  // interface remembering to.
  if (error || (data ?? []).length !== 1) {
    redirect(buildTemplateHref({ error: "delete-failed", templateId }));
  }

  revalidatePath(`/admin/report-templates/${templateId}`);
  redirect(buildTemplateHref({ notice: "component-removed", templateId }));
}

export async function updateComponentRoundAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const templateId = parseId(formData.get("templateId"));
  const componentId = parseId(formData.get("componentId"));
  const round = parseOptionalId(formData.get("roundId"));
  if (templateId === null || componentId === null || !round.ok) {
    redirect(buildTemplatesHref({ error: "invalid-request" }));
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("ars_report_template_components")
    .update({ round_id: round.value }).eq("id", componentId).eq("template_id", templateId).select("id");
  if (error || (data ?? []).length !== 1) redirect(buildTemplateHref({ error: "save-failed", templateId }));
  revalidatePath(`/admin/report-templates/${templateId}`);
  redirect(buildTemplateHref({ notice: "saved", templateId }));
}

// Rebalancing every weightage at once, in an order that cannot be refused.
//
// The constraint trigger is DEFERRABLE INITIALLY DEFERRED, so several changes in
// ONE transaction are judged only on their final total. PostgREST commits each
// request separately, so this action's updates are separate transactions and a
// swap of A 40->60 with B 60->40 would be refused if the raise went first: 120
// at that moment, even though the end state is legal.
//
// So every decrease is applied before any increase. The running total is then
// non-increasing until the last step, and no intermediate state can exceed 100
// whenever the final state does not. `orderWeightageChanges` is unit tested.
export async function saveWeightagesAction(formData: FormData): Promise<void> {
  await requireRole("admin");

  const templateId = parseId(formData.get("templateId"));
  if (templateId === null) redirect(buildTemplatesHref({ error: "invalid-request" }));

  const supabase = await createServerSupabaseClient();
  const { data: current, error: readError } = await supabase
    .from("ars_report_template_components")
    .select("id, weightage_pct")
    .eq("template_id", templateId);

  if (readError) redirect(buildTemplateHref({ error: "save-failed", templateId }));
  if (!current?.length) redirect(buildTemplateHref({ notice: "weightages-saved", templateId }));

  const changes: { current: number; id: number; next: number }[] = [];
  for (const row of current) {
    const next = validateWeightage(formData.get(`weightage-${row.id}`));
    if (next === null) redirect(buildTemplateHref({ error: "weightage-invalid", templateId }));
    changes.push({ current: Number(row.weightage_pct ?? 0), id: row.id, next });
  }

  // Refused here as well as by the trigger, so the admin gets the readable
  // sentence before any row is touched rather than a partial application.
  const total = changes.reduce((sum, entry) => sum + entry.next, 0);
  if (Math.round(total * 100) / 100 > 100) {
    redirect(buildTemplateHref({ error: "weightage-over-100", templateId }));
  }

  for (const change of orderWeightageChanges(changes)) {
    const { data, error } = await supabase
      .from("ars_report_template_components")
      .update({ weightage_pct: change.next })
      .eq("id", change.id)
      .eq("template_id", templateId)
      .select("id");

    if (error || (data ?? []).length !== 1) {
      redirect(buildTemplateHref({ error: "save-failed", templateId }));
    }
  }

  revalidatePath(`/admin/report-templates/${templateId}`);
  redirect(buildTemplateHref({ notice: "weightages-saved", templateId }));
}
