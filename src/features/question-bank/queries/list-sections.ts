import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface QuestionSection {
  id: number;
  name: string;
  questionCount: number;
  sortOrder: number;
}

// Sections are a short, admin-kept list -- a handful per organisation -- so it
// is capped rather than paginated. RLS scopes it to the caller's organisation.
const sectionLimit = 200;

export async function listSections({ withCounts = false } = {}): Promise<QuestionSection[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("question_sections")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(sectionLimit);

  if (error) throw new Error(`Unable to list sections: ${error.message}`);

  const sections: QuestionSection[] = (data ?? []).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    questionCount: 0,
    sortOrder: Number(row.sort_order),
  }));

  if (withCounts && sections.length > 0) {
    // One head-only count per section: the list is short, and a count cannot
    // be grouped through PostgREST without a view or a function.
    const counts = await Promise.all(
      sections.map((section) =>
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true })
          .eq("section_id", section.id),
      ),
    );
    counts.forEach((result, index) => {
      if (result.error) throw new Error(`Unable to count questions: ${result.error.message}`);
      sections[index].questionCount = result.count ?? 0;
    });
  }

  return sections;
}

// The topic suggestions under the topic box. A facet rather than a listing, so
// capped, the same reasoning as the documents folder facet.
const topicFacetLimit = 1000;

export async function listTopics(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("questions")
    .select("topic")
    .order("topic", { ascending: true })
    .limit(topicFacetLimit);

  if (error) throw new Error(`Unable to list topics: ${error.message}`);

  return [...new Set((data ?? []).map((row) => String(row.topic)))];
}
