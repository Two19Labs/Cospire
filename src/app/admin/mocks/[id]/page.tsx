import { notFound } from "next/navigation";
import { EditMockRoute } from "@/features/question-bank/components/mock-routes";
import { parseId } from "@/features/question-bank/list-params";
import { MockAccessPanel } from "@/features/test-engine/components/mock-access-panel";
import { MockAttemptsPanel } from "@/features/test-engine/components/mock-attempts-panel";
import { listMockAccess } from "@/features/test-engine/queries/list-mock-access";
import { listMockAttempts } from "@/features/test-engine/queries/mock-attempts";
// parseId, not a bare digit test: `/^\d+$/` admits an id past Number's safe
// range, which then loses precision and 500s in the query instead of being a
// plain 404. Every other id route in the feature already uses it.
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const mockId = parseId((await params).id); if (mockId === null) notFound();
  const access = (await searchParams).access;
  // Started now and awaited inside the editor's children, so they run alongside
  // the editor's own reads instead of before them (one round trip saved).
  const students = listMockAccess(mockId);
  const attempts = listMockAttempts(mockId);
  // Marked handled: if the editor 404s first, nobody awaits these.
  students.catch(() => {});
  attempts.catch(() => {});
  return (
    <EditMockRoute mockId={mockId} searchParams={searchParams}>
      <MockPanels access={typeof access === "string" ? access : undefined} attempts={attempts} mockId={mockId} students={students} />
    </EditMockRoute>
  );
}

async function MockPanels({ access, attempts, mockId, students }: { access?: string; attempts: ReturnType<typeof listMockAttempts>; mockId: number; students: ReturnType<typeof listMockAccess> }) {
  const [studentRows, attemptRows] = await Promise.all([students, attempts]);
  return (
    <>
      <MockAccessPanel access={access} mockId={mockId} students={studentRows} />
      <MockAttemptsPanel attempts={attemptRows} />
    </>
  );
}
