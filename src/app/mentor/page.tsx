import type { Metadata } from "next";

import { requireRole } from "@/features/auth/guards";
import { MentorReports } from "@/features/ars-report/components/mentor-reports";
import { parsePage } from "@/features/ars-report/list-params";
import { listMentorReports } from "@/features/ars-report/queries/list-reports";

export const metadata: Metadata = { title: "Mentor workspace" };

export default async function MentorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("mentor");
  const page = parsePage((await searchParams).page);
  const reports = await listMentorReports({ page });
  return <MentorReports profile={profile} reports={reports} />;
}
