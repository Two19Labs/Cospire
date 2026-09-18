import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { StudentHome } from "@/features/student/components/student-home";
import { parsePage } from "@/features/ars-report/list-params";
import { listStudentReports } from "@/features/ars-report/queries/list-reports";

export const metadata: Metadata = { title: "My learning" };

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const page = parsePage((await searchParams).page);
  const reports = await listStudentReports({ page });
  return <StudentHome profile={profile} reports={reports} />;
}
