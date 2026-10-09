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

  // Sections and their items in one round trip: PostgREST embeds the items
  // through their foreign key, and RLS still applies to both tables. Measured
  // 2026-10-09, the four queries this replaced ran one after another and were
  // most of a programme page's half second.
  const { data: sections, error } = await supabase
    .from("sections")
    .select("id, title, sort_order, curriculum_items(id, section_id, type, ref_id, title, body, sort_order)")
    .eq("course_id", courseId)
    .order("sort_order")
    .order("id")
    .order("sort_order", { referencedTable: "curriculum_items" })
    .order("id", { referencedTable: "curriculum_items" })
    .limit(200)
    .limit(2000, { referencedTable: "curriculum_items" });
  if (error) throw new Error(`Unable to load the curriculum: ${error.message}`);
  if (!sections || sections.length === 0) return [];

  const rows = sections.flatMap((section) => (section.curriculum_items ?? []) as ItemRow[]);
  const refIds = (type: CurriculumItemType) =>
    rows.filter((row) => row.type === type && row.ref_id !== null).map((row) => row.ref_id as number);

  const titles = new Map<string, string>();
  const documentIds = refIds("document");
  const mockIds = refIds("test");

  // The two title lookups depend only on the items, not on each other.
  const [documents, mocks] = await Promise.all([
    documentIds.length > 0 ? supabase.from("documents").select("id, title").in("id", documentIds) : null,
    mockIds.length > 0 ? supabase.from("mocks").select("id, title").in("id", mockIds) : null,
  ]);
  if (documents?.error) throw new Error(`Unable to load document titles: ${documents.error.message}`);
  if (mocks?.error) throw new Error(`Unable to load mock titles: ${mocks.error.message}`);
  for (const row of documents?.data ?? []) titles.set(`document:${row.id}`, row.title as string);
  for (const row of mocks?.data ?? []) titles.set(`test:${row.id}`, row.title as string);

  return sections.map((section) => ({
    id: section.id as number,
    items: ((section.curriculum_items ?? []) as ItemRow[]).map((row) => ({
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
