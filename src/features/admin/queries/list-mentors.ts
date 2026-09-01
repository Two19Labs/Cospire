import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface MentorOption {
  id: string;
  name: string;
}

// Bounded rather than paginated. This feeds a dropdown, and clause 3.1 caps the
// platform at 100 users in total, so the whole mentor list is a handful of rows.
// The cap exists so that a future org which outgrows that assumption degrades by
// truncating a picker instead of loading an unbounded result set.
export const mentorOptionLimit = 200;

export async function listMentors(): Promise<MentorOption[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "mentor")
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(mentorOptionLimit);

  if (error) {
    throw new Error(`Unable to list mentors: ${error.message}`);
  }

  return (data ?? []).map((entry) => {
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.name !== "string") {
      throw new Error("A mentor row came back in an unexpected shape.");
    }
    return { id: row.id, name: row.name };
  });
}

// Which mentor each of the given students currently has. Keyed by student id,
// and absent means unassigned rather than an error.
export async function getMentorByStudent(
  studentIds: string[],
): Promise<Map<string, MentorOption>> {
  const assigned = new Map<string, MentorOption>();
  if (studentIds.length === 0) return assigned;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("mentor_assignments")
    .select("student_id, mentor_id")
    .in("student_id", studentIds);

  if (error) {
    throw new Error(`Unable to read mentor assignments: ${error.message}`);
  }

  const pairs = (data ?? []).map((entry) => {
    const row = entry as Record<string, unknown>;
    if (typeof row.student_id !== "string" || typeof row.mentor_id !== "string") {
      throw new Error("A mentor assignment came back in an unexpected shape.");
    }
    return { mentorId: row.mentor_id, studentId: row.student_id };
  });

  if (pairs.length === 0) return assigned;

  // A second query rather than a PostgREST embed. `mentor_assignments` reaches
  // `profiles` through a composite (id, org_id) foreign key, which the embed
  // syntax resolves awkwardly, and two small indexed reads are easier to read
  // than a relationship hint that breaks when the constraint is renamed.
  const mentorIds = [...new Set(pairs.map((pair) => pair.mentorId))];
  const { data: mentorRows, error: mentorError } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", mentorIds);

  if (mentorError) {
    throw new Error(`Unable to read mentor names: ${mentorError.message}`);
  }

  const namesById = new Map<string, string>();
  for (const entry of mentorRows ?? []) {
    const row = entry as Record<string, unknown>;
    if (typeof row.id === "string" && typeof row.name === "string") {
      namesById.set(row.id, row.name);
    }
  }

  for (const pair of pairs) {
    assigned.set(pair.studentId, {
      id: pair.mentorId,
      // A mentor the admin cannot see would be an RLS inconsistency rather than
      // a normal state, so it is shown as unknown instead of silently blank.
      name: namesById.get(pair.mentorId) ?? "Unknown mentor",
    });
  }

  return assigned;
}
