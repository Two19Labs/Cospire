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
  const [students, attempts] = await Promise.all([listMockAccess(mockId), listMockAttempts(mockId)]);
  return (
    <EditMockRoute mockId={mockId} searchParams={searchParams}>
      <MockAccessPanel access={typeof access === "string" ? access : undefined} mockId={mockId} students={students} />
      <MockAttemptsPanel attempts={attempts} />
    </EditMockRoute>
  );
}
