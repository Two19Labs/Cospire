import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { StudentHome } from "@/features/student/components/student-home";
import { listStudentReports } from "@/features/ars-report/queries/list-reports";

export const metadata: Metadata = { title: "My learning" };

export default async function StudentPage() {
  const profile = await requireRole("student");
  const reports = await listStudentReports();
  return <StudentHome profile={profile} reports={reports} />;
}
