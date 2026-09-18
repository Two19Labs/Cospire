import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { templatesPageSize } from "../list-params";

export interface TemplateListRow {
  componentCount: number;
  courseTitle: string | null;
  id: number;
  isActive: boolean;
  name: string;
  weightageTotal: number;
}

export interface TemplateListPage {
  page: number;
  pageCount: number;
  rows: TemplateListRow[];
  total: number;
}

// No organisation filter, for the same reason `listCourses` has none:
// `ars_report_templates_select_staff` already scopes the caller. Restating it
// here would be application code impersonating the access control, and would
// mask the difference if the policy ever changed.
export async function listTemplates({ page }: { page: number }): Promise<TemplateListPage> {
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * templatesPageSize;

  const { count, data, error } = await supabase
    .from("ars_report_templates")
    .select("id, name, course_id, is_active", { count: "exact" })
    .order("name", { ascending: true })
    // A unique final sort key. Two templates sharing a name would otherwise come
    // back in an arbitrary order and could swap between pages, showing one twice
    // and hiding another entirely.
    .order("id", { ascending: true })
    .range(from, from + templatesPageSize - 1);

  if (error) throw new Error(`Unable to list report templates: ${error.message}`);

  const total = count ?? data?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / templatesPageSize));
  if (!data?.length) return { page, pageCount, rows: [], total };

  const templateIds = data.map((row) => row.id);
  const courseIds = [...new Set(data.map((row) => row.course_id).filter((id): id is number => id !== null))];

  // Both lists are bounded by the page above, so neither `IN` carries more than
  // `templatesPageSize` ids.
  const [componentsResult, coursesResult] = await Promise.all([
    supabase
      .from("ars_report_template_components")
      .select("template_id, weightage_pct")
      .in("template_id", templateIds),
    courseIds.length
      ? supabase.from("courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (componentsResult.error) {
    throw new Error(`Unable to total the template weightages: ${componentsResult.error.message}`);
  }
  if (coursesResult.error) {
    throw new Error(`Unable to load template programmes: ${coursesResult.error.message}`);
  }

  const counts = new Map<number, { count: number; total: number }>();
  for (const component of componentsResult.data ?? []) {
    const entry = counts.get(component.template_id) ?? { count: 0, total: 0 };
    entry.count += 1;
    // numeric arrives as a string from PostgREST when it will not fit a double
    // safely, so it is coerced rather than assumed to be a number.
    entry.total += Number(component.weightage_pct ?? 0);
    counts.set(component.template_id, entry);
  }

  const courses = new Map((coursesResult.data ?? []).map((row) => [row.id, row.title]));

  const rows = data.map((row) => {
    const entry = counts.get(row.id);
    return {
      componentCount: entry?.count ?? 0,
      courseTitle: row.course_id === null ? null : courses.get(row.course_id) ?? "Programme",
      id: row.id,
      isActive: row.is_active,
      name: row.name,
      weightageTotal: Math.round((entry?.total ?? 0) * 100) / 100,
    };
  });

  return { page, pageCount, rows, total };
}
