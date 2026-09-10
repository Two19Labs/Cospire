import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { coursesPageSize, sanitizeCourseSearch } from "../list-params";

export interface CourseListRow {
  createdAt: string;
  id: number;
  sortOrder: number;
  title: string;
}

export interface CourseListPage {
  page: number;
  pageCount: number;
  rows: CourseListRow[];
  total: number;
}

function toRow(entry: unknown): CourseListRow {
  const row = entry as Record<string, unknown>;

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

// No organisation filter and no role filter, for the same reason `listDocuments`
// has none: `courses_select_authorized` already scopes an admin to their own
// organisation and a student to their grants. Restating that here would be
// application code impersonating the access control, and would mask the
// difference if the policy ever changed.
//
// So this one query serves both the admin's programme list and, when the
// student screens land, a student's own. The rows each sees differ entirely,
// and the difference is the database's decision rather than this function's.
export async function listCourses({
  page,
  search,
}: {
  page: number;
  search: string;
}): Promise<CourseListPage> {
  const supabase = await createServerSupabaseClient();
  const term = sanitizeCourseSearch(search);
  const from = (page - 1) * coursesPageSize;

  let query = supabase
    .from("courses")
    .select("id, title, sort_order, created_at", { count: "exact" })
    .order("sort_order", { ascending: true })
    // A unique final sort key. Two programmes sharing a sort_order would
    // otherwise come back in an arbitrary order and could swap between pages,
    // showing one twice and hiding another entirely. This matches the
    // (org_id, sort_order, id) index the migration creates.
    .order("id", { ascending: true })
    .range(from, from + coursesPageSize - 1);

  if (term) {
    query = query.ilike("title", `%${term}%`);
  }

  const { count, data, error } = await query;

  if (error) {
    throw new Error(`Unable to list programmes: ${error.message}`);
  }

  const rows = (data ?? []).map(toRow);
  const total = count ?? rows.length;

  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / coursesPageSize)),
    rows,
    total,
  };
}
