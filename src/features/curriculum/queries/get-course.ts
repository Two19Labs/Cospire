import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface Course {
  createdAt: string;
  id: number;
  sortOrder: number;
  title: string;
}

// Returns null rather than throwing when the row is not visible, so the route
// can render a 404.
//
// A programme in another organisation and a programme that does not exist are
// deliberately indistinguishable here: `courses_select_authorized` filters the
// first to zero rows, which arrives as the same `PGRST116` as the second. That
// is the correct behaviour -- telling a rival admin that id 7 exists but is not
// theirs is itself a disclosure -- and it is why this returns null for both
// rather than trying to tell them apart.
export async function getCourse(courseId: number): Promise<Course | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("courses")
    .select("id, title, sort_order, created_at")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the programme: ${error.message}`);
  }

  if (!data) return null;

  const row = data as Record<string, unknown>;

  if (
    typeof row.id !== "number" ||
    typeof row.title !== "string" ||
    typeof row.sort_order !== "number" ||
    typeof row.created_at !== "string"
  ) {
    throw new Error("A programme row came back in an unexpected shape.");
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    sortOrder: row.sort_order,
    title: row.title,
  };
}
