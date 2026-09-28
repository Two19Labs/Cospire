import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

// Reads behind the aptitude round's mock link. Every query runs through the
// signed-in user's own client, so RLS decides what each caller sees: an admin
// sees their organisation's mocks and grants, a student sees only the mocks
// they have been granted and only their own attempts.

export interface MockOption {
  id: number;
  title: string;
}

// Bounded: a select is not a paginated list, and clause 3.1's hundred users do
// not need more than this many mocks. The linked mock is fetched on its own if
// it has fallen off the end, so the select can always show what is stored.
const mockOptionLimit = 200;

export async function listMockOptions(linkedId: number | null): Promise<MockOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("mocks")
    .select("id, title")
    .order("created_at", { ascending: false })
    .limit(mockOptionLimit);
  if (error) throw new Error(`Unable to list mocks: ${error.message}`);

  const options = (data ?? []).map((row) => ({ id: Number(row.id), title: String(row.title) }));
  if (linkedId !== null && !options.some((option) => option.id === linkedId)) {
    const { data: linked } = await supabase.from("mocks").select("id, title").eq("id", linkedId).maybeSingle();
    if (linked) options.unshift({ id: Number(linked.id), title: String(linked.title) });
  }
  return options;
}

// How many students on this process cannot open the linked mock, because the
// mock is granted separately. Read through the admin's session.
export async function countProcessStudentsWithoutMock(
  courseId: number,
  mockId: number,
): Promise<{ onProcess: number; withoutMock: number }> {
  const supabase = await createServerSupabaseClient();
  const [processGrants, mockGrants] = await Promise.all([
    supabase.from("content_access").select("student_id").eq("resource_type", "course").eq("resource_id", courseId).limit(1000),
    supabase.from("content_access").select("student_id").eq("resource_type", "mock").eq("resource_id", mockId).limit(1000),
  ]);
  if (processGrants.error) throw new Error(`Unable to read process access: ${processGrants.error.message}`);
  if (mockGrants.error) throw new Error(`Unable to read mock access: ${mockGrants.error.message}`);

  const onMock = new Set((mockGrants.data ?? []).map((row) => row.student_id));
  const onProcess = new Set((processGrants.data ?? []).map((row) => row.student_id));
  let withoutMock = 0;
  for (const student of onProcess) if (!onMock.has(student)) withoutMock += 1;
  return { onProcess: onProcess.size, withoutMock };
}

export interface RoundMockForStudent {
  // False when RLS returned no mock: it exists, but has not been granted to
  // this student (or was removed). The screen says so instead of linking.
  available: boolean;
  id: number;
  latest: { score: number | null; status: "in_progress" | "submitted" } | null;
  title: string | null;
}

// The linked mocks, as the signed-in student may see them.
export async function readMocksForStudent(mockIds: number[]): Promise<Map<number, RoundMockForStudent>> {
  const result = new Map<number, RoundMockForStudent>();
  const ids = [...new Set(mockIds)];
  if (ids.length === 0) return result;

  const supabase = await createServerSupabaseClient();
  const [mocks, attempts] = await Promise.all([
    supabase.from("mocks").select("id, title").in("id", ids),
    supabase
      .from("attempts")
      .select("mock_id, status, score, started_at")
      .in("mock_id", ids)
      .order("started_at", { ascending: false })
      .limit(200),
  ]);
  if (mocks.error) throw new Error(`Unable to read your tests: ${mocks.error.message}`);
  if (attempts.error) throw new Error(`Unable to read your attempts: ${attempts.error.message}`);

  const titles = new Map((mocks.data ?? []).map((row) => [Number(row.id), String(row.title)]));
  for (const id of ids) {
    const latest = (attempts.data ?? []).find((row) => Number(row.mock_id) === id);
    result.set(id, {
      available: titles.has(id),
      id,
      latest: latest
        ? {
            score: latest.score === null ? null : Number(latest.score),
            status: latest.status === "submitted" ? "submitted" : "in_progress",
          }
        : null,
      title: titles.get(id) ?? null,
    });
  }
  return result;
}
