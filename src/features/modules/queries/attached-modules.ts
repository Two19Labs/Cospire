import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { groupAttachments, type AttachedModule, type AttachmentRow } from "../attachments";

// The modules attached to each of a programme's subjects, in order, with each
// module's item count. Keyed by section id. RLS scopes it to the admin's org.
export async function listAttachedModules(courseId: number): Promise<Map<number, AttachedModule[]>> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("section_modules")
    .select("section_id, module_id, sort_order, modules(title, curriculum_items(count)), sections!inner(course_id)")
    .eq("sections.course_id", courseId)
    .limit(2000);
  if (error) throw new Error(`Unable to load the attached modules: ${error.message}`);
  return groupAttachments((data ?? []) as unknown as AttachmentRow[]);
}
