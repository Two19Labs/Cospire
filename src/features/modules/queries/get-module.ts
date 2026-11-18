import "server-only";

import type { CurriculumItemType } from "@/features/curriculum/curriculum";
import { loadItemTitles } from "@/features/curriculum/queries/get-curriculum";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { programmesByModule } from "../modules";

export interface ModuleItem {
  body: string | null;
  id: number;
  title: string;
  type: CurriculumItemType;
}

export interface ModuleDetail {
  id: number;
  items: ModuleItem[];
  // Read-only here; attaching is done from the programme page.
  programmes: { id: number; title: string }[];
  title: string;
}

// Null when the module is not visible to the caller, which becomes a 404.
export async function getModule(moduleId: number): Promise<ModuleDetail | null> {
  const supabase = await createServerSupabaseClient();
  const [module, items, attachments] = await Promise.all([
    supabase.from("modules").select("id, title").eq("id", moduleId).maybeSingle(),
    supabase
      .from("curriculum_items")
      .select("id, type, ref_id, title, body")
      .eq("module_id", moduleId)
      .order("sort_order")
      .order("id")
      .limit(2000),
    supabase
      .from("section_modules")
      .select("module_id, sections(course_id, courses(title))")
      .eq("module_id", moduleId)
      .limit(500),
  ]);
  if (module.error) throw new Error(`Unable to load the module: ${module.error.message}`);
  if (!module.data) return null;
  if (items.error) throw new Error(`Unable to load the module's items: ${items.error.message}`);
  if (attachments.error) throw new Error(`Unable to load where the module is used: ${attachments.error.message}`);

  const rows = (items.data ?? []) as { body: string | null; id: number; ref_id: number | null; title: string | null; type: CurriculumItemType }[];
  const titles = await loadItemTitles(supabase, rows);
  const used = programmesByModule(
    (attachments.data ?? []).flatMap((row) => {
      const section = row.sections as unknown as { course_id: number; courses: { title: string } | null } | null;
      return section ? [{ courseId: section.course_id, courseTitle: section.courses?.title ?? "", moduleId: row.module_id }] : [];
    }),
  );

  return {
    id: module.data.id,
    items: rows.map((row) => ({
      body: row.body,
      id: row.id,
      title: row.title ?? titles.get(`${row.type}:${row.ref_id}`) ?? "Unavailable",
      type: row.type,
    })),
    programmes: used.get(moduleId) ?? [],
    title: module.data.title,
  };
}
