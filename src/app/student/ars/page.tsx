import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { StudentProcesses } from "@/features/ars/components/student-process";
import { listStudentProcesses } from "@/features/ars/queries/student-process";

export const metadata: Metadata = { title: "Your ARS" };

export default async function StudentArsPage() {
  const profile = await requireRole("student");
  const processes = await listStudentProcesses();
  return <StudentProcesses processes={processes} profile={profile} />;
}
