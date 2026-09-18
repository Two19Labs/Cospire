import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { MentorReports } from "@/features/ars-report/components/mentor-reports";
import { listMentorReports } from "@/features/ars-report/queries/list-reports";

export const metadata: Metadata = { title: "Mentor workspace" };

export default async function MentorPage() {
  const profile = await requireRole("mentor");
  const rows = await listMentorReports();
  return <MentorReports profile={profile} rows={rows} />;
}
