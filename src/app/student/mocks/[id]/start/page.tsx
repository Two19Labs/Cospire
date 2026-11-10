import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { MockInstructionsScreen } from "@/features/test-engine/components/student-mock-screens";
import { isPhone } from "@/features/test-engine/device";
import { getStudentMock } from "@/features/test-engine/queries/student-mocks";

export default async function StudentMockStartPage({
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
  // A sitting already under way has its clock running: straight back into it.
  const open = mock.attempts.find((attempt) => attempt.status === "in_progress");
  if (open) redirect(`/student/attempts/${open.id}`);
  const error = (await searchParams).error;
  return (
    <MockInstructionsScreen
      error={typeof error === "string" ? error : undefined}
      mock={mock}
      phone={isPhone((await headers()).get("user-agent"))}
      profile={profile}
    />
  );
}
