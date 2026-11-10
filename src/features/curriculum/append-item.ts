import "server-only";

import type { Profile } from "@/features/auth/types";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { nextSortOrder, type Placement } from "./curriculum";

export { parsePlacement, type Placement } from "./curriculum";

// Putting an item at the end of a programme section, shared by the builder's
// Add and by uploads started from the builder. Not a "use server" file on
// purpose: every export of one is a public endpoint.
//
// Everything goes through the admin's own session, so RLS (`*_insert_admin`)
// and `private.validate_curriculum_item` still decide what may be inserted.

// The section must belong to this programme. Read through RLS, so a section in
// another organisation is simply not found. Sections exist only on programmes
// (a trigger refuses one on an ARS process), so this also proves the course is one.
export async function sectionInCourse(placement: Placement): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("sections")
    .select("id")
    .eq("id", placement.sectionId)
    .eq("course_id", placement.courseId)
    .maybeSingle();
  return Boolean(data);
}

export async function appendCurriculumItem(
  admin: Profile,
  placement: Placement,
  fields: { type: "document" | "test" | "video"; refId: number } | { type: "text"; title: string; body: string },
): Promise<boolean> {
  if (!(await sectionInCourse(placement))) return false;
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: readError } = await supabase
    .from("curriculum_items")
    .select("id, sort_order")
    .eq("section_id", placement.sectionId)
    .limit(2000);
  if (readError) return false;

  const { error } = await supabase.from("curriculum_items").insert({
    ...(fields.type === "text" ? { body: fields.body, title: fields.title } : { ref_id: fields.refId }),
    org_id: admin.orgId,
    section_id: placement.sectionId,
    sort_order: nextSortOrder(
      (existing ?? []).map((row) => ({ id: row.id as number, sortOrder: row.sort_order as number })),
    ),
    type: fields.type,
  });
  return !error;
}
