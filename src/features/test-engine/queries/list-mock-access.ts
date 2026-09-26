import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface MockAccessStudent {
  email: string;
  granted: boolean;
  id: string;
  name: string;
}

// Bounded by clause 3.1's hundred users, like the programme picker.
const studentPickerLimit = 500;

// Who may sit this mock, and who could be allowed to. Both halves come back
// through the admin's own client, so the organisation is RLS's to decide.
export async function listMockAccess(mockId: number): Promise<MockAccessStudent[]> {
  const supabase = await createServerSupabaseClient();

  const [studentsResult, grantsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email")
      .eq("role", "student")
      .eq("status", "active")
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(studentPickerLimit),
    supabase
      .from("content_access")
      .select("student_id")
      .eq("resource_type", "mock")
      .eq("resource_id", mockId),
  ]);

  if (studentsResult.error) throw new Error(`Unable to list students: ${studentsResult.error.message}`);
  if (grantsResult.error) throw new Error(`Unable to list mock access: ${grantsResult.error.message}`);

  const granted = new Set((grantsResult.data ?? []).map((row) => row.student_id));
  return (studentsResult.data ?? []).map((row) => ({
    email: row.email,
    granted: granted.has(row.id),
    id: row.id,
    name: row.name,
  }));
}
