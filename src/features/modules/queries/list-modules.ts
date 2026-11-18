import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { modulesPageSize, programmesByModule, sanitizeModuleSearch } from "../modules";

export interface ModuleListRow {
  id: number;
  programmeCount: number;
  title: string;
}

export interface ModuleListPage {
  page: number;
  pageCount: number;
  rows: ModuleListRow[];
  total: number;
}

// One page of the library with how many programmes use each module. RLS scopes
// both tables to the admin's organisation, so there is no org filter here.
export async function listModules({ page, search }: { page: number; search: string }): Promise<ModuleListPage> {
  const supabase = await createServerSupabaseClient();
  const term = sanitizeModuleSearch(search);
  const from = (page - 1) * modulesPageSize;

  let query = supabase
    .from("modules")
    .select("id, title", { count: "exact" })
    .order("title")
    .order("id")
    .range(from, from + modulesPageSize - 1);
  if (term) query = query.ilike("title", `%${term}%`);

  const { count, data, error } = await query;
  if (error) throw new Error(`Unable to list modules: ${error.message}`);
  const modules = data ?? [];

  const attachments =
    modules.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("section_modules")
          .select("module_id, sections(course_id, courses(title))")
          .in("module_id", modules.map((row) => row.id))
          .limit(5000);
  if (attachments.error) throw new Error(`Unable to count where modules are used: ${attachments.error.message}`);

  const used = programmesByModule(
    (attachments.data ?? []).flatMap((row) => {
      const section = row.sections as unknown as { course_id: number; courses: { title: string } | null } | null;
      return section ? [{ courseId: section.course_id, courseTitle: section.courses?.title ?? "", moduleId: row.module_id }] : [];
    }),
  );

  const total = count ?? modules.length;
  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / modulesPageSize)),
    rows: modules.map((row) => ({ id: row.id, programmeCount: used.get(row.id)?.length ?? 0, title: row.title })),
    total,
  };
}
