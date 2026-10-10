import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { listStudentProcesses } from "@/features/ars/queries/student-process";
import { parsePage } from "@/features/ars-report/list-params";
import { listStudentReports } from "@/features/ars-report/queries/list-reports";
import { listStudentProgrammes } from "@/features/curriculum/queries/student-programmes";
import { StudentHome } from "@/features/student/components/student-home";
import { listStudentMocks } from "@/features/test-engine/queries/student-mocks";

export const metadata: Metadata = { title: "Home" };

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const page = parsePage((await searchParams).page);
  // Four independent reads, side by side.
  const [reports, programmes, mocks, processes] = await Promise.all([
    listStudentReports({ page }),
    listStudentProgrammes(1, profile.id, 5),
    listStudentMocks(),
    listStudentProcesses(),
  ]);
  return <StudentHome mocks={mocks} processes={processes} profile={profile} programmes={programmes} reports={reports} />;
}
