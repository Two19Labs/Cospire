import { notFound } from "next/navigation";
import { EditMockRoute } from "@/features/question-bank/components/mock-routes";
import { parseId } from "@/features/question-bank/list-params";
// parseId, not a bare digit test: `/^\d+$/` admits an id past Number's safe
// range, which then loses precision and 500s in the query instead of being a
// plain 404. Every other id route in the feature already uses it.
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const mockId = parseId((await params).id); if (mockId === null) notFound();
  return <EditMockRoute mockId={mockId} searchParams={searchParams} />;
}
