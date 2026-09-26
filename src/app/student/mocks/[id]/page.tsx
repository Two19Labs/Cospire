import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { StudentMockScreen } from "@/features/test-engine/components/student-mock-screens";
import { isPhone } from "@/features/test-engine/device";
import { getStudentMock } from "@/features/test-engine/queries/student-mocks";

export default async function StudentMockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const mockId = parseId((await params).id);
  if (mockId === null) notFound();
  // Null when the student holds no grant: RLS hides the mock entirely.
  const mock = await getStudentMock(mockId);
  if (!mock) notFound();
  const error = (await searchParams).error;
  const phone = isPhone((await headers()).get("user-agent"));
  return <StudentMockScreen error={typeof error === "string" ? error : undefined} mock={mock} phone={phone} profile={profile} />;
}
