import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

// What the "build a mock from this paper" panel offers (D7, D13): the paper's
// sections in the order its questions first use them, the programmes and ARS
// processes whose students can be granted it in one go, and the students to pick
// from. Read through the admin's own session, so RLS keeps it to their
// organisation. Clause 3.1 caps the platform at 100 users, so the student list
// is bounded rather than paginated.

export interface PaperSection {
  id: number;
  name: string;
  questionCount: number;
}

export interface BuildMockOptions {
  courses: Array<{ id: number; kind: string; title: string }>;
  sections: PaperSection[];
  students: Array<{ email: string; id: string; name: string }>;
}

const studentLimit = 500;

export async function getBuildMockOptions(questionIds: number[]): Promise<BuildMockOptions> {
  const supabase = await createServerSupabaseClient();

  const [questionResult, courseResult, studentResult] = await Promise.all([
    questionIds.length > 0
      ? supabase.from("questions").select("id, section_id, question_sections(name)").in("id", questionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("courses").select("id, title, kind").order("title"),
    supabase.from("profiles").select("id, name, email").eq("role", "student").eq("status", "active").order("name").limit(studentLimit),
  ]);
  if (questionResult.error) throw new Error(`Unable to read the paper's questions: ${questionResult.error.message}`);
  if (courseResult.error) throw new Error(`Unable to read programmes: ${courseResult.error.message}`);
  if (studentResult.error) throw new Error(`Unable to read students: ${studentResult.error.message}`);

  const byId = new Map((questionResult.data ?? []).map((row) => [Number(row.id), row]));
  const sections: PaperSection[] = [];
  for (const id of questionIds) {
    const row = byId.get(id);
    if (!row) continue;
    const embedded = Array.isArray(row.question_sections) ? row.question_sections[0] : row.question_sections;
    const sectionId = Number(row.section_id);
    const existing = sections.find((section) => section.id === sectionId);
    if (existing) existing.questionCount += 1;
    else sections.push({ id: sectionId, name: (embedded as { name?: string } | null)?.name ?? "Unnamed section", questionCount: 1 });
  }

  return {
    courses: (courseResult.data ?? []).map((row) => ({ id: Number(row.id), kind: String(row.kind), title: String(row.title) })),
    sections,
    students: (studentResult.data ?? []).map((row) => ({ email: String(row.email), id: String(row.id), name: String(row.name) })),
  };
}
