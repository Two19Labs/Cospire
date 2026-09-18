import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface TemplateComponent {
  id: number;
  metricHasNotes: boolean;
  metricHasScores: boolean;
  metricLabel: string;
  metricNames: string[];
  roundId: number | null;
  roundName: string | null;
  sortOrder: number;
  title: string;
  usesActionPlan: boolean;
  usesDevelopmentAreas: boolean;
  usesStrengths: boolean;
  weightagePct: number;
}

export interface TemplateDetail {
  components: TemplateComponent[];
  courseId: number | null;
  courseOptions: { id: number; title: string }[];
  id: number;
  isActive: boolean;
  name: string;
  overallLevels: string[];
  readinessTags: string[];
  roundOptions: { id: number; name: string }[];
  weightageTotal: number;
}

// jsonb arrives as parsed JSON, but it is a column an earlier migration could
// have left in any shape, so it is narrowed rather than cast.
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function getTemplate(templateId: number): Promise<TemplateDetail | null> {
  const supabase = await createServerSupabaseClient();

  const { data: template, error } = await supabase
    .from("ars_report_templates")
    .select("id, name, course_id, is_active, readiness_tags, overall_levels")
    .eq("id", templateId)
    .maybeSingle();

  // A template outside the caller's reach comes back as no row rather than an
  // error, because RLS filters it. That is indistinguishable from a deleted one
  // and is meant to be: both are "not found" to this caller.
  if (error) throw new Error(`Unable to load the report template: ${error.message}`);
  if (!template) return null;

  const { data: components, error: componentsError } = await supabase
    .from("ars_report_template_components")
    .select(
      "id, title, weightage_pct, metric_label, metric_names, metric_has_scores, metric_has_notes, uses_strengths, uses_development_areas, uses_action_plan, sort_order, round_id",
    )
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (componentsError) {
    throw new Error(`Unable to load the template's components: ${componentsError.message}`);
  }

  // The programmes and rounds an admin may pick from. Both are scoped by their
  // own policies, so an admin of another organisation sees neither.
  const [coursesResult, roundsResult] = await Promise.all([
    supabase.from("courses").select("id, title").order("title", { ascending: true }).limit(200),
    supabase.from("ars_rounds").select("id, name").order("name", { ascending: true }).limit(200),
  ]);

  if (coursesResult.error) throw new Error(`Unable to load programmes: ${coursesResult.error.message}`);
  if (roundsResult.error) throw new Error(`Unable to load rounds: ${roundsResult.error.message}`);

  const roundNames = new Map((roundsResult.data ?? []).map((row) => [row.id, row.name]));

  const rows: TemplateComponent[] = (components ?? []).map((row) => ({
    id: row.id,
    metricHasNotes: row.metric_has_notes,
    metricHasScores: row.metric_has_scores,
    metricLabel: row.metric_label,
    metricNames: toStringList(row.metric_names),
    roundId: row.round_id,
    roundName: row.round_id === null ? null : roundNames.get(row.round_id) ?? null,
    sortOrder: row.sort_order,
    title: row.title,
    usesActionPlan: row.uses_action_plan,
    usesDevelopmentAreas: row.uses_development_areas,
    usesStrengths: row.uses_strengths,
    weightagePct: Number(row.weightage_pct ?? 0),
  }));

  return {
    components: rows,
    courseId: template.course_id,
    courseOptions: coursesResult.data ?? [],
    id: template.id,
    isActive: template.is_active,
    name: template.name,
    overallLevels: toStringList(template.overall_levels),
    readinessTags: toStringList(template.readiness_tags),
    roundOptions: roundsResult.data ?? [],
    weightageTotal: Math.round(rows.reduce((sum, row) => sum + row.weightagePct, 0) * 100) / 100,
  };
}
