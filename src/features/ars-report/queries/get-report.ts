import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface ReportComponentView {
  actionPlan: string | null;
  developmentAreas: string | null;
  id: number | null;
  metricHasNotes: boolean;
  metricHasScores: boolean;
  metricLabel: string;
  metricNames: string[];
  metrics: unknown[];
  nextStep: string | null;
  readinessTag: string | null;
  score: number | null;
  strengths: string | null;
  templateComponentId: number;
  timeline: string | null;
  title: string;
  usesActionPlan: boolean;
  usesDevelopmentAreas: boolean;
  usesStrengths: boolean;
  weightagePct: number;
}

export interface ReportView {
  closingNote: string | null;
  components: ReportComponentView[];
  id: number;
  overallLevel: string | null;
  overallLevels: string[];
  overallScore: number | null;
  readinessTags: string[];
  releasedAt: string | null;
  status: "draft" | "released";
  studentName: string;
  templateName: string;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getReport(reportId: number): Promise<ReportView | null> {
  const supabase = await createServerSupabaseClient();
  const { data: report, error } = await supabase
    .from("ars_reports")
    .select("id, template_id, student_id, status, overall_score, overall_level, closing_note, released_at")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load the ARS report: ${error.message}`);
  if (!report) return null;

  const [templateResult, templateComponentsResult, filledResult, studentResult] = await Promise.all([
    supabase.from("ars_report_templates").select("name, readiness_tags, overall_levels").eq("id", report.template_id).single(),
    supabase.from("ars_report_template_components").select("id, title, weightage_pct, metric_label, metric_names, metric_has_scores, metric_has_notes, uses_strengths, uses_development_areas, uses_action_plan, sort_order").eq("template_id", report.template_id).order("sort_order").order("id"),
    supabase.from("ars_report_components").select("id, template_component_id, score, readiness_tag, metrics, strengths, development_areas, action_plan, timeline, next_step").eq("report_id", reportId),
    supabase.from("profiles").select("name").eq("id", report.student_id).single(),
  ]);
  for (const result of [templateResult, templateComponentsResult, filledResult, studentResult]) {
    if (result.error) throw new Error(`Unable to assemble the ARS report: ${result.error.message}`);
  }
  if (!templateResult.data || !studentResult.data) {
    throw new Error("The ARS report references a missing template or student.");
  }

  const filled = new Map((filledResult.data ?? []).map((row) => [row.template_component_id, row]));
  return {
    closingNote: report.closing_note,
    components: (templateComponentsResult.data ?? []).map((component) => {
      const value = filled.get(component.id);
      return {
        actionPlan: value?.action_plan ?? null,
        developmentAreas: value?.development_areas ?? null,
        id: value?.id ?? null,
        metricHasNotes: component.metric_has_notes,
        metricHasScores: component.metric_has_scores,
        metricLabel: component.metric_label,
        metricNames: stringArray(component.metric_names),
        metrics: Array.isArray(value?.metrics) ? value.metrics : [],
        nextStep: value?.next_step ?? null,
        readinessTag: value?.readiness_tag ?? null,
        score: value?.score ?? null,
        strengths: value?.strengths ?? null,
        templateComponentId: component.id,
        timeline: value?.timeline ?? null,
        title: component.title,
        usesActionPlan: component.uses_action_plan,
        usesDevelopmentAreas: component.uses_development_areas,
        usesStrengths: component.uses_strengths,
        weightagePct: component.weightage_pct,
      };
    }),
    id: report.id,
    overallLevel: report.overall_level,
    overallLevels: stringArray(templateResult.data.overall_levels),
    overallScore: report.overall_score,
    readinessTags: stringArray(templateResult.data.readiness_tags),
    releasedAt: report.released_at,
    status: report.status as "draft" | "released",
    studentName: studentResult.data.name,
    templateName: templateResult.data.name,
  };
}
