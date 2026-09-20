import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface AdminProcessRow { courseId: number; courseTitle: string; roundCount: number }

export async function listAdminProcesses(): Promise<AdminProcessRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: courses, error } = await supabase.from("courses").select("id, title").order("title").limit(200);
  if (error) throw new Error(`Unable to load ARS programmes: ${error.message}`);
  if (!courses?.length) return [];
  const { data: rounds, error: roundsError } = await supabase.from("ars_rounds").select("course_id").in("course_id", courses.map((course) => course.id));
  if (roundsError) throw new Error(`Unable to count ARS rounds: ${roundsError.message}`);
  const counts = new Map<number, number>();
  for (const round of rounds ?? []) counts.set(round.course_id, (counts.get(round.course_id) ?? 0) + 1);
  return courses.map((course) => ({ courseId: course.id, courseTitle: course.title, roundCount: counts.get(course.id) ?? 0 }));
}
