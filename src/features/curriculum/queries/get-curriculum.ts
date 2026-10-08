import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { CurriculumItemType } from "../curriculum";

export interface CurriculumItem {
  body: string | null;
  id: number;
  refId: number | null;
  sectionId: number;
  sortOrder: number;
  // The referenced document's or mock's title, or the text item's own.
  title: string;
  type: CurriculumItemType;
}

export interface CurriculumSection {
  id: number;
  items: CurriculumItem[];
  sortOrder: number;
  title: string;
}

interface ItemRow {
  body: string | null;
  id: number;
  ref_id: number | null;
  section_id: number;
  sort_order: number;
  title: string | null;
  type: CurriculumItemType;
}

// One programme's curriculum, in order. Serves the admin builder and the
// student page alike: `sections_select_authorized` and
// `curriculum_items_select_authorized` decide what each caller sees, and the
// document and mock titles come back only where the caller may read the row
// (for a student, through the programme cascade).
export async function getCurriculum(courseId: number): Promise<CurriculumSection[]> {
  const supabase = await createServerSupabaseClient();

  const { data: sections, error } = await supabase
    .from("sections")
    .select("id, title, sort_order")
    .eq("course_id", courseId)
    .order("sort_order")
    .order("id")
    .limit(200);
  if (error) throw new Error(`Unable to load the curriculum: ${error.message}`);

  const sectionIds = (sections ?? []).map((section) => section.id as number);
  if (sectionIds.length === 0) return [];

  const { data: items, error: itemError } = await supabase
    .from("curriculum_items")
    .select("id, section_id, type, ref_id, title, body, sort_order")
    .in("section_id", sectionIds)
    .order("sort_order")
    .order("id")
    .limit(2000);
  if (itemError) throw new Error(`Unable to load the curriculum items: ${itemError.message}`);

  const rows = (items ?? []) as ItemRow[];
  const refIds = (type: CurriculumItemType) =>
    rows.filter((row) => row.type === type && row.ref_id !== null).map((row) => row.ref_id as number);

  const titles = new Map<string, string>();
  const documentIds = refIds("document");
  const mockIds = refIds("test");

  if (documentIds.length > 0) {
    const { data, error: docError } = await supabase
      .from("documents")
      .select("id, title")
      .in("id", documentIds);
    if (docError) throw new Error(`Unable to load document titles: ${docError.message}`);
    for (const row of data ?? []) titles.set(`document:${row.id}`, row.title as string);
  }

  if (mockIds.length > 0) {
    const { data, error: mockError } = await supabase
      .from("mocks")
      .select("id, title")
      .in("id", mockIds);
    if (mockError) throw new Error(`Unable to load mock titles: ${mockError.message}`);
    for (const row of data ?? []) titles.set(`test:${row.id}`, row.title as string);
  }

  return (sections ?? []).map((section) => ({
    id: section.id as number,
    items: rows
      .filter((row) => row.section_id === section.id)
      .map((row) => ({
        body: row.body,
        id: row.id,
        refId: row.ref_id,
        sectionId: row.section_id,
        sortOrder: row.sort_order,
        title: row.title ?? titles.get(`${row.type}:${row.ref_id}`) ?? "Unavailable",
        type: row.type,
      })),
    sortOrder: section.sort_order as number,
    title: section.title as string,
  }));
}
