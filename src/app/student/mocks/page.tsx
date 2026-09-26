import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { StudentMocksScreen } from "@/features/test-engine/components/student-mock-screens";
import { listStudentMocks } from "@/features/test-engine/queries/student-mocks";

export const metadata: Metadata = { title: "Mock tests" };

export default async function StudentMocksPage() {
  const profile = await requireRole("student");
  return <StudentMocksScreen mocks={await listStudentMocks()} profile={profile} />;
}
